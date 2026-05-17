import { consola } from 'consola';
import type {
    AuthenticationResponseJSON,
    PublicKeyCredentialCreationOptionsJSON,
    PublicKeyCredentialRequestOptionsJSON,
    RegistrationResponseJSON
} from 'nid-webauthn-emulator';

const logger = consola.withTag('platform:luogu');
const LUOGU_USER_AGENT = 'CPOAuth';

interface LuoguPasteResponse {
    code: number;
    currentData: {
        paste: {
            data: string;
            id: string;
            public: boolean;
            user: {
                uid: number;
                name: string;
            };
        };
    };
}

export interface LuoguPasteData {
    id: string;
    data: string;
    isPublic: boolean;
    ownerUid: string;
    ownerUsername: string;
}

export async function fetchLuoguPaste(pasteId: string): Promise<LuoguPasteData | null> {
    const normalizedPasteId = pasteId.trim();
    if (!normalizedPasteId) {
        return null;
    }

    try {
        const res = await $fetch<LuoguPasteResponse>(
            `https://www.luogu.com/paste/${normalizedPasteId}`,
            {
                headers: {
                    'User-Agent': LUOGU_USER_AGENT,
                    'X-Luogu-Type': 'content-only'
                }
            }
        );

        const paste = res.currentData?.paste;
        if (!paste) {
            return null;
        }

        return {
            id: paste.id,
            data: paste.data,
            isPublic: paste.public,
            ownerUid: String(paste.user.uid),
            ownerUsername: paste.user.name
        };
    } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 404) {
            return null;
        }
        logger.error(`Failed to fetch clipboard ${normalizedPasteId}:`, e);
        throw createError({ statusCode: 502, message: 'Failed to fetch clipboard from Luogu' });
    }
}

export interface LuoguSessionToken {
    uid: number;
    clientId: string;
    csrfToken: string;
}

function isLentilleContextUserNull(html: string): boolean {
    const idMarker = 'id="lentille-context"';
    const idIndex = html.indexOf(idMarker);
    if (idIndex === -1) {
        return false;
    }

    const scriptStart = html.lastIndexOf('<script', idIndex);
    if (scriptStart === -1) {
        return false;
    }

    const tagEnd = html.indexOf('>', idIndex);
    if (tagEnd === -1 || tagEnd < scriptStart) {
        return false;
    }

    const openingTag = html.slice(scriptStart, tagEnd + 1);
    if (!openingTag.includes('type="application/json"')) {
        return false;
    }

    const scriptClose = html.indexOf('</script>', tagEnd + 1);
    if (scriptClose === -1) {
        return false;
    }

    const jsonText = html.slice(tagEnd + 1, scriptClose).trim();
    if (!jsonText.includes('"user"')) {
        return false;
    }

    try {
        const parsed = JSON.parse(jsonText) as { user?: unknown } | null;
        return parsed !== null && typeof parsed === 'object' && parsed.user === null;
    } catch {
        return false;
    }
}

async function readLuoguCookiesFromResponse(res: Response): Promise<{
    uid?: number;
    clientId?: string;
}> {
    let html = '';
    if (res.headers.get('Content-Type') === 'text/html; charset=UTF-8')
        try {
            html = await res.text();
        } catch {
            // ignore parse error
        }
    const cookies = res.headers.getSetCookie();
    const uid =
        html && isLentilleContextUserNull(html)
            ? 0
            : cookies
                  .find(cookie => cookie.startsWith('_uid='))
                  ?.split(';')[0]
                  ?.split('=')[1];
    const clientId = cookies
        .find(cookie => cookie.startsWith('__client_id='))
        ?.split(';')[0]
        ?.split('=')[1];

    return {
        uid: uid !== undefined ? Number(uid) : undefined,
        clientId: clientId || undefined
    };
}

async function applyLuoguCookiesToToken(token: LuoguSessionToken, res: Response): Promise<void> {
    const { uid, clientId } = await readLuoguCookiesFromResponse(res);

    if (uid !== undefined) {
        token.uid = uid;
    }
    if (clientId !== undefined) {
        token.clientId = clientId;
    }
}

export async function createLuoguSessionToken(): Promise<LuoguSessionToken> {
    const token: LuoguSessionToken = {
        uid: 0,
        clientId: '',
        csrfToken: ''
    };
    await generateLuoguCSRF(token);
    return token;
}
export async function generateLuoguCSRF(token: LuoguSessionToken): Promise<void> {
    try {
        const res = await fetch('https://www.luogu.com.cn/judgement', {
            redirect: 'manual',
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`
            }
        });
        const clonedRes = res.clone();
        if (res.status !== 200) {
            throw new Error(`Unexpected status code ${res.status}`);
        }
        const csrfToken = /<meta name="csrf-token" content="(.*)">/.exec(await res.text())?.[1];
        if (!csrfToken) {
            throw new Error('CSRF token not found in response body');
        }
        await applyLuoguCookiesToToken(token, clonedRes);
        token.csrfToken = csrfToken;
    } catch (e) {
        logger.error('Failed to generate Luogu CSRF token:', e);
        throw createError({ statusCode: 502, message: 'Failed to generate Luogu CSRF token' });
    }
}
export async function getLuoguCaptcha(token: LuoguSessionToken) {
    try {
        const res = await fetch('https://www.luogu.com.cn/lg4/captcha', {
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=0; __client_id=${token.clientId}`
            }
        });
        return await res.body;
    } catch (e) {
        logger.error('Failed to fetch Luogu captcha:', e);
        throw createError({ statusCode: 502, message: 'Failed to fetch Luogu captcha' });
    }
}

