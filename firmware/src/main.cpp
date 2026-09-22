#include <Arduino.h>
#include <esp_log.h>
#include "hal/hal_board.h"
#include "hid/hid_manager.h"
#include "state/state_machine.h"
#include "ui/touch_ui.h"

static const char* TAG = "KunlunMain";

void setup() {
    Serial.begin(115200);
    delay(200);
    ESP_LOGI(TAG, "Kunlun Voice Deck 固件启动 (V1.0.0)...");

    // 1. 初始化硬件抽象层 (M5Unified / 电源 / 屏幕 / 触摸)
    HalBoard::instance().init();

    // 2. 初始化 ESP32-S3 原生 USB-HID (Keyboard / Mouse)
    HidManager::instance().init();

    // 3. 初始化状态机
    StateMachine::instance().init();

    // 4. 初始化触摸与界面
    TouchUi::instance().init();

    ESP_LOGI(TAG, "Kunlun Voice Deck 固件初始化完毕，进入待机循环。");
}

void loop() {
    // 1. 硬件轮询 (M5Unified 内部状态更新)
    HalBoard::instance().update();

    // 2. 状态机时序推进
    StateMachine::instance().update();

    // 3. 触摸手势事件捕获
    auto touchCount = M5.Touch.getCount();
    if (touchCount > 0) {
        auto detail = M5.Touch.getDetail(0);
        TouchUi::instance().handleTouch(detail);
    }

    // 4. 界面重绘
    TouchUi::instance().render(StateMachine::instance().getState());

    // 适度让出 CPU 时间片，保证 USB 协议栈稳定性
    delay(10);
}
