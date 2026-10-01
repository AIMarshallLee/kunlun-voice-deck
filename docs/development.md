# Kunlun Voice Deck — 开发者指南与阶段验收计划

## 1. 整体演进路线 (Roadmap)

- [x] **Phase 0 — Hardware Bring-up (当前阶段)**：屏幕、触摸、电源/背光、原生 USB CDC/HID 基础驱动就绪，板载硬件自检通过。
- [x] **Phase 1 — USB HID 实体控制 (当前阶段)**：实现原生复合 HID 键盘与鼠标，支持 Command+Tab、快捷卡片触控直控 macOS。
- [x] **Phase 2 — Bridge 核心与状态同步** (Bridge 已本地测试 / 固件未编译)：WebSocket 双向通道、心跳、断线重连、Action Router、SAFE/CONFIRM/DANGEROUS 三级安全、status 广播。
- [ ] **Phase 3 — 离线唤醒与语音识别**：本地离线 Wake Word 唤醒（“昆仑”）、麦克风管道传输、STT 意图解析。
- [ ] **Phase 4 — Dynamic Deck 上下文感应**：随 Mac 前台活跃 App 动态更新 CoreS3 屏幕按键布局。
- [ ] **Phase 5 — AI Agent & Workflow 扩展**：接入 Codex、Shell 脚本以及 Webhook 流水线。
- [ ] **Phase 6 — 系统加固与生产级交付**：断线重连容灾、网络波动自愈、抗误唤醒调优。

---

## 2. Phase 0 & Phase 1 现场验收用例表

| 序号 | 验证项 | 测试操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- |
| **0.1** | 硬件上电自检 | CoreS3 连入 Mac USB-C，设备自动开机初始化 | 屏幕点亮，顶部状态栏显示硬件状态，主界面渲染触控卡片网格 |
| **0.2** | 电容触摸测试 | 手指触摸屏幕不同卡片热区 | 触摸位置产生视觉按压高亮反馈，串口打印精确触控坐标 |
| **1.1** | HID 键盘组合键 (测试 A) | 触摸屏幕上 `APP SWITCH` 卡片 | CoreS3 发送 `Command + Tab` 组合键，Mac 弹出/轮转应用切换界面 |
| **1.2** | 快捷键响应 | 触摸屏幕上 `TERMINAL` / `DESKTOP` 卡片 | 发送对应 HID 快捷键，Mac 窗口即刻响应 |
| **1.3** | 热插拔稳定性 | 拔下 USB 数据线后重新插入 Mac | 设备自动重新枚举为 USB-CDC + USB-HID，无需手动按复位键即可恢复控制 |

---

## 3. Phase 2 验收用例表 (Bridge 核心与状态同步)

### 3.1 Bridge 自动化测试 (已在本地 Node 22 / Linux 环境通过)

```bash
cd bridge
npm install
npm test        # tsc -p tsconfig.test.json && node --test dist-test/test/*.test.js
npm run build   # tsc -> dist/
```

macOS 副作用 (open / osascript / zsh) 全部经由可注入的 `runCommand` 接口发出，测试中注入 mock，不依赖 macOS。

