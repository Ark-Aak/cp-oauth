/** Browser-side WebAuthn: decode server JSON options, encode credentials as base64url JSON. */

function toBase64Url(buffer: ArrayBuffer | null | undefined): string {
    if (!buffer) return '';
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): ArrayBuffer {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
}

interface DescriptorJSON {
    id: string;
    type: 'public-key';
    transports?: AuthenticatorTransport[];
}

export interface PasskeyRequestOptionsJSON {
    challenge: string;
    timeout?: number;
    rpId?: string;
    allowCredentials?: DescriptorJSON[];
    userVerification?: UserVerificationRequirement;
}

export interface PasskeyCreationOptionsJSON {
    challenge: string;
    rp: PublicKeyCredentialRpEntity;
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: PublicKeyCredentialParameters[];
    timeout?: number;
    excludeCredentials?: DescriptorJSON[];
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    attestation?: AttestationConveyancePreference;
}

const decodeDescriptor = (descriptor: DescriptorJSON): PublicKeyCredentialDescriptor => ({
    ...descriptor,
    id: fromBase64Url(descriptor.id)
});

export function isPasskeySupported(): boolean {
    return (
        typeof window !== 'undefined' &&
        typeof window.PublicKeyCredential === 'function' &&
        typeof navigator.credentials?.get === 'function'
    );
}

function commonFields(credential: PublicKeyCredential) {
    const attachment = credential.authenticatorAttachment;
    return {
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        type: 'public-key' as const,
        clientExtensionResults: JSON.parse(
            JSON.stringify(credential.getClientExtensionResults())
        ) as Record<string, unknown>,
        ...(attachment === 'platform' || attachment === 'cross-platform'
            ? { authenticatorAttachment: attachment }
            : {})
    };
}

/** Runs `navigator.credentials.get`; resolves `null` when the user dismisses the prompt. */
export async function getPasskeyAssertion(options: PasskeyRequestOptionsJSON) {
    const credential = (await navigator.credentials.get({
        publicKey: {
            ...options,
            challenge: fromBase64Url(options.challenge),
            allowCredentials: options.allowCredentials?.map(decodeDescriptor)
        }
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const response = credential.response as AuthenticatorAssertionResponse;
    return {
        ...commonFields(credential),
        response: {
            clientDataJSON: toBase64Url(response.clientDataJSON),
            authenticatorData: toBase64Url(response.authenticatorData),
            signature: toBase64Url(response.signature),
            ...(response.userHandle ? { userHandle: toBase64Url(response.userHandle) } : {})
        }
    };
}

/** Runs `navigator.credentials.create`; resolves `null` when the user dismisses the prompt. */
export async function createPasskeyCredential(options: PasskeyCreationOptionsJSON) {
    const credential = (await navigator.credentials.create({
        publicKey: {
            ...options,
            challenge: fromBase64Url(options.challenge),
            user: { ...options.user, id: fromBase64Url(options.user.id) },
            excludeCredentials: options.excludeCredentials?.map(decodeDescriptor)
        }
    })) as PublicKeyCredential | null;
    if (!credential) return null;
    const response = credential.response as AuthenticatorAttestationResponse;
    const transports = response.getTransports?.() as
        | Array<'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'>
        | undefined;
    return {
        ...commonFields(credential),
        response: {
            clientDataJSON: toBase64Url(response.clientDataJSON),
            attestationObject: toBase64Url(response.attestationObject),
            ...(transports?.length ? { transports } : {})
        }
    };
}

/** True for the DOMException a browser raises when the user cancels or times out. */
export function isPasskeyCancelled(error: unknown): boolean {
    return error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name);
}
