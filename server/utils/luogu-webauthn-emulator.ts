import {
    WebAuthnEmulator,
    AuthenticatorEmulator,
    PasskeysCredentialsMemoryRepository,
    getRepositoryId,
    type PasskeyDiscoverableCredential,
    type AuthenticationResponseJSON,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialRequestOptionsJSON,
    type RegistrationResponseJSON
} from 'nid-webauthn-emulator';

const LUOGU_ORIGIN = 'https://www.luogu.com.cn';
const SUPPORTED_COSE_ALGORITHMS = new Set([-7, -257, -8]);

export interface LuoguWebAuthnRegisterResult {
    response: RegistrationResponseJSON;
    repository: string;
}

export interface LuoguWebAuthnLoginResult {
    requestBody: {
        result: AuthenticationResponseJSON;
    };
    repository: string;
}

function bufferReplacer(key: string, value: unknown) {
    if (value instanceof ArrayBuffer) {
        return { __type: 'ArrayBuffer', data: Array.from(new Uint8Array(value)) };
    }
    if (value instanceof Uint8Array) {
        return { __type: 'Uint8Array', data: Array.from(value) };
    }
    return value;
}

function bufferReviver(key: string, value: unknown) {
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.__type === 'ArrayBuffer' && Array.isArray(obj.data)) {
            return new Uint8Array(obj.data).buffer;
        }
        if (obj.__type === 'Uint8Array' && Array.isArray(obj.data)) {
            return new Uint8Array(obj.data);
        }
        if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
            return typeof Buffer !== 'undefined' ? Buffer.from(obj.data) : new Uint8Array(obj.data);
        }
    }
    return value;
}

export function emulateLuoguWebAuthnRegister(
    options: PublicKeyCredentialCreationOptionsJSON
): LuoguWebAuthnRegisterResult {
    const repository = new PasskeysCredentialsMemoryRepository();
    const authenticator = new AuthenticatorEmulator({
        credentialsRepository: repository
    });
    const emulator = new WebAuthnEmulator(authenticator);

    const supportedPubKeyCredParams = options.pubKeyCredParams.filter(param =>
        SUPPORTED_COSE_ALGORITHMS.has(param.alg)
    );
    if (supportedPubKeyCredParams.length === 0) {
        throw createError({
            statusCode: 502,
            message: 'No supported WebAuthn algorithm from upstream'
        });
    }

    const response = emulator.createJSON(LUOGU_ORIGIN, {
        ...options,
        pubKeyCredParams: supportedPubKeyCredParams
    });
    const credential = repository
        .loadCredentials()
        .find(savedCredential => getRepositoryId(savedCredential) === response.id);

    if (!credential) {
        throw createError({
            statusCode: 500,
            message: 'Failed to persist WebAuthn credential'
        });
    }

    return {
        response,
        repository: JSON.stringify(credential, bufferReplacer)
    };
}

export function emulateLuoguWebAuthnLogin(
    options: PublicKeyCredentialRequestOptionsJSON,
    repositoryRaw: string
): LuoguWebAuthnLoginResult {
    let credential: PasskeyDiscoverableCredential;
    try {
        credential = JSON.parse(repositoryRaw, bufferReviver) as PasskeyDiscoverableCredential;
    } catch {
        throw createError({
            statusCode: 400,
            message: 'Invalid WebAuthn repository data'
        });
    }
    const repository = new PasskeysCredentialsMemoryRepository();
    repository.saveCredential(credential);

    const authenticator = new AuthenticatorEmulator({
        credentialsRepository: repository
    });
    const emulator = new WebAuthnEmulator(authenticator);

    const result = emulator.getJSON(LUOGU_ORIGIN, options);
    const updatedCredential = repository
        .loadCredentials()
        .find(savedCredential => getRepositoryId(savedCredential) === result.id);

    if (!updatedCredential) {
        throw createError({
            statusCode: 500,
            message: 'Failed to persist WebAuthn credential'
        });
    }

    return {
        requestBody: {
            result
        },
        repository: JSON.stringify(updatedCredential, bufferReplacer)
    };
}
