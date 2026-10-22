<template>
    <CpAuthScreen
        v-if="state === 'done'"
        :title="t('auth.reset.doneTitle')"
        :description="t('auth.reset.doneText')"
        :icon="CircleCheck"
        tone="success"
    >
        <el-button type="primary" @click="navigateTo(loginLink)">{{
            t('common.actions.signIn')
        }}</el-button>
    </CpAuthScreen>

    <CpAuthScreen
        v-else-if="state === 'invalid'"
        :title="t('auth.reset.invalidTitle')"
        :description="t('auth.reset.invalidText')"
        :icon="CircleAlert"
        tone="danger"
    >
        <el-button type="primary" @click="navigateTo(forgotLink)">{{
            t('auth.reset.requestNew')
        }}</el-button>
    </CpAuthScreen>

    <CpAuthScreen v-else :title="t('auth.reset.title')" :description="t('auth.reset.description')">
        <form class="reset" method="post" novalidate @submit.prevent="submit">
            <input type="text" name="username" autocomplete="username" hidden />
            <AuthField
                v-slot="{ id }"
                :label="t('auth.fields.newPassword')"
                :hint="t('auth.passwordRule')"
                :error="password && !passwordValid ? t('auth.passwordRule') : ''"
            >
                <el-input
                    :id="id"
                    v-model="password"
                    name="new-password"
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
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <el-button
                class="reset__submit"
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="!hydrated || !passwordValid || password !== confirm"
            >
                {{ t('auth.reset.submit') }}
            </el-button>
        </form>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { CircleAlert, CircleCheck } from 'lucide-vue-next';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe, read } = useApiError();
const hydrated = useHydrated();

useHead({ title: t('auth.reset.title') });

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const redirect = ref(getSafeRedirectTarget(route.query.redirect as string | undefined, '/profile'));
const loginLink = computed(() =>
    redirect.value === '/profile' ? '/login' : buildLoginPath(redirect.value)
);
const forgotLink = computed(() =>
    redirect.value === '/profile'
        ? '/forgot-password'
        : `/forgot-password?redirect=${encodeURIComponent(redirect.value)}`
);

const state = ref<'form' | 'done' | 'invalid'>(token.value ? 'form' : 'invalid');
const password = ref('');
const confirm = ref('');
const busy = ref(false);
const error = ref('');
const passwordValid = computed(
    () => password.value.length >= 8 && new TextEncoder().encode(password.value).length <= 72
);

async function submit() {
    busy.value = true;
    error.value = '';
    try {
        const result = await api<{ success: true; redirect: string }>('/api/auth/password/reset', {
            method: 'POST',
            body: { token: token.value, newPassword: password.value, redirect: redirect.value }
        });
        redirect.value = getSafeRedirectTarget(result.redirect, '/profile');
        useSession().setUser(null);
        state.value = 'done';
    } catch (cause) {
        if (read(cause).code === 'RESET_TOKEN_INVALID_OR_EXPIRED') state.value = 'invalid';
        else error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.reset {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.reset__submit {
    width: 100%;
}
</style>
