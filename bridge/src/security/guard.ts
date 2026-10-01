import type { SecurityLevel, ActionRequest } from '../protocol/types.js';

export interface SecurityPolicyOptions {
    policy: Record<string, SecurityLevel>;
    dangerousShellPatterns: RegExp[];
    safeShellCommands: string[];
}

export interface Classification {
    level: SecurityLevel;
    reason: string;
    /** 供 confirm_required.summary / 日志展示的人类可读摘要 */
    summary: string;
}

/**
 * Security Guard — 三级安全策略
 *  - SAFE      : 直接执行
 *  - CONFIRM   : 回 confirm_required，等待固件 confirm 报文后执行
 *  - DANGEROUS : 拒绝，返回 ACTION_FORBIDDEN
 * 策略只在 Bridge 判定；固件对安全级别无感知，只呈现确认界面。
 */
export class SecurityGuard {
    constructor(private readonly opts: SecurityPolicyOptions) {}

    classify(request: ActionRequest): Classification {
        const { action, payload } = request;
        const base = this.opts.policy[action];

        if (!base) {
            return { level: 'DANGEROUS', reason: `action '${action}' 未登记在安全策略表`, summary: action };
        }

        if (action === 'shell.run') {
            return this.classifyShell(String(payload?.command ?? ''), base);
        }

        if (action === 'workflow.run') {
            return { level: base, reason: 'workflow 默认需要确认', summary: `运行流水线 ${payload?.workflow ?? '?'}` };
        }

        return { level: base, reason: '策略表', summary: summarize(action, payload) };
    }

    private classifyShell(command: string, base: SecurityLevel): Classification {
        const trimmed = command.trim();
        if (!trimmed) {
            return { level: 'DANGEROUS', reason: '空命令', summary: 'shell: <empty>' };
        }
        for (const pattern of this.opts.dangerousShellPatterns) {
            if (pattern.test(trimmed)) {
                return { level: 'DANGEROUS', reason: `命中高危模式 ${pattern}`, summary: `shell: ${trimmed}` };
            }
        }
        if (this.opts.safeShellCommands.includes(trimmed)) {
            return { level: 'SAFE', reason: '只读命令白名单', summary: `shell: ${trimmed}` };
        }
        return { level: base, reason: 'shell 默认需要确认', summary: `shell: ${trimmed}` };
    }
}

function summarize(action: string, payload: Record<string, any>): string {
    switch (action) {
        case 'app.open': return `打开 ${payload?.app ?? '?'}`;
        case 'app.close': return `退出 ${payload?.app ?? '?'}`;
        case 'url.open': return `打开网页 ${payload?.url ?? '?'}`;
        case 'keyboard.shortcut': return `快捷键 ${(payload?.modifiers ?? []).join('+')}+${payload?.key ?? '?'}`;
        case 'keyboard.press': return `按键 ${payload?.key ?? '?'}`;
        case 'system.volume': return `音量 ${payload?.level ?? '?'}%`;
        default: return action;
    }
}
