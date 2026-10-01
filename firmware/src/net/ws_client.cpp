// NOT_COMPILED: 本文件在无 PlatformIO 环境下编写，请执行 `pio run` 验证。
#include "net/ws_client.h"
#include "net_config.h"
#include <ArduinoJson.h>
#include <esp_log.h>
#include <cstring>

static const char* TAG = "KunlunWS";

static void copyStr(char* dst, size_t cap, const char* src) {
    if (!src) { dst[0] = '\0'; return; }
    strncpy(dst, src, cap - 1);
    dst[cap - 1] = '\0';
}

WsClient::WsClient()
    : m_linkState(LinkState::OFFLINE),
      m_wsStarted(false),
      m_lastPingAt(0),
      m_lastRxAt(0),
      m_reconnectDelayMs(KUNLUN_RECONNECT_MIN_MS),
      m_requestSeq(0),
      m_onLink(nullptr),
      m_onResult(nullptr),
      m_onConfirm(nullptr),
      m_onStatus(nullptr) {
    m_currentRequestId[0] = '\0';
}

void WsClient::begin() {
    ESP_LOGI(TAG, "连接 Wi-Fi: %s", KUNLUN_WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(KUNLUN_WIFI_SSID, KUNLUN_WIFI_PASS);
    setLinkState(LinkState::CONNECTING);

    m_ws.onEvent([this](WStype_t type, uint8_t* payload, size_t length) {
        handleEvent(type, payload, length);
    });
    // 库自带的 WS 层 ping 关闭，统一使用协议 JSON ping/pong
    m_ws.setReconnectInterval(m_reconnectDelayMs);
}

void WsClient::setLinkState(LinkState s) {
    if (s == m_linkState) return;
    LinkState old = m_linkState;
    m_linkState = s;
    ESP_LOGI(TAG, "链路状态: %d -> %d", static_cast<int>(old), static_cast<int>(s));
    if (m_onLink) m_onLink(old, s);
}

void WsClient::ensureWifi() {
    if (WiFi.status() == WL_CONNECTED) {
        if (!m_wsStarted) {
            ESP_LOGI(TAG, "Wi-Fi 已连接 (%s)，连接 Bridge ws://%s:%d%s",
                     WiFi.localIP().toString().c_str(), KUNLUN_BRIDGE_HOST, KUNLUN_BRIDGE_PORT, KUNLUN_BRIDGE_PATH);
            m_ws.begin(KUNLUN_BRIDGE_HOST, KUNLUN_BRIDGE_PORT, KUNLUN_BRIDGE_PATH);
            m_wsStarted = true;
            setLinkState(LinkState::CONNECTING);
        }
    } else if (m_linkState == LinkState::ONLINE) {
        ESP_LOGW(TAG, "Wi-Fi 掉线，进入离线模式");
        setLinkState(LinkState::OFFLINE);
    }
}

void WsClient::loop() {
    ensureWifi();
    if (!m_wsStarted) return;

    m_ws.loop();

    uint32_t now = millis();
    if (m_linkState == LinkState::ONLINE) {
        if (now - m_lastPingAt >= KUNLUN_PING_INTERVAL_MS) {
            sendPing();
        }
        if (now - m_lastRxAt >= KUNLUN_PONG_TIMEOUT_MS) {
            ESP_LOGW(TAG, "心跳超时 (%u ms 无响应)，主动断开等待重连", (unsigned)(now - m_lastRxAt));
            setLinkState(LinkState::OFFLINE);
            m_ws.disconnect();   // 库会按 reconnectInterval 自动重连
            scheduleReconnect();
        }
    }
}

void WsClient::scheduleReconnect() {
    m_ws.setReconnectInterval(m_reconnectDelayMs);
    ESP_LOGI(TAG, "下次重连间隔 %u ms", (unsigned)m_reconnectDelayMs);
    uint32_t next = m_reconnectDelayMs * 2;
    m_reconnectDelayMs = (next > KUNLUN_RECONNECT_MAX_MS) ? KUNLUN_RECONNECT_MAX_MS : next;
}

void WsClient::handleEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_CONNECTED:
            ESP_LOGI(TAG, "Bridge 已连接");
            m_lastRxAt = millis();
            m_lastPingAt = millis();
            m_reconnectDelayMs = KUNLUN_RECONNECT_MIN_MS;   // 成功后退避归零
            m_ws.setReconnectInterval(m_reconnectDelayMs);
            setLinkState(LinkState::ONLINE);
            sendPing();
            break;

        case WStype_DISCONNECTED:
            if (m_linkState != LinkState::OFFLINE) {
                ESP_LOGW(TAG, "Bridge 断开");
                setLinkState(LinkState::OFFLINE);
            }
            scheduleReconnect();
            break;

        case WStype_TEXT:
            m_lastRxAt = millis();
            handleText(reinterpret_cast<const char*>(payload), length);
            break;

        case WStype_ERROR:
            ESP_LOGE(TAG, "WebSocket 错误");
            break;

        default:
            break;
    }
}

