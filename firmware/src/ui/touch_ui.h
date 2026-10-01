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
    /** Bridge 在线标志：决定卡片走 WebSocket action 还是 HID 回退 */
    void setBridgeOnline(bool online);
    /** 当前待确认的 Bridge 请求 id (由 main 在 confirm_required 回调中设置) */
    void setPendingConfirmId(const char* id);

private:
    TouchUi();

    void drawHeader();
    void drawDeckGrid();
    void drawListeningView();
    void drawConnectingView();
    void drawExecutingView(const char* actionName);
    void drawConfirmView(const char* summary);
    void drawResultView(bool success, const char* message);

    // Phase 2 (NOT_COMPILED): 卡片动作优先经 Bridge 发送，离线时回退 HID 直控
    void dispatchCardAction(const DeckCard& card);
    void dispatchViaBridge(const DeckCard& card);
    void dispatchViaHid(const DeckCard& card);
    void handleConfirmTouch(int16_t tx, int16_t ty);

    bool m_macConnected;
    bool m_wifiConnected;
    bool m_voiceActive;
    bool m_bridgeOnline;
    char m_pendingConfirmId[32];
    SystemState m_lastRenderedState;
    int16_t m_pressedCardIndex;

    static const uint8_t CARD_COUNT = 4;
    DeckCard m_cards[CARD_COUNT];
};
