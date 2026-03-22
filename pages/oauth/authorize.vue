<template>
    <div class="consent">
        <el-card v-if="clientData" class="consent__card" shadow="never">
            <h1 class="consent__title">{{ $t('oauth.consent.title') }}</h1>
            <p class="consent__app">
                <strong>{{ clientData.client.name }}</strong>
                {{ $t('oauth.consent.wants_access') }}
            </p>

            <div class="consent__scopes">
                <p class="consent__scopes-label">{{ $t('oauth.consent.permissions') }}</p>
                <div v-for="scope in clientData.scopes" :key="scope" class="consent__scope-item">
                    <Shield :size="16" />
                    <span>{{ $t(`oauth.scopes.${scope.replace(':', '_')}`) }}</span>
                </div>
            </div>

            <div class="consent__actions">
                <el-button size="large" @click="handleDecision(false)">
                    {{ $t('oauth.consent.deny') }}
                </el-button>
                <el-button type="primary" size="large" @click="handleDecision(true)">
                    {{ $t('oauth.consent.authorize') }}
                </el-button>
            </div>
        </el-card>
        <el-card v-else-if="loadError" class="consent__card" shadow="never">
            <el-result icon="error" :sub-title="loadError" />
        </el-card>
        <div v-else v-loading="true" class="consent__loading" />
    </div>
</template>

<script setup lang="ts">
import { Shield } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const route = useRoute();
const loadError = ref('');

interface ClientData {
    client: { name: string; clientId: string };
    scopes: string[];
    redirectUri: string;
    state: string | null;
    codeChallenge: string | null;
    codeChallengeMethod: string | null;
}

const clientData = ref<ClientData | null>(null);

try {
    const data = await $fetch<ClientData>('/api/oauth/authorize', {
        params: {
            client_id: route.query.client_id,
            redirect_uri: route.query.redirect_uri,
            response_type: route.query.response_type,
            scope: route.query.scope,
            state: route.query.state,
            code_challenge: route.query.code_challenge,
            code_challenge_method: route.query.code_challenge_method
        }
    });
    clientData.value = data;
} catch (e: unknown) {
    const err = e as { data?: { message?: string } };
    loadError.value = err.data?.message || t('oauth.consent.error');
}

const token = useCookie('auth_token');

async function handleDecision(approved: boolean) {
    if (!clientData.value) return;

    if (!token.value) {
        navigateTo(`/login?redirect=${encodeURIComponent(route.fullPath)}`);
        return;
    }

    try {
        const result = await $fetch<{ redirect: string }>('/api/oauth/authorize', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                client_id: clientData.value.client.clientId,
                redirect_uri: clientData.value.redirectUri,
                scopes: clientData.value.scopes,
                state: clientData.value.state,
                code_challenge: clientData.value.codeChallenge,
                code_challenge_method: clientData.value.codeChallengeMethod,
                approved
            }
        });
        window.location.href = result.redirect;
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('oauth.consent.error'));
    }
}
</script>

<style scoped lang="scss">
.consent {
    width: 100%;
    max-width: 420px;

    &__card {
        border: 1px solid var(--border-color);
    }

    &__loading {
        min-height: 200px;
    }

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
    }

    &__app {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 24px;

        strong {
            color: var(--text-primary);
        }
    }

    &__scopes {
        margin-bottom: 28px;
    }

    &__scopes-label {
        font-size: 13px;
        color: var(--text-secondary);
        font-weight: 500;
        margin-bottom: 10px;
    }

    &__scope-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        font-size: 14px;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-color);

        &:last-child {
            border-bottom: none;
        }
    }

    &__actions {
        display: flex;
        gap: 12px;

        .el-button {
            flex: 1;
        }
    }
}
</style>
