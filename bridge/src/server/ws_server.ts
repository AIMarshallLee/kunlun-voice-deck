import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { ProtocolValidator } from '../protocol/validator.js';
import {
    ActionRequest, ActionResult, ConfirmMessage, ErrorCode, PingMessage, StatusMessage, errorResult
} from '../protocol/types.js';
import { ActionRouter } from '../router/action_router.js';
import { SecurityGuard } from '../security/guard.js';
import { DeviceSession } from './session.js';
import type { HostContext } from '../context/context_engine.js';

export interface BridgeServerOptions {
    port: number;
    host?: string;
    heartbeat: { intervalMs: number; timeoutMs: number };
    statusIntervalMs?: number;
    confirmTimeoutMs: number;
    validator: ProtocolValidator;
    router: ActionRouter;
    guard: SecurityGuard;
    /** 由 ContextEngine 提供；未提供时 active_app 为 null 占位 */
    getContext?: () => HostContext;
    version?: string;
    logger?: Pick<Console, 'log' | 'warn' | 'error'>;
}

/**
 * Bridge WebSocket Server
 * 事件:
 *  - 'listening'        (port)
 *  - 'device:online'    (session)
 *  - 'device:offline'   (session, reason: 'closed' | 'heartbeat_timeout' | 'error')
 *  - 'action'           (session, request, classification)
 *  - 'result'           (session, result)
 */
export class BridgeServer extends EventEmitter {
    private wss: WebSocketServer | null = null;
    private sessions = new Set<DeviceSession>();
    private heartbeatTimer: NodeJS.Timeout | null = null;
    private statusTimer: NodeJS.Timeout | null = null;
    private readonly startedAt = Date.now();
    private readonly log: Pick<Console, 'log' | 'warn' | 'error'>;

    constructor(private readonly opts: BridgeServerOptions) {
        super();
        this.log = opts.logger ?? console;
    }

    get port(): number {
        const addr = this.wss?.address();
        return typeof addr === 'object' && addr ? addr.port : this.opts.port;
    }

