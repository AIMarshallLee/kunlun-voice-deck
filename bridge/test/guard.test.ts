import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SecurityGuard } from '../src/security/guard.js';
import { DEFAULT_DANGEROUS_SHELL_PATTERNS, DEFAULT_POLICY, DEFAULT_SAFE_SHELL_COMMANDS } from '../src/config/index.js';

const guard = new SecurityGuard({
    policy: DEFAULT_POLICY,
    dangerousShellPatterns: DEFAULT_DANGEROUS_SHELL_PATTERNS,
    safeShellCommands: DEFAULT_SAFE_SHELL_COMMANDS
});
const req = (action: string, payload: any) => ({ id: 'x', type: 'action' as const, action, payload });

test('策略表三级分类', () => {
    assert.equal(guard.classify(req('app.open', { app: 'Terminal' })).level, 'SAFE');
    assert.equal(guard.classify(req('keyboard.shortcut', { modifiers: ['Command'], key: 'Tab' })).level, 'SAFE');
    assert.equal(guard.classify(req('system.volume', { level: 30 })).level, 'SAFE');
    assert.equal(guard.classify(req('app.close', { app: 'Safari' })).level, 'CONFIRM');
    assert.equal(guard.classify(req('workflow.run', { workflow: 'demo' })).level, 'CONFIRM');
    assert.equal(guard.classify(req('not.registered', {})).level, 'DANGEROUS');
});

test('shell.run 分级：白名单 SAFE、默认 CONFIRM、高危 DANGEROUS', () => {
    assert.equal(guard.classify(req('shell.run', { command: 'git status' })).level, 'SAFE');
    assert.equal(guard.classify(req('shell.run', { command: 'npm test' })).level, 'CONFIRM');
    assert.equal(guard.classify(req('shell.run', { command: 'git push origin main' })).level, 'CONFIRM');
    for (const cmd of ['rm -rf ~/Projects', 'sudo rm file', 'git push --force', 'mkfs.ext4 /dev/sda', 'dd if=/dev/zero of=/dev/disk2', 'cat ~/.ssh/id_rsa', '']) {
        assert.equal(guard.classify(req('shell.run', { command: cmd })).level, 'DANGEROUS', cmd);
    }
});
