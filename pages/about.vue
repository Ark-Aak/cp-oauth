<template>
    <div class="about">
        <CpPageHeader
            :kicker="t('common.nav.explore')"
            :title="t('public.about.title')"
            :description="t('public.about.description')"
        >
            <template #actions>
                <el-button type="primary" @click="navigateTo('/developer')">
                    {{ t('public.about.toDeveloper') }}
                </el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet
                :title="t('public.about.platformsTitle')"
                :description="t('public.about.platformsText')"
                flush
            >
                <ul class="cp-rows">
                    <li v-for="platform in PLATFORM_NAMES" :key="platform">
                        <CpPlatformMark :platform="platform" />
                        <span class="cp-rows__main cp-rows__meta">
                            {{
                                PLATFORMS[platform].method === 'proof'
                                    ? t(`public.about.proof.${platform}`)
                                    : t('public.about.providerSignIn')
                            }}
                        </span>
                    </li>
                </ul>
            </CpSheet>

            <CpSheet :title="t('public.about.flowTitle')" :description="t('public.about.flowText')">
                <ol class="about__steps">
                    <li v-for="(step, index) in flowSteps" :key="index" class="about__step">
                        <span class="about__index cp-num" aria-hidden="true">{{ index + 1 }}</span>
                        <p>{{ step }}</p>
                    </li>
                </ol>
            </CpSheet>

            <CpSheet :title="t('public.about.endpointsTitle')" flush>
                <template #actions>
                    <a href="/.well-known/openid-configuration" target="_blank" rel="noopener">
                        {{ t('common.footer.discovery') }}
                    </a>
                </template>
                <CpDataState
                    :pending="pending"
                    :error="error ? describe(error) : null"
                    @retry="refresh"
                >
                    <ul v-if="discovery" class="cp-rows">
                        <li v-for="endpoint in endpoints" :key="endpoint.key">
                            <span class="about__endpoint-label">{{ endpoint.label }}</span>
                            <CpCode class="about__endpoint-value" :value="endpoint.value" />
                        </li>
                    </ul>
                </CpDataState>
            </CpSheet>

            <CpSheet
                :title="t('public.about.scopesTitle')"
                :description="t('public.about.scopesText')"
                flush
            >
                <ul class="cp-rows">
                    <li v-for="scope in scopes" :key="scope">
                        <code class="about__scope cp-mono">{{ scope }}</code>
                        <div class="cp-rows__main">
                            <span class="cp-rows__title">{{ scopeText.title(scope) }}</span>
                            <span class="cp-rows__meta">{{ scopeText.detail(scope) }}</span>
                        </div>
                    </li>
                </ul>
            </CpSheet>
        </div>
    </div>
</template>

<script setup lang="ts">
import { PLATFORMS, PLATFORM_NAMES } from '~/utils/platforms';
import { SCOPES, type ScopeName } from '~/utils/oauth-scopes';

interface DiscoveryDocument {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    revocation_endpoint: string;
}

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const scopeText = useScopeText();

useHead({ title: t('public.about.title') });

const scopes = Object.keys(SCOPES) as ScopeName[];

const {
    data: discovery,
    pending,
    error,
    refresh
} = await useAsyncData('about-discovery', () =>
    api<DiscoveryDocument>('/.well-known/openid-configuration')
);

const endpoints = computed(() =>
    discovery.value
        ? [
              {
                  key: 'issuer',
                  label: t('public.about.endpoints.issuer'),
                  value: discovery.value.issuer
              },
              {
                  key: 'authorize',
                  label: t('public.about.endpoints.authorization'),
                  value: discovery.value.authorization_endpoint
              },
              {
                  key: 'token',
                  label: t('public.about.endpoints.token'),
                  value: discovery.value.token_endpoint
              },
              {
                  key: 'userinfo',
                  label: t('public.about.endpoints.userinfo'),
                  value: discovery.value.userinfo_endpoint
              },
              {
                  key: 'revoke',
                  label: t('public.about.endpoints.revocation'),
                  value: discovery.value.revocation_endpoint
              }
          ]
        : []
);

const flowSteps = computed(() => [
    t('public.about.steps.register'),
    t('public.about.steps.redirect'),
    t('public.about.steps.consent'),
    t('public.about.steps.exchange'),
    t('public.about.steps.userinfo'),
    t('public.about.steps.refresh')
]);
</script>

<style scoped lang="scss">
.about__steps {
    display: flex;
    flex-direction: column;
}

.about__step {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: var(--cp-space-3);
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);
    color: var(--cp-text-2);

    &:first-child {
        padding-top: 0;
    }

    &:last-child {
        padding-bottom: 0;
        border-bottom: 0;
    }
}

.about__index {
    color: var(--cp-text-3);
}

.about__endpoint-label {
    flex: none;
    width: 160px;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

.about__endpoint-value {
    flex: 1;
    min-width: 0;
}

.about__scope {
    flex: none;
    width: 140px;
    font-size: var(--cp-text-sm);
    color: var(--cp-text);
}

@media (max-width: 767px) {
    .about__endpoint-label,
    .about__scope {
        width: 100%;
    }
}
</style>
