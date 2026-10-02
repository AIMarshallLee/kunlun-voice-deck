# Kunlun Voice Deck — 统一通信协议规范 (Protocol V1.1)

## 1. 协议设计原则

- **统一载荷格式**：固件与 Bridge 之间的指令传输全量采用标准化 JSON 结构。
- **强制消息 ID**：每个请求必须携带全局/单会话唯一的 `id`（例如 `req_1710000000000`），以便异步并发控制与响应精准对应。
- **统一 Action 命名空间**：禁止为每个零散功能单独发明私有协议，一律采用 `类别.动作`（例如 `app.open`、`keyboard.shortcut`、`workflow.run`）。

---

## 2. 报文格式定义

### 2.1 控制指令 (Action Request: CoreS3 -> Bridge)
```json
{
  "id": "req_001_1710920000",
  "type": "action",
  "action": "app.open",
  "payload": {
    "app": "Terminal",
    "background": false
  },
  "timestamp": 1710920000123
}
```

### 2.2 响应与执行结果 (Action Result: Bridge -> CoreS3)
成功响应：
```json
{
  "id": "req_001_1710920000",
  "type": "result",
  "success": true,
  "message": "Terminal 已打开",
  "data": {
    "pid": 58920
  }
}
```

失败/异常响应：
```json
{
  "id": "req_001_1710920000",
  "type": "result",
  "success": false,
  "error": {
    "code": "APP_NOT_FOUND",
    "message": "未找到名为 'Terminal' 的应用程序"
  }
}
```

### 2.3 心跳保活 (Heartbeat: 双向)
CoreS3 发送 (默认每 5 s)：
```json
{
  "type": "ping",
  "timestamp": 1710920005000
}
```
Bridge 回复 (`echo` 原样返回 ping 的 timestamp，便于设备计算 RTT)：
```json
{
  "type": "pong",
  "timestamp": 1710920005010,
  "echo": 1710920005000
}
```
离线判定：
- **Bridge 侧**：超过 `heartbeat.timeoutMs` (默认 15 s) 未收到该连接的任何报文 → 终止连接，触发 `device:offline(heartbeat_timeout)`，该连接所有待确认请求作废。
- **固件侧**：超过 `KUNLUN_PONG_TIMEOUT_MS` (默认 15 s) 未收到任何报文 → 标记 OFFLINE，主动断开并按指数退避 (1 s → 30 s) 重连；重连成功后退避归零。

### 2.4 二次确认 (Confirmation: 双向，Phase 2 新增)
Security Guard 判定为 **CONFIRM** 级别时，Bridge 不立即执行，而是回送：
```json
{
  "id": "req_002_1710920010",
  "type": "confirm_required",
  "action": "shell.run",
  "level": "CONFIRM",
  "summary": "shell: npm test",
  "expires_in_ms": 20000,
  "timestamp": 1710920010050
}
```
固件在屏幕展示 `summary` 与【确认 / 取消】，用户触控后回送：
```json
{
  "id": "req_002_1710920010",
  "type": "confirm",
  "accepted": true,
  "timestamp": 1710920012000
}
```
随后 Bridge 以 2.2 的 `result` (同一 `id`) 回复最终执行结果。`accepted:false` → `CONFIRM_REJECTED`；超时未回复 → `CONFIRM_TIMEOUT`；对不存在/已过期的 id 发送 confirm → `NO_PENDING_CONFIRMATION`。

### 2.5 状态广播 (Status: Bridge -> CoreS3，Phase 2 新增)
连接建立时立即推送，之后周期性 (默认 10 s) 及前台应用变化时推送：
```json
{
  "type": "status",
  "connection": "online",
  "bridge": { "version": "1.0.0", "platform": "darwin", "uptime_ms": 123456 },
  "active_app": "Visual Studio Code",
  "active_window": null,
  "pending_confirmations": 0,
  "timestamp": 1710920020000
}
```
`active_app` 在 Phase 2 为占位 (探测不可用时为 `null`)；Phase 4 的 `context.update` (2.6) 在其基础上扩展 Dynamic Deck。

### 2.6 上下文感知推送 (Context Sync: Bridge -> CoreS3，Phase 4)
```json
{
  "type": "context.update",
  "active_app": "Visual Studio Code",
  "active_window": "kunlun-voice-deck — main.cpp",
  "project": "kunlun-voice-deck",
  "mode": "development",
  "dynamic_deck": [
    { "label": "CODEX", "action": "codex.run", "payload": { "prompt": "Review changes" } },
    { "label": "TEST", "action": "shell.run", "payload": { "command": "npm test" } },
    { "label": "BUILD", "action": "shell.run", "payload": { "command": "pio run" } },
    { "label": "GIT", "action": "app.open", "payload": { "app": "Fork" } }
  ]
}
```

