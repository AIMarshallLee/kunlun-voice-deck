import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startBridge, connect, mockRunner, sleep, FakeDevice } from './helpers.js';
import type { BridgeServer } from '../src/server/ws_server.js';

async function withBridge(fn: (server: BridgeServer, dev: FakeDevice, calls: ReturnType<typeof mockRunner>['calls']) => Promise<void>, behaviour?: Parameters<typeof mockRunner>[0]) {
    const { run, calls } = mockRunner(behaviour);
    const server = await startBridge({}, run);
    const dev = await connect(server);
    try {
        await fn(server, dev, calls);
    } finally {
        dev.close();
        await server.stop();
    }
}

test('连接后立即收到 status 广播 (含 active_app 占位)', async () => {
    await withBridge(async (_s, dev) => {
        const status = dev.messages.find((m) => m.type === 'status');
        assert.equal(status.connection, 'online');
        assert.equal(status.active_app, null);
        assert.equal(typeof status.timestamp, 'number');
        assert.equal(status.pending_confirmations, 0);
    });
});

test('ping -> pong 并回显 timestamp', async () => {
    await withBridge(async (_s, dev) => {
        dev.send({ type: 'ping', timestamp: 4242 });
        const pong = await dev.wait((m) => m.type === 'pong');
        assert.equal(pong.echo, 4242);
        assert.equal(typeof pong.timestamp, 'number');
    });
});

test('非法报文：JSON 损坏 / schema 不符 / 未知类型 / 固件不可发送的类型', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send('{not json');
        const r1 = await dev.wait((m) => m.type === 'result' && m.error?.code === 'PARSE_ERROR');
        assert.equal(r1.success, false);

        dev.send({ id: 'bad_1', type: 'action', action: 'app.open' }); // 缺 payload
        const r2 = await dev.waitResult('bad_1');
        assert.equal(r2.error.code, 'SCHEMA_INVALID');

        dev.send({ id: 'bad_2', type: 'whatever' });
        const r3 = await dev.waitResult('bad_2');
        assert.equal(r3.error.code, 'UNKNOWN_TYPE');

        dev.send({ id: 'bad_3', type: 'result', success: true });
        const r4 = await dev.waitResult('bad_3');
        assert.equal(r4.error.code, 'UNKNOWN_TYPE');

        assert.equal(calls.length, 0, '非法报文不得触发任何执行');
    });
});

test('SAFE: app.open 直接执行并调用 open -a', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'safe_1', type: 'action', action: 'app.open', payload: { app: 'Terminal' }, timestamp: Date.now() });
        const r = await dev.waitResult('safe_1');
        assert.equal(r.success, true);
        assert.deepEqual(calls[0], { cmd: 'open', args: ['-a', 'Terminal'] });
        assert.ok(!dev.messages.some((m) => m.type === 'confirm_required'));
    });
});

test('SAFE: keyboard.shortcut / system.volume 走 osascript', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'k1', type: 'action', action: 'keyboard.shortcut', payload: { modifiers: ['Command'], key: 'Tab' } });
        const r1 = await dev.waitResult('k1');
        assert.equal(r1.success, true);
        assert.equal(calls[0].cmd, 'osascript');
        assert.match(calls[0].args[1], /key code 48 using \{command down\}/);

        dev.send({ id: 'v1', type: 'action', action: 'system.volume', payload: { level: 140 } });
        const r2 = await dev.waitResult('v1');
        assert.equal(r2.success, true);
        assert.equal(r2.data.level, 100);
        assert.match(calls[1].args[1], /set volume output volume 100/);
    });
});

test('执行失败映射为 EXECUTION_FAILED', async () => {
    await withBridge(async (_s, dev) => {
        dev.send({ id: 'f1', type: 'action', action: 'app.open', payload: { app: 'Nope' } });
        const r = await dev.waitResult('f1');
        assert.equal(r.success, false);
        assert.equal(r.error.code, 'EXECUTION_FAILED');
    }, () => ({ fail: 'Unable to find application' }));
});

test('CONFIRM: shell.run 返回 confirm_required，确认后执行', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'c1', type: 'action', action: 'shell.run', payload: { command: 'npm test' } });
        const cr = await dev.wait((m) => m.type === 'confirm_required' && m.id === 'c1');
        assert.equal(cr.level, 'CONFIRM');
        assert.equal(cr.action, 'shell.run');
        assert.equal(typeof cr.expires_in_ms, 'number');
        assert.equal(calls.length, 0, '确认前不得执行');

        dev.send({ id: 'c1', type: 'confirm', accepted: true });
        const r = await dev.waitResult('c1');
        assert.equal(r.success, true);
        assert.deepEqual(calls[0], { cmd: '/bin/zsh', args: ['-lc', 'npm test'] });
        assert.equal(r.data.stdout, 'ok');
    }, () => ({ stdout: 'ok\n' }));
});

test('CONFIRM: 用户取消 -> CONFIRM_REJECTED，不执行', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'c2', type: 'action', action: 'app.close', payload: { app: 'Safari' } });
        await dev.wait((m) => m.type === 'confirm_required' && m.id === 'c2');
        dev.send({ id: 'c2', type: 'confirm', accepted: false });
        const r = await dev.waitResult('c2');
        assert.equal(r.error.code, 'CONFIRM_REJECTED');
        assert.equal(calls.length, 0);
    });
});

