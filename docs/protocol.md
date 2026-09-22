# Kunlun Voice Deck — 统一通信协议规范 (Protocol V1.0)

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
CoreS3 发送：
```json
{
  "type": "ping",
  "timestamp": 1710920005000
}
```
Bridge 回复：
```json
{
  "type": "pong",
  "timestamp": 1710920005010
}
```

### 2.4 上下文感知推送 (Context Sync: Bridge -> CoreS3)
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
