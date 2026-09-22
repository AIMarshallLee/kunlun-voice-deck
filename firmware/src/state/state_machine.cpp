#include "state/state_machine.h"
#include <esp_log.h>
#include <cstring>

static const char* TAG = "KunlunFSM";

StateMachine::StateMachine()
    : m_currentState(SystemState::BOOT),
      m_stateEnterTime(0),
      m_resultDurationMs(1500),
      m_resultSuccess(true),
      m_callback(nullptr) {
    m_resultMessage[0] = '\0';
}

void StateMachine::init() {
    m_currentState = SystemState::BOOT;
    m_stateEnterTime = millis();
    ESP_LOGI(TAG, "状态机初始化，当前状态: BOOT");
}

void StateMachine::transitionTo(SystemState newState) {
    if (m_currentState == newState) {
        return;
    }

    SystemState oldState = m_currentState;
    m_currentState = newState;
    m_stateEnterTime = millis();

    ESP_LOGI(TAG, "状态迁移: %d -> %d", static_cast<int>(oldState), static_cast<int>(newState));

    if (m_callback) {
        m_callback(oldState, newState);
    }
}

void StateMachine::setResultState(const char* message, bool success, uint32_t durationMs) {
    m_resultSuccess = success;
    m_resultDurationMs = durationMs;
    strncpy(m_resultMessage, message, sizeof(m_resultMessage) - 1);
    m_resultMessage[sizeof(m_resultMessage) - 1] = '\0';
    transitionTo(SystemState::RESULT);
}

void StateMachine::update() {
    uint32_t now = millis();

    switch (m_currentState) {
        case SystemState::BOOT:
            // 初始化完成后迁移至 CONNECTING / IDLE
            if (now - m_stateEnterTime > 500) {
                transitionTo(SystemState::IDLE);
            }
            break;

        case SystemState::RESULT:
            // 结果展示固定时间后自动回到待机 IDLE
            if (now - m_stateEnterTime >= m_resultDurationMs) {
                transitionTo(SystemState::IDLE);
            }
            break;

        case SystemState::WAKE_WORD_DETECTED:
            if (now - m_stateEnterTime > 800) {
                transitionTo(SystemState::LISTENING);
            }
            break;

        default:
            break;
    }
}
