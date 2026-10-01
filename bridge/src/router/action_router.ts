import { MacOSExecutor } from '../actions/macos_executor.js';
import { ActionRequest, ActionResult, ErrorCode, errorResult, okResult } from '../protocol/types.js';
import type { WorkflowDefinition } from '../config/index.js';

export type ActionHandler = (request: ActionRequest) => Promise<ActionResult>;

export interface ActionRouterOptions {
    executor: MacOSExecutor;
    workflows?: Record<string, WorkflowDefinition>;
}

/**
 * Action Router — 统一命名空间分发器 (`类别.动作`)
 * 只负责把 action 映射到 handler；安全判定在 SecurityGuard，执行在 Executor。
 */
export class ActionRouter {
    private handlers = new Map<string, ActionHandler>();

    constructor(private readonly opts: ActionRouterOptions) {
        this.registerDefaults();
    }

    register(action: string, handler: ActionHandler): void {
        this.handlers.set(action, handler);
    }

    has(action: string): boolean {
        return this.handlers.has(action);
    }

    actions(): string[] {
        return [...this.handlers.keys()];
    }

    async dispatch(request: ActionRequest): Promise<ActionResult> {
        const handler = this.handlers.get(request.action);
        if (!handler) {
            return errorResult(request.id, ErrorCode.UNKNOWN_ACTION, `Action '${request.action}' 未注册`);
        }
        try {
            return await handler(request);
        } catch (err: any) {
            return errorResult(request.id, ErrorCode.EXECUTION_FAILED, err?.message || '执行异常');
        }
    }

    private registerDefaults(): void {
        const ex = this.opts.executor;
        const wrap = (id: string, res: { success: boolean; message: string; data?: Record<string, any> }): ActionResult =>
            res.success ? okResult(id, res.message, res.data) : errorResult(id, ErrorCode.EXECUTION_FAILED, res.message);

        // app.*
        this.register('app.open', async ({ id, payload }) => {
            if (typeof payload.app !== 'string' || !payload.app.trim()) return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 app 参数');
            return wrap(id, await ex.openApp(payload.app));
        });
        this.register('app.close', async ({ id, payload }) => {
            if (typeof payload.app !== 'string' || !payload.app.trim()) return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 app 参数');
            return wrap(id, await ex.closeApp(payload.app));
        });

        // keyboard.*
        this.register('keyboard.shortcut', async ({ id, payload }) => {
            if (typeof payload.key !== 'string') return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 key 参数');
            const modifiers = Array.isArray(payload.modifiers) ? payload.modifiers.map(String) : [];
            return wrap(id, await ex.keyboardShortcut(modifiers, payload.key));
        });
        this.register('keyboard.press', async ({ id, payload }) => {
            if (typeof payload.key !== 'string') return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 key 参数');
            return wrap(id, await ex.keyPress(payload.key));
        });

        // system.*
        this.register('system.volume', async ({ id, payload }) => {
            if (typeof payload.level !== 'number') return errorResult(id, ErrorCode.INVALID_PARAM, 'level 必须为数字');
            return wrap(id, await ex.setVolume(payload.level));
        });

        // url.*
        this.register('url.open', async ({ id, payload }) => {
            if (typeof payload.url !== 'string') return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 url 参数');
            return wrap(id, await ex.openUrl(payload.url));
        });

        // shell.*
        this.register('shell.run', async ({ id, payload }) => {
            if (typeof payload.command !== 'string' || !payload.command.trim()) return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 command 参数');
            return wrap(id, await ex.runShell(payload.command, typeof payload.timeoutMs === 'number' ? payload.timeoutMs : undefined));
        });

        // workflow.*
        this.register('workflow.run', async ({ id, payload }) => {
            const name = typeof payload.workflow === 'string' ? payload.workflow : '';
            if (!name) return errorResult(id, ErrorCode.INVALID_PARAM, '缺少 workflow 参数');
            const def = this.opts.workflows?.[name];
            if (!def) return errorResult(id, ErrorCode.NOT_CONFIGURED, `workflow '${name}' 未在 Bridge 配置`);
            const res = await ex.runShell(def.command);
            return res.success
                ? okResult(id, `流水线 ${name} 已执行`, { workflow: name, ...res.data })
                : errorResult(id, ErrorCode.EXECUTION_FAILED, res.message);
        });
    }
}
