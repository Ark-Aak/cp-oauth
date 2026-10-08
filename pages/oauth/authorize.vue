<template>
    <div class="consent">
        <section class="auth-card" aria-labelledby="oauth-authorize-title">
            <h1 id="oauth-authorize-title" class="auth-card__title consent__title">
                <ShieldCheck :size="24" :stroke-width="1.5" aria-hidden="true" />
                <span>{{ $t('oauth.consent.title') }}</span>
            </h1>
            <AppAsyncState
                :pending="authorizationPending"
                :error="loadError"
                @retry="refreshAuthorization()"
            >
                <template v-if="clientData">
                    <p class="consent__request">
                        <strong>{{ clientData.client.name }}</strong>
                        {{ $t('oauth.consent.wants_access') }}
                    </p>

                    <section
                        class="consent__permissions"
                        aria-labelledby="consent-permissions-title"
                    >
                        <h2 id="consent-permissions-title">
                            {{ $t('oauth.consent.permissions') }}
                        </h2>
                        <ul class="consent__scope-list">
                            <li
                                v-for="scope in clientData.scopes"
                                :key="scope"
                                class="consent__scope"
                            >
                                <Shield :size="18" :stroke-width="1.5" aria-hidden="true" />
                                <span>{{ $t(`oauth.scopes.${scope.replace(':', '_')}`) }}</span>
                            </li>
                        </ul>
                    </section>

                    <section class="consent__account" aria-labelledby="consent-account-title">
                        <h2 id="consent-account-title">
                            {{ $t('oauth.consent.current_account') }}
                        </h2>
                        <div v-if="user && status === 'authenticated'" class="consent__account-row">
                            <p class="consent__account-name">
                                <strong>{{ user.displayName || user.username }}</strong>
                                <span>{{ '@' + user.username }}</span>
                            </p>
                            <el-button
                                native-type="button"
                                :disabled="controlsPending || identityPending"
                                :loading="switchPending"
                                @click="switchAccount"
                            >
                                {{ $t('oauth.consent.switch_account') }}
                            </el-button>
                        </div>
                        <p v-else-if="status === 'anonymous'" class="consent__account-hint">
                            {{ $t('oauth.consent.signed_out_hint') }}
                        </p>
                        <div
                            v-if="authError"
                            class="consent__notice consent__notice--error"
                            role="alert"
                        >
                            <p>{{ $t('identity.identity_unavailable') }}</p>
                            <el-button
                                native-type="button"
                                :disabled="controlsPending || identityPending"
                                :loading="identityPending"
                                @click="loadIdentity(true)"
                            >
                                {{ $t('identity.retry') }}
                            </el-button>
                        </div>
                    </section>

                    <div
                        v-if="needsEmailVerification"
                        class="consent__notice consent__notice--verification"
                        role="status"
                    >
                        <p>{{ $t('oauth.consent.email_verification_required') }}</p>
                        <NuxtLink :to="verificationPath" class="consent__task-link">
                            {{ $t('oauth.consent.go_verify_email') }}
                        </NuxtLink>
                        <p class="consent__account-hint">
                            {{ $t('oauth.consent.verification_return_hint') }}
                        </p>
                    </div>
                    <p
                        v-if="decisionError"
                        ref="decisionErrorElement"
                        tabindex="-1"
                        class="consent__notice consent__notice--error"
                        role="alert"
                    >
                        {{ decisionError }}
                    </p>

                    <div class="consent__actions">
                        <el-button
                            native-type="button"
                            :disabled="controlsPending"
                            :loading="decisionPending && decisionApproved === false"
                            @click="handleDecision(false)"
                        >
                            {{ $t('oauth.consent.deny') }}
                        </el-button>
                        <el-button
                            type="primary"
                            native-type="button"
                            :disabled="
                                controlsPending ||
                                identityPending ||
                                needsEmailVerification ||
                                status === 'error'
                            "
                            :loading="decisionPending && decisionApproved === true"
                            @click="handleDecision(true)"
                        >
                            {{
                                $t(
                                    status === 'anonymous'
                                        ? 'oauth.consent.sign_in_authorize'
                                        : 'oauth.consent.authorize'
                                )
                            }}
                        </el-button>
                    </div>
                </template>
            </AppAsyncState>
        </section>
    </div>
</template>

<script setup lang="ts">
import { LogOut, Shield, ShieldCheck } from 'lucide-vue-next';
import { getCurrentInstance, markRaw } from 'vue';
import { ElMessageBox } from 'element-plus';
import type { OAuthAuthorizationResponse } from '~/types/api';
import { buildLoginPath, getSafeRedirectTarget } from '~/utils/auth-redirect';

