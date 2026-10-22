<template>
    <CpAuthScreen
        :title="screen.title"
        :description="screen.description"
        :step="screen.step"
        :alternatives-label="t('auth.login.otherWays')"
    >
        <CpMfaForm
            v-if="mfa"
            :challenge-id="mfa.challengeId"
            :method="mfa.method"
            @done="finish"
            @cancel="mfa = null"
        />

        <template v-else-if="mode === 'luogu'">
            <CpProofChallenge
                v-if="luoguChallenge"
                platform="luogu"
                :code="luoguChallenge.code"
                :platform-uid="luoguUid.trim()"
                :expires-in="luoguChallenge.expiresIn"
                :busy="busy"
                :error="error"
                @submit="verifyLuogu"
                @back="luoguChallenge = null"
            />
            <form v-else class="login-form" method="post" novalidate @submit.prevent="requestLuogu">
                <AuthField
                    v-slot="{ id }"
                    :label="t('auth.luogu.uid')"
                    :hint="t('auth.luogu.uidHint')"
                    :error="luoguUidInvalid ? t('auth.luogu.uidRule') : ''"
                >
                    <el-input
                        :id="id"
                        v-model="luoguUid"
                        name="luoguUid"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="20"
                        :disabled="!hydrated || busy"
                    />
                </AuthField>
                <CpTurnstile ref="luoguTurnstile" v-model="luoguToken" action="luogu_challenge" />
                <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                <div class="login-form__actions">
                    <el-button :disabled="busy" @click="leaveLuogu">{{
                        t('common.actions.back')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="busy"
                        :disabled="
                            !hydrated ||
                            !luoguUid.trim() ||
                            luoguUidInvalid ||
                            (config.turnstileEnabled && !luoguToken)
                        "
                    >
                        {{ t('auth.luogu.getCode') }}
                    </el-button>
                </div>
            </form>
        </template>

        <form v-else class="login-form" method="post" novalidate @submit.prevent="submitPassword">
            <AuthField v-slot="{ id }" :label="t('auth.fields.email')">
                <el-input
                    :id="id"
                    v-model="email"
                    name="email"
                    type="email"
                    autocomplete="username webauthn"
                    inputmode="email"
                    :disabled="!hydrated || busy"
                />
            </AuthField>
            <AuthField :label="t('auth.fields.password')">
                <template #aside>
                    <NuxtLink :to="forgotLink">{{ t('auth.login.forgot') }}</NuxtLink>
                </template>
                <template #default="{ id }">
                    <el-input
                        :id="id"
                        v-model="password"
                        name="password"
                        type="password"
                        autocomplete="current-password"
                        show-password
                        :disabled="!hydrated || busy"
                    />
                </template>
            </AuthField>
            <CpTurnstile ref="loginTurnstile" v-model="loginToken" action="login" />
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <el-button
                class="login-form__submit"
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="
                    !hydrated ||
                    !email.trim() ||
                    !password ||
                    (config.turnstileEnabled && !loginToken)
                "
            >
                {{ t('common.actions.signIn') }}
            </el-button>
        </form>

        <template v-if="!mfa && mode === 'password'" #alternatives>
            <div class="login-alternatives">
                <el-button
                    v-if="passkeyAvailable"
                    class="login-alternatives__button"
                    :loading="passkeyBusy"
                    :disabled="busy"
                    @click="signInWithPasskey"
                >
                    <KeyRound :size="16" :stroke-width="1.75" aria-hidden="true" />
                    <span>{{ t('auth.login.passkey') }}</span>
                </el-button>
                <AuthProviders
                    mode="login"
                    :redirect="redirect"
                    :turnstile-token="loginToken"
                    :disabled="busy"
                    @used="resetLoginTurnstile"
                />
                <el-button class="login-alternatives__button" :disabled="busy" @click="enterLuogu">
                    <CpPlatformMark platform="luogu" :label="false" />
                    <span>{{ t('auth.login.luogu') }}</span>
                </el-button>
            </div>
        </template>

        <template #footer>
            <p v-if="config.registrationEnabled">
                {{ t('auth.login.noAccount') }}
                <NuxtLink :to="registerLink">{{ t('common.actions.createAccount') }}</NuxtLink>
            </p>
            <p v-else>{{ t('auth.login.registrationClosed') }}</p>
        </template>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { KeyRound } from 'lucide-vue-next';
import type { AuthResult } from '~/types/auth';
import {
    getPasskeyAssertion,
    isPasskeyCancelled,
    isPasskeySupported,
    type PasskeyRequestOptionsJSON
} from '~/utils/passkey-client';
import type { PendingMfa } from '~/composables/useAuthFlow';

definePageMeta({ layout: 'auth', middleware: 'guest' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe } = useApiError();
const { config } = usePublicConfig();
const { complete } = useAuthFlow();
const hydrated = useHydrated();

useHead({ title: t('common.actions.signIn') });

const redirect = computed(() =>
    getSafeRedirectTarget(route.query.redirect as string | undefined, '/profile')
);
const withRedirect = (path: string) =>
    redirect.value === '/profile' ? path : `${path}?redirect=${encodeURIComponent(redirect.value)}`;
const forgotLink = computed(() => withRedirect('/forgot-password'));
const registerLink = computed(() => withRedirect('/register'));

const mode = ref<'password' | 'luogu'>('password');
const mfa = ref<PendingMfa | null>(null);
const busy = ref(false);
const error = ref('');

const screen = computed(() => {
    if (mfa.value) {
        return {
            title: t('auth.mfa.title'),
            description: t('auth.mfa.description'),
            step: t('auth.step', { n: 2, total: 2 })
        };
    }
    if (mode.value === 'luogu') {
        return {
            title: t('auth.luogu.title'),
            description: t('auth.luogu.description'),
            step: t('auth.step', { n: luoguChallenge.value ? 2 : 1, total: 2 })
        };
    }
    return {
        title: t('auth.login.title', { site: config.value.siteTitle }),
        description: t('auth.login.description'),
        step: undefined
    };
});

async function finish(result: AuthResult) {
    const pending = await complete(result, '/profile');
    if (pending) {
        mfa.value = pending;
        error.value = '';
    }
}

/* Email and password */
const email = ref('');
const password = ref('');
const loginToken = ref('');
const loginTurnstile = ref<{ reset: () => void } | null>(null);

function resetLoginTurnstile() {
    loginTurnstile.value?.reset();
}

async function submitPassword() {
    if (busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        await finish(
            await api<AuthResult>('/api/auth/login', {
                method: 'POST',
                body: {
                    email: email.value.trim(),
                    password: password.value,
                    redirect: redirect.value,
                    turnstileToken: loginToken.value || undefined
                }
            })
        );
    } catch (cause) {
        error.value = describe(cause);
        password.value = '';
    } finally {
        busy.value = false;
        resetLoginTurnstile();
    }
}

/* Passkey */
const passkeyBusy = ref(false);
const passkeyAvailable = computed(() => hydrated.value && isPasskeySupported());

async function signInWithPasskey() {
    passkeyBusy.value = true;
    error.value = '';
    try {
        const { challengeId, options } = await api<{
            challengeId: string;
            options: PasskeyRequestOptionsJSON;
        }>('/api/auth/passkey/login/options', {
            method: 'POST',
            body: { redirect: redirect.value }
        });
        const response = await getPasskeyAssertion(options);
        if (!response) {
            error.value = t('common.reauth.passkeyCancelled');
            return;
        }
        await finish(
            await api<AuthResult>('/api/auth/passkey/login/verify', {
                method: 'POST',
                body: { challengeId, response }
            })
        );
    } catch (cause) {
        error.value = isPasskeyCancelled(cause)
            ? t('common.reauth.passkeyCancelled')
            : describe(cause);
    } finally {
        passkeyBusy.value = false;
    }
}

/* Luogu clipboard */
const luoguUid = ref('');
const luoguToken = ref('');
const luoguTurnstile = ref<{ reset: () => void } | null>(null);
const luoguChallenge = ref<{ requestId: string; code: string; expiresIn: number } | null>(null);
const luoguUidInvalid = computed(
    () => luoguUid.value.trim() !== '' && !/^\d{1,20}$/.test(luoguUid.value.trim())
);

function enterLuogu() {
    mode.value = 'luogu';
    error.value = '';
}

function leaveLuogu() {
    mode.value = 'password';
    luoguChallenge.value = null;
    error.value = '';
}

async function requestLuogu() {
    busy.value = true;
    error.value = '';
    try {
        luoguChallenge.value = await api<{ requestId: string; code: string; expiresIn: number }>(
            '/api/auth/thirdparty/luogu/challenge/request',
            {
                method: 'POST',
                body: {
                    luoguUid: luoguUid.value.trim(),
                    redirect: redirect.value,
                    turnstileToken: luoguToken.value || undefined
                }
            }
        );
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
        luoguTurnstile.value?.reset();
    }
}

async function verifyLuogu(pasteId: string) {
    if (!luoguChallenge.value) return;
    busy.value = true;
    error.value = '';
    try {
        await finish(
            await api<AuthResult>('/api/auth/thirdparty/luogu/challenge/verify', {
                method: 'POST',
                body: { requestId: luoguChallenge.value.requestId, pasteId }
            })
        );
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.login-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.login-form__submit {
    width: 100%;
}

.login-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.login-alternatives {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
}

.login-alternatives__button {
    justify-content: flex-start;
    width: 100%;
    margin-left: 0;

    :deep(> span) {
        display: inline-flex;
        align-items: center;
        gap: var(--cp-space-3);
    }
}
</style>
