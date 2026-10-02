#pragma once

/**
 * 网络与 Bridge 连接配置 (Phase 2)
 * 所有宏均可通过 platformio.ini build_flags 以 -DKUNLUN_WIFI_SSID=\"xxx\" 覆盖，
 * 避免把凭据写入源码。
 */

#ifndef KUNLUN_WIFI_SSID
#define KUNLUN_WIFI_SSID        "CHANGE_ME_SSID"
#endif

#ifndef KUNLUN_WIFI_PASS
#define KUNLUN_WIFI_PASS        "CHANGE_ME_PASSWORD"
#endif

#ifndef KUNLUN_BRIDGE_HOST
#define KUNLUN_BRIDGE_HOST      "192.168.1.100"   // 运行 Bridge 的 Mac 局域网 IP
#endif

#ifndef KUNLUN_BRIDGE_PORT
#define KUNLUN_BRIDGE_PORT      8765
#endif

#ifndef KUNLUN_BRIDGE_PATH
#define KUNLUN_BRIDGE_PATH      "/"
#endif

// 心跳：固件每 PING_INTERVAL 发送 {"type":"ping"}，超过 PONG_TIMEOUT 未收到任何报文判离线
#define KUNLUN_PING_INTERVAL_MS     5000
#define KUNLUN_PONG_TIMEOUT_MS      15000

// 重连退避：1s 起步，每次翻倍，封顶 30s
#define KUNLUN_RECONNECT_MIN_MS     1000
#define KUNLUN_RECONNECT_MAX_MS     30000

// 上电后等待 Bridge 上线的时间，超时则进入离线 (HID 直控) 模式继续可用
#define KUNLUN_CONNECT_TIMEOUT_MS   8000

// 单个 action 等待 Bridge result 的超时
#define KUNLUN_ACTION_TIMEOUT_MS    10000
