#pragma once

#include <M5Unified.h>
#include <Arduino.h>

class HalBoard {
public:
    static HalBoard& instance() {
        static HalBoard inst;
        return inst;
    }

    bool init();
    void update();

    // 屏幕与亮度控制
    void setBrightness(uint8_t brightness);
    void turnScreenOn();
    void turnScreenOff();
    bool isScreenOn() const { return m_screenOn; }

    // 声音反馈
    void playFeedbackTone(uint16_t freq = 2000, uint32_t durationMs = 50);

    // 电源与电池状态
    int32_t getBatteryLevel();
    bool isCharging();

private:
    HalBoard() : m_screenOn(true), m_brightness(128) {}
    bool m_screenOn;
    uint8_t m_brightness;
};