void WsClient::handleText(const char* text, size_t length) {
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, text, length);
    if (err) {
        ESP_LOGW(TAG, "报文解析失败: %s", err.c_str());
        return;
    }
    const char* type = doc["type"] | "";

    if (strcmp(type, "pong") == 0) {
        return;   // m_lastRxAt 已更新
    }

    if (strcmp(type, "result") == 0) {
        BridgeResult r;
        copyStr(r.id, sizeof(r.id), doc["id"] | "");
        r.success = doc["success"] | false;
        copyStr(r.message, sizeof(r.message), doc["message"] | (r.success ? "OK" : "Error"));
        copyStr(r.errorCode, sizeof(r.errorCode), doc["error"]["code"] | "");
        if (m_currentRequestId[0] && strcmp(r.id, m_currentRequestId) != 0) {
            ESP_LOGW(TAG, "忽略不匹配的 result id=%s (当前 %s)", r.id, m_currentRequestId);
            return;
        }
        m_currentRequestId[0] = '\0';
        if (m_onResult) m_onResult(r);
        return;
    }

    if (strcmp(type, "confirm_required") == 0) {
        BridgeConfirmRequired c;
        copyStr(c.id, sizeof(c.id), doc["id"] | "");
        copyStr(c.action, sizeof(c.action), doc["action"] | "");
        copyStr(c.summary, sizeof(c.summary), doc["summary"] | "");
        c.expiresInMs = doc["expires_in_ms"] | 20000;
        if (m_onConfirm) m_onConfirm(c);
        return;
    }

    if (strcmp(type, "status") == 0) {
        BridgeStatus s;
        s.online = true;
        copyStr(s.activeApp, sizeof(s.activeApp), doc["active_app"] | "");
        s.pendingConfirmations = doc["pending_confirmations"] | 0;
        if (m_onStatus) m_onStatus(s);
        return;
    }

    ESP_LOGW(TAG, "未知报文类型: %s", type);
}

void WsClient::sendRaw(const String& json) {
    String copy = json;          // WebSocketsClient::sendTXT 需要非常量 String&
    m_ws.sendTXT(copy);
}

void WsClient::sendPing() {
    m_lastPingAt = millis();
    String msg = String("{\"type\":\"ping\",\"timestamp\":") + String(m_lastPingAt) + "}";
    sendRaw(msg);
}

String WsClient::nextRequestId() {
    ++m_requestSeq;
    char buf[32];
    snprintf(buf, sizeof(buf), "req_%03u_%lu", (unsigned)m_requestSeq, (unsigned long)millis());
    return String(buf);
}

String WsClient::sendAction(const char* action, const char* payloadJson) {
    if (!isOnline()) {
        ESP_LOGW(TAG, "离线，无法发送 action %s", action);
        return String();
    }
    String id = nextRequestId();
    copyStr(m_currentRequestId, sizeof(m_currentRequestId), id.c_str());

    String msg;
    msg.reserve(160);
    msg += "{\"id\":\""; msg += id;
    msg += "\",\"type\":\"action\",\"action\":\""; msg += action;
    msg += "\",\"payload\":"; msg += (payloadJson && payloadJson[0]) ? payloadJson : "{}";
    msg += ",\"timestamp\":"; msg += String(millis());
    msg += "}";
    ESP_LOGI(TAG, "-> %s", msg.c_str());
    sendRaw(msg);
    return id;
}

bool WsClient::sendConfirm(const char* id, bool accepted) {
    if (!isOnline()) return false;
    String msg;
    msg += "{\"id\":\""; msg += id;
    msg += "\",\"type\":\"confirm\",\"accepted\":"; msg += accepted ? "true" : "false";
    msg += ",\"timestamp\":"; msg += String(millis());
    msg += "}";
    ESP_LOGI(TAG, "-> %s", msg.c_str());
    sendRaw(msg);
    return true;
}
