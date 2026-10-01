import { execFile } from 'node:child_process';

export interface CommandOutput {
    stdout: string;
    stderr: string;
}

/** 可注入的命令执行接口：生产环境走 execFile，测试环境注入 mock */
export type RunCommand = (cmd: string, args: string[], options?: { timeoutMs?: number }) => Promise<CommandOutput>;

export const execFileRunner: RunCommand = (cmd, args, options) =>
    new Promise((resolve, reject) => {
        execFile(cmd, args, { timeout: options?.timeoutMs ?? 15000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
            if (err) {
                const e = new Error(stderr?.toString().trim() || err.message);
                reject(e);
                return;
            }
            resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
        });
    });

export interface ExecResult {
    success: boolean;
    message: string;
    data?: Record<string, any>;
}

/** macOS 快捷键修饰键 -> AppleScript 修饰符 */
const MODIFIER_MAP: Record<string, string> = {
    command: 'command down',
    cmd: 'command down',
    option: 'option down',
    alt: 'option down',
    control: 'control down',
    ctrl: 'control down',
    shift: 'shift down'
};

/** 特殊键 -> macOS 虚拟键码 (System Events key code) */
const KEY_CODE_MAP: Record<string, number> = {
    tab: 48, space: 49, enter: 36, return: 36, escape: 53, esc: 53, delete: 51, backspace: 51,
    up: 126, down: 125, left: 123, right: 124,
    f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111,
    home: 115, end: 119, pageup: 116, pagedown: 121
};

function sanitizeName(name: string): string {
    return String(name ?? '').replace(/["'\\\n\r]/g, '').trim();
}

/**
 * macOS Command Executor
 * 所有系统副作用都经由 runCommand 发出 (open / osascript / zsh)，便于在非 macOS 环境测试。
 */
export class MacOSExecutor {
    constructor(private readonly run: RunCommand = execFileRunner) {}

    async openApp(appName: string): Promise<ExecResult> {
        const safeName = sanitizeName(appName);
        if (!safeName) return { success: false, message: '无效的应用程序名称' };
        try {
            await this.run('open', ['-a', safeName]);
            return { success: true, message: `${safeName} 已打开` };
        } catch (error: any) {
            return { success: false, message: `打开应用失败: ${error.message || '未知错误'}` };
        }
    }

    async closeApp(appName: string): Promise<ExecResult> {
        const safeName = sanitizeName(appName);
        if (!safeName) return { success: false, message: '无效的应用程序名称' };
        try {
            await this.run('osascript', ['-e', `tell application "${safeName}" to quit`]);
            return { success: true, message: `${safeName} 已退出` };
        } catch (error: any) {
            return { success: false, message: `退出应用失败: ${error.message}` };
        }
    }

    async openUrl(url: string): Promise<ExecResult> {
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
            return { success: false, message: '仅支持 http/https 协议链接' };
        }
        try {
            await this.run('open', [url]);
            return { success: true, message: `网页已打开: ${url}` };
        } catch (error: any) {
            return { success: false, message: `打开网页失败: ${error.message}` };
        }
    }

    async setVolume(level: number): Promise<ExecResult> {
        if (!Number.isFinite(level)) return { success: false, message: 'level 必须为数字' };
        const clamped = Math.max(0, Math.min(100, Math.round(level)));
        try {
            await this.run('osascript', ['-e', `set volume output volume ${clamped}`]);
            return { success: true, message: `系统音量已调整为 ${clamped}%`, data: { level: clamped } };
        } catch (error: any) {
            return { success: false, message: `调节音量失败: ${error.message}` };
        }
    }

    /** 组合快捷键，如 { modifiers: ['Command'], key: 'Tab' } */
    async keyboardShortcut(modifiers: string[], key: string): Promise<ExecResult> {
        const mods = (modifiers ?? []).map((m) => MODIFIER_MAP[String(m).toLowerCase()]).filter(Boolean);
        if ((modifiers ?? []).length !== mods.length) {
            return { success: false, message: `不支持的修饰键: ${modifiers.join(',')}` };
        }
        const script = buildKeyScript(key, mods);
        if (!script) return { success: false, message: `不支持的按键: ${key}` };
        try {
            await this.run('osascript', ['-e', script]);
            return { success: true, message: `已发送 ${[...(modifiers ?? []), key].join('+')}` };
        } catch (error: any) {
            return { success: false, message: `发送快捷键失败: ${error.message}` };
        }
    }

    async keyPress(key: string): Promise<ExecResult> {
        return this.keyboardShortcut([], key);
    }

    /** 在宿主执行 shell (安全级别由 Security Guard 判定，这里只负责执行) */
    async runShell(command: string, timeoutMs = 30000): Promise<ExecResult> {
        const trimmed = String(command ?? '').trim();
        if (!trimmed) return { success: false, message: '空命令' };
        try {
            const out = await this.run('/bin/zsh', ['-lc', trimmed], { timeoutMs });
            const stdout = out.stdout.trim();
            return {
                success: true,
                message: stdout ? stdout.split('\n').slice(-1)[0].slice(0, 60) : '命令已执行',
                data: { stdout: stdout.slice(0, 4000), stderr: out.stderr.trim().slice(0, 1000) }
            };
        } catch (error: any) {
            return { success: false, message: `命令执行失败: ${error.message}` };
        }
    }

    /** 前台应用探测 (Phase 4 Context Engine 占位；探测失败返回 null) */
    async getActiveApp(): Promise<string | null> {
        try {
            const out = await this.run('osascript', [
                '-e',
                'tell application "System Events" to get name of first application process whose frontmost is true'
            ], { timeoutMs: 3000 });
            const name = out.stdout.trim();
            return name || null;
        } catch {
            return null;
        }
    }
}

function buildKeyScript(key: string, mods: string[]): string | null {
    const k = String(key ?? '').trim();
    if (!k) return null;
    const using = mods.length ? ` using {${mods.join(', ')}}` : '';
    const code = KEY_CODE_MAP[k.toLowerCase()];
    if (code !== undefined) {
        return `tell application "System Events" to key code ${code}${using}`;
    }
    if (k.length === 1) {
        const ch = k.replace(/["\\]/g, '');
        if (!ch) return null;
        return `tell application "System Events" to keystroke "${ch.toLowerCase()}"${using}`;
    }
    return null;
}
