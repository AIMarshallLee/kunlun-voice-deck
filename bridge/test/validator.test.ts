import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProtocolValidator } from '../src/protocol/validator.js';

const v = new ProtocolValidator();

test('schema 文件全部加载', () => {
    for (const t of ['action', 'result', 'ping', 'pong', 'confirm', 'confirm_required', 'status']) {
        assert.ok(v.has(t), `missing schema ${t}`);
    }
});

test('合法 action 通过', () => {
    const r = v.validate({ id: 'req_1', type: 'action', action: 'app.open', payload: { app: 'Terminal' }, timestamp: 1 });
    assert.equal(r.valid, true, r.errors.join(';'));
});

test('缺少必填字段被拒绝', () => {
    const r = v.validate({ type: 'action', action: 'app.open' });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes("'id'")));
    assert.ok(r.errors.some((e) => e.includes("'payload'")));
});

test('额外字段 / 错误类型被拒绝', () => {
    assert.equal(v.validate({ id: 'x', type: 'action', action: 'a.b', payload: {}, extra: 1 }).valid, false);
    assert.equal(v.validate({ id: 'x', type: 'action', action: 'a.b', payload: 'nope' }).valid, false);
    assert.equal(v.validate({ id: 'x', type: 'action', action: 'a.b', payload: {}, timestamp: 1.5 }).valid, false);
});

test('未知 type 与非对象被拒绝', () => {
    assert.equal(v.validate({ type: 'hack' }).valid, false);
    assert.equal(v.validate('str').valid, false);
    assert.equal(v.validate(null).valid, false);
});

test('confirm / ping / status 校验', () => {
    assert.equal(v.validate({ id: 'r', type: 'confirm', accepted: true }).valid, true);
    assert.equal(v.validate({ id: 'r', type: 'confirm', accepted: 'yes' }).valid, false);
    assert.equal(v.validate({ type: 'ping', timestamp: 123 }).valid, true);
    assert.equal(v.validate({ type: 'status', connection: 'online', active_app: null, timestamp: 1 }).valid, true);
});
