/**
 * 协议报文类型定义 (与 protocol/schema/*.json 一一对应)
 * 固件只负责感知/呈现；所有语义、安全与执行判定均在 Bridge 完成。
 */

export type SecurityLevel = 'SAFE' | 'CONFIRM' | 'DANGEROUS';

export interface ActionRequest {
    id: string;
    type: 'action';
    action: string;
    payload: Record<string, any>;
    timestamp?: number;
}

export interface ActionError {
    code: string;
    message: string;
}

export interface ActionResult {
    id: string;
    type: 'result';
    success: boolean;
    message?: string;
    data?: Record<string, any>;
    error?: ActionError;
}

export interface PingMessage {
    type: 'ping';
    timestamp?: number;
}

export interface PongMessage {
    type: 'pong';
    timestamp: number;
    echo?: number;
}

export interface ConfirmRequiredMessage {
    id: string;
    type: 'confirm_required';
    action: string;
    level: 'CONFIRM';
    summary: string;
    expires_in_ms: number;
    timestamp?: number;
}

export interface ConfirmMessage {
    id: string;
    type: 'confirm';
    accepted: boolean;
    timestamp?: number;
}

export interface StatusMessage {
    type: 'status';
    connection: 'online';
    bridge?: { version?: string; platform?: string; uptime_ms?: number };
    active_app?: string | null;
    active_window?: string | null;
    pending_confirmations?: number;
    timestamp: number;
}

export type InboundMessage = ActionRequest | PingMessage | ConfirmMessage;
export type OutboundMessage = ActionResult | PongMessage | ConfirmRequiredMessage | StatusMessage;

/** 统一错误码 (写入 result.error.code) */
export const ErrorCode = {
    PARSE_ERROR: 'PARSE_ERROR',
    SCHEMA_INVALID: 'SCHEMA_INVALID',
    UNKNOWN_TYPE: 'UNKNOWN_TYPE',
    UNKNOWN_ACTION: 'UNKNOWN_ACTION',
    DUPLICATE_ID: 'DUPLICATE_ID',
    INVALID_PARAM: 'INVALID_PARAM',
    ACTION_FORBIDDEN: 'ACTION_FORBIDDEN',
    CONFIRM_REJECTED: 'CONFIRM_REJECTED',
    CONFIRM_TIMEOUT: 'CONFIRM_TIMEOUT',
    NO_PENDING_CONFIRMATION: 'NO_PENDING_CONFIRMATION',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    NOT_CONFIGURED: 'NOT_CONFIGURED'
} as const;

export function errorResult(id: string, code: string, message: string): ActionResult {
    return { id, type: 'result', success: false, message, error: { code, message } };
}

export function okResult(id: string, message: string, data?: Record<string, any>): ActionResult {
    const res: ActionResult = { id, type: 'result', success: true, message };
    if (data) res.data = data;
    return res;
}
