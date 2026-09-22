#pragma once

#include "types.h"
#include <M5Unified.h>

/**
 * @brief Dynamic Deck 触控与状态显示 UI 引擎
 * 严守 Dark Mode 与 PRD 8/9 视觉规范
 */
class TouchUi {
public:
    static TouchUi& instance() {
        static TouchUi inst;
        return inst;
    }

    void init();
    void render(SystemState state);
    void handleTouch(const m5::touch_detail_t& touchDetail);

    // 状态更新
    void setMacConnected(bool connected);
    void setWifiConnected(bool connected);
    void setVoiceActive(bool active);

private:
    TouchUi();

    void drawHeader();
    void drawDeckGrid();
    void drawListeningView();
    void drawExecutingView(const char* actionName);
    void drawResultView(bool success, const char* message);

    bool m_macConnected;
    bool m_wifiConnected;
    bool m_voiceActive;
    SystemState m_lastRenderedState;
    int16_t m_pressedCardIndex;

    static const uint8_t CARD_COUNT = 4;
    DeckCard m_cards[CARD_COUNT];
};
