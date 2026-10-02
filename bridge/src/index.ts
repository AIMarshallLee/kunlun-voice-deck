import { BridgeServer } from './server/ws_server.js';
import { ProtocolValidator } from './protocol/validator.js';
import { ActionRouter } from './router/action_router.js';
import { SecurityGuard } from './security/guard.js';
import { MacOSExecutor } from './actions/macos_executor.js';
import { ContextEngine } from './context/context_engine.js';
import { config } from './config/index.js';

console.log('==========================================');
console.log('   Kunlun Voice Deck — Bridge (macOS)     ');
console.log('==========================================');

const executor = new MacOSExecutor();
const context = new ContextEngine(executor);
const server = new BridgeServer({
    port: config.port,
    host: config.host,
    heartbeat: config.heartbeat,
    statusIntervalMs: config.status.intervalMs,
    confirmTimeoutMs: config.security.confirmTimeoutMs,
    validator: new ProtocolValidator(),
    router: new ActionRouter({ executor, workflows: config.workflows }),
    guard: new SecurityGuard(config.security),
    getContext: () => context.current,
    version: '1.0.0'
});

context.on('change', (ctx) => {
    console.log(`[KunlunBridge] 前台应用: ${ctx.active_app ?? '(unknown)'}`);
    server.broadcastStatus();
});

server.start().then(() => {
    if (process.platform === 'darwin') context.start();
}).catch((err) => {
    console.error('[KunlunBridge] 启动失败:', err.message);
    process.exit(1);
});

const shutdown = async (signal: string) => {
    console.log(`\n[KunlunBridge] 收到 ${signal}，正在退出...`);
    context.stop();
    await server.stop();
    process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