### 2.7 报文方向与 Schema 对照

| type | 方向 | Schema | 说明 |
| :--- | :--- | :--- | :--- |
| `action` | CoreS3 → Bridge | `protocol/schema/action.schema.json` | 控制请求 |
| `result` | Bridge → CoreS3 | `result.schema.json` | 执行结果 / 错误 |
| `ping` / `pong` | CoreS3 → Bridge / Bridge → CoreS3 | `ping.schema.json` / `pong.schema.json` | 心跳 |
| `confirm_required` | Bridge → CoreS3 | `confirm_required.schema.json` | CONFIRM 级动作的确认请求 |
| `confirm` | CoreS3 → Bridge | `confirm.schema.json` | 用户确认应答 |
| `status` | Bridge → CoreS3 | `status.schema.json` | 连接/上下文状态广播 |

Bridge 对每一条入站报文按 `type` 选择对应 schema 校验；校验失败不会进入 Router。固件若发送只允许 Bridge → CoreS3 方向的类型，会收到 `UNKNOWN_TYPE`。

### 2.8 `id` 配对规则
- `id` 由固件生成 (`req_<seq>_<millis>`)，一个请求在 **处理中 (执行中或等待确认)** 期间不得复用，否则返回 `DUPLICATE_ID`。
- 配对按 **连接会话** 隔离：连接断开时该会话所有 in-flight / 待确认请求作废，结果不会投递到其他连接；重连后可以重新使用相同的 `id`。

### 2.9 错误码 (result.error.code)

| code | 含义 |
| :--- | :--- |
| `PARSE_ERROR` | JSON 解析失败 |
| `SCHEMA_INVALID` | 报文不符合对应 schema |
| `UNKNOWN_TYPE` | 未知或不允许该方向发送的 type |
| `UNKNOWN_ACTION` | Action 未在 Router 注册 |
| `DUPLICATE_ID` | 同一会话内 id 正在处理中 |
| `INVALID_PARAM` | payload 参数缺失或类型错误 |
| `ACTION_FORBIDDEN` | Security Guard 判定为 DANGEROUS，已拒绝 |
| `CONFIRM_REJECTED` | 用户在屏幕取消 |
| `CONFIRM_TIMEOUT` | 确认窗口超时 |
| `NO_PENDING_CONFIRMATION` | confirm 的 id 无对应待确认请求 |
| `EXECUTION_FAILED` | 宿主命令执行失败 |
| `NOT_CONFIGURED` | 如 workflow 未在 Bridge 配置 |

---

## 3. 标准 Action 命名空间全集 (V1.0)

| Action 标识 | 说明 | 参数示例 (payload) | 安全级别 |
| :--- | :--- | :--- | :--- |
| `app.open` | 启动或聚焦指定 macOS 应用 | `{"app": "Terminal"}` | SAFE |
| `app.close` | 优雅退出指定应用 | `{"app": "Safari"}` | CONFIRM |
| `keyboard.press` | 发送单键点击 | `{"key": "Enter"}` | SAFE |
| `keyboard.shortcut` | 触发组合快捷键 | `{"modifiers": ["Command"], "key": "Tab"}` | SAFE |
| `mouse.click` | 触发鼠标点击 | `{"button": "left"}` | SAFE |
| `mouse.scroll` | 触发鼠标滚轮 | `{"deltaY": -5}` | SAFE |
| `shell.run` | 在宿主执行预设 Shell 脚本 | `{"command": "git status"}` | CONFIRM / SAFE |
| `url.open` | 在默认浏览器打开网页 | `{"url": "https://github.com"}` | SAFE |
| `workflow.run` | 触发 Webhook 或 AI 流水线 | `{"workflow": "daily_summary"}` | CONFIRM |
| `codex.run` | 调度 Coding Agent 任务 | `{"prompt": "Run tests and fix failures"}`| CONFIRM |
| `system.volume` | 调整系统主音量 | `{"level": 50}` | SAFE |

安全级别由 Bridge `config.security.policy` 策略表决定；未登记的 Action 一律视为 **DANGEROUS**。`shell.run` 额外经过高危正则 (`rm -rf`、`sudo`、`mkfs`、`dd if=`、`git push --force`、凭据路径等) 升级为 DANGEROUS，只读白名单 (`git status`、`pwd` 等) 降级为 SAFE。Phase 2 Bridge 已实现：`app.open`、`app.close`、`keyboard.press`、`keyboard.shortcut`、`url.open`、`system.volume`、`shell.run`、`workflow.run`；`mouse.*`、`codex.run` 返回 `UNKNOWN_ACTION` 待后续阶段实现。