definePageMeta({ layout: 'auth' });
const { t } = useI18n();
const messageBoxContext = getCurrentInstance()?.appContext;
const route = useRoute();
const api = useApi();
const { user, status, error: authError, load, logout } = useAuth();
useHead({ title: () => t('oauth.consent.title') });
const identityPending = ref(false);
const switchConfirming = ref(false);
const switchPending = ref(false);
const decisionPending = ref(false);
const decisionApproved = ref<boolean | null>(null);
const decisionError = ref('');
const decisionErrorElement = ref<HTMLElement | null>(null);
const emailVerificationRequired = ref(false);
const controlsPending = computed(
    () => decisionPending.value || switchConfirming.value || switchPending.value
);
const authorizationPath = computed(() => getSafeRedirectTarget(route.fullPath));
const verificationPath = computed(() => ({
    path: '/profile',
    query: { tab: 'basic', redirect: authorizationPath.value }
}));

type RequestFailure = {
    status?: number;
    statusCode?: number;
    response?: { status?: number };
    data?: {
        message?: string;
        error_description?: string;
        reason?: string;
        data?: { reason?: string };
    };
};

function errorMessage(cause: unknown, fallback: string) {
    const failure = cause as RequestFailure | null;
    const code = failure?.response?.status ?? failure?.statusCode ?? failure?.status;
    if (code === 403) return t('identity.permission_denied');
    if (code && code >= 500) return t('identity.network_error');
    return failure?.data?.error_description || failure?.data?.message || fallback;
}

async function loadIdentity(force = false) {
    if (identityPending.value) return;
    identityPending.value = true;
    try {
        await load(force);
        emailVerificationRequired.value = false;
    } catch {
        // Identity failures do not prevent a server-validated anonymous denial.
    } finally {
        identityPending.value = false;
    }
}

const authorization = useAsyncData(
    () => `oauth:authorization:${route.fullPath}`,
    () =>
        api<OAuthAuthorizationResponse>('/api/oauth/authorize', {
            params: {
                client_id: route.query.client_id,
                redirect_uri: route.query.redirect_uri,
                response_type: route.query.response_type,
                scope: route.query.scope,
                state: route.query.state,
                code_challenge: route.query.code_challenge,
                code_challenge_method: route.query.code_challenge_method
            }
        }),
    { deep: false }
);
await Promise.all([loadIdentity(), authorization]);
const {
    data: clientData,
    pending: authorizationPending,
    error: authorizationError,
    refresh: refreshAuthorization
} = authorization;
const loadError = computed(() =>
    authorizationError.value
        ? errorMessage(authorizationError.value, t('oauth.consent.error'))
        : null
);
const needsEmailVerification = computed(
    () =>
        emailVerificationRequired.value ||
        (!!clientData.value?.client.requireEmailVerified &&
            !!user.value &&
            !user.value.emailVerified)
);

watch(
    () => route.fullPath,
    () => {
        decisionError.value = '';
        emailVerificationRequired.value = false;
    }
);

async function showDecisionError(message: string) {
    decisionError.value = message;
    await nextTick();
    decisionErrorElement.value?.focus();
}

async function switchAccount() {
    if (controlsPending.value || identityPending.value) return;
    const loginPath = buildLoginPath(authorizationPath.value);
    switchConfirming.value = true;
    try {
        await ElMessageBox.confirm(
            t('oauth.consent.switch_account_confirm'),
            t('oauth.consent.switch_account'),
            {
                type: 'warning',
                icon: markRaw(LogOut),
                confirmButtonText: t('oauth.consent.switch_account'),
                cancelButtonText: t('common.cancel')
            },
            messageBoxContext
        );
    } catch (cause) {
        if (cause !== 'cancel' && cause !== 'close') {
            await showDecisionError(errorMessage(cause, t('identity.network_error')));
        }
        return;
    } finally {
        switchConfirming.value = false;
    }
    switchPending.value = true;
    decisionError.value = '';
    try {
        await logout(loginPath);
    } catch (cause) {
        await showDecisionError(errorMessage(cause, t('identity.network_error')));
    } finally {
        switchPending.value = false;
    }
}

