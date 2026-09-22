#include "hal/hal_board.h"

bool HalBoard::init() {
    auto cfg = M5.config();
    // 启用内部 I2C、屏幕、触控、电源模块
    cfg.internal_imu = false; // Phase 0 暂不加载 IMU
    cfg.internal_spk = true;  // 启用扬声器用于反馈提示
    cfg.internal_mic = true;  // 预初始化麦克风
    
    M5.begin(cfg);

    // 屏幕横屏设置 (320x240)
    M5.Display.setRotation(1);
    M5.Display.setColorDepth(16);
    M5.Display.clear(TFT_BLACK);

    setBrightness(160);

    // 播放开机声响
    playFeedbackTone(1800, 60);

    return true;
}

void HalBoard::update() {
    M5.update();
}

void HalBoard::setBrightness(uint8_t brightness) {
    m_brightness = brightness;
    M5.Display.setBrightness(brightness);
}

void HalBoard::turnScreenOn() {
    m_screenOn = true;
    M5.Display.wakeup();
    M5.Display.setBrightness(m_brightness > 0 ? m_brightness : 128);
}

void HalBoard::turnScreenOff() {
    m_screenOn = false;
    M5.Display.sleep();
}

void HalBoard::playFeedbackTone(uint16_t freq, uint32_t durationMs) {
    if (M5.Speaker.isEnabled()) {
        M5.Speaker.tone(freq, durationMs);
    }
}

int32_t HalBoard::getBatteryLevel() {
    return M5.Power.getBatteryLevel();
}

bool HalBoard::isCharging() {
    return M5.Power.isCharging();
}