| 序号 | 验证项 | 测试文件 | 预期结果 |
| :--- | :--- | :--- | :--- |
| **2.1** | Schema 校验 | `test/validator.test.ts` | 缺字段 / 多字段 / 类型错误 / 未知 type 一律拒绝，合法 action / confirm / ping / status 通过 |
| **2.2** | 非法报文不进入 Router | `test/bridge.test.ts` | 损坏 JSON → `PARSE_ERROR`；schema 不符 → `SCHEMA_INVALID`；未知 type 或固件发送 `result` → `UNKNOWN_TYPE`；mock 执行器零调用 |
| **2.3** | 心跳 | `test/bridge.test.ts` | `ping` → `pong` 且 `echo` 回显；持续 ping 不断线；静默超过 `timeoutMs` 后被判离线 (`device:offline(heartbeat_timeout)`) 并断开 |
| **2.4** | SAFE 直接执行 | `test/bridge.test.ts` | `app.open` → `open -a Terminal`；`keyboard.shortcut Command+Tab` → `osascript key code 48 using {command down}`；`system.volume 140` 钳位为 100 |
| **2.5** | CONFIRM 流程 | `test/bridge.test.ts` | `shell.run npm test` → `confirm_required`；确认前零执行；`confirm accepted:true` 后执行并回 `result`；`accepted:false` → `CONFIRM_REJECTED`；超时 → `CONFIRM_TIMEOUT`；过期后再确认 → `NO_PENDING_CONFIRMATION` |
| **2.6** | DANGEROUS 拒绝 | `test/bridge.test.ts`, `test/guard.test.ts` | `rm -rf /`、`sudo`、`git push --force`、`mkfs`、`dd if=`、凭据路径 → `ACTION_FORBIDDEN`；未实现 action → `UNKNOWN_ACTION` |
| **2.7** | id 配对 | `test/bridge.test.ts` | 等待确认期间重复 id → `DUPLICATE_ID`；断线重连后旧 id 的 pending 作废、新连接可复用同一 id；多固件同 id 结果只回发起连接 |
| **2.8** | 状态广播 | `test/bridge.test.ts` | 连接建立即收到 `status`（`connection:"online"`、`active_app` 占位 `null`、`pending_confirmations`） |

### 3.2 固件现场验收 (NOT_COMPILED — 需先 `pio run`)

固件 Phase 2 代码在无 PlatformIO 的环境编写，**尚未编译**。请先执行：

```bash
cd firmware
pio run                                   # 编译 (拉取 links2004/WebSockets、ArduinoJson)
pio run --target upload && pio device monitor --baud 115200
```
Wi-Fi / Bridge 地址通过 `build_flags` 覆盖 `include/net_config.h` 的默认值 (`-DKUNLUN_WIFI_SSID=\"...\"` 等)，Bridge 在 Mac 上 `cd bridge && npm run dev`。

| 序号 | 验证项 | 测试操作步骤 | 预期结果 |
| :--- | :--- | :--- | :--- |
| **2.9** | 上电连接 | 上电，Bridge 已启动 | 屏幕先显示 CONNECTING，Wi-Fi/WS 握手成功后进入 IDLE，状态栏显示 `WiFi` + `BRIDGE` + ●Mac；Bridge 日志打印 `固件已连接` 并发送 `status` |
| **2.10** | 离线回退 | 上电，Bridge 未启动 | 8 s 后自动进入 IDLE，状态栏显示 `HID`；卡片仍通过 USB HID 直控 Mac |
| **2.11** | 经 Bridge 执行 SAFE | 在线状态点击 `APP SWITCH` | 固件发送 `keyboard.shortcut Command+Tab`，屏幕显示 EXECUTING → [OK]，Mac 轮换应用；Bridge 日志 `-> SAFE` |
| **2.12** | CONFIRM 弹窗 | 用 `wscat`/脚本或自定义卡片向 Bridge 发送 `shell.run npm test` 的 action (固件 id) | 屏幕弹出 CONFIRM REQUIRED + summary；点 CONFIRM → 执行并显示 [OK]；点 CANCEL → `已取消`；不操作 20 s → `确认超时` |
| **2.13** | 心跳与重连 | 运行中停止 Bridge，30 s 后重启 | 固件 ≤15 s 内切回 `HID`；Bridge 重启后按退避 (1/2/4…s) 自动重连并恢复 `BRIDGE`；进行中的 Bridge 流程被取消回 IDLE |
| **2.14** | Wi-Fi 波动 | 关闭再打开路由器 Wi-Fi | 状态栏 `No-WiFi` → `WiFi`，自动重连 Bridge，无需重启设备 |
