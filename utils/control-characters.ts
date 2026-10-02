export function hasC0ControlCharacters(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        if (value.charCodeAt(index) < 0x20) return true;
    }
    return false;
}
