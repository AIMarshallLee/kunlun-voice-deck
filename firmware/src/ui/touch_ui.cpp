#include "ui/touch_ui.h"
#include "hid/hid_manager.h"
#include "state/state_machine.h"
#include "hal/hal_board.h"
#include "net/ws_client.h"
#include "net_config.h"
#include <esp_log.h>
#include <cstring>

static const char* TAG = "KunlunUI";

TouchUi::TouchUi()
    : m_macConnected(true),
      m_wifiConnected(false),
      m_voiceActive(false),
      m_bridgeOnline(false),
      m_lastRenderedState(SystemState::BOOT),
      m_pressedCardIndex(-1) {
    m_pendingConfirmId[0] = '\0';
    
    // 初始化 2x2 触控卡片网格
    m_cards[0] = { 10,  36, 145, 92, "APP SWITCH", "Cmd + Tab",  0x18E3, 0x03E0, DeckActionType::SHORTCUT_CMD_TAB };
    m_cards[1] = { 165, 36, 145, 92, "SPOTLIGHT",  "Cmd + Space", 0x18E3, 0x03E0, DeckActionType::SHORTCUT_TERMINAL };
    m_cards[2] = { 10, 136, 145, 92, "MISSION",    "Ctrl + Up",   0x18E3, 0x03E0, DeckActionType::SHORTCUT_BROWSER };
    m_cards[3] = { 165, 136, 145, 92, "DESKTOP",    "Show Desk",   0x18E3, 0x03E0, DeckActionType::SHORTCUT_DESKTOP };
}

void TouchUi::init() {
    M5.Display.clear(TFT_BLACK);
    drawHeader();
    drawDeckGrid();
    m_lastRenderedState = SystemState::IDLE;
}

void TouchUi::setMacConnected(bool connected) {
    if (m_macConnected != connected) {
        m_macConnected = connected;
        drawHeader();
    }
}

void TouchUi::setWifiConnected(bool connected) {
    if (m_wifiConnected != connected) {
        m_wifiConnected = connected;
        drawHeader();
    }
}

void TouchUi::setVoiceActive(bool active) {
    if (m_voiceActive != active) {
        m_voiceActive = active;
        drawHeader();
    }
}

void TouchUi::setBridgeOnline(bool online) {
    if (m_bridgeOnline != online) {
        m_bridgeOnline = online;
        drawHeader();
        if (m_lastRenderedState == SystemState::IDLE) {
            drawDeckGrid();   // 副标签随 HID / Bridge 模式切换
        }
    }
}

void TouchUi::setPendingConfirmId(const char* id) {
    strncpy(m_pendingConfirmId, id ? id : "", sizeof(m_pendingConfirmId) - 1);
    m_pendingConfirmId[sizeof(m_pendingConfirmId) - 1] = '\0';
}

void TouchUi::drawHeader() {
    // 顶部状态栏区域 (320 x 28)
    M5.Display.fillRect(0, 0, 320, 30, 0x1082); // 深灰底色
    M5.Display.drawFastHLine(0, 29, 320, 0x3186);

    M5.Display.setTextColor(TFT_WHITE, 0x1082);
    M5.Display.setTextSize(1);
    M5.Display.drawString("KUNLUN DECK", 12, 10);

    // 链路模式标签：Bridge 在线走 WebSocket，否则 HID 直控回退
    M5.Display.setTextColor(m_bridgeOnline ? 0x07E0 : 0x7BEF, 0x1082);
    M5.Display.drawString(m_bridgeOnline ? "BRIDGE" : "HID", 120, 10);

    // Wi-Fi 状态图标
    if (m_wifiConnected) {
        M5.Display.setTextColor(0x07E0, 0x1082);
        M5.Display.drawString("WiFi", 220, 10);
    } else {
        M5.Display.setTextColor(0x7BEF, 0x1082);
        M5.Display.drawString("No-WiFi", 205, 10);
    }

    // Mac 连接指示点 (●Mac 或 ○Mac，PRD 14 规范)
    if (m_macConnected) {
        M5.Display.fillCircle(275, 14, 4, 0x07E0); // 绿色实心
        M5.Display.setTextColor(TFT_WHITE, 0x1082);
        M5.Display.drawString("Mac", 285, 10);
    } else {
        M5.Display.drawCircle(275, 14, 4, 0x7BEF); // 灰色空心
        M5.Display.setTextColor(0x7BEF, 0x1082);
        M5.Display.drawString("Mac", 285, 10);
    }
}

void TouchUi::drawDeckGrid() {
    for (int i = 0; i < CARD_COUNT; ++i) {
        const auto& card = m_cards[i];
        bool isPressed = (m_pressedCardIndex == i);

        uint32_t bg = isPressed ? 0x2124 : 0x18C3;
        uint32_t border = isPressed ? 0x07E0 : 0x3186;

        // 圆角矩形卡片
        M5.Display.fillRoundRect(card.x, card.y, card.w, card.h, 8, bg);
        M5.Display.drawRoundRect(card.x, card.y, card.w, card.h, 8, border);

        // 卡片主标题
        M5.Display.setTextColor(TFT_WHITE, bg);
        M5.Display.setTextSize(2);
        int16_t textX = card.x + (card.w - M5.Display.textWidth(card.label)) / 2;
        M5.Display.drawString(card.label, textX, card.y + 26);

        // 卡片副标签
        M5.Display.setTextColor(0x7BEF, bg);
        M5.Display.setTextSize(1);
        int16_t subX = card.x + (card.w - M5.Display.textWidth(card.sublabel)) / 2;
        M5.Display.drawString(card.sublabel, subX, card.y + 56);
    }
}

