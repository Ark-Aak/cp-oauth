<template>
    <CpAuthScreen
        v-if="failure"
        :title="t('oauth.authorize.errorTitle')"
        :description="failure"
        :icon="CircleAlert"
        tone="danger"
    >
        <p class="cp-help">{{ t('oauth.authorize.errorHint') }}</p>
        <template #footer>
            <NuxtLink to="/">{{ t('common.errorPage.home') }}</NuxtLink>
        </template>
    </CpAuthScreen>

    <CpAuthScreen
        v-else-if="request && me"
        :title="t('oauth.authorize.title', { app: request.client.name })"
        :description="t('oauth.authorize.description')"
    >
        <div class="consent">
            <dl class="consent__facts">
                <CpField :label="t('oauth.authorize.app')">
                    <span class="consent__app">
                        <span class="consent__app-name">{{ request.client.name }}</span>
                        <span class="cp-mono cp-muted" :title="request.client.clientId">{{
                            request.client.clientId
                        }}</span>
                    </span>
                </CpField>
                <CpField :label="t('oauth.authorize.returnsTo')">
                    <span class="consent__target">
                        <span class="consent__host cp-mono">{{ target.host }}</span>
                        <span class="cp-mono cp-muted consent__uri">{{ request.redirectUri }}</span>
                    </span>
                </CpField>
                <CpField :label="t('oauth.authorize.account')">
                    <span class="consent__account">
                        <CpAvatar
                            :src="me.avatarUrl"
                            :name="me.displayName || me.username"
                            :size="24"
                        />
                        <span>{{ me.displayName || me.username }}</span>
                        <span class="cp-mono cp-muted">@{{ me.username }}</span>
                        <button
                            type="button"
                            class="consent__switch"
                            :disabled="busy !== null"
                            @click="switchAccount"
                        >
                            {{ t('oauth.authorize.switch') }}
                        </button>
                    </span>
                </CpField>
            </dl>

            <section class="consent__scopes" :aria-labelledby="scopesId">
                <h2 :id="scopesId" class="consent__heading">
                    {{ t('oauth.authorize.permissions') }}
                </h2>
                <ul>
                    <li v-for="scope in request.scopes" :key="scope">
                        <Check
                            :size="16"
                            :stroke-width="2"
                            class="consent__check"
                            aria-hidden="true"
                        />
                        <div class="consent__scope">
                            <span class="consent__scope-title">{{ scopeText.title(scope) }}</span>
                            <span class="cp-help">{{ scopeText.detail(scope) }}</span>
                        </div>
                        <code class="cp-mono consent__scope-id">{{ scope }}</code>
                    </li>
                </ul>
            </section>

            <p class="cp-help">
                {{
                    request.codeChallenge
                        ? t('oauth.authorize.pkce', {
                              method: request.codeChallengeMethod ?? 'plain'
                          })
                        : t('oauth.authorize.noPkce')
                }}
            </p>

            <CpNote
                v-if="needsVerifiedEmail"
                tone="warning"
                :title="t('oauth.authorize.verifyTitle')"
            >
                {{ t('oauth.authorize.verifyText', { app: request.client.name }) }}
                <template #actions>
                    <el-button size="small" @click="navigateTo('/profile?tab=basic')">{{
                        t('oauth.authorize.verifyAction')
                    }}</el-button>
                </template>
            </CpNote>
            <CpNote v-if="error" tone="danger">{{ error }}</CpNote>

            <div class="consent__decision">
                <el-button
                    :loading="busy === 'deny'"
                    :disabled="!hydrated || busy !== null"
                    @click="decide(false)"
                >
                    {{ t('oauth.authorize.deny') }}
                </el-button>
                <el-button
                    type="primary"
                    :loading="busy === 'approve'"
                    :disabled="!hydrated || busy !== null || needsVerifiedEmail"
                    @click="decide(true)"
                >
                    {{ t('oauth.authorize.approve') }}
                </el-button>
            </div>
            <p class="cp-help consent__fineprint">{{ t('oauth.authorize.revokeHint') }}</p>
        </div>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { Check, CircleAlert } from 'lucide-vue-next';
import type { OAuthAuthorizationResponse } from '~/types/api';

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
const api = useApi();
const route = useRoute();
const { describe, read } = useApiError();
const session = useSession();
const hydrated = useHydrated();
const scopeText = useScopeText();
const scopesId = useId();

