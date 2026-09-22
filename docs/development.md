# Kunlun Voice Deck — 开发者指南与阶段验收计划

## 1. 整体演进路线 (Roadmap)

- [x] **Phase 0 — Hardware Bring-up (当前阶段)**：屏幕、触摸、电源/背光、原生 USB CDC/HID 基础驱动就绪，板载硬件自检通过。
- [x] **Phase 1 — USB HID 实体控制 (当前阶段)**：实现原生复合 HID 键盘与鼠标，支持 Command+Tab、快捷卡片触控直控 macOS。
- [ ] **Phase 2 — Bridge 核心与状态同步**：WebSocket 双向通道、心跳、断线重连、Action Router。
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