void TouchUi::drawListeningView() {
    M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);
    
    // 居中大圆呼吸环
    M5.Display.drawCircle(160, 95, 26, 0x07E0);
    M5.Display.fillCircle(160, 95, 18, 0x0400);

    M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
    M5.Display.setTextSize(2);
    M5.Display.drawString("我在听...", 120, 145);

    // 绘制音频波形线示意
    M5.Display.drawFastHLine(60, 185, 200, 0x07E0);
}

void TouchUi::drawConnectingView() {
    M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);
    M5.Display.setTextColor(0x7BEF, TFT_BLACK);
    M5.Display.setTextSize(1);
    M5.Display.drawString("CONNECTING", 20, 45);
    M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
    M5.Display.setTextSize(2);
    M5.Display.drawString("等待 Bridge...", 20, 75);
    M5.Display.setTextSize(1);
    M5.Display.setTextColor(0x7BEF, TFT_BLACK);
    M5.Display.drawString(m_wifiConnected ? "Wi-Fi OK, 连接 Bridge" : "连接 Wi-Fi 中", 20, 110);
    M5.Display.drawString("超时后自动进入 HID 直控模式", 20, 125);
}

void TouchUi::drawConfirmView(const char* summary) {
    M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);

    M5.Display.setTextColor(0xFD20, TFT_BLACK);   // 橙色警示
    M5.Display.setTextSize(1);
    M5.Display.drawString("CONFIRM REQUIRED", 20, 42);

    M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
    M5.Display.setTextSize(2);
    M5.Display.drawString(summary, 20, 65);

    // 左：取消 (灰)  右：确认 (绿)   —— 热区见 handleConfirmTouch
    M5.Display.fillRoundRect(20, 150, 130, 60, 8, 0x4208);
    M5.Display.drawRoundRect(20, 150, 130, 60, 8, 0x7BEF);
    M5.Display.setTextColor(TFT_WHITE, 0x4208);
    M5.Display.drawString("CANCEL", 20 + (130 - M5.Display.textWidth("CANCEL")) / 2, 172);

    M5.Display.fillRoundRect(170, 150, 130, 60, 8, 0x0400);
    M5.Display.drawRoundRect(170, 150, 130, 60, 8, 0x07E0);
    M5.Display.setTextColor(TFT_WHITE, 0x0400);
    M5.Display.drawString("CONFIRM", 170 + (130 - M5.Display.textWidth("CONFIRM")) / 2, 172);
}

void TouchUi::drawExecutingView(const char* actionName) {
    M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);

    M5.Display.setTextColor(0x07E0, TFT_BLACK);
    M5.Display.setTextSize(1);
    M5.Display.drawString("EXECUTING", 20, 45);

    M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
    M5.Display.setTextSize(2);
    M5.Display.drawString(actionName, 20, 75);

    // 进度条渲染
    M5.Display.fillRect(20, 120, 280, 10, 0x18C3);
    M5.Display.fillRect(20, 120, 180, 10, 0x07E0);
}

void TouchUi::drawResultView(bool success, const char* message) {
    M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);

    if (success) {
        M5.Display.setTextColor(0x07E0, TFT_BLACK);
        M5.Display.setTextSize(3);
        M5.Display.drawString("[OK]", 130, 80);
    } else {
        M5.Display.setTextColor(0xF800, TFT_BLACK);
        M5.Display.setTextSize(3);
        M5.Display.drawString("[!]", 140, 80);
    }

    M5.Display.setTextColor(TFT_WHITE, TFT_BLACK);
    M5.Display.setTextSize(2);
    int16_t msgX = (320 - M5.Display.textWidth(message)) / 2;
    if (msgX < 10) msgX = 10;
    M5.Display.drawString(message, msgX, 135);
}

void TouchUi::render(SystemState state) {
    if (state != m_lastRenderedState) {
        m_lastRenderedState = state;
        switch (state) {
            case SystemState::IDLE:
                M5.Display.fillRect(0, 30, 320, 210, TFT_BLACK);
                drawHeader();
                drawDeckGrid();
                break;
            case SystemState::CONNECTING:
                drawHeader();
                drawConnectingView();
                break;
            case SystemState::LISTENING:
                drawHeader();
                drawListeningView();
                break;
            case SystemState::EXECUTING:
                drawHeader();
                drawExecutingView(StateMachine::instance().getExecutingLabel());
                break;
            case SystemState::CONFIRMATION_REQUIRED:
                drawHeader();
                drawConfirmView(StateMachine::instance().getConfirmSummary());
                break;
            case SystemState::RESULT:
                drawHeader();
                drawResultView(
                    StateMachine::instance().isResultSuccess(),
                    StateMachine::instance().getResultMessage()
                );
                break;
            default:
                break;
        }
    }
}

