<template>
    <CpAuthScreen
        v-if="sent"
        :title="t('auth.forgot.sentTitle')"
        :description="t('auth.forgot.sentText', { email: email.trim() })"
        :icon="MailCheck"
        tone="success"
    >
        <div class="forgot__actions">
            <el-button type="primary" @click="navigateTo(loginLink)">{{
                t('auth.forgot.backToSignIn')
            }}</el-button>
            <el-button @click="sent = false">{{ t('auth.forgot.tryAnother') }}</el-button>
        </div>
    </CpAuthScreen>

    <CpAuthScreen
        v-else
        :title="t('auth.forgot.title')"
        :description="t('auth.forgot.description')"
    >
        <form class="forgot" method="post" novalidate @submit.prevent="submit">
            <AuthField v-slot="{ id }" :label="t('auth.fields.email')">
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
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
            <el-button
                class="forgot__submit"
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="!hydrated || !email.trim()"
            >
                {{ t('auth.forgot.submit') }}
            </el-button>
        </form>
        <template #footer>
            <p>
                {{ t('auth.forgot.remembered') }}
                <NuxtLink :to="loginLink">{{ t('common.actions.signIn') }}</NuxtLink>
            </p>
        </template>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { MailCheck } from 'lucide-vue-next';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe } = useApiError();
const hydrated = useHydrated();

useHead({ title: t('auth.forgot.title') });

const redirect = computed(() =>
    getSafeRedirectTarget(route.query.redirect as string | undefined, '/profile')
);
const loginLink = computed(() =>
    redirect.value === '/profile' ? '/login' : buildLoginPath(redirect.value)
);

const email = ref('');
const busy = ref(false);
const error = ref('');
const sent = ref(false);

async function submit() {
    busy.value = true;
    error.value = '';
    try {
        await api('/api/auth/password/forgot', {
            method: 'POST',
            body: { email: email.value.trim(), redirect: redirect.value }
        });
        sent.value = true;
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.forgot {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.forgot__submit {
    width: 100%;
}

.forgot__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}
</style>
