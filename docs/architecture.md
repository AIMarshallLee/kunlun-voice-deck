# Kunlun Voice Deck — 架构设计白皮书 (V1.0)

## 1. 概述与核心定位

**Kunlun Voice Deck** 是一台置于电脑桌旁的实体 AI 控制终端（AI Voice & Touch Console），首发硬件平台为 **M5Stack CoreS3 (ESP32-S3)**，首发控制宿主为 **macOS**。

产品设计遵循以下核心原则：
- **Local First**：核心控制与输入响应在本地局域网与 USB HID 上完成，不依赖外部云端中转。
- **低延迟感知**：利用 ESP32-S3 原生 USB-OTG 控制器，提供近乎零延迟的原生按键与鼠标事件触发。
- **职责严格解耦**：
  - **CoreS3 固件端 (Firmware)**：负责**环境感知、触控交互、实体控制、状态呈现与本地离线唤醒**。坚决不把复杂的业务逻辑、LLM 调用、网络爬虫或外部系统集成塞入 ESP32 芯片中。
  - **宿主网桥端 (Kunlun Bridge)**：在 macOS 本地运行，负责**语义理解、系统上下文感知 (Active App/Window)、高危权限审核、自动化脚本执行与外部 Agent (如 Codex / Workflow) 调度**。
- **状态机驱动**：固件交互全生命周期由明确的有限状态机 (FSM) 驱动，杜绝网状调用与面条代码。

---

## 2. 总体架构拓扑图

```
┌────────────────────────────────────────────────────────┐
│             M5Stack CoreS3 (ESP32-S3)                  │
│                                                        │
│  [ Wake Word Engine ] (Local 离线唤醒)                   │
│  [ Audio Pipeline   ] (AW88298 功放 / ES7210 录音)      │
│  [ Touch UI Deck    ] (ILI9342C + FT6336U 触控网格)     │
│  [ Native USB HID   ] (USB Composite: Keyboard + Mouse)│
│  [ State Machine    ] (BOOT -> IDLE -> EXEC -> RESULT) │
└──────────────────────────┬─────────────────────────────┘
                           │
             USB HID / Native USB CDC / WebSocket
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             Kunlun Bridge (macOS Local)                │
│                                                        │
│  [ Connection Manager ] (WebSocket / Serial 心跳与重连)  │
│  [ Action Router      ] (统一命名空间分发器: app/sys/shell) │
│  [ Context Engine     ] (Active App / Active Window 探测)│
│  [ Command Executor   ] (AppleScript / Shell / Shortcuts)│
│  [ Speech Service     ] (STT / Intent Parser 抽象层)     │
│  [ Security Guard     ] (SAFE / CONFIRM / DANGEROUS 三级) │
└────────────┬─────────────┬─────────────┬───────────────┘
             │             │             │
             ▼             ▼             ▼
      ┌─────────────┐┌─────────────┐┌────────────────────┐
      │  macOS Apps ││ Shell / CLI ││ AI Agent / Workflow│
      │ (Terminal / ││ (Git / Test ││ (Codex / n8n /     │
      │  Browser)   ││  Scripts)   ││  Webhook)          │
      └─────────────┘└─────────────┘└────────────────────┘
```

---

## 3. CoreS3 硬件接口与抽象层映射

| 硬件子系统 | 控制芯片 / 接口 | 固件驱动库与实现策略 |
| :--- | :--- | :--- |
| **中央处理器** | ESP32-S3FN8 (240MHz 双核) | 8MB PSRAM, 16MB Flash, QIO/OPI 高速总线 |
| **显示子系统** | 2.0寸 IPS (320x240) ILI9342C | `M5Unified.Display`，高刷双缓冲暗色系渲染 |
| **触控子系统** | FT6336U (电容屏) | `M5Unified.Touch`，区域命中检测与防误触 |
| **电源与背光** | AXP2101 + AW9523B | `M5Unified.Power`，支持亮屏/息屏待机降耗 |
| **USB 控制器** | 原生 USB OTG (GPIO19/20) | `USBHIDKeyboard` + `USBHIDMouse` (原生复合设备) |
| **扬声器功放** | AW88298 (I2S) | `M5Unified.Speaker` 提示音与语音播报 |
| **麦克风录音** | ES7210 (双麦 ADC) | `M5Unified.Mic` 16kHz 录音与离线唤醒词检测 |

---

## 4. 核心状态机设计 (State Machine)

固件主线程围绕明确的状态转移逻辑运行：

```
       [BOOT]
         │ (硬件初始化、USB枚举)
         ▼
    [CONNECTING]
         │ (建立链路就绪)
         ▼
  ┌───►[IDLE] (待机/极简时钟/息屏节能)
  │      │
  │      ├── (触控卡片点击) ────────────────────────┐
  │      │                                         ▼
  │      │                                  [HID_EXECUTING]
  │      │                                         │
  │      └── (本地识别到“昆仑”唤醒词)                 │
  │             │                                  │
  │             ▼                                  │
  │      [WAKE_DETECTED] (亮屏反馈)                │
  │             │                                  │
  │             ▼                                  │
  │      [LISTENING] (我在听，拾音录音)              │
  │             │                                  │
  │             ▼                                  │
  │      [PROCESSING] (上传音频 / STT 意图解析)     │
  │             │                                  │
  │             ├── [需要屏幕确认?] ──► [CONFIRMATION]
  │             │                            │ (确认)
  │             ▼                            ▼
  │      [BRIDGE_EXECUTING] (执行终端/脚本指令)
  │             │
  │             ▼
  │      [RESULT] (显示成功✓或错误提示，播报短音频)
  │             │ (展示 1.5 秒)
  └─────────────┘
```

---

## 5. 安全与权限三级防护模型

所有由 CoreS3 或 Bridge 触发的操作必须归属于以下三个安全等级之一：

1. **SAFE (安全级别)**
   - 行为：无需确认，收到指令即刻触发。
   - 典型动作：打开应用程序（`app.open`）、切换前台应用（`keyboard.shortcut Command+Tab`）、调整系统音量、桌面展示。
2. **CONFIRM (确认级别)**
   - 行为：Bridge 拦截执行并向 CoreS3 屏幕发送确认弹窗请求，用户在触摸屏点击【确认】后方可执行。
   - 典型动作：Git Push、部署测试脚本、发送外部消息、覆盖配置文件。
3. **DANGEROUS (高危级别)**
   - 行为：默认禁止语音直接触发，严格要求屏幕双重确认并配合 Bridge 白名单校验。
   - 典型动作：系统关键文件删除、格式化操作、凭证密钥修改。