async function handleDecision(approved: boolean) {
    const request = clientData.value;
    if (!request || authorizationPending.value || authorizationError.value || controlsPending.value)
        return;
    if (
        approved &&
        (needsEmailVerification.value || identityPending.value || status.value === 'error')
    )
        return;
    const returnPath = authorizationPath.value;
    decisionPending.value = true;
    decisionApproved.value = approved;
    decisionError.value = '';
    try {
        if (approved) {
            await load();
            if (status.value === 'anonymous') {
                await navigateTo(buildLoginPath(returnPath));
                return;
            }
            if (!user.value) {
                await showDecisionError(t('identity.identity_unavailable'));
                return;
            }
            if (request.client.requireEmailVerified && !user.value.emailVerified) {
                emailVerificationRequired.value = true;
                return;
            }
        }
        const result = await api<{ redirect: string }>('/api/oauth/authorize', {
            method: 'POST',
            body: {
                client_id: request.client.clientId,
                redirect_uri: request.redirectUri,
                scopes: request.scopes,
                state: request.state,
                code_challenge: request.codeChallenge,
                code_challenge_method: request.codeChallengeMethod,
                approved
            }
        });
        await navigateTo(result.redirect, { external: true });
    } catch (cause) {
        const failure = cause as RequestFailure;
        const reason = failure.data?.data?.reason ?? failure.data?.reason;
        const code = failure.response?.status ?? failure.statusCode ?? failure.status;
        if (approved && reason === 'email_not_verified') {
            emailVerificationRequired.value = true;
        } else if (approved && code === 401 && status.value === 'anonymous') {
            await navigateTo(buildLoginPath(returnPath));
        } else {
            await showDecisionError(errorMessage(cause, t('identity.network_error')));
        }
    } finally {
        decisionPending.value = false;
        decisionApproved.value = null;
    }
}
</script>

<style scoped lang="scss">
.consent {
    width: 100%;
    min-width: 0;
    font-size: var(--font-size-control);

    &__title {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        font-size: var(--font-size-section);
        line-height: 1.4;

        svg {
            flex-shrink: 0;
            color: var(--accent);
        }
    }

    &__request {
        margin-bottom: var(--space-3);
        color: var(--text-secondary);
        font-size: var(--font-size-body);
        overflow-wrap: anywhere;

        strong {
            color: var(--text-primary);
        }
    }

    h2 {
        margin-bottom: var(--space-2);
        font-size: var(--font-size-subheading);
        font-weight: 600;
        line-height: 1.4;
    }

    &__permissions {
        margin-bottom: var(--space-3);
    }

    &__scope-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    &__scope {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        align-items: start;
        gap: var(--space-2);
        padding-block: var(--space-1);
        border-bottom: 1px solid var(--border-color);
        font-size: var(--font-size-control);
        line-height: 1.45;
        overflow-wrap: anywhere;

        svg {
            margin-top: 2px;
            color: var(--accent);
        }
    }

    &__scope:last-child {
        border-bottom: 0;
    }

    &__account {
        margin-bottom: var(--space-3);
        padding-top: var(--space-3);
        border-top: 1px solid var(--border-color);
    }

    &__account-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: var(--space-3);
        min-width: 0;
    }

    &__account-name {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: var(--space-2);
        min-width: 0;
        font-size: var(--font-size-body);
        overflow-wrap: anywhere;

        span {
            color: var(--text-secondary);
            font-size: var(--font-size-control);
        }
    }

    &__account-hint {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
        overflow-wrap: anywhere;
    }

    &__notice {
        margin-bottom: var(--space-3);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-left-width: 3px;
        border-radius: 0;
        color: var(--text-primary);
        font-size: var(--font-size-control);
        line-height: 1.5;
        overflow-wrap: anywhere;
    }

    &__notice--verification {
        background: var(--el-color-warning-light-9);
        border-color: var(--el-color-warning);
    }

    &__notice--error {
        background: var(--el-color-danger-light-9);
        border-color: var(--el-color-danger);
    }

    &__notice .el-button {
        margin-top: var(--space-3);
    }

    &__task-link {
        display: inline-flex;
        align-items: center;
        min-width: 44px;
        min-height: 44px;
        margin-block: var(--space-1);
        overflow-wrap: anywhere;
    }

    &__actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: var(--space-3);
    }

    &__actions > .el-button {
        margin: 0;
        min-height: 44px;
        height: auto;
        padding-block: var(--space-2);
        white-space: normal;
    }

    @media (max-width: 479px) {
        &__account-row {
            grid-template-columns: minmax(0, 1fr);
            align-items: stretch;
        }

        &__account-row :deep(.el-button) {
            width: 100%;
        }
    }
}
</style>
