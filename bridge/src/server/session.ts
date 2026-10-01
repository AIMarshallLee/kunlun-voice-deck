import type { WebSocket } from 'ws';
import type { ActionRequest, OutboundMessage } from '../protocol/types.js';
import type { Classification } from '../security/guard.js';

export interface PendingConfirmation {
    request: ActionRequest;
    classification: Classification;
    timer: NodeJS.Timeout;
}

let sessionSeq = 0;

/**
 * 单个固件连接的会话状态。
 * id 配对、待确认队列都按会话隔离：连接断开即全部作废，重连后不会串台。
 */
export class DeviceSession {
    readonly id: string;
    readonly connectedAt = Date.now();
    lastSeenAt = Date.now();
    /** 正在处理中的 action id (执行中或等待确认) */
    readonly inflight = new Set<string>();
    readonly pending = new Map<string, PendingConfirmation>();

    constructor(readonly ws: WebSocket, readonly remoteAddress: string) {
        this.id = `sess_${++sessionSeq}_${this.connectedAt.toString(36)}`;
    }

    touch(): void {
        this.lastSeenAt = Date.now();
    }

    send(message: OutboundMessage): boolean {
        if (this.ws.readyState !== this.ws.OPEN) return false;
        this.ws.send(JSON.stringify(message));
        return true;
    }

    /** 关闭时清理所有定时器，防止向已关闭连接发送 */
    dispose(): void {
        for (const p of this.pending.values()) clearTimeout(p.timer);
        this.pending.clear();
        this.inflight.clear();
    }
}
