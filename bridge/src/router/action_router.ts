import { MacOSExecutor } from '../actions/macos_executor.js';

export interface ActionRequest {
    id: string;
    type: 'action';
    action: string;
    payload: Record<string, any>;
    timestamp?: number;
}

export interface ActionResult {
    id: string;
    type: 'result';
    success: boolean;
    message: string;
    data?: any;
    error?: {
        code: string;
        message: string;
    };
}

export class ActionRouter {
    /**
     * 统一分发 Action 指令
     */
    static async dispatch(request: ActionRequest): Promise<ActionResult> {
        const { id, action, payload } = request;

        try {
            switch (action) {
                case 'app.open': {
                    const app = payload?.app || 'Terminal';
                    const res = await MacOSExecutor.openApp(app);
                    return {
                        id,
                        type: 'result',
                        success: res.success,
                        message: res.message
                    };
                }

                case 'url.open': {
                    const url = payload?.url;
                    if (!url) {
                        return {
                            id,
                            type: 'result',
                            success: false,
                            message: '缺少 url 参数',
                            error: { code: 'INVALID_PARAM', message: 'Missing url in payload' }
                        };
                    }
                    const res = await MacOSExecutor.openUrl(url);
                    return {
                        id,
                        type: 'result',
                        success: res.success,
                        message: res.message
                    };
                }

                case 'system.volume': {
                    const level = Number(payload?.level ?? 50);
                    const res = await MacOSExecutor.setVolume(level);
                    return {
                        id,
                        type: 'result',
                        success: res.success,
                        message: res.message
                    };
                }

                default:
                    return {
                        id,
                        type: 'result',
                        success: false,
                        message: `未知的 Action: ${action}`,
                        error: {
                            code: 'UNKNOWN_ACTION',
                            message: `Action '${action}' is not registered in ActionRouter.`
                        }
                    };
            }
        } catch (err: any) {
            return {
                id,
                type: 'result',
                success: false,
                message: err.message || '执行异常',
                error: {
                    code: 'EXECUTION_FAILED',
                    message: err.toString()
                }
            };
        }
    }
}
