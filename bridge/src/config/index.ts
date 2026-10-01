import type { SecurityLevel } from '../protocol/types.js';

export interface WorkflowDefinition {
    /** 在宿主执行的命令 (经 /bin/zsh -lc) */
    command: string;
    description?: string;
}

export interface BridgeConfig {
    port: number;
    host: string;
    heartbeat: {
        /** Bridge 侧巡检周期 */
        intervalMs: number;
        /** 超过该时长未收到固件任何报文即判离线并断开 */
        timeoutMs: number;
    };
    status: {
        /** status 广播周期 (0 表示仅在连接建立/变化时推送) */
        intervalMs: number;
    };
    security: {
        /** 二次确认等待窗口 */
        confirmTimeoutMs: number;
        /** Action -> 安全级别策略表 (未登记的 Action 一律视为 DANGEROUS) */
        policy: Record<string, SecurityLevel>;
        /** shell.run 命中以下任一正则即升级为 DANGEROUS */
        dangerousShellPatterns: RegExp[];
        /** shell.run 完全命中以下命令时降级为 SAFE (只读命令白名单) */
        safeShellCommands: string[];
    };
    workflows: Record<string, WorkflowDefinition>;
}

export const DEFAULT_POLICY: Record<string, SecurityLevel> = {
    'app.open': 'SAFE',
    'app.close': 'CONFIRM',
    'keyboard.press': 'SAFE',
    'keyboard.shortcut': 'SAFE',
    'mouse.click': 'SAFE',
    'mouse.scroll': 'SAFE',
    'url.open': 'SAFE',
    'system.volume': 'SAFE',
    'shell.run': 'CONFIRM',
    'workflow.run': 'CONFIRM',
    'codex.run': 'CONFIRM'
};

export const DEFAULT_DANGEROUS_SHELL_PATTERNS: RegExp[] = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\b/, // rm -rf / rm -fr
    /\brm\s+-[a-zA-Z]*r\b.*\s\/(\s|$)/,                       // rm -r /
    /\bmkfs(\.|\b)/,
    /\bdd\s+if=/,
    /\bdiskutil\s+(erase|partition|reformat)/i,
    /\bsudo\b/,
    /\bchmod\s+(-R\s+)?[0-7]*777\b/,
    /\bgit\s+push\b.*(--force|-f\b)/,
    /\bgit\s+reset\s+--hard/,
    />\s*\/dev\/(sd|disk|null\b.*;)/,
    /\b(shutdown|reboot|halt)\b/,
    /\bkillall\b/,
    /\b(ssh-keygen|security\s+(add|delete)-)/,                 // 凭证/密钥修改
    /\.(ssh|aws|gnupg)\//,
    /:\(\)\s*\{\s*:\|:&\s*\};:/                                 // fork bomb
];

export const DEFAULT_SAFE_SHELL_COMMANDS = ['git status', 'git log --oneline -n 10', 'pwd', 'ls', 'uptime', 'date'];

export const config: BridgeConfig = {
    port: Number(process.env.PORT) || 8765,
    host: process.env.HOST || '0.0.0.0',
    heartbeat: {
        intervalMs: Number(process.env.HEARTBEAT_INTERVAL_MS) || 5000,
        timeoutMs: Number(process.env.HEARTBEAT_TIMEOUT_MS) || 15000
    },
    status: {
        intervalMs: Number(process.env.STATUS_INTERVAL_MS) || 10000
    },
    security: {
        confirmTimeoutMs: Number(process.env.CONFIRM_TIMEOUT_MS) || 20000,
        policy: { ...DEFAULT_POLICY },
        dangerousShellPatterns: [...DEFAULT_DANGEROUS_SHELL_PATTERNS],
        safeShellCommands: [...DEFAULT_SAFE_SHELL_COMMANDS]
    },
    workflows: {
        daily_summary: { command: 'echo "daily_summary workflow placeholder"', description: '示例流水线占位' }
    }
};
