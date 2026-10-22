<template>
    <CpAuthScreen
        v-if="!config.registrationEnabled"
        :title="t('auth.register.closedTitle')"
        :description="t('auth.register.closedText')"
        :icon="CircleSlash"
        tone="warning"
    >
        <el-button type="primary" @click="navigateTo(loginLink)">{{
            t('common.actions.signIn')
        }}</el-button>
    </CpAuthScreen>

    <CpAuthScreen
        v-else
        :title="screen.title"
        :description="screen.description"
        :step="screen.step"
        :alternatives-label="t('auth.register.otherWays')"
    >
        <CpMfaForm
            v-if="mfa"
            :challenge-id="mfa.challengeId"
            :method="mfa.method"
            @done="finish"
            @cancel="mfa = null"
        />

        <template v-else-if="proofPlatform">
            <CpProofChallenge
                v-if="proofChallenge"
                :platform="proofPlatform"
                :code="proofChallenge.code"
                :platform-uid="proofUid.trim()"
                :expires-in="proofChallenge.expiresIn"
                :busy="busy"
                :error="error"
                @submit="verifyProof"
                @back="proofChallenge = null"
            />
            <form
                v-else
                class="register-form"
                method="post"
                novalidate
                @submit.prevent="requestProof"
            >
                <AuthField
                    v-slot="{ id }"
                    :label="t(`auth.register.proof.uid.${proofPlatform}`)"
                    :hint="t(`auth.register.proof.uidHint.${proofPlatform}`)"
                    :error="proofUidInvalid ? t('auth.luogu.uidRule') : ''"
                >
                    <el-input
                        :id="id"
                        v-model="proofUid"
                        name="platformUid"
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="100"
                        :inputmode="proofPlatform === 'luogu' ? 'numeric' : 'text'"
                        :disabled="!hydrated || busy"
                    />
                </AuthField>
                <CpTurnstile ref="proofTurnstile" v-model="proofToken" action="register" />
                <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                <div class="register-form__actions">
                    <el-button :disabled="busy" @click="leaveProof">{{
                        t('common.actions.back')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="busy"
                        :disabled="
                            !hydrated ||
                            !proofUid.trim() ||
                            proofUidInvalid ||
                            (config.turnstileEnabled && !proofToken)
                        "
                    >
                        {{ t('auth.luogu.getCode') }}
                    </el-button>
                </div>
            </form>
        </template>

        <form v-else class="register-form" method="post" novalidate @submit.prevent="submit">
            <AuthField
                v-slot="{ id }"
                :label="t('auth.fields.username')"
                :hint="t('auth.register.usernameRule')"
                :error="errors.username"
            >
                <el-input
                    :id="id"
                    v-model="username"
                    name="username"
                    autocomplete="username"
                    spellcheck="false"
                    :maxlength="USERNAME_MAX_LENGTH"
                    :disabled="!hydrated || busy"
                />
            </AuthField>
            <AuthField v-slot="{ id }" :label="t('auth.fields.email')" :error="errors.email">
                <el-input
                    :id="id"
                    v-model="email"
                    name="email"
                    type="email"
                    autocomplete="email"
                    inputmode="email"
                    :disabled="!hydrated || busy"
                />
            </AuthField>
            <AuthField
                v-slot="{ id }"
                :label="t('auth.fields.password')"
                :hint="t('auth.passwordRule')"
                :error="errors.password"
            >
                <el-input
                    :id="id"
                    v-model="password"
                    name="password"
                    type="password"
                    autocomplete="new-password"
                    show-password
                    :disabled="!hydrated || busy"
                />
            </AuthField>
            <AuthField
                v-slot="{ id }"
                :label="t('auth.fields.confirmPassword')"
                :error="confirm && confirm !== password ? t('auth.passwordMismatch') : ''"
            >
                <el-input
                    :id="id"
                    v-model="confirm"
                    name="confirm-password"
                    type="password"
                    autocomplete="new-password"
                    show-password
                    :disabled="!hydrated || busy"
                />
            </AuthField>
            <CpTurnstile ref="registerTurnstile" v-model="registerToken" action="register" />
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <el-button
                class="register-form__submit"
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="!hydrated || !valid || (config.turnstileEnabled && !registerToken)"
            >
                {{ t('common.actions.createAccount') }}
            </el-button>
        </form>

        <template v-if="!mfa && !proofPlatform" #alternatives>
            <div class="register-alternatives">
                <AuthProviders
                    mode="register"
                    :redirect="redirect"
                    :turnstile-token="registerToken"
                    :disabled="busy"
                    @used="registerTurnstile?.reset()"
                />
                <el-button
                    v-for="platform in PROOF_PLATFORMS"
                    :key="platform"
                    class="register-alternatives__button"
                    :disabled="busy"
                    @click="enterProof(platform)"
                >
                    <CpPlatformMark :platform="platform" :label="false" />
                    <span>{{
                        t('auth.register.withProof', { platform: PLATFORMS[platform].name })
                    }}</span>
                </el-button>
            </div>
        </template>

        <template #footer>
            <p>
                {{ t('auth.register.haveAccount') }}
                <NuxtLink :to="loginLink">{{ t('common.actions.signIn') }}</NuxtLink>
            </p>
        </template>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { CircleSlash } from 'lucide-vue-next';
import type { PendingMfa } from '~/composables/useAuthFlow';
import type { AuthResult } from '~/types/auth';
import { PLATFORMS } from '~/utils/platforms';
import { USERNAME_MAX_LENGTH, USERNAME_REGEX, normalizeUsername } from '~/utils/username';

type ProofPlatform = 'luogu' | 'leetcode';
const PROOF_PLATFORMS: ProofPlatform[] = ['luogu', 'leetcode'];

definePageMeta({ layout: 'auth', middleware: 'guest' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe, read } = useApiError();
const { config } = usePublicConfig();
const { complete } = useAuthFlow();
const hydrated = useHydrated();

useHead({ title: t('common.actions.createAccount') });

const redirect = computed(() =>
    getSafeRedirectTarget(route.query.redirect as string | undefined, '/profile')
);
const loginLink = computed(() =>
    redirect.value === '/profile' ? '/login' : buildLoginPath(redirect.value)
);

const mfa = ref<PendingMfa | null>(null);
const busy = ref(false);
const error = ref('');

const screen = computed(() => {
    if (mfa.value)
        return {
            title: t('auth.mfa.title'),
            description: t('auth.mfa.description'),
            step: undefined
        };
    if (proofPlatform.value) {
        return {
            title: t('auth.register.proof.title', {
                platform: PLATFORMS[proofPlatform.value].name
            }),
            description: t(`auth.register.proof.description.${proofPlatform.value}`),
            step: t('auth.step', { n: proofChallenge.value ? 2 : 1, total: 2 })
        };
    }
    return {
        title: t('auth.register.title'),
        description: t('auth.register.description'),
        step: undefined
    };
});

async function finish(result: AuthResult) {
    if ('authenticated' in result && result.verificationEmailSent) {
        ElMessage.success(t('auth.register.verificationSent'));
    }
    const pending = await complete(result, '/profile');
    if (pending) mfa.value = pending;
}

/* Local account */
const username = ref('');
const email = ref('');
const password = ref('');
const confirm = ref('');
const registerToken = ref('');
const registerTurnstile = ref<{ reset: () => void } | null>(null);
const errors = reactive<Record<string, string>>({});

const passwordValid = computed(
    () => password.value.length >= 8 && new TextEncoder().encode(password.value).length <= 72
);
const usernameValid = computed(() => USERNAME_REGEX.test(normalizeUsername(username.value)));
const valid = computed(
    () =>
        usernameValid.value &&
        email.value.trim().length > 0 &&
        passwordValid.value &&
        password.value === confirm.value
);

watch(username, value => {
    errors.username =
        value && !USERNAME_REGEX.test(normalizeUsername(value))
            ? t('auth.register.usernameRule')
            : '';
});
watch(password, value => {
    errors.password = value && !passwordValid.value ? t('auth.passwordRule') : '';
});

async function submit() {
    if (!valid.value || busy.value) return;
    busy.value = true;
    error.value = '';
    try {
        await finish(
            await api<AuthResult>('/api/auth/register', {
                method: 'POST',
                body: {
                    username: normalizeUsername(username.value),
                    email: email.value.trim(),
                    password: password.value,
                    redirect: redirect.value,
                    turnstileToken: registerToken.value || undefined
                }
            })
        );
    } catch (cause) {
        const info = read(cause);
        for (const [field, message] of Object.entries(info.fields)) errors[field] = message;
        if (info.status === 409) error.value = t('auth.register.exists');
        else if (!Object.keys(info.fields).length) error.value = describe(cause);
    } finally {
        busy.value = false;
        registerTurnstile.value?.reset();
    }
}

/* Registration by platform proof */
const proofPlatform = ref<ProofPlatform | null>(null);
const proofUid = ref('');
const proofToken = ref('');
const proofTurnstile = ref<{ reset: () => void } | null>(null);
const proofChallenge = ref<{ requestId: string; code: string; expiresIn: number } | null>(null);
const proofUidInvalid = computed(
    () =>
        proofPlatform.value === 'luogu' &&
        proofUid.value.trim() !== '' &&
        !/^\d{1,20}$/.test(proofUid.value.trim())
);

function enterProof(platform: ProofPlatform) {
    proofPlatform.value = platform;
    proofUid.value = '';
    proofChallenge.value = null;
    error.value = '';
}

function leaveProof() {
    proofPlatform.value = null;
    proofChallenge.value = null;
    error.value = '';
}

async function requestProof() {
    if (!proofPlatform.value) return;
    busy.value = true;
    error.value = '';
    try {
        proofChallenge.value = await api<{ requestId: string; code: string; expiresIn: number }>(
            `/api/auth/thirdparty/${proofPlatform.value}/register/request`,
            {
                method: 'POST',
                body: {
                    platformUid: proofUid.value.trim(),
                    redirect: redirect.value,
                    turnstileToken: proofToken.value || undefined
                }
            }
        );
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
        proofTurnstile.value?.reset();
    }
}

async function verifyProof(credential: string) {
    if (!proofPlatform.value || !proofChallenge.value) return;
    busy.value = true;
    error.value = '';
    try {
        await finish(
            await api<AuthResult>(`/api/auth/thirdparty/${proofPlatform.value}/register/verify`, {
                method: 'POST',
                body: { requestId: proofChallenge.value.requestId, credential }
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
.register-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.register-form__submit {
    width: 100%;
}

.register-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.register-alternatives {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
}

.register-alternatives__button {
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
