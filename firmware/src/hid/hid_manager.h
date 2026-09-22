#pragma once

#include <Arduino.h>
#include "USB.h"
#include "USBHIDKeyboard.h"
#include "USBHIDMouse.h"

/**
 * @brief 原生 USB-HID 管理器 (Phase 1 核心)
 * 基于 ESP32-S3 原生 USB-OTG 控制器，向 macOS 提供免驱的 Composite HID 接口
 */
class HidManager {
public:
    static HidManager& instance() {
        static HidManager inst;
        return inst;
    }

    bool init();
    bool isConnected() const;

    // 组合快捷键 (macOS 专属)
    void sendCmdTab();               // Command + Tab 切换应用 (测试 A)
    void sendSpotlight();            // Command + Space 聚焦搜索
    void sendCopy();                 // Command + C
    void sendPaste();                // Command + V
    void sendCloseWindow();          // Command + W
    void sendQuitApp();              // Command + Q
    void sendMissionControl();       // Control + Up 调度中心 / 显示桌面

    // 基础按键与修饰键
    void pressKey(uint8_t key);
    void releaseKey(uint8_t key);
    void releaseAll();

    // 鼠标快捷控制
    void mouseClick(uint8_t button = MOUSE_LEFT);
    void mouseScroll(int8_t wheel);
    void mouseMove(int8_t x, int8_t y);

private:
    HidManager();
    USBHIDKeyboard m_keyboard;
    USBHIDMouse m_mouse;
    bool m_initialized;
};