export async function loginLuogu(
    token: LuoguSessionToken,
    luoguUsername: string,
    luoguPassword: string,
    captcha: string
): Promise<{ uid: number; need2fa: boolean }> {
    try {
        const res = await fetch('https://www.luogu.com.cn/do-auth/password', {
            method: 'POST',
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `__uid=0; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-CSRF-Token': token.csrfToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: luoguUsername,
                password: luoguPassword,
                captcha
            }),
            redirect: 'manual'
        });
        const clonedRes = res.clone();
        if (res.status !== 200) {
            const errorMessage = ((await res.json()) as { errorMessage?: string }).errorMessage;
            if (typeof errorMessage === 'string') {
                throw createError({
                    statusCode: 400,
                    message: `Luogu login failed`,
                    data: { luoguErrorMessage: errorMessage }
                });
            }
        }
        const { uid } = await readLuoguCookiesFromResponse(res);
        if (!uid) throw new Error('_uid cookie not found');
        await applyLuoguCookiesToToken(token, clonedRes);
        return {
            need2fa: (await res.json()).locked,
            uid
        };
    } catch (e) {
        if (e !== null && typeof e === 'object' && 'statusCode' in e) throw e;
        logger.error('Failed to login to Luogu:', e);
        throw createError({ statusCode: 502, message: 'Failed to login to Luogu' });
    }
}

export async function verifyLuogu2FA(token: LuoguSessionToken, code: string): Promise<void> {
    try {
        await $fetch('https://www.luogu.com.cn/do-auth/totp', {
            method: 'POST',
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-CSRF-Token': token.csrfToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code
            })
        });
        return;
    } catch (e) {
        const errorMessage = (e as { data?: { errorMessage?: string } }).data?.errorMessage;
        if (typeof errorMessage === 'string')
            throw createError({
                statusCode: 400,
                message: `Luogu 2FA verification failed`,
                data: { luoguErrorMessage: errorMessage }
            });
        logger.error('Failed to verify Luogu 2FA code:', e);
        throw createError({ statusCode: 502, message: 'Failed to verify Luogu 2FA code' });
    }
}

export async function getLuoguWebAuthnSetupOptions(
    token: LuoguSessionToken
): Promise<PublicKeyCredentialCreationOptionsJSON> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await $fetch('https://www.luogu.com.cn/user/security/webauthnSetup', {
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`,
                'X-Lentille-Request': 'content-only'
            }
        });
        const options = res.data.options;
        options.pubKeyCredParams = [
            {
                alg: -7,
                type: 'public-key'
            }
        ] satisfies PublicKeyCredentialParameters[];
        return options;
    } catch (e) {
        logger.error('Failed to get WebAuthn setup options:', e);
        throw createError({ statusCode: 502, message: 'Failed to get WebAuthn setup options' });
    }
}
export async function registerLuoguWebAuthn(
    token: LuoguSessionToken,
    response: RegistrationResponseJSON
): Promise<void> {
    try {
        await $fetch('https://www.luogu.com.cn/user/security/webauthn-register', {
            method: 'POST',
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-CSRF-Token': token.csrfToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'CPOAuth WebAuthn Credential',
                result: response
            })
        });
    } catch (e) {
        logger.error('Failed to register WebAuthn credential:', e);
        throw createError({ statusCode: 502, message: 'Failed to register WebAuthn credential' });
    }
}
export async function getLuoguWebAuthnLoginOptions(
    token: LuoguSessionToken
): Promise<PublicKeyCredentialRequestOptionsJSON> {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = await $fetch('https://www.luogu.com.cn/auth/login', {
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-Lentille-Request': 'content-only'
            }
        });
        const options = res?.data?.webauthn;
        if (!options || typeof options !== 'object') {
            throw new Error('Invalid WebAuthn login options response');
        }
        return options as PublicKeyCredentialRequestOptionsJSON;
    } catch (e) {
        logger.error('Failed to get WebAuthn login options:', e);
        throw createError({ statusCode: 502, message: 'Failed to get WebAuthn login options' });
    }
}

export async function requestLuoguOpenApi(
    path: string,
    method: string,
    body: Buffer | undefined,
    token: LuoguSessionToken
): Promise<{ status: number; contentType: string; body?: Buffer; location?: string }> {
    try {
        const res = await fetch(`https://www.luogu.com.cn/${path}`, {
            method,
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=${token.uid}; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-CSRF-Token': token.csrfToken
            },
            body: body ? new Uint8Array(body) : undefined,
            redirect: 'manual'
        });
        const clonedRes = res.clone();

        const resBody = await res.arrayBuffer().catch(e => {
            if (e instanceof TypeError) return undefined;
            throw e;
        });

        await applyLuoguCookiesToToken(token, clonedRes);

        return {
            status: res.status,
            contentType: res.headers.get('content-type') || 'application/octet-stream',
            body: resBody && Buffer.from(resBody),
            location: res.headers.get('location') || undefined
        };
    } catch (e) {
        logger.error(`Failed to fetch ${path} from Luogu:`, e);
        throw createError({ statusCode: 502, message: `Failed to fetch ${path} from Luogu` });
    }
}

export async function loginLuoguWithWebAuthn(
    token: LuoguSessionToken,
    requestBody: {
        result: AuthenticationResponseJSON;
    }
) {
    try {
        const res = await fetch('https://www.luogu.com.cn/do-auth/fido2', {
            method: 'POST',
            headers: {
                'User-Agent': LUOGU_USER_AGENT,
                Cookie: `_uid=0; __client_id=${token.clientId}`,
                Referer: 'https://www.luogu.com.cn/',
                'X-CSRF-Token': token.csrfToken,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        await applyLuoguCookiesToToken(token, res);
    } catch (e) {
        logger.error('Failed to login with WebAuthn:', e);
        throw createError({ statusCode: 502, message: 'Failed to login with WebAuthn' });
    }
}
