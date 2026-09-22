import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class MacOSExecutor {
    /**
     * 打开指定的 macOS 应用程序
     * @param appName 应用程序名称 (如 Terminal, Safari, Visual Studio Code)
     */
    static async openApp(appName: string): Promise<{ success: boolean; message: string }> {
        try {
            // 防御性过滤，避免路径注入
            const safeName = appName.replace(/["'\\]/g, '').trim();
            if (!safeName) {
                return { success: false, message: '无效的应用程序名称' };
            }

            await execFileAsync('open', ['-a', safeName]);
            return { success: true, message: `${safeName} 已打开` };
        } catch (error: any) {
            return {
                success: false,
                message: `打开应用失败: ${error.message || '未知错误'}`
            };
        }
    }

    /**
     * 在默认浏览器中打开指定 URL
     */
    static async openUrl(url: string): Promise<{ success: boolean; message: string }> {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return { success: false, message: '仅支持 http/https 协议链接' };
            }
            await execFileAsync('open', [url]);
            return { success: true, message: `网页已打开: ${url}` };
        } catch (error: any) {
            return { success: false, message: `打开网页失败: ${error.message}` };
        }
    }

    /**
     * 调整 macOS 系统主音量 (0 - 100)
     */
    static async setVolume(level: number): Promise<{ success: boolean; message: string }> {
        try {
            const clamped = Math.max(0, Math.min(100, Math.round(level)));
            // 通过 osascript 调节输出音量
            await execFileAsync('osascript', ['-e', `set volume output volume ${clamped}`]);
            return { success: true, message: `系统音量已调整为 ${clamped}%` };
        } catch (error: any) {
            return { success: false, message: `调节音量失败: ${error.message}` };
        }
    }
}
