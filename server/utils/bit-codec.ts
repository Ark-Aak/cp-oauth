export function bitEncode(value: Buffer | Uint8Array): string {
    return Array.from(value, byte => byte.toString(2).padStart(8, '0')).join('');
}

export function bitDecode(bitString: string): Buffer {
    if (!/^[01]+$/.test(bitString) || bitString.length % 8 !== 0) {
        throw createError({ statusCode: 500, message: 'Invalid bit-string data' });
    }

    const bytes = [];
    for (let index = 0; index < bitString.length; index += 8) {
        bytes.push(Number.parseInt(bitString.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
}
