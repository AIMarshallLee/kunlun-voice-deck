# Kunlun Voice Deck

> Turn **M5Stack CoreS3** into an AI voice control deck for your computer.  
> **Voice. Touch. Control. Automate.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Hardware: M5Stack CoreS3](https://img.shields.io/badge/Hardware-M5Stack%20CoreS3-orange.svg)](https://docs.m5stack.com/en/core/CoreS3)
[![Host: macOS](https://img.shields.io/badge/Host-macOS-black.svg)]()

[English](README.md) | [简体中文](README.zh-CN.md)

---

## 1. Overview

**Kunlun Voice Deck** is a physical desktop AI controller tailored for your desk. It bridges physical sensory interactions (capacitive touch, voice wake-word, and display) with your Mac desktop.

### Core Values
- **Local-First & Low Latency**: Core HID keypresses run directly over native USB-OTG without network roundtrips.
- **Strict Decoupling**: The ESP32-S3 firmware handles sensing, local wake-word, and UI feedback, while the macOS Bridge handles context understanding, app control, and agent orchestration.
- **Safety First**: Dangerous actions require explicit on-screen touch confirmation.

---

## 2. Features

- [x] **Phase 0 — Hardware Bring-up**: Display (ILI9342C), Capacitive Touch (FT6336U), Power/Backlight management (AXP2101), and feedback tones (AW88298).
- [x] **Phase 1 — Native USB HID Controller**:
  - **macOS Shortcuts**: `Command + Tab` (App switcher), `Command + Space` (Spotlight), Mission Control, and Desktop minimization.
  - **Composite USB-OTG**: Native USB CDC Serial + USB HID Keyboard/Mouse without third-party drivers.
  - **Dynamic Dark-Mode Deck**: Reactive touch tiles with tactile visual and auditory feedback.
- [x] **Phase 2 — macOS Bridge & WebSocket Sync** (Bridge tested locally / firmware NOT compiled):
  - **Bridge (TypeScript)**: WebSocket server, JSON-schema validation, `id` pairing, ping/pong heartbeat with offline detection, `status` broadcast;
  - **Action Router**: `app.open` / `app.close` / `keyboard.shortcut` / `keyboard.press` / `url.open` / `system.volume` / `shell.run` / `workflow.run`;
  - **Security Guard**: SAFE executes immediately, CONFIRM sends `confirm_required` and waits for on-screen confirmation, DANGEROUS is rejected (`ACTION_FORBIDDEN`);
  - **Firmware** `net/ws_client` (Wi-Fi + WebSocket client, heartbeat, exponential-backoff reconnect, confirm dialog); deck cards are routed through the Bridge and fall back to native USB HID when offline — **not compiled yet, verify with `pio run`**.
- [ ] **Phase 3 — Offline Wake-word ("昆仑") & Voice Pipeline** (Planned)
- [ ] **Phase 4 — Context-Aware Dynamic Deck** (Planned)
- [ ] **Phase 5 — AI Agent / Codex / Webhook Automations** (Planned)

---

## 3. Architecture

```
┌─────────────────────────────────┐
│        M5Stack CoreS3           │
│                                 │
│  Wake Word (Offline)            │
│  Microphone (ES7210)            │
│  Touch UI (2.0" 320x240)        │
│  Speaker (AW88298)              │
│  Native USB HID (Composite)     │
└──────────────┬──────────────────┘
               │ Native USB / WebSocket
               ▼
┌─────────────────────────────────┐
│        Kunlun Bridge            │
│             macOS               │
│                                 │
│  Action Router (Namespace)      │
│  Context Engine (Active App)    │
│  Command Executor (AppleScript) │
│  Security Gate (Confirmation)   │
└──────────────┬──────────────────┘
               │
      ┌────────┼────────┬─────────┐
      ▼        ▼        ▼         ▼
    macOS    Shell     Codex      HTTP
     App    Scripts    Agent    Workflow
```

---

## 4. Hardware Requirements

- **M5Stack CoreS3** (ESP32-S3FN8, 16MB Flash, 8MB PSRAM)
- **High-speed USB Type-C Cable** (must support USB 2.0 data lines for native USB-OTG)
- **Mac Computer** (macOS 12.0+)

---

## 5. Getting Started

### 5.1 Firmware Build & Flash (PlatformIO)

1. Install [PlatformIO](https://platformio.org/):
   ```bash
   pip3 install platformio
   ```
2. Build firmware:
   ```bash
   cd firmware
   pio run
   ```
3. Connect M5Stack CoreS3 via USB-C and flash:
   ```bash
   pio run --target upload
   ```

### 5.2 Kunlun Bridge Setup (macOS)

1. Install dependencies:
   ```bash
   cd bridge
   pnpm install # or npm install
   ```
2. Run the local test suite (no macOS required) and start the bridge:
   ```bash
   npm test
   npm run dev     # listens on ws://0.0.0.0:8765 by default
   ```
3. Point the firmware at your Mac via `build_flags` in `firmware/platformio.ini` (`-DKUNLUN_WIFI_SSID`, `-DKUNLUN_WIFI_PASS`, `-DKUNLUN_BRIDGE_HOST`); see `firmware/include/net_config.h`.

---

## 6. Security Model

Every trigger is governed by three permission tiers:
1. **SAFE**: Executed immediately (e.g., App Switch, Volume adjust, Open Browser).
2. **CONFIRM**: Prompts on-screen confirmation button on the CoreS3 (e.g., Git Push, Deploy, Run Scripts).
3. **DANGEROUS**: Prohibited from blind voice triggers; requires explicit dual authorization.

---

## 7. License

Released under the [MIT License](LICENSE).
