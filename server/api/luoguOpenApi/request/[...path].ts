import bcrypt from 'bcryptjs';
import { base32Decode, base32Encode } from '@ctrl/ts-base32';
import prisma from '~/server/utils/prisma';
import { bitDecode, bitEncode } from '~/server/utils/bit-codec';
import {
    encryptData,
    decryptData,
    getLuoguOpenApiCredentialCache,
    getLuoguOpenApiValidationCache,
    setLuoguOpenApiCredentialCache,
    setLuoguOpenApiValidationCache
} from '~/server/utils/luogu-openapi-credentials';
import crypto from 'node:crypto';
import { type H3Event, isError as isH3Error } from 'h3';
import {
    requestLuoguOpenApi,
    generateLuoguCSRF,
    getLuoguWebAuthnLoginOptions,
    loginLuoguWithWebAuthn,
    type LuoguSessionToken
} from '~/server/utils/fetch-luogu';
import { emulateLuoguWebAuthnLogin } from '~/server/utils/luogu-webauthn-emulator';

function getBearerTokenFromHeader(event: H3Event): string {
    const authorization = getHeader(event, 'authorization');
    if (typeof authorization === 'string') {
        const parts = authorization.split(' ');
        if (parts.length === 2 && /^Bearer$/i.test(parts[0] || '')) {
            const bearerToken = parts[1]?.trim();
            if (bearerToken) {
                return bearerToken;
            }
        }
    }

    throw createError({
        statusCode: 401,
        message: 'Luogu OpenAPI token is required',
        cause: 'from cp-oauth'
    });
}

function parseOpenApiToken(rawToken: string): { keyIdBase32: string; apiTokenBase32: string } {
    const segments = rawToken.split(':');
    if (segments.length !== 2) {
        throw createError({
            statusCode: 401,
            message: 'Invalid Luogu OpenAPI token format',
            cause: 'from cp-oauth'
        });
    }

    const keyIdBase32 = segments[0]?.trim().toUpperCase();
    const apiTokenBase32 = segments[1]?.trim().toUpperCase();

    if (!keyIdBase32 || !apiTokenBase32) {
        throw createError({
            statusCode: 401,
            message: 'Invalid Luogu OpenAPI token format',
            cause: 'from cp-oauth'
        });
    }

    return { keyIdBase32, apiTokenBase32 };
}