void TouchUi::handleTouch(const m5::touch_detail_t& touchDetail) {
    int16_t tx = touchDetail.x;
    int16_t ty = touchDetail.y;

    if (m_lastRenderedState == SystemState::CONFIRMATION_REQUIRED) {
        if (touchDetail.wasPressed()) {
            handleConfirmTouch(tx, ty);
        }
        return;
    }

    if (m_lastRenderedState != SystemState::IDLE) {
        return;
    }

    if (touchDetail.wasPressed()) {
        // 查找命中的卡片
        for (int i = 0; i < CARD_COUNT; ++i) {
            const auto& c = m_cards[i];
            if (tx >= c.x && tx <= (c.x + c.w) && ty >= c.y && ty <= (c.y + c.h)) {
                m_pressedCardIndex = i;
                drawDeckGrid();
                HalBoard::instance().playFeedbackTone(2400, 30);
                dispatchCardAction(c);
                break;
            }
        }
    } else if (touchDetail.wasReleased()) {
        if (m_pressedCardIndex != -1) {
            m_pressedCardIndex = -1;
            if (m_lastRenderedState == SystemState::IDLE) {
                drawDeckGrid();
            }
        }
    }
}

void TouchUi::handleConfirmTouch(int16_t tx, int16_t ty) {
    if (ty < 150 || ty > 210) return;
    bool accepted;
    if (tx >= 20 && tx <= 150) {
        accepted = false;
    } else if (tx >= 170 && tx <= 300) {
        accepted = true;
    } else {
        return;
    }
    HalBoard::instance().playFeedbackTone(accepted ? 2800 : 1600, 40);
    ESP_LOGI(TAG, "二次确认: %s (%s)", accepted ? "CONFIRM" : "CANCEL", m_pendingConfirmId);

    if (WsClient::instance().sendConfirm(m_pendingConfirmId, accepted)) {
        if (accepted) {
            StateMachine::instance().setExecuting("Confirmed", KUNLUN_ACTION_TIMEOUT_MS);
        } else {
            StateMachine::instance().setResultState("已取消", false, 800);
        }
    } else {
        StateMachine::instance().setResultState("Bridge 离线", false, 1000);
    }
    m_pendingConfirmId[0] = '\0';
}

void TouchUi::dispatchCardAction(const DeckCard& card) {
    // Phase 2: Bridge 在线 -> 经 WebSocket 发送协议 action (语义/安全由 Bridge 判定)
    //          Bridge 离线 -> Phase 1 原生 HID 直控回退
    if (m_bridgeOnline && WsClient::instance().isOnline()) {
        dispatchViaBridge(card);
    } else {
        dispatchViaHid(card);
    }
}

void TouchUi::dispatchViaBridge(const DeckCard& card) {
    const char* action = nullptr;
    const char* payload = nullptr;
    switch (card.action) {
        case DeckActionType::SHORTCUT_CMD_TAB:
            action = "keyboard.shortcut"; payload = "{\"modifiers\":[\"Command\"],\"key\":\"Tab\"}";
            break;
        case DeckActionType::SHORTCUT_TERMINAL:
            action = "keyboard.shortcut"; payload = "{\"modifiers\":[\"Command\"],\"key\":\"Space\"}";
            break;
        case DeckActionType::SHORTCUT_BROWSER:
            action = "keyboard.shortcut"; payload = "{\"modifiers\":[\"Control\"],\"key\":\"Up\"}";
            break;
        case DeckActionType::SHORTCUT_DESKTOP:
            action = "keyboard.press"; payload = "{\"key\":\"F11\"}";
            break;
        default:
            return;
    }

    String id = WsClient::instance().sendAction(action, payload);
    if (id.length() == 0) {
        dispatchViaHid(card);   // 发送失败即时回退
        return;
    }
    StateMachine::instance().setExecuting(card.label, KUNLUN_ACTION_TIMEOUT_MS);
}

void TouchUi::dispatchViaHid(const DeckCard& card) {
    // 触发对应 HID 控制动作 (Phase 1 核心，Phase 2 作为离线回退保留)
    switch (card.action) {
        case DeckActionType::SHORTCUT_CMD_TAB:
            HidManager::instance().sendCmdTab();
            StateMachine::instance().setResultState("Cmd + Tab 触发", true, 800);
            break;
        case DeckActionType::SHORTCUT_TERMINAL:
            HidManager::instance().sendSpotlight();
            StateMachine::instance().setResultState("Spotlight 打开", true, 800);
            break;
        case DeckActionType::SHORTCUT_BROWSER:
            HidManager::instance().sendMissionControl();
            StateMachine::instance().setResultState("调度中心展开", true, 800);
            break;
        case DeckActionType::SHORTCUT_DESKTOP:
            HidManager::instance().pressKey(KEY_F11);
            delay(20);
            HidManager::instance().releaseAll();
            StateMachine::instance().setResultState("桌面切换", true, 800);
            break;
        default:
            break;
    }
}
