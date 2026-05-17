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
                    <Shield :size="15" :stroke-width="1.5" />
                    <span>{{ $t(`oauth.scopes.${scope.replace(':', '_')}`) }}</span>
                </div>
            </div>

            <div class="consent__actions">
                <el-button @click="handleDecision(false)">
                    {{ $t('oauth.consent.deny') }}
                </el-button>
                <el-button type="primary" @click="handleDecision(true)">
                    {{ $t('oauth.consent.authorize') }}
                </el-button>
            </div>
        </el-card>
        <el-card v-else-if="loadError" class="consent__card" shadow="never">
            <el-result icon="error" :sub-title="loadError" />
        </el-card>
        <div v-else v-loading="true" class="consent__loading" />

        <a
            class="consent__rainyun-float"
            href="https://www.rainyun.com/federico_?s=oauth"
            aria-label="由雨云提供计算服务"
        >
            <img
                class="consent__rainyun-logo"
                src="https://www.rainyun.com/img/logo.d193755d.png"
                alt="Rainyun"
            />
            <span>由雨云提供计算服务</span>
        </a>
    </div>
</template>

<script setup lang="ts">
import { Shield } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();

useHead({ title: () => `${t('oauth.consent.title')} - CP OAuth` });
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
    max-width: 400px;

    &__card {
        border: 1px solid var(--border-color);
    }

    &__loading {
        min-height: 200px;
    }

    &__title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 12px;
        color: var(--text-primary);
    }

    &__app {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 20px;

        strong {
            color: var(--text-primary);
        }
    }

    &__scopes {
        margin-bottom: 24px;
    }

    &__scopes-label {
        font-size: 12px;
        color: var(--text-muted);
        font-weight: 500;
        margin-bottom: 8px;
    }

    &__scope-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 0;
        font-size: 13px;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-color);

        &:last-child {
            border-bottom: none;
        }
    }

    &__actions {
        display: flex;
        gap: 10px;

        .el-button {
            flex: 1;
        }
    }

    &__rainyun-float {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 1000;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: var(--card-radius);
        border: 1px solid rgba(0, 0, 0, 0.12);
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
        text-decoration: none;
        color: #111111;
        font-size: 13px;
        font-weight: 500;
        line-height: 1;
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            background-color 0.2s ease;

        &:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
            background: rgba(255, 255, 255, 0.98);
        }
    }

    &__rainyun-logo {
        width: 56px;
        height: auto;
        border-radius: 4px;
        object-fit: contain;
        object-position: center;
        display: block;
        flex-shrink: 0;
    }
}

@media (max-width: 640px) {
    .consent {
        &__rainyun-float {
            right: 12px;
            bottom: 12px;
            padding: 9px 12px;
            font-size: 12px;
            gap: 8px;
        }

        &__rainyun-logo {
            width: 48px;
            height: auto;
        }
    }
}
</style>