test('CONFIRM: 超时 -> CONFIRM_TIMEOUT，之后 confirm 报 NO_PENDING_CONFIRMATION', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'c3', type: 'action', action: 'workflow.run', payload: { workflow: 'demo' } });
        await dev.wait((m) => m.type === 'confirm_required' && m.id === 'c3');
        const r = await dev.waitResult('c3', 1500);
        assert.equal(r.error.code, 'CONFIRM_TIMEOUT');
        dev.send({ id: 'c3', type: 'confirm', accepted: true });
        const r2 = await dev.wait((m) => m.type === 'result' && m.id === 'c3' && m.error?.code === 'NO_PENDING_CONFIRMATION');
        assert.ok(r2);
        assert.equal(calls.length, 0);
    });
});

test('CONFIRM: 等待期间重复 id -> DUPLICATE_ID', async () => {
    await withBridge(async (_s, dev) => {
        dev.send({ id: 'dup', type: 'action', action: 'shell.run', payload: { command: 'npm test' } });
        await dev.wait((m) => m.type === 'confirm_required' && m.id === 'dup');
        dev.send({ id: 'dup', type: 'action', action: 'app.open', payload: { app: 'Terminal' } });
        const r = await dev.wait((m) => m.type === 'result' && m.id === 'dup' && m.error?.code === 'DUPLICATE_ID');
        assert.ok(r);
    });
});

test('DANGEROUS: rm -rf / 未登记 action 被拒绝 ACTION_FORBIDDEN，未知 action -> UNKNOWN_ACTION', async () => {
    await withBridge(async (_s, dev, calls) => {
        dev.send({ id: 'd1', type: 'action', action: 'shell.run', payload: { command: 'rm -rf /' } });
        const r1 = await dev.waitResult('d1');
        assert.equal(r1.success, false);
        assert.equal(r1.error.code, 'ACTION_FORBIDDEN');

        dev.send({ id: 'd2', type: 'action', action: 'codex.run', payload: { prompt: 'x' } }); // 策略表有但 router 未实现
        const r2 = await dev.waitResult('d2');
        assert.equal(r2.error.code, 'UNKNOWN_ACTION');

        dev.send({ id: 'd3', type: 'action', action: 'evil.thing', payload: {} });
        const r3 = await dev.waitResult('d3');
        assert.equal(r3.error.code, 'UNKNOWN_ACTION');
        assert.equal(calls.length, 0);
    });
});

test('心跳超时：固件静默 > timeoutMs 后被判离线并断开', async () => {
    const server = await startBridge({ heartbeat: { intervalMs: 30, timeoutMs: 120 } });
    const offline: string[] = [];
    server.on('device:offline', (_s, reason) => offline.push(reason));
    const dev = await connect(server);
    try {
        // 前 150ms 持续 ping 保活
        for (let i = 0; i < 5; i++) { dev.send({ type: 'ping' }); await sleep(30); }
        assert.equal(server.sessionCount, 1, 'ping 期间不应断开');
        await dev.closed; // 停止 ping 后应在 ~120ms 内被踢
        assert.deepEqual(offline, ['heartbeat_timeout']);
        assert.equal(server.sessionCount, 0);
    } finally {
        await server.stop();
    }
});

test('断线重连：旧连接的待确认 id 作废，新连接可复用同一 id 且不串台', async () => {
    const { run, calls } = mockRunner();
    const server = await startBridge({}, run);
    const events: string[] = [];
    server.on('device:online', () => events.push('online'));
    server.on('device:offline', (_s, r) => events.push(`offline:${r}`));
    try {
        const a = await connect(server);
        a.send({ id: 'req_7', type: 'action', action: 'shell.run', payload: { command: 'npm test' } });
        await a.wait((m) => m.type === 'confirm_required' && m.id === 'req_7');
        a.close();
        await a.closed;
        await sleep(20);
        assert.equal(server.sessionCount, 0);

        const b = await connect(server);
        // 用旧 id 确认：旧会话的 pending 已随断线作废
        b.send({ id: 'req_7', type: 'confirm', accepted: true });
        const r1 = await b.waitResult('req_7');
        assert.equal(r1.error.code, 'NO_PENDING_CONFIRMATION');
        assert.equal(calls.length, 0, '旧会话请求绝不能在新会话被执行');

        // 新会话可以重新使用同一 id，并正常走完流程
        b.send({ id: 'req_7', type: 'action', action: 'app.open', payload: { app: 'Terminal' } });
        const r2 = await b.wait((m) => m.type === 'result' && m.id === 'req_7' && m.success === true);
        assert.ok(r2);
        assert.equal(a.messages.filter((m) => m.type === 'result').length, 0, '旧连接不应收到任何结果');
        b.close();
        await b.closed;
        await sleep(20);
        assert.deepEqual(events, ['online', 'offline:closed', 'online', 'offline:closed']);
    } finally {
        await server.stop();
    }
});

test('多固件并发：结果只回给发起连接', async () => {
    const server = await startBridge();
    try {
        const a = await connect(server);
        const b = await connect(server);
        a.send({ id: 'same', type: 'action', action: 'app.open', payload: { app: 'A' } });
        b.send({ id: 'same', type: 'action', action: 'shell.run', payload: { command: 'npm test' } });
        await a.waitResult('same');
        await b.wait((m) => m.type === 'confirm_required' && m.id === 'same');
        assert.equal(a.messages.filter((m) => m.type === 'confirm_required').length, 0);
        assert.equal(b.messages.filter((m) => m.type === 'result').length, 0);
        a.close(); b.close();
    } finally {
        await server.stop();
    }
});
