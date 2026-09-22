#include "ui/touch_ui.h"
#include "hid/hid_manager.h"
#include "state/state_machine.h"
#include "hal/hal_board.h"
#include <esp_log.h>

static const char* TAG = "KunlunUI";

TouchUi::TouchUi()
    : m_macConnected(true),
      m_wifiConnected(false),
      m_voiceActive(false),
      m_lastRenderedState(SystemState::BOOT),
      m_pressedCardIndex(-1) {
    
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

void TouchUi::drawHeader() {
    // 顶部状态栏区域 (320 x 28)
    M5.Display.fillRect(0, 0, 320, 30, 0x1082); // 深灰底色
    M5.Display.drawFastHLine(0, 29, 320, 0x3186);

    M5.Display.setTextColor(TFT_WHITE, 0x1082);
    M5.Display.setTextSize(1);
    M5.Display.drawString("KUNLUN DECK", 12, 10);

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
            case SystemState::LISTENING:
                drawHeader();
                drawListeningView();
                break;
            case SystemState::EXECUTING:
                drawHeader();
                drawExecutingView("Action Running");
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
    if (m_lastRenderedState != SystemState::IDLE) {
        return;
    }

    int16_t tx = touchDetail.x;
    int16_t ty = touchDetail.y;

    if (touchDetail.wasPressed()) {
        // 查找命中的卡片
        for (int i = 0; i < CARD_COUNT; ++i) {
            const auto& c = m_cards[i];
            if (tx >= c.x && tx <= (c.x + c.w) && ty >= c.y && ty <= (c.y + c.h)) {
                m_pressedCardIndex = i;
                drawDeckGrid();
                HalBoard::instance().playFeedbackTone(2400, 30);

                // 触发对应 HID 控制动作 (Phase 1 核心)
                switch (c.action) {
                    case DeckActionType::SHORTCUT_CMD_TAB:
                        // 测试 A: Command + Tab 切换 Mac 窗口
                        HidManager::instance().sendCmdTab();
                        StateMachine::instance().setResultState("Cmd + Tab 触发", true, 800);
                        break;
                    case DeckActionType::SHORTCUT_TERMINAL:
                        // Spotlight
                        HidManager::instance().sendSpotlight();
                        StateMachine::instance().setResultState("Spotlight 打开", true, 800);
                        break;
                    case DeckActionType::SHORTCUT_BROWSER:
                        // Mission Control
                        HidManager::instance().sendMissionControl();
                        StateMachine::instance().setResultState("调度中心展开", true, 800);
                        break;
                    case DeckActionType::SHORTCUT_DESKTOP:
                        // 最小化 / 显示桌面
                        HidManager::instance().pressKey(KEY_F11);
                        delay(20);
                        HidManager::instance().releaseAll();
                        StateMachine::instance().setResultState("桌面切换", true, 800);
                        break;
                    default:
                        break;
                }
                break;
            }
        }
    } else if (touchDetail.wasReleased()) {
        if (m_pressedCardIndex != -1) {
            m_pressedCardIndex = -1;
            drawDeckGrid();
        }
    }
}
