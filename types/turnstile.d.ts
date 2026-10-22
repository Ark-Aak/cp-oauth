export {};

interface TurnstileRenderOptions {
    sitekey: string;
    action?: string;
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
    size?: 'normal' | 'flexible' | 'compact';
    callback?: (token: string) => void;
    'expired-callback'?: () => void;
    'error-callback'?: () => void;
    'timeout-callback'?: () => void;
}

declare global {
    interface Window {
        turnstile?: {
            render(container: HTMLElement, options: TurnstileRenderOptions): string;
            reset(widgetId?: string): void;
            remove(widgetId?: string): void;
        };
    }
}
