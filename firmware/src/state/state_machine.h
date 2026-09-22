#pragma once

#include "types.h"
#include <functional>

/**
 * @brief 核心有限状态机 (FSM)
 * 围绕 PRD 5.1 状态转移规范，严禁网状耦合
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

    // 状态保持时间 (用于 RESULT -> IDLE 自动回退)
    void setResultState(const char* message, bool success = true, uint32_t durationMs = 1500);
    const char* getResultMessage() const { return m_resultMessage; }
    bool isResultSuccess() const { return m_resultSuccess; }

private:
    StateMachine();
    SystemState m_currentState;
    uint32_t m_stateEnterTime;
    uint32_t m_resultDurationMs;
    bool m_resultSuccess;
    char m_resultMessage[64];
    StateChangeCallback m_callback;
};
