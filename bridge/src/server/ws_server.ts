import { WebSocketServer, WebSocket } from 'ws';
import { ActionRouter, ActionRequest } from '../router/action_router.js';

export class BridgeServer {
    private wss: WebSocketServer | null = null;

    constructor(private port: number, private host: string) {}

    public start(): void {
        this.wss = new WebSocketServer({ port: this.port, host: this.host });

        this.wss.on('listening', () => {
            console.log(`[KunlunBridge] WebSocket 服务已启动: ws://${this.host}:${this.port}`);
        });

        this.wss.on('connection', (ws: WebSocket, req) => {
            const remoteAddr = req.socket.remoteAddress;
            console.log(`[KunlunBridge] 客户端已连接: ${remoteAddr}`);

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data.toString());

                    // 心跳检测 Ping / Pong
                    if (message.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                        return;
                    }

                    // Action 请求分发
                    if (message.type === 'action') {
                        console.log(`[KunlunBridge] 收到 Action 请求:`, message.action, message.payload);
                        const result = await ActionRouter.dispatch(message as ActionRequest);
                        ws.send(JSON.stringify(result));
                    }
                } catch (err: any) {
                    console.error('[KunlunBridge] 处理消息失败:', err.message);
                    ws.send(JSON.stringify({
                        type: 'result',
                        success: false,
                        message: 'JSON 解析或处理异常',
                        error: { code: 'PARSE_ERROR', message: err.message }
                    }));
                }
            });

            ws.on('close', () => {
                console.log(`[KunlunBridge] 客户端断开连接`);
            });

            ws.on('error', (err) => {
                console.error(`[KunlunBridge] 连接异常:`, err.message);
            });
        });
    }

    public stop(): void {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
    }
}
