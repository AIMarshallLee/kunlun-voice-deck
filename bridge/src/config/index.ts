export interface BridgeConfig {
    port: number;
    host: string;
    security: {
        requireConfirmation: boolean;
        allowedActions: string[];
    };
}

export const config: BridgeConfig = {
    port: Number(process.env.PORT) || 8765,
    host: process.env.HOST || '0.0.0.0',
    security: {
        requireConfirmation: true,
        allowedActions: [
            'app.open',
            'app.close',
            'keyboard.press',
            'keyboard.shortcut',
            'mouse.click',
            'mouse.scroll',
            'shell.run',
            'url.open',
            'system.volume'
        ]
    }
};