export default defineEventHandler(async event => {
    const rawToken = getBearerTokenFromHeader(event);
    const { keyIdBase32, apiTokenBase32 } = parseOpenApiToken(rawToken);

    let keyIdBitEncoded = '';
    try {
        const keyIdBytes = base32Decode(keyIdBase32);
        if (keyIdBytes.length !== 20) {
            throw new Error('invalid length');
        }
        keyIdBitEncoded = bitEncode(Buffer.from(keyIdBytes));
    } catch {
        throw createError({
            statusCode: 401,
            message: 'Invalid Luogu OpenAPI token format',
            cause: 'from cp-oauth'
        });
    }

    let userId = '';
    let encryptedDek = '';
    const cachedValidation = getLuoguOpenApiValidationCache(keyIdBitEncoded, apiTokenBase32);
    if (cachedValidation) {
        userId = cachedValidation.userId;
        encryptedDek = cachedValidation.encryptedDEK;
    } else {
        const tokenRecord = await prisma.luoguApiToken.findUnique({
            where: { keyId: keyIdBitEncoded },
            select: {
                userId: true,
                passwordHash: true,
                encryptedDEK: true
            }
        });

        if (!tokenRecord) {
            throw createError({
                statusCode: 401,
                message: 'Invalid Luogu OpenAPI token',
                cause: 'from cp-oauth'
            });
        }

        const valid = await bcrypt.compare(apiTokenBase32, tokenRecord.passwordHash);
        if (!valid) {
            throw createError({
                statusCode: 401,
                message: 'Invalid Luogu OpenAPI token',
                cause: 'from cp-oauth'
            });
        }

        userId = tokenRecord.userId;
        encryptedDek = tokenRecord.encryptedDEK;
        setLuoguOpenApiValidationCache(keyIdBitEncoded, apiTokenBase32, {
            userId,
            encryptedDEK: encryptedDek
        });
    }

    let openApiCredentialCache = getLuoguOpenApiCredentialCache(userId);

    if (!openApiCredentialCache) {
        const tokenBuffer = Buffer.from(base32Decode(apiTokenBase32));
        const dek = decryptData(
            bitDecode(encryptedDek),
            crypto.createHash('sha256').update(tokenBuffer).digest()
        );

        const secretRecord = await prisma.luoguApiSecert.findUnique({
            where: { userId },
            select: {
                luoguUid: true,
                encryptedLuoguWebAuthnClientRepo: true,
                encryptedLuoguClientId: true,
                valid: true
            }
        });

        if (!secretRecord) {
            throw createError({
                statusCode: 404,
                message: 'Luogu OpenAPI credential is not setup',
                cause: 'from cp-oauth'
            });
        }

        setLuoguOpenApiCredentialCache(
            userId,
            (openApiCredentialCache = {
                luoguUid: secretRecord.luoguUid,
                dek,
                clientId: base32Encode(
                    decryptData(bitDecode(secretRecord.encryptedLuoguClientId), dek)
                ),
                webauthn: decryptData(
                    bitDecode(secretRecord.encryptedLuoguWebAuthnClientRepo),
                    dek
                ).toString('utf-8'),
                valid: secretRecord.valid
            })
        );
    }

    if (!openApiCredentialCache.valid)
        throw createError({
            statusCode: 403,
            message: 'This luogu account is invalid',
            cause: 'from cp-oauth'
        });

    const search = new URL(event.node.req.url || '', 'http://localhost').search;
    const requestPath = (getRouterParam(event, 'path') || '') + search;
    const requestBody =
        event.method !== 'GET' && event.method !== 'HEAD'
            ? await readRawBody(event, false)
            : undefined;

    const secretRecordPatch: {
        clientId?: string;
        webauthn?: string;
        valid?: boolean;
    } = {};
    const sessionToken: LuoguSessionToken = {
        uid: openApiCredentialCache.luoguUid,
        clientId: openApiCredentialCache.clientId.toLowerCase(),
        csrfToken: openApiCredentialCache.csrf || ''
    };

    try {
        let requestState: 'ok' | 'csrf' | 'unlogin' = 'ok';
        if (!sessionToken.csrfToken) requestState = 'csrf';
        else {
            const res = await requestLuoguOpenApi(
                requestPath,
                event.node.req.method || 'GET',
                requestBody,
                sessionToken
            );
            if (sessionToken.uid !== openApiCredentialCache.luoguUid) requestState = 'unlogin';
            else if (res.body) {
                try {
                    const data = JSON.parse(res.body.toString('utf-8'));
                    if (
                        typeof data === 'object' &&
                        data !== null &&
                        'errorType' in data &&
                        (data.errorType ===
                            'LuoguWeb\\Spilopelia\\Library\\Csrf\\CsrfTokenInvalidException' ||
                            data.errorType ===
                                'Luogu\\Exception\\Request\\InvalidCSRFTokenException')
                    )
                        requestState = 'csrf';
                } catch {
                    // ignore JSON parse error
                }
            }

            if (requestState === 'ok')
                return new Response(res.body ? new Uint8Array(res.body) : null, {
                    status: res.status,
                    headers: {
                        'Content-Type': res.contentType,
                        ...(res.location ? { Location: res.location } : {})
                    }
                });
        }

        // 无论如何，此处 CSRF 无效
        await generateLuoguCSRF(sessionToken);
        if (sessionToken.uid !== openApiCredentialCache.luoguUid) requestState = 'unlogin';

        if (requestState === 'unlogin') {
            const loginEmulation = emulateLuoguWebAuthnLogin(
                await getLuoguWebAuthnLoginOptions(sessionToken),
                openApiCredentialCache.webauthn
            );
            secretRecordPatch.webauthn = loginEmulation.repository;
            // TODO: login failed handling
            await loginLuoguWithWebAuthn(sessionToken, loginEmulation.requestBody);
        }

        if (sessionToken.clientId !== openApiCredentialCache.clientId.toLowerCase())
            secretRecordPatch.clientId = sessionToken.clientId;

        if (sessionToken.uid !== openApiCredentialCache.luoguUid) {
            secretRecordPatch.valid = false;
            throw createError({
                statusCode: 401,
                message: 'This luogu account is invalid',
                cause: 'from cp-oauth'
            });
        }

        const res = await requestLuoguOpenApi(
            requestPath,
            event.node.req.method || 'GET',
            requestBody,
            sessionToken
        );

        if (res.body)
            try {
                const data = JSON.parse(res.body.toString('utf-8'));
                if (
                    typeof data === 'object' &&
                    data !== null &&
                    'errorType' in data &&
                    (data.errorType ===
                        'LuoguWeb\\Spilopelia\\Library\\Csrf\\CsrfTokenInvalidException' ||
                        data.errorType === 'Luogu\\Exception\\Request\\InvalidCSRFTokenException')
                )
                    throw createError({
                        statusCode: 403,
                        message: 'CSRF is invalid',
                        cause: 'from cp-oauth'
                    });
            } catch {
                // ignore JSON parse error
            }

        return new Response(res.body ? new Uint8Array(res.body) : null, {
            status: res.status,
            headers: {
                'Content-Type': res.contentType,
                ...(res.location ? { Location: res.location } : {})
            }
        });
    } catch (e) {
        if (isH3Error(e)) throw e;
        console.error('Failed to fetch luogu', e);
        throw createError({
            statusCode: 500,
            message: 'Failed to fetch luogu',
            cause: 'by cp-oauth'
        });
    } finally {
        if (Object.keys(secretRecordPatch).length > 0) {
            await prisma.luoguApiSecert.update({
                where: { userId },
                data: {
                    valid: secretRecordPatch.valid,
                    encryptedLuoguClientId:
                        secretRecordPatch.clientId !== undefined
                            ? bitEncode(
                                  encryptData(
                                      base32Decode(secretRecordPatch.clientId),
                                      openApiCredentialCache.dek
                                  )
                              )
                            : undefined,
                    encryptedLuoguWebAuthnClientRepo:
                        secretRecordPatch.webauthn !== undefined
                            ? bitEncode(
                                  encryptData(
                                      base32Decode(secretRecordPatch.webauthn),
                                      openApiCredentialCache.dek
                                  )
                              )
                            : undefined
                }
            });
        }
        setLuoguOpenApiCredentialCache(userId, {
            ...openApiCredentialCache,
            ...secretRecordPatch,
            csrf: sessionToken.csrfToken
        });
    }
});