    get sessionCount(): number {
        return this.sessions.size;
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.wss = new WebSocketServer({ port: this.opts.port, host: this.opts.host ?? '0.0.0.0' });
            this.wss.once('error', reject);
            this.wss.on('listening', () => {
                this.log.log(`[KunlunBridge] WebSocket 服务已启动: ws://${this.opts.host ?? '0.0.0.0'}:${this.port}`);
                this.emit('listening', this.port);
                resolve();
            });
            this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));

            this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), this.opts.heartbeat.intervalMs);
            if (this.opts.statusIntervalMs && this.opts.statusIntervalMs > 0) {
                this.statusTimer = setInterval(() => this.broadcastStatus(), this.opts.statusIntervalMs);
            }
        });
    }

    async stop(): Promise<void> {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.statusTimer) clearInterval(this.statusTimer);
        this.heartbeatTimer = this.statusTimer = null;
        for (const s of this.sessions) {
            s.dispose();
            s.ws.terminate();
        }
        this.sessions.clear();
        await new Promise<void>((resolve) => {
            if (!this.wss) return resolve();
            this.wss.close(() => resolve());
            this.wss = null;
        });
    }

    /** 向所有在线固件广播状态 (连接建立、周期、上下文变化时) */
    broadcastStatus(): void {
        for (const s of this.sessions) this.sendStatus(s);
    }

    // ------------------------------------------------------------------ connection

    private handleConnection(ws: WebSocket, req: IncomingMessage): void {
        const session = new DeviceSession(ws, req.socket.remoteAddress ?? 'unknown');
        this.sessions.add(session);
        this.log.log(`[KunlunBridge] 固件已连接 ${session.id} <- ${session.remoteAddress}`);
        this.emit('device:online', session);

        ws.on('message', (data) => {
            session.touch();
            void this.handleMessage(session, data.toString());
        });
        ws.on('pong', () => session.touch());
        ws.on('close', () => this.dropSession(session, 'closed'));
        ws.on('error', (err) => {
            this.log.error(`[KunlunBridge] 连接异常 ${session.id}: ${err.message}`);
            this.dropSession(session, 'error');
        });

        this.sendStatus(session);
    }

    private dropSession(session: DeviceSession, reason: 'closed' | 'heartbeat_timeout' | 'error'): void {
        if (!this.sessions.has(session)) return;
        this.sessions.delete(session);
        session.dispose();
        this.log.log(`[KunlunBridge] 固件离线 ${session.id} (${reason})`);
        this.emit('device:offline', session, reason);
    }

    private checkHeartbeats(): void {
        const now = Date.now();
        for (const s of this.sessions) {
            if (now - s.lastSeenAt > this.opts.heartbeat.timeoutMs) {
                this.log.warn(`[KunlunBridge] 心跳超时 ${s.id}，判定离线`);
                this.dropSession(s, 'heartbeat_timeout');
                s.ws.terminate();
            }
        }
    }

    private sendStatus(session: DeviceSession): void {
        const ctx = this.opts.getContext?.() ?? { active_app: null, active_window: null };
        const msg: StatusMessage = {
            type: 'status',
            connection: 'online',
            bridge: { version: this.opts.version ?? '1.0.0', platform: process.platform, uptime_ms: Date.now() - this.startedAt },
            active_app: ctx.active_app,
            active_window: ctx.active_window,
            pending_confirmations: session.pending.size,
            timestamp: Date.now()
        };
        session.send(msg);
    }

    // ------------------------------------------------------------------ messages

    private async handleMessage(session: DeviceSession, raw: string): Promise<void> {
        let message: any;
        try {
            message = JSON.parse(raw);
        } catch (err: any) {
            this.reply(session, errorResult(extractId(raw), ErrorCode.PARSE_ERROR, `JSON 解析失败: ${err.message}`));
            return;
        }

        const validation = this.opts.validator.validate(message);
        if (!validation.valid) {
            const id = typeof message?.id === 'string' ? message.id : '';
            const code = typeof message?.type === 'string' && this.opts.validator.has(message.type) ? ErrorCode.SCHEMA_INVALID : ErrorCode.UNKNOWN_TYPE;
            this.reply(session, errorResult(id, code, validation.errors.join('; ')));
            return;
        }

        switch (message.type) {
            case 'ping':
                this.handlePing(session, message as PingMessage);
                return;
            case 'action':
                await this.handleAction(session, message as ActionRequest);
                return;
            case 'confirm':
                await this.handleConfirm(session, message as ConfirmMessage);
                return;
            default:
                // schema 中存在但只允许 Bridge -> 固件方向的报文 (pong/status/confirm_required/result)
                this.reply(session, errorResult(message.id ?? '', ErrorCode.UNKNOWN_TYPE, `报文类型 '${message.type}' 不允许由固件发送`));
        }
    }

    private handlePing(session: DeviceSession, ping: PingMessage): void {
        const pong = { type: 'pong' as const, timestamp: Date.now(), ...(typeof ping.timestamp === 'number' ? { echo: ping.timestamp } : {}) };
        session.send(pong);
    }

    private async handleAction(session: DeviceSession, request: ActionRequest): Promise<void> {
        if (session.inflight.has(request.id)) {
            this.reply(session, errorResult(request.id, ErrorCode.DUPLICATE_ID, `id '${request.id}' 正在处理中`));
            return;
        }
        if (!this.opts.router.has(request.action)) {
            this.reply(session, errorResult(request.id, ErrorCode.UNKNOWN_ACTION, `Action '${request.action}' 未注册`));
            return;
        }

        const classification = this.opts.guard.classify(request);
        this.emit('action', session, request, classification);
        this.log.log(`[KunlunBridge] action ${request.id} ${request.action} -> ${classification.level} (${classification.reason})`);

        switch (classification.level) {
            case 'SAFE':
                await this.execute(session, request);
                return;

            case 'CONFIRM': {
                session.inflight.add(request.id);
                const timer = setTimeout(() => {
                    if (!session.pending.has(request.id)) return;
                    session.pending.delete(request.id);
                    session.inflight.delete(request.id);
                    this.reply(session, errorResult(request.id, ErrorCode.CONFIRM_TIMEOUT, `确认超时 (${this.opts.confirmTimeoutMs}ms)`));
                }, this.opts.confirmTimeoutMs);
                timer.unref?.();
                session.pending.set(request.id, { request, classification, timer });
                session.send({
                    id: request.id,
                    type: 'confirm_required',
                    action: request.action,
                    level: 'CONFIRM',
                    summary: classification.summary,
                    expires_in_ms: this.opts.confirmTimeoutMs,
                    timestamp: Date.now()
                });
                return;
            }

            case 'DANGEROUS':
                this.reply(session, errorResult(request.id, ErrorCode.ACTION_FORBIDDEN, `高危动作已拒绝: ${classification.reason}`));
                return;
        }
    }

    private async handleConfirm(session: DeviceSession, confirm: ConfirmMessage): Promise<void> {
        const pending = session.pending.get(confirm.id);
        if (!pending) {
            this.reply(session, errorResult(confirm.id, ErrorCode.NO_PENDING_CONFIRMATION, `没有等待确认的请求 '${confirm.id}'`));
            return;
        }
        clearTimeout(pending.timer);
        session.pending.delete(confirm.id);
        session.inflight.delete(confirm.id);

        if (!confirm.accepted) {
            this.reply(session, errorResult(confirm.id, ErrorCode.CONFIRM_REJECTED, '用户已取消'));
            return;
        }
        await this.execute(session, pending.request);
    }

    private async execute(session: DeviceSession, request: ActionRequest): Promise<void> {
        session.inflight.add(request.id);
        try {
            const result = await this.opts.router.dispatch(request);
            this.reply(session, result);
        } finally {
            session.inflight.delete(request.id);
        }
    }

    private reply(session: DeviceSession, result: ActionResult): void {
        this.emit('result', session, result);
        session.send(result);
    }
}

function extractId(raw: string): string {
    const m = /"id"\s*:\s*"([^"]{1,128})"/.exec(raw);
    return m ? m[1] : '';
}
