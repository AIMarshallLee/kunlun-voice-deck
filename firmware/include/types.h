#pragma once

#include <Arduino.h>

/**
 * @brief 系统全局运行状态枚举 (PRD 5.1 状态机)
 */
enum class SystemState {
    BOOT,                   // 上电自检与外设初始化
    CONNECTING,             // 正在建立 USB-HID / Wi-Fi 连接
    IDLE,                   // 待机状态 (极简时钟 / 暗色省电)
    WAKE_WORD_DETECTED,     // 命中唤醒词 (亮屏)
    LISTENING,              // 语音拾音中 ("我在听")
    PROCESSING,             // 语义解析处理中
    EXECUTING,              // 正在执行动作
    CONFIRMATION_REQUIRED,  // 高危动作需要屏幕确认
    RESULT,                 // 显示执行成功/失败结果
    ERROR_STATE             // 异常故障状态
};

/**
 * @brief 触控按键动作定义
 */
enum class DeckActionType {
    NONE = 0,
    SHORTCUT_CMD_TAB,       // Command + Tab (切换应用)
    SHORTCUT_TERMINAL,      // 快速打开终端
    SHORTCUT_BROWSER,       // 快速打开浏览器
    SHORTCUT_DESKTOP,       // 显示桌面
    CUSTOM_ACTION           // 自定义协议动作
};

/**
 * @brief 触控卡片配置
 */
struct DeckCard {
    int16_t x;
    int16_t y;
    int16_t w;
    int16_t h;
    const char* label;
    const char* sublabel;
    uint32_t bgColor;
    uint32_t activeColor;
    DeckActionType action;
};