useHead({ title: t('oauth.authorize.pageTitle') });

const me = computed(() => session.user.value);

if (!me.value) {
    if (session.unavailable.value) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Authentication is temporarily unavailable'
        });
    }
    await navigateTo(buildLoginPath(route.fullPath), { replace: true });
}

/** Forward the consumer's query verbatim; repeated parameters are rejected by the server. */
function originalQuery(): string {
    const index = route.fullPath.indexOf('?');
    if (index < 0) return '';
    const hash = route.fullPath.indexOf('#', index);
    return route.fullPath.slice(index + 1, hash < 0 ? undefined : hash);
}

const { data: request, error: loadError } = await useAsyncData(
    'oauth-authorize',
    () => api<OAuthAuthorizationResponse>(`/api/oauth/authorize?${originalQuery()}`),
    { immediate: Boolean(me.value) }
);

const failure = computed(() =>
    loadError.value ? describe(loadError.value, 'oauth.authorize.invalid') : ''
);

const target = computed(() => {
    try {
        return new URL(request.value?.redirectUri ?? '');
    } catch {
        return { host: '' };
    }
});

const needsVerifiedEmail = ref(
    Boolean(request.value?.client.requireEmailVerified && me.value && !me.value.emailVerified)
);
const busy = ref<'approve' | 'deny' | null>(null);
const error = ref('');

async function decide(approved: boolean) {
    if (!request.value) return;
    busy.value = approved ? 'approve' : 'deny';
    error.value = '';
    try {
        const { redirect } = await api<{ redirect: string }>('/api/oauth/authorize', {
            method: 'POST',
            body: {
                response_type: 'code',
                client_id: request.value.client.clientId,
                redirect_uri: request.value.redirectUri,
                scopes: request.value.scopes,
                approved,
                state: request.value.state,
                code_challenge: request.value.codeChallenge,
                code_challenge_method: request.value.codeChallengeMethod
            }
        });
        window.location.assign(redirect);
    } catch (cause) {
        const info = read(cause);
        if (info.data.reason === 'email_not_verified') needsVerifiedEmail.value = true;
        else error.value = describe(cause);
        busy.value = null;
    }
}

async function switchAccount() {
    error.value = '';
    try {
        await session.signOut(buildLoginPath(route.fullPath));
    } catch (cause) {
        error.value = describe(cause);
    }
}
</script>

<style scoped lang="scss">
.consent {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-5);
}

.consent__app,
.consent__target {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.consent__app-name {
    font-weight: var(--cp-weight-medium);
}

.consent__host {
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.consent__uri {
    font-size: var(--cp-text-sm);
    overflow-wrap: anywhere;
}

.consent__account {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2);
}

.consent__switch {
    padding: 0;
    font: inherit;
    font-size: var(--cp-text-sm);
    color: var(--cp-accent);
    background: none;
    border: 0;
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }
}

.consent__heading {
    margin-bottom: var(--cp-space-2);
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-xs);
    font-weight: var(--cp-weight-medium);
    letter-spacing: var(--cp-tracking-kicker);
    text-transform: uppercase;
    color: var(--cp-text-3);
}

.consent__scopes ul {
    border-top: 1px solid var(--cp-line);

    > li {
        display: grid;
        grid-template-columns: 16px minmax(0, 1fr) auto;
        gap: var(--cp-space-3);
        align-items: start;
        padding: var(--cp-space-3) 0;
        border-bottom: 1px solid var(--cp-line);
    }
}

.consent__check {
    margin-top: 3px;
    color: var(--cp-success);
}

.consent__scope {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.consent__scope-title {
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.consent__scope-id {
    font-size: var(--cp-text-xs);
    color: var(--cp-text-3);
}

.consent__decision {
    display: flex;
    justify-content: space-between;
    gap: var(--cp-space-3);

    .el-button {
        flex: 1;
        margin-left: 0;
    }
}

.consent__fineprint {
    text-align: center;
}

@media (max-width: 767px) {
    .consent__scopes ul > li {
        grid-template-columns: 16px minmax(0, 1fr);
    }

    .consent__scope-id {
        grid-column: 2;
    }
}
</style>
