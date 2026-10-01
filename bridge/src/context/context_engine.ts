import { EventEmitter } from 'node:events';
import type { MacOSExecutor } from '../actions/macos_executor.js';

export interface HostContext {
    active_app: string | null;
    active_window: string | null;
}

/**
 * Context Engine (Phase 2 占位版)
 * 周期性探测前台应用；探测不可用 (非 macOS / 无权限) 时保持 null。
 * Phase 4 在此基础上扩展 active_window / project / dynamic_deck。
 * 事件: 'change' (ctx: HostContext)
 */
export class ContextEngine extends EventEmitter {
    private timer: NodeJS.Timeout | null = null;
    private ctx: HostContext = { active_app: null, active_window: null };

    constructor(private readonly executor: MacOSExecutor, private readonly pollMs = 2000) {
        super();
    }

    get current(): HostContext {
        return { ...this.ctx };
    }

    start(): void {
        if (this.timer) return;
        const tick = async () => {
            const app = await this.executor.getActiveApp();
            if (app !== this.ctx.active_app) {
                this.ctx = { ...this.ctx, active_app: app };
                this.emit('change', this.current);
            }
        };
        void tick();
        this.timer = setInterval(tick, this.pollMs);
        this.timer.unref?.();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }
}
