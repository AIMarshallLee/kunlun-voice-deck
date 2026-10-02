#pragma once

/**
 * Kunlun Bridge WebSocket 客户端 (Phase 2) — NOT_COMPILED
 *
 * 职责 (严格遵守固件/业务解耦原则)：
 *  - 维护 Wi-Fi + WebSocket 链路：连接、JSON 心跳、断线指数退避重连
 *  - 按 protocol/schema 组装 action / confirm / ping 报文，解析 result / confirm_required / status / pong
 *  - 不做任何语义理解、安全判定或命令执行，这些全部由 Bridge 完成
 *
 * 依赖: links2004/WebSockets, bblanchon/ArduinoJson (见 platformio.ini)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <functional>

enum class LinkState {
    OFFLINE,        // 无 Wi-Fi 或 Bridge 不可达 (HID 直控回退)
    CONNECTING,     // Wi-Fi 已连 / WebSocket 握手中
    ONLINE          // 已连接 Bridge，心跳正常
};

struct BridgeResult {
    char id[32];
    bool success;
    char message[64];
    char errorCode[32];
};

struct BridgeConfirmRequired {
    char id[32];
    char action[32];
    char summary[64];
    uint32_t expiresInMs;
};

struct BridgeStatus {
    bool online;
    char activeApp[32];     // 空字符串表示 Bridge 尚未探测到前台应用
    uint8_t pendingConfirmations;
};

class WsClient {
public:
    using LinkStateCallback   = std::function<void(LinkState oldState, LinkState newState)>;
    using ResultCallback      = std::function<void(const BridgeResult& result)>;
    using ConfirmCallback     = std::function<void(const BridgeConfirmRequired& req)>;
    using StatusCallback      = std::function<void(const BridgeStatus& status)>;

    static WsClient& instance() {
        static WsClient inst;
        return inst;
    }

    void begin();
    void loop();

    LinkState getLinkState() const { return m_linkState; }
    bool isOnline() const { return m_linkState == LinkState::ONLINE; }
    bool isWifiConnected() const { return WiFi.status() == WL_CONNECTED; }

    /**
     * 发送 action 请求 (payloadJson 为已序列化的 JSON 对象字符串，如 {"app":"Terminal"})
     * @return 生成的请求 id，离线时返回空串
     */
    String sendAction(const char* action, const char* payloadJson);

    /** 对 confirm_required 做二次确认应答 */
    bool sendConfirm(const char* id, bool accepted);

    void onLinkStateChanged(LinkStateCallback cb) { m_onLink = cb; }
    void onResult(ResultCallback cb)              { m_onResult = cb; }
    void onConfirmRequired(ConfirmCallback cb)    { m_onConfirm = cb; }
    void onStatus(StatusCallback cb)              { m_onStatus = cb; }

    const char* currentRequestId() const { return m_currentRequestId; }

private:
    WsClient();

    void setLinkState(LinkState s);
    void ensureWifi();
    void handleEvent(WStype_t type, uint8_t* payload, size_t length);
    void handleText(const char* text, size_t length);
    void sendPing();
    void sendRaw(const String& json);
    void scheduleReconnect();
    String nextRequestId();

    WebSocketsClient m_ws;
    LinkState  m_linkState;
    bool       m_wsStarted;
    uint32_t   m_lastPingAt;
    uint32_t   m_lastRxAt;
    uint32_t   m_reconnectDelayMs;
    uint32_t   m_requestSeq;
    char       m_currentRequestId[32];

    LinkStateCallback m_onLink;
    ResultCallback    m_onResult;
    ConfirmCallback   m_onConfirm;
    StatusCallback    m_onStatus;
};
