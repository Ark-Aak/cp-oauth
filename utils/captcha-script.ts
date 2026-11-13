const scripts = new Map<string, Promise<void>>();

/** Shared between forms, bounded, and retryable after a failed download. */
export function loadCaptchaScript(src: string, ready: () => boolean): Promise<void> {
    if (ready()) return Promise.resolve();
    const existing = scripts.get(src);
    if (existing) return existing;
    const promise = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        const timer = setTimeout(() => finish(new Error('Captcha script timed out')), 12_000);
        function finish(error?: Error) {
            clearTimeout(timer);
            script.onload = null;
            script.onerror = null;
            if (error) {
                script.remove();
                scripts.delete(src);
                reject(error);
            } else resolve();
        }
        script.src = src;
        script.async = true;
        script.onload = () =>
            finish(ready() ? undefined : new Error('Captcha script did not initialize'));
        script.onerror = () => finish(new Error('Captcha script failed to load'));
        document.head.appendChild(script);
    });
    scripts.set(src, promise);
    return promise;
}
