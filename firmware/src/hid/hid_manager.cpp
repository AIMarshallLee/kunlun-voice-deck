#include "hid/hid_manager.h"
#include <esp_log.h>

static const char* TAG = "KunlunHID";

HidManager::HidManager() : m_initialized(false) {}

bool HidManager::init() {
    ESP_LOGI(TAG, "初始化 ESP32-S3 原生 USB-HID 控制器...");
    
    // 启动原生 USB 子系统及 Composite 描述符
    USB.begin();
    m_keyboard.begin();
    m_mouse.begin();
    
    m_initialized = true;
    ESP_LOGI(TAG, "USB-HID 键盘与鼠标设备枚举就绪");
    return true;
}

bool HidManager::isConnected() const {
    // 检查 USB 状态
    return m_initialized;
}

void HidManager::sendCmdTab() {
    ESP_LOGI(TAG, "HID: 发送 Command + Tab 组合键");
    // KEY_LEFT_GUI 对应 Mac Command 键
    m_keyboard.press(KEY_LEFT_GUI);
    delay(20);
    m_keyboard.press(KEY_TAB);
    delay(40);
    m_keyboard.release(KEY_TAB);
    delay(20);
    m_keyboard.release(KEY_LEFT_GUI);
}

void HidManager::sendSpotlight() {
    ESP_LOGI(TAG, "HID: 发送 Command + Space (Spotlight)");
    m_keyboard.press(KEY_LEFT_GUI);
    delay(20);
    m_keyboard.press(' ');
    delay(40);
    m_keyboard.releaseAll();
}

void HidManager::sendCopy() {
    m_keyboard.press(KEY_LEFT_GUI);
    m_keyboard.press('c');
    delay(30);
    m_keyboard.releaseAll();
}

void HidManager::sendPaste() {
    m_keyboard.press(KEY_LEFT_GUI);
    m_keyboard.press('v');
    delay(30);
    m_keyboard.releaseAll();
}

void HidManager::sendCloseWindow() {
    m_keyboard.press(KEY_LEFT_GUI);
    m_keyboard.press('w');
    delay(30);
    m_keyboard.releaseAll();
}

void HidManager::sendQuitApp() {
    m_keyboard.press(KEY_LEFT_GUI);
    m_keyboard.press('q');
    delay(30);
    m_keyboard.releaseAll();
}

void HidManager::sendMissionControl() {
    // Control + Up 展开 macOS 调度中心
    m_keyboard.press(KEY_LEFT_CTRL);
    m_keyboard.press(KEY_UP_ARROW);
    delay(30);
    m_keyboard.releaseAll();
}

void HidManager::pressKey(uint8_t key) {
    m_keyboard.press(key);
}

void HidManager::releaseKey(uint8_t key) {
    m_keyboard.release(key);
}

void HidManager::releaseAll() {
    m_keyboard.releaseAll();
}

void HidManager::mouseClick(uint8_t button) {
    m_mouse.click(button);
}

void HidManager::mouseScroll(int8_t wheel) {
    m_mouse.move(0, 0, wheel);
}

void HidManager::mouseMove(int8_t x, int8_t y) {
    m_mouse.move(x, y, 0);
}
