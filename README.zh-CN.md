# Kunlun Voice Deck (昆仑语音控制台)

> 将 **M5Stack CoreS3** 打造为放置在电脑身旁的实体 AI 语音与触控控制台。  
> **Voice. Touch. Control. Automate.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hardware: M5Stack CoreS3](https://img.shields.io/badge/Hardware-M5Stack%20CoreS3-orange.svg)](https://docs.m5stack.com/zh_CN/core/CoreS3)
[![Host: macOS](https://img.shields.io/badge/Host-macOS-black.svg)]()

[English](README.md) | [简体中文](README.zh-CN.md)

---

## 1. 产品定义与定位

**Kunlun Voice Deck** 不是单纯的红外遥控器，也不是简单的 Stream Deck 复制品。

它是一台放置在电脑旁的实体 AI 桌面交互终端。用户无需拿起设备，通过语音唤醒、触控按键、原生 USB HID 与 Wi-Fi，即可无缝联动控制 macOS、Terminal、Codex、自动化脚本与 AI 工作流。

### 核心设计原则
- **Local First & 极低延迟**：实体按键与控制通过 ESP32-S3 原生 USB-OTG HID 直达 Mac，无网络中转与延迟。
- **固件与业务解耦**：CoreS3 专精于交互感知、状态呈现与离线唤醒；复杂的语义理解、上下文跟踪与脚本执行全部由运行在 Mac 本地的 Kunlun Bridge 处理。
- **高危操作防御**：涉及 Git Push、生产部署、文件变更的操作强制拉起屏幕二次触控确认。

---

## 2. 当前实现与阶段进展

- [x] **Phase 0 — Hardware Bring-up (硬件点亮)**：
  - 2.0" IPS 触控屏 (ILI9342C) 暗色渲染与背光控制；
  - FT6336U 电容触控热区命中算法；
  - AXP2101 电源域自适应管理；
  - AW88298 扬声器短促蜂鸣反馈。
- [x] **Phase 1 — 原生 USB HID 控制器**：
  - **macOS 组合快捷键**：`Command + Tab` (应用轮换切换)、`Command + Space` (Spotlight 聚焦搜索)、调度中心与桌面切换；
  - **原生复合免驱**：启用 ESP32-S3 原生 USB-CDC 串口与 USB-HID 键盘/鼠标，插上 Mac 即插即用；
  - **Dynamic Dark-Mode Deck**：触控反馈、状态栏（Wi-Fi、Mac 连接指示灯 ●Mac / ○Mac）。
- [x] **Phase 2 — Kunlun Bridge 与 WebSocket 协同** (Bridge 已本地测试 / 固件未编译)：
  - **Bridge (TypeScript)**：WebSocket 服务、报文 schema 校验、`id` 配对、ping/pong 心跳与超时判离线、`status` 状态广播；
  - **Action Router**：`app.open` / `app.close` / `keyboard.shortcut` / `keyboard.press` / `url.open` / `system.volume` / `shell.run` / `workflow.run`；
  - **Security Guard**：SAFE 直接执行、CONFIRM 回送 `confirm_required` 等待屏幕确认、DANGEROUS 拒绝 (`ACTION_FORBIDDEN`)；
  - **固件** `net/ws_client` (Wi-Fi + WebSocket 客户端、心跳、指数退避重连、确认弹窗)，卡片动作经 Bridge 下发，离线自动回退 USB HID 直控 —— **代码未编译，需 `pio run` 验证**。
- [ ] **Phase 3 — 离线唤醒词 ("昆仑") 与语音链路** (规划中)
- [ ] **Phase 4 — Dynamic Deck 上下文感应** (规划中)
- [ ] **Phase 5 — AI Agent / Codex / Webhook 调度** (规划中)

---

## 3. 硬件要求

- **M5Stack CoreS3 核心开发板** (内置 ESP32-S3FN8, 16MB Flash, 8MB PSRAM)
- **优质 USB Type-C 数据线** (必须支持 USB 2.0 数据传输，用于原生 USB-OTG)
- **Mac 电脑** (macOS 12.0+)

---

## 4. 快速上手

### 4.1 固件编译与烧录 (PlatformIO)

1. 安装 [PlatformIO](https://platformio.org/)：
   ```bash
   pip3 install platformio
   ```
2. 编译固件：
   ```bash
   cd firmware
   pio run
   ```
3. 使用 USB-C 连接 M5Stack CoreS3，一键烧录：
   ```bash
   pio run --target upload
   ```
4. 监控设备日志：
   ```bash
   pio device monitor --baud 115200
   ```

### 4.2 启动 macOS 本地 Bridge 服务

```bash
cd bridge
npm install
npm test        # 本地自动化测试 (不依赖 macOS)
npm run dev     # 默认监听 ws://0.0.0.0:8765
```

固件侧需通过 `firmware/platformio.ini` 的 `build_flags` 指定 `-DKUNLUN_WIFI_SSID`、`-DKUNLUN_WIFI_PASS`、`-DKUNLUN_BRIDGE_HOST` (Mac 局域网 IP)，详见 `firmware/include/net_config.h`。

---

## 5. 安全三级防护模型

| 级别 | 策略 | 动作示例 |
| :--- | :--- | :--- |
| **SAFE** | 收到立即执行 | 切换窗口 (`Command+Tab`)、调整音量、打开浏览器 |
| **CONFIRM** | 必须屏幕二次确认 | Git Push、脚本部署、消息发送 |
| **DANGEROUS** | 禁止语音直发，强校验 | 批量文件删除、格式化、修改凭证 |

---

## 6. 开源协议

本项目基于 [MIT License](LICENSE) 开源。
