#include <Arduino.h>
#include <esp_log.h>
#include "hal/hal_board.h"
#include "hid/hid_manager.h"
#include "state/state_machine.h"
#include "ui/touch_ui.h"
#include "net/ws_client.h"
#include "net_config.h"

static const char* TAG = "KunlunMain";

/**
 * Phase 2 (NOT_COMPILED — 请 `pio run` 验证)：
 * 把 Bridge 链路事件接到状态机与 UI。固件只呈现 Bridge 的判定结果，
 * 不解释 action 语义，也不做安全分级。
 */
static void wireBridgeCallbacks() {
    auto& ws  = WsClient::instance();
    auto& fsm = StateMachine::instance();
    auto& ui  = TouchUi::instance();

    ws.onLinkStateChanged([&](LinkState, LinkState now) {
        bool online = (now == LinkState::ONLINE);
        ui.setWifiConnected(WsClient::instance().isWifiConnected());
        ui.setBridgeOnline(online);
        fsm.setLinkOnline(online);
    });

    ws.onConfirmRequired([&](const BridgeConfirmRequired& req) {
        ui.setPendingConfirmId(req.id);
        fsm.setConfirmation(req.summary, req.expiresInMs);
    });

    ws.onResult([&](const BridgeResult& r) {
        // 结果只能对应 EXECUTING / CONFIRMATION_REQUIRED (超时/取消也会以 result 形式到达)
        SystemState st = fsm.getState();
        if (st != SystemState::EXECUTING && st != SystemState::CONFIRMATION_REQUIRED) {
            ESP_LOGW(TAG, "忽略非执行态的 result id=%s", r.id);
            return;
        }
        if (r.success) {
            fsm.setResultState(r.message, true, 900);
        } else {
            // 把错误码压缩到屏幕可读文案
            const char* msg = r.message[0] ? r.message : r.errorCode;
            fsm.setResultState(msg, false, 1500);
        }
    });

    ws.onStatus([&](const BridgeStatus& s) {
        // Phase 4 将用 active_app 驱动 Dynamic Deck；Phase 2 仅记录
        ESP_LOGI(TAG, "Bridge status: active_app=%s pending=%u",
                 s.activeApp[0] ? s.activeApp : "(unknown)", (unsigned)s.pendingConfirmations);
    });
}

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

    // 5. Phase 2: Wi-Fi + Bridge WebSocket 链路
    wireBridgeCallbacks();
    WsClient::instance().begin();

    ESP_LOGI(TAG, "Kunlun Voice Deck 固件初始化完毕，进入待机循环。");
}

void loop() {
    // 1. 硬件轮询 (M5Unified 内部状态更新)
    HalBoard::instance().update();

    // 2. 网络链路轮询 (Wi-Fi / WebSocket / 心跳 / 重连)
    WsClient::instance().loop();
    TouchUi::instance().setWifiConnected(WsClient::instance().isWifiConnected());

    // 3. 状态机时序推进
    StateMachine::instance().update();

    // 4. 触摸手势事件捕获
    auto touchCount = M5.Touch.getCount();
    if (touchCount > 0) {
        auto detail = M5.Touch.getDetail(0);
        TouchUi::instance().handleTouch(detail);
    }

    // 5. 界面重绘
    TouchUi::instance().render(StateMachine::instance().getState());

    // 适度让出 CPU 时间片，保证 USB 协议栈稳定性
    delay(10);
}
