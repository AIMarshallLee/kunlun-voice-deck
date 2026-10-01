#include "state/state_machine.h"
#include "net_config.h"
#include <esp_log.h>
#include <cstring>

static const char* TAG = "KunlunFSM";

static void copyStr(char* dst, size_t cap, const char* src) {
    strncpy(dst, src ? src : "", cap - 1);
    dst[cap - 1] = '\0';
}

StateMachine::StateMachine()
    : m_currentState(SystemState::BOOT),
      m_stateEnterTime(0),
      m_stateTimeoutMs(0),
      m_resultDurationMs(1500),
      m_resultSuccess(true),
      m_linkOnline(false),
      m_callback(nullptr) {
    m_resultMessage[0] = '\0';
    m_executingLabel[0] = '\0';
    m_confirmSummary[0] = '\0';
}

void StateMachine::init() {
    m_currentState = SystemState::BOOT;
    m_stateEnterTime = millis();
    m_stateTimeoutMs = 0;
    ESP_LOGI(TAG, "状态机初始化，当前状态: BOOT");
}

void StateMachine::transitionTo(SystemState newState) {
    if (m_currentState == newState) {
        return;
    }

    SystemState oldState = m_currentState;
    m_currentState = newState;
    m_stateEnterTime = millis();
    m_stateTimeoutMs = 0;

    ESP_LOGI(TAG, "状态迁移: %d -> %d", static_cast<int>(oldState), static_cast<int>(newState));

    if (m_callback) {
        m_callback(oldState, newState);
    }
}

void StateMachine::setLinkOnline(bool online) {
    if (m_linkOnline == online) return;
    m_linkOnline = online;
    if (online) {
        if (m_currentState == SystemState::CONNECTING) {
            transitionTo(SystemState::IDLE);
        }
    } else {
        // 链路离线：取消等待 Bridge 的流程，回到 IDLE (HID 直控仍可用)
        if (m_currentState == SystemState::EXECUTING || m_currentState == SystemState::CONFIRMATION_REQUIRED) {
            setResultState("Bridge 离线", false, 1200);
        }
    }
}

void StateMachine::setExecuting(const char* label, uint32_t timeoutMs) {
    copyStr(m_executingLabel, sizeof(m_executingLabel), label);
    transitionTo(SystemState::EXECUTING);
    m_stateTimeoutMs = timeoutMs;
}

void StateMachine::setConfirmation(const char* summary, uint32_t expiresMs) {
    copyStr(m_confirmSummary, sizeof(m_confirmSummary), summary);
    transitionTo(SystemState::CONFIRMATION_REQUIRED);
    m_stateTimeoutMs = expiresMs;
}

void StateMachine::setResultState(const char* message, bool success, uint32_t durationMs) {
    m_resultSuccess = success;
    m_resultDurationMs = durationMs;
    copyStr(m_resultMessage, sizeof(m_resultMessage), message);
    transitionTo(SystemState::RESULT);
}

void StateMachine::update() {
    uint32_t now = millis();
    uint32_t elapsed = now - m_stateEnterTime;

    switch (m_currentState) {
        case SystemState::BOOT:
            // 初始化完成后迁移至 CONNECTING，等待 Bridge
            if (elapsed > 500) {
                transitionTo(m_linkOnline ? SystemState::IDLE : SystemState::CONNECTING);
            }
            break;

        case SystemState::CONNECTING:
            // Bridge 超时未上线：进入 IDLE 离线模式，卡片回退为 HID 直控；链路稍后上线由 setLinkOnline 处理
            if (elapsed > KUNLUN_CONNECT_TIMEOUT_MS) {
                ESP_LOGW(TAG, "Bridge 连接超时，进入离线 (HID 直控) 模式");
                transitionTo(SystemState::IDLE);
            }
            break;

        case SystemState::EXECUTING:
            if (m_stateTimeoutMs && elapsed > m_stateTimeoutMs) {
                setResultState("Bridge 超时", false, 1200);
            }
            break;

        case SystemState::CONFIRMATION_REQUIRED:
            if (m_stateTimeoutMs && elapsed > m_stateTimeoutMs) {
                setResultState("确认超时", false, 1000);
            }
            break;

        case SystemState::RESULT:
            // 结果展示固定时间后自动回到待机 IDLE
            if (elapsed >= m_resultDurationMs) {
                transitionTo(SystemState::IDLE);
            }
            break;

        case SystemState::WAKE_WORD_DETECTED:
            if (elapsed > 800) {
                transitionTo(SystemState::LISTENING);
            }
            break;

        default:
            break;
    }
}
