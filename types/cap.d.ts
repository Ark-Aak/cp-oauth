export {};

declare global {
    interface Window {
        CAP_CUSTOM_WASM_URL?: string;
        CAP_CUSTOM_HASHWX_URL?: string;
        CAP_PAKO_URL?: string;
    }
}
