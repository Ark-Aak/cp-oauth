import { z } from 'zod';
import { getHeader, getRequestURL, readBody, readRawBody, type H3Event } from 'h3';
import prisma from '~/server/utils/prisma';
import {
    OAuthProtocolError,
    validateScopes,
    PKCE_VERIFIER_PATTERN,
    PKCE_S256_PATTERN
} from '~/server/utils/oauth';
import type { ScopeName } from '~/utils/oauth-scopes';
import { isSafeOAuthRedirectUri } from '~/utils/oauth-redirect';

const scalarParametersSchema = z.record(z.string(), z.string());
const authorizationQuerySchema = z.object({
    response_type: z.literal('code'),
    client_id: z.string().min(1),
    redirect_uri: z.string().min(1).max(2048),
    scope: z.string(),
    state: z.string().max(4096).optional(),
    code_challenge: z.string().optional(),
    code_challenge_method: z.string().optional()
});
const optionalConsentString = z
    .string()
    .nullable()
    .optional()
    .transform(value => value ?? undefined);
const authorizationConsentSchema = z
    .object({
        response_type: z.literal('code').optional(),
        client_id: z.string().min(1),
        redirect_uri: z.string().min(1).max(2048),
        scopes: z.array(z.string()),
        state: z
            .string()
            .max(4096)
            .nullable()
            .optional()
            .transform(value => value ?? undefined),
        code_challenge: optionalConsentString,
        code_challenge_method: optionalConsentString,
        approved: z.boolean()
    })
    .catchall(z.string());

export interface OAuthAuthorizationRequest {
    clientId: string;
    redirectUri: string;
    scopes: ScopeName[];
    state: string | undefined;
    codeChallenge: string | undefined;
    codeChallengeMethod: 'S256' | 'plain' | undefined;
}

function parseProtocolInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
    const result = schema.safeParse(input);
    if (!result.success) {
        throw new OAuthProtocolError(
            'invalid_request',
            'OAuth parameters must have the expected scalar types'
        );
    }
    return result.data;
}

export function oauthParametersFromSearchParams(
    parameters: URLSearchParams
): Record<string, string> {
    const values: Record<string, string> = Object.create(null);
    for (const [key, value] of parameters) {
        if (Object.hasOwn(values, key)) {
            throw new OAuthProtocolError(
                'invalid_request',
                'Repeated OAuth parameters are not allowed'
            );
        }
        values[key] = value;
    }
    return values;
}

export function parseOAuthScopes(scope: string): ScopeName[] {
    const scopes = [...new Set(scope.split(' ').filter(Boolean))];
    if (!validateScopes(scopes)) {
        throw new OAuthProtocolError(
            'invalid_scope',
            'A non-empty set of supported scopes is required'
        );
    }
    return scopes;
}

function normalizeAuthorization(parameters: {
    client_id: string;
    redirect_uri: string;
    scopes: string[];
    state?: string;
    code_challenge?: string;
    code_challenge_method?: string;
}): OAuthAuthorizationRequest {
    const scopes = [...new Set(parameters.scopes)];
    if (!validateScopes(scopes)) {
        throw new OAuthProtocolError(
            'invalid_scope',
            'A non-empty set of supported scopes is required'
        );
    }
    const challenge = parameters.code_challenge;
    const method = parameters.code_challenge_method;
    if (challenge === undefined && method !== undefined) {
        throw new OAuthProtocolError(
            'invalid_request',
            'code_challenge_method requires code_challenge'
        );
    }
    const challengeMethod = challenge === undefined ? undefined : (method ?? 'plain');
    if (
        challenge !== undefined &&
        !(
            (challengeMethod === 'plain' && PKCE_VERIFIER_PATTERN.test(challenge)) ||
            (challengeMethod === 'S256' && PKCE_S256_PATTERN.test(challenge))
        )
    ) {
        throw new OAuthProtocolError('invalid_request', 'Invalid PKCE challenge or method');
    }
    return {
        clientId: parameters.client_id,
        redirectUri: parameters.redirect_uri,
        scopes,
        state: parameters.state,
        codeChallenge: challenge,
        codeChallengeMethod: challengeMethod as OAuthAuthorizationRequest['codeChallengeMethod']
    };
}

