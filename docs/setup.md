# Kunlun Voice Deck — 硬件准备与环境搭建指南 (Setup Guide)

## 1. 硬件准备清单

1. **M5Stack CoreS3 核心主机**
   - 包含主控、2.0" IPS 触控屏、AW88298 功放、ES7210 录音麦克风、AXP2101 电源底座。
2. **高品质 USB Type-C 数据线**
   - **必须**使用支持完整数据传输的 USB-C 数据线连接 Mac（避免仅支持供电的充电线）。
   - CoreS3 板载的原生 USB-OTG 端口能够直接向 Mac 暴露 CDC 串口及 USB-HID 键盘/鼠标复合设备。

---

## 2. 固件编译与烧录流程 (PlatformIO)

### 2.1 依赖安装
本项目使用现代化标准的 PlatformIO 工具链：
```bash
# 安装 PlatformIO CLI
pip3 install platformio
# 或通过 Homebrew
brew install platformio
```

### 2.2 编译固件
```bash
cd firmware
pio run
```

### 2.3 烧录至 M5Stack CoreS3
将 CoreS3 用 USB-C 数据线插至 Mac：
```bash
pio run --target upload
```

### 2.4 查看实时串口日志
```bash
pio device monitor --baud 115200
```

---

## 3. macOS 权限配置说明

为了确保 Bridge 能够顺利调起应用程序并模拟按键，需要在 macOS 中授予必要的辅助功能权限：
1. **辅助功能 (Accessibility)**：
   - 打开 `系统设置 (System Settings)` -> `隐私与安全性 (Privacy & Security)` -> `辅助功能 (Accessibility)`。
   - 确保运行 Bridge 的终端（如 `Terminal`、`iTerm2` 或 `VSCode`）已被勾选允许。
2. **自动化 (Automation)**：
   - 当 Bridge 首次调用 AppleScript 打开特定 App 时，系统会弹出授权对话框，请点击“好 (OK)”。
