import { BridgeServer } from './server/ws_server.js';
import { config } from './config/index.js';

console.log('==========================================');
console.log('   Kunlun Voice Deck — Bridge (macOS)     ');
console.log('==========================================');

const server = new BridgeServer(config.port, config.host);
server.start();

process.on('SIGINT', () => {
    console.log('\n[KunlunBridge] 收到中断信号，正在退出...');
    server.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[KunlunBridge] 收到终止信号，正在退出...');
    server.stop();
    process.exit(0);
});