export function parseOAuthAuthorizationQuery(input: unknown): OAuthAuthorizationRequest {
    const parameters = parseProtocolInput(
        authorizationQuerySchema,
        parseProtocolInput(scalarParametersSchema, input)
    );
    return normalizeAuthorization({
        ...parameters,
        scopes: parameters.scope.split(' ').filter(Boolean)
    });
}

export function parseOAuthAuthorizationConsent(
    input: unknown
): OAuthAuthorizationRequest & { approved: boolean } {
    const parameters = parseProtocolInput(authorizationConsentSchema, input);
    return { ...normalizeAuthorization(parameters), approved: parameters.approved };
}

export async function validateOAuthAuthorization(request: OAuthAuthorizationRequest) {
    const client = await prisma.oAuthClient.findUnique({ where: { clientId: request.clientId } });
    if (!client) throw new OAuthProtocolError('invalid_client', 'Unknown OAuth client');
    if (
        !isSafeOAuthRedirectUri(request.redirectUri) ||
        !client.redirectUris.includes(request.redirectUri)
    ) {
        throw new OAuthProtocolError('invalid_request', 'Invalid redirect_uri');
    }
    return client;
}

export function readOAuthAuthorizationQuery(event: H3Event): OAuthAuthorizationRequest {
    return parseOAuthAuthorizationQuery(
        oauthParametersFromSearchParams(getRequestURL(event).searchParams)
    );
}

export async function readOAuthAuthorizationConsent(event: H3Event) {
    let input: unknown;
    try {
        input = await readBody(event);
    } catch {
        throw new OAuthProtocolError('invalid_request', 'Invalid consent request body');
    }
    return parseOAuthAuthorizationConsent(input);
}

/** Protocol clients may submit JSON or the standard URL-encoded scalar form. */
export async function readOAuthTokenBody(event: H3Event): Promise<Record<string, string>> {
    const mediaType = getHeader(event, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json' && mediaType !== 'application/x-www-form-urlencoded') {
        throw new OAuthProtocolError(
            'invalid_request',
            'Use application/json or application/x-www-form-urlencoded'
        );
    }
    let input: unknown;
    try {
        const raw = await readRawBody(event);
        if (!raw) throw new OAuthProtocolError('invalid_request', 'A request body is required');
        input =
            mediaType === 'application/json'
                ? JSON.parse(raw)
                : oauthParametersFromSearchParams(new URLSearchParams(raw));
    } catch (error) {
        if (error instanceof OAuthProtocolError) throw error;
        throw new OAuthProtocolError('invalid_request', 'Invalid OAuth request body');
    }
    return parseProtocolInput(scalarParametersSchema, input);
}

export function requireOAuthParameter(parameters: Record<string, string>, name: string): string {
    const value = parameters[name];
    if (!value) throw new OAuthProtocolError('invalid_request', `${name} is required`);
    return value;
}

const clientFields = {
    name: z.string().trim().min(1).max(100),
    redirectUris: z
        .array(
            z
                .string()
                .trim()
                .min(1)
                .max(2048)
                .refine(
                    isSafeOAuthRedirectUri,
                    'Use HTTPS, or HTTP on localhost, 127.0.0.1 or [::1]'
                )
        )
        .min(1)
        .max(20)
        .transform(uris => [...new Set(uris)]),
    requireEmailVerified: z.boolean()
};
export const oauthClientCreateSchema = z
    .object({
        ...clientFields,
        requireEmailVerified: clientFields.requireEmailVerified.optional().default(false)
    })
    .strict();
export const oauthClientPatchSchema = z
    .object(clientFields)
    .partial()
    .strict()
    .refine(patch => Object.keys(patch).length > 0, 'At least one field is required');
