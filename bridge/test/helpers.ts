import WebSocket from 'ws';
import { BridgeServer, BridgeServerOptions } from '../src/server/ws_server.js';
import { ProtocolValidator } from '../src/protocol/validator.js';
import { ActionRouter } from '../src/router/action_router.js';
import { SecurityGuard } from '../src/security/guard.js';
import { MacOSExecutor, RunCommand } from '../src/actions/macos_executor.js';
import { DEFAULT_DANGEROUS_SHELL_PATTERNS, DEFAULT_POLICY, DEFAULT_SAFE_SHELL_COMMANDS } from '../src/config/index.js';

export interface Invocation { cmd: string; args: string[] }

/** Linux 下的 mock runCommand：记录调用，不产生任何副作用 */
export function mockRunner(behaviour?: (cmd: string, args: string[]) => { stdout?: string; fail?: string }) {
    const calls: Invocation[] = [];
    const run: RunCommand = async (cmd, args) => {
        calls.push({ cmd, args });
        const b = behaviour?.(cmd, args);
        if (b?.fail) throw new Error(b.fail);
        return { stdout: b?.stdout ?? '', stderr: '' };
    };
    return { run, calls };
}

const silent = { log: () => {}, warn: () => {}, error: () => {} };

export async function startBridge(overrides: Partial<BridgeServerOptions> = {}, runner?: RunCommand) {
    const executor = new MacOSExecutor(runner ?? mockRunner().run);
    const server = new BridgeServer({
        port: 0,
        host: '127.0.0.1',
        heartbeat: { intervalMs: 100, timeoutMs: 3000 },
        statusIntervalMs: 0,
        confirmTimeoutMs: 300,
        validator: new ProtocolValidator(),
        router: new ActionRouter({ executor, workflows: { demo: { command: 'echo demo' } } }),
        guard: new SecurityGuard({
            policy: DEFAULT_POLICY,
            dangerousShellPatterns: DEFAULT_DANGEROUS_SHELL_PATTERNS,
            safeShellCommands: DEFAULT_SAFE_SHELL_COMMANDS
        }),
        logger: silent,
        ...overrides
    });
    await server.start();
    return server;
}

/** 简易固件模拟客户端：收集所有报文，支持按条件等待 */
export class FakeDevice {
    ws: WebSocket;
    messages: any[] = [];
    private waiters: Array<{ pred: (m: any) => boolean; resolve: (m: any) => void }> = [];
    closed: Promise<void>;

    constructor(port: number) {
        this.ws = new WebSocket(`ws://127.0.0.1:${port}`);
        this.ws.on('message', (d) => {
            const m = JSON.parse(d.toString());
            this.messages.push(m);
            this.waiters = this.waiters.filter((w) => {
                if (w.pred(m)) { w.resolve(m); return false; }
                return true;
            });
        });
        this.closed = new Promise((r) => this.ws.on('close', () => r()));
    }

    open(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ws.once('open', () => resolve());
            this.ws.once('error', reject);
        });
    }

    send(msg: any): void {
        this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    wait(pred: (m: any) => boolean, timeoutMs = 2000): Promise<any> {
        const hit = this.messages.find(pred);
        if (hit) return Promise.resolve(hit);
        return new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
            this.waiters.push({ pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
        });
    }

    waitResult(id: string, timeoutMs?: number) {
        return this.wait((m) => m.type === 'result' && m.id === id, timeoutMs);
    }

    close(): void {
        this.ws.close();
    }
}

export async function connect(server: BridgeServer): Promise<FakeDevice> {
    const d = new FakeDevice(server.port);
    await d.open();
    await d.wait((m) => m.type === 'status');
    return d;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
