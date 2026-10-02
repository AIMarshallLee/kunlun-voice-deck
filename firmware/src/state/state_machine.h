#pragma once

#include "types.h"
#include <functional>

/**
 * @brief 核心有限状态机 (FSM)
 * 围绕 PRD 5.1 状态转移规范，严禁网状耦合
 *
 * Phase 2 新增转移 (NOT_COMPILED，待 pio run 验证):
 *   BOOT -> CONNECTING                 (硬件就绪后等待 Bridge)
 *   CONNECTING -> IDLE                 (Bridge 上线，或超时进入离线 HID 回退模式)
 *   IDLE -> EXECUTING                  (卡片动作已经 Bridge 发出，等待 result)
 *   EXECUTING -> CONFIRMATION_REQUIRED (Bridge 返回 confirm_required)
 *   EXECUTING -> RESULT                (收到 result 或等待超时)
 *   CONFIRMATION_REQUIRED -> EXECUTING (用户点击确认，等待 result)
 *   CONFIRMATION_REQUIRED -> RESULT    (用户取消 / 确认窗口超时)
 *   任意 -> IDLE                       (链路离线时正在进行的 Bridge 流程被取消)
 */
class StateMachine {
public:
    using StateChangeCallback = std::function<void(SystemState oldState, SystemState newState)>;

    static StateMachine& instance() {
        static StateMachine inst;
        return inst;
    }

    void init();
    void update();

    SystemState getState() const { return m_currentState; }
    void transitionTo(SystemState newState);

    void onStateChanged(StateChangeCallback cb) {
        m_callback = cb;
    }

    // ---- Phase 2: 链路与 Bridge 流程 ----
    /** 链路上线/离线通知：CONNECTING 时上线 -> IDLE；离线时取消进行中的 Bridge 流程 */
    void setLinkOnline(bool online);
    bool isLinkOnline() const { return m_linkOnline; }

    /** 动作已发往 Bridge，进入 EXECUTING 并等待 result (超时自动回 RESULT 失败) */
    void setExecuting(const char* label, uint32_t timeoutMs);
    /** Bridge 要求二次确认，进入 CONFIRMATION_REQUIRED (超时自动回 IDLE) */
    void setConfirmation(const char* summary, uint32_t expiresMs);
    const char* getExecutingLabel() const { return m_executingLabel; }
    const char* getConfirmSummary() const { return m_confirmSummary; }

    // 状态保持时间 (用于 RESULT -> IDLE 自动回退)
    void setResultState(const char* message, bool success = true, uint32_t durationMs = 1500);
    const char* getResultMessage() const { return m_resultMessage; }
    bool isResultSuccess() const { return m_resultSuccess; }

private:
    StateMachine();
    SystemState m_currentState;
    uint32_t m_stateEnterTime;
    uint32_t m_stateTimeoutMs;      // 当前状态的超时 (0 = 不超时)
    uint32_t m_resultDurationMs;
    bool m_resultSuccess;
    bool m_linkOnline;
    char m_resultMessage[64];
    char m_executingLabel[32];
    char m_confirmSummary[64];
    StateChangeCallback m_callback;
};
