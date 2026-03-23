<template>
    <div v-loading="pending" class="profile">
        <h1 class="profile__title">{{ $t('profile.title') }}</h1>
        <template v-if="!pending">
            <!-- Avatar preview -->
            <div class="profile__avatar-section">
                <div class="profile__avatar-wrapper">
                    <el-avatar :size="72" :src="form.avatarUrl || undefined">
                        {{ (form.displayName || form.username || '?').charAt(0).toUpperCase() }}
                    </el-avatar>
                </div>
                <div class="profile__avatar-info">
                    <span v-if="form.displayName" class="profile__avatar-name">{{
                        form.displayName
                    }}</span>
                    <span v-if="form.username" class="profile__avatar-username"
                        >@{{ form.username }}</span
                    >
                    <NuxtLink v-if="form.username" :to="`/user/${form.username}`">
                        <el-button text size="small">{{ $t('profile.view_public') }}</el-button>
                    </NuxtLink>
                </div>
            </div>

            <el-form
                ref="formRef"
                :model="form"
                label-position="top"
                class="profile__form"
                @submit.prevent="handleSave"
            >
                <el-form-item :label="$t('profile.avatar_url')">
                    <el-input
                        v-model="form.avatarUrl"
                        type="url"
                        :placeholder="$t('profile.avatar_url_hint')"
                    />
                </el-form-item>
                <el-form-item :label="$t('profile.display_name')">
                    <el-input v-model="form.displayName" />
                </el-form-item>
                <el-form-item :label="$t('profile.username')">
                    <el-input v-model="form.username" :placeholder="$t('profile.username_hint')" />
                </el-form-item>
                <el-form-item :label="$t('profile.email')">
                    <el-input
                        v-model="form.email"
                        type="email"
                        :placeholder="$t('profile.email_hint')"
                    />
                    <div class="profile__email-meta">
                        <el-tag v-if="emailVerified" type="success" size="small">
                            {{ $t('profile.email_verified') }}
                        </el-tag>
                        <el-tag v-else type="warning" size="small">
                            {{ $t('profile.email_unverified') }}
                        </el-tag>
                        <el-button
                            v-if="!emailVerified"
                            text
                            size="small"
                            :loading="sendingVerifyEmail"
                            @click="handleSendVerifyEmail"
                        >
                            {{ $t('profile.send_verify_email') }}
                        </el-button>
                    </div>
                </el-form-item>
                <el-form-item :label="$t('profile.bio')">
                    <el-input v-model="form.bio" type="textarea" :rows="3" />
                </el-form-item>
                <el-form-item>
                    <template #label>
                        {{ $t('profile.homepage') }}
                        <span class="profile__hint">{{ $t('profile.homepage_hint') }}</span>
                    </template>
                    <el-input
                        v-model="form.homepage"
                        type="textarea"
                        :rows="10"
                        class="profile__editor"
                    />
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" native-type="submit" :loading="saving">
                        {{ saving ? $t('profile.saving') : $t('profile.save') }}
                    </el-button>
                </el-form-item>
            </el-form>

            <!-- Linked Accounts section -->
            <el-divider />
            <h2 class="profile__section-title">{{ $t('binding.title') }}</h2>

            <div v-if="bindings.length" class="profile__bindings">
                <div v-for="account in bindings" :key="account.id" class="profile__binding-item">
                    <div class="profile__binding-info">
                        <span class="profile__binding-platform">
                            <AppPlatformIcon :platform="account.platform" />
                            <span>{{ $t(`binding.platforms.${account.platform}`) }}</span>
                        </span>
                        <span class="profile__binding-uid">
                            {{ account.platformUsername || account.platformUid }}
                            <span v-if="account.platformUsername" class="profile__binding-uid-hint">
                                (UID: {{ account.platformUid }})
                            </span>
                            <el-button
                                v-if="canRefresh(account.platform)"
                                text
                                size="small"
                                :loading="refreshingPlatform === account.platform"
                                :title="$t('binding.refresh_username')"
                                @click="handleRefreshUsername(account)"
                            >
                                <RefreshCw :size="13" :stroke-width="1.5" />
                            </el-button>
                        </span>
                    </div>
                    <el-popconfirm
                        :title="$t('binding.unlink_confirm')"
                        @confirm="handleUnlink(account.platform)"
                    >
                        <template #reference>
                            <el-button size="small" type="danger" text>{{
                                $t('binding.unlink')
                            }}</el-button>
                        </template>
                    </el-popconfirm>
                </div>
            </div>
            <p v-else class="profile__no-bindings">{{ $t('binding.no_accounts') }}</p>

            <div class="profile__bind-actions-list">
                <el-button :disabled="luoguLinked" @click="openBindDialog('luogu')">
                    <span class="profile__bind-btn-content">
                        <AppPlatformIcon platform="luogu" />
                        <span
                            >{{ $t('binding.link_account') }} —
                            {{ $t('binding.platforms.luogu') }}</span
                        >
                    </span>
                </el-button>
                <el-button :disabled="atcoderLinked" @click="openBindDialog('atcoder')">
                    <span class="profile__bind-btn-content">
                        <AppPlatformIcon platform="atcoder" />
                        <span
                            >{{ $t('binding.link_account') }} —
                            {{ $t('binding.platforms.atcoder') }}</span
                        >
                    </span>
                </el-button>
                <el-button :disabled="codeforcesLinked" @click="handleBindCodeforcesOAuth">
                    <span class="profile__bind-btn-content">
                        <AppPlatformIcon platform="codeforces" />
                        <span
                            >{{ $t('binding.link_account') }} —
                            {{ $t('binding.platforms.codeforces') }}</span
                        >
                    </span>
                </el-button>
                <el-button :disabled="githubLinked" @click="handleBindGitHubOAuth">
                    <span class="profile__bind-btn-content">
                        <AppPlatformIcon platform="github" />
                        <span
                            >{{ $t('binding.link_account') }} —
                            {{ $t('binding.platforms.github') }}</span
                        >
                    </span>
                </el-button>
                <el-button :disabled="googleLinked" @click="handleBindGoogleOAuth">
                    <span class="profile__bind-btn-content">
                        <AppPlatformIcon platform="google" />
                        <span
                            >{{ $t('binding.link_account') }} —
                            {{ $t('binding.platforms.google') }}</span
                        >
                    </span>
                </el-button>
            </div>

            <div v-if="luoguLinked" class="profile__luogu-login">
                <h3 class="profile__luogu-login-title">{{ $t('binding.luogu_login.title') }}</h3>
                <p class="profile__luogu-login-desc">{{ $t('binding.luogu_login.desc') }}</p>
                <p class="profile__luogu-login-note">
                    {{ $t('binding.luogu_login.new_clipboard_notice') }}
                </p>
                <p class="profile__luogu-login-note">
                    {{ $t('binding.luogu_login.refresh_notice') }}
                </p>

                <div class="profile__luogu-login-controls">
                    <el-select
                        v-model="luoguCredentialDuration"
                        class="profile__luogu-login-select"
                    >
                        <el-option
                            v-for="option in luoguDurationOptions"
                            :key="option"
                            :value="option"
                            :label="$t(`binding.luogu_login.duration.${option}`)"
                        />
                    </el-select>
                    <el-button
                        type="primary"
                        :loading="luoguCredentialLoading"
                        @click="handleCreateLuoguCredential"
                    >
                        {{
                            luoguCredentialLoading
                                ? $t('binding.luogu_login.creating')
                                : $t('binding.luogu_login.create')
                        }}
                    </el-button>
                </div>

                <div
                    v-if="luoguCredentialToken"
                    class="profile__bind-code-value"
                    @click="copyLuoguCredential"
                >
                    <code>{{ luoguCredentialToken }}</code>
                    <el-icon><Copy /></el-icon>
                </div>
                <p v-if="luoguCredentialExpiresAt" class="profile__bind-code-hint">
                    {{
                        $t('binding.luogu_login.expires_at', {
                            time: new Date(luoguCredentialExpiresAt).toLocaleString()
                        })
                    }}
                </p>
            </div>

            <!-- Bind Dialog -->
            <el-dialog
                v-model="bindDialogVisible"
                :title="
                    $t('binding.dialog_title', {
                        platform: $t(`binding.platforms.${bindPlatform}`)
                    })
                "
                width="440px"
                :close-on-click-modal="false"
            >
                <!-- Step 1: Enter UID -->
                <div v-if="bindStep === 1">
                    <p class="profile__bind-desc">
                        {{
                            $t(bindStep1DescKey, {
                                platform: $t(`binding.platforms.${bindPlatform}`)
                            })
                        }}
                    </p>
                    <el-input
                        v-model="bindUid"
                        :placeholder="$t(bindUidPlaceholderKey)"
                        class="profile__bind-input"
                    />
                    <div class="profile__bind-actions">
                        <el-button
                            type="primary"
                            :loading="bindLoading"
                            :disabled="!bindUid.trim()"
                            @click="handleRequestCode"
                        >
                            {{ bindLoading ? $t('binding.getting_code') : $t('binding.get_code') }}
                        </el-button>
                    </div>
                </div>

                <!-- Step 2: Verify -->
                <div v-if="bindStep === 2">
                    <p class="profile__bind-desc">
                        {{
                            $t(bindStep2DescKey, {
                                platform: $t(`binding.platforms.${bindPlatform}`)
                            })
                        }}
                    </p>
                    <p v-if="isAtcoderBinding" class="profile__bind-desc profile__bind-desc--minor">
                        {{ $t('binding.atcoder_settings_guide') }}
                        <a
                            href="https://atcoder.jp/settings"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            https://atcoder.jp/settings
                        </a>
                    </p>
                    <p
                        v-if="isAtcoderBinding && locale === 'zh'"
                        class="profile__bind-desc profile__bind-desc--minor"
                    >
                        {{ $t('binding.atcoder_cn_plugin_hint') }}
                    </p>
                    <div class="profile__bind-code">
                        <label class="profile__bind-code-label">{{
                            $t('binding.code_label')
                        }}</label>
                        <div class="profile__bind-code-value" @click="copyCode">
                            <code>{{ bindCode }}</code>
                            <el-icon><Copy /></el-icon>
                        </div>
                        <p class="profile__bind-code-hint">
                            {{ $t('binding.code_expires', { minutes: 10 }) }}
                        </p>
                    </div>
                    <el-input
                        v-if="!isAtcoderBinding"
                        v-model="bindCredential"
                        :placeholder="$t(bindCredentialPlaceholderKey)"
                        class="profile__bind-input"
                    />
                    <div class="profile__bind-actions">
                        <el-button
                            type="primary"
                            :loading="bindLoading"
                            :disabled="!isAtcoderBinding && !bindCredential.trim()"
                            @click="handleVerify"
                        >
                            {{ bindLoading ? $t('binding.verifying') : $t('binding.verify') }}
                        </el-button>
                    </div>
                </div>
            </el-dialog>

            <!-- Settings section -->
            <el-divider />
            <h2 class="profile__section-title">{{ $t('settings.title') }}</h2>

            <div class="profile__setting-row">
                <label class="profile__setting-label">{{ $t('settings.theme.label') }}</label>
                <el-radio-group v-model="selectedTheme" @change="setTheme">
                    <el-radio-button
                        v-for="opt in themeOptions"
                        :key="opt.value"
                        :value="opt.value"
                    >
                        {{ opt.label }}
                    </el-radio-button>
                </el-radio-group>
            </div>

            <div class="profile__setting-row">
                <label class="profile__setting-label">{{ $t('settings.language.label') }}</label>
                <el-radio-group :model-value="locale" @change="changeLocale">
                    <el-radio-button
                        v-for="loc in localeOptions"
                        :key="loc.code"
                        :value="loc.code"
                        :disabled="loc.disabled"
                    >
                        {{ loc.label }}
                    </el-radio-button>
                </el-radio-group>
            </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Copy, RefreshCw } from 'lucide-vue-next';
import { buildLoginPath } from '~/utils/auth-redirect';
import {
    LUOGU_LOGIN_DURATION_OPTIONS,
    type LuoguLoginDuration
} from '~/utils/luogu-login-credential';
import { isValidUsername, normalizeUsername } from '~/utils/username';

type LocaleCode = 'en' | 'zh' | 'ja';
const localeCodes: LocaleCode[] = ['en', 'zh', 'ja'];

function isLocaleCode(value: string): value is LocaleCode {
    return localeCodes.includes(value as LocaleCode);
}

interface ProfileData {
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    username?: string;
    bio?: string;
    homepage?: string;
    avatarUrl?: string;
    theme?: string;
    locale?: string;
}

const { locale, setLocale, t } = useI18n();
const route = useRoute();

useHead({ title: () => `${t('profile.title')} - CP OAuth` });
const colorMode = useColorMode();
const token = useCookie('auth_token');
const saving = ref(false);
const sendingVerifyEmail = ref(false);

const { data: userData, pending } = await useFetch<ProfileData>('/api/auth/me', {
    headers: { Authorization: `Bearer ${token.value}` },
    onResponseError() {
        navigateTo(buildLoginPath(route.fullPath));
    }
});

const d = userData.value;
const originalUsername = ref(d?.username || '');
const originalEmail = ref(d?.email || '');
const emailVerified = ref(Boolean(d?.emailVerified));
const form = reactive({
    email: d?.email || '',
    displayName: d?.displayName || '',
    username: d?.username || '',
    bio: d?.bio || '',
    homepage: d?.homepage || '',
    avatarUrl: d?.avatarUrl || ''
});
const selectedTheme = ref(d?.theme || 'system');
colorMode.preference = selectedTheme.value;
if (d?.locale && isLocaleCode(d.locale) && d.locale !== locale.value) {
    setLocale(d.locale);
}

async function handleSave() {
    const body: Record<string, string> = {
        displayName: form.displayName,
        bio: form.bio,
        homepage: form.homepage,
        avatarUrl: form.avatarUrl
    };

    const trimmedEmail = form.email.trim().toLowerCase();
    if (trimmedEmail !== originalEmail.value) {
        body.email = trimmedEmail;
    }

    const trimmedUsername = normalizeUsername(form.username);
    if (trimmedUsername !== originalUsername.value) {
        if (!isValidUsername(trimmedUsername)) {
            ElMessage.error(t('profile.username_invalid'));
            return;
        }
        body.username = trimmedUsername;
    }

    saving.value = true;
    try {
        const updated = await $fetch<ProfileData>('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body
        });
        if (body.username) {
            originalUsername.value = body.username;
            form.username = body.username;
        }
        if (body.email && updated.email) {
            originalEmail.value = updated.email;
            form.email = updated.email;
        }
        emailVerified.value = Boolean(updated.emailVerified);
        ElMessage.success(t('profile.updated'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        saving.value = false;
    }
}

async function handleSendVerifyEmail() {
    sendingVerifyEmail.value = true;
    try {
        await $fetch('/api/auth/verify', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('profile.verify_email_sent'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.verify_email_send_error'));
    } finally {
        sendingVerifyEmail.value = false;
    }
}

async function setTheme(value: string | number | boolean | undefined) {
    if (value === undefined) return;
    const v = String(value);
    selectedTheme.value = v;
    colorMode.preference = v;
    try {
        await $fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { theme: v }
        });
    } catch {
        // silent
    }
}

async function changeLocale(code: string | number | boolean | undefined) {
    if (code === undefined) return;
    const c = String(code);
    if (!isLocaleCode(c)) return;
    setLocale(c);
    try {
        await $fetch('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { locale: c }
        });
    } catch {
        // silent
    }
}

const themeOptions = computed(() => [
    { value: 'system', label: t('settings.theme.system') },
    { value: 'light', label: t('settings.theme.light') },
    { value: 'dark', label: t('settings.theme.dark') }
]);

const localeOptions = computed(() => [
    { code: 'en', label: t('settings.language.en'), disabled: false },
    { code: 'zh', label: t('settings.language.zh'), disabled: false },
    { code: 'ja', label: t('settings.language.ja'), disabled: false }
]);

// --- Linked Accounts ---
interface LinkedAccount {
    id: string;
    platform: 'luogu' | 'atcoder' | 'codeforces' | 'github' | 'google';
    platformUid: string;
    platformUsername: string | null;
    verifiedAt: string;
}

const bindings = ref<LinkedAccount[]>([]);
const refreshingPlatform = ref('');
const refreshablePlatforms = new Set(['luogu', 'codeforces']);

function canRefresh(platform: string): boolean {
    return refreshablePlatforms.has(platform);
}

async function handleRefreshUsername(account: LinkedAccount) {
    refreshingPlatform.value = account.platform;
    try {
        const result = await $fetch<{ platformUsername: string }>('/api/account/refresh-username', {
            method: 'POST',
            body: { platform: account.platform, platformUid: account.platformUid }
        });
        const idx = bindings.value.findIndex(b => b.id === account.id);
        if (idx !== -1) {
            bindings.value[idx].platformUsername = result.platformUsername;
        }
        ElMessage.success(t('binding.refresh_success'));
    } catch (e: unknown) {
        const err = e as { statusCode?: number; data?: { message?: string } };
        if (err.statusCode === 429) {
            ElMessage.warning(err.data?.message || t('binding.refresh_cooldown'));
        } else {
            ElMessage.error(err.data?.message || t('binding.refresh_error'));
        }
    } finally {
        refreshingPlatform.value = '';
    }
}

const bindDialogVisible = ref(false);
const bindPlatform = ref('luogu');
const bindStep = ref(1);
const bindUid = ref('');
const bindCode = ref('');
const bindCredential = ref('');
const bindLoading = ref(false);
const luoguCredentialLoading = ref(false);
const luoguCredentialDuration = ref<LuoguLoginDuration>('7day');
const luoguCredentialToken = ref('');
const luoguCredentialExpiresAt = ref<number | null>(null);
const luoguDurationOptions = LUOGU_LOGIN_DURATION_OPTIONS;
const luoguLinked = computed(() => bindings.value.some(account => account.platform === 'luogu'));
const atcoderLinked = computed(() =>
    bindings.value.some(account => account.platform === 'atcoder')
);
const codeforcesLinked = computed(() =>
    bindings.value.some(account => account.platform === 'codeforces')
);
const githubLinked = computed(() => bindings.value.some(account => account.platform === 'github'));
const googleLinked = computed(() => bindings.value.some(account => account.platform === 'google'));
const bindStep2DescKey = computed(() =>
    bindPlatform.value === 'atcoder' ? 'binding.step2_desc_atcoder' : 'binding.step2_desc'
);
const isAtcoderBinding = computed(() => bindPlatform.value === 'atcoder');
const bindStep1DescKey = computed(() =>
    bindPlatform.value === 'atcoder' ? 'binding.step1_desc_atcoder' : 'binding.step1_desc'
);
const bindUidPlaceholderKey = computed(() =>
    bindPlatform.value === 'atcoder' ? 'binding.username_placeholder' : 'binding.uid_placeholder'
);
const bindCredentialPlaceholderKey = computed(() =>
    bindPlatform.value === 'atcoder'
        ? 'binding.affiliation_placeholder'
        : 'binding.paste_id_placeholder'
);

async function fetchBindings() {
    try {
        bindings.value = await $fetch<LinkedAccount[]>('/api/account/bindings', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        // silent
    }
}

fetchBindings();

function openBindDialog(platform: string) {
    bindPlatform.value = platform;
    bindStep.value = 1;
    bindUid.value = '';
    bindCode.value = '';
    bindCredential.value = '';
    bindDialogVisible.value = true;
}

async function handleRequestCode() {
    bindLoading.value = true;
    try {
        const data = await $fetch<{ code: string }>('/api/account/bind/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { platform: bindPlatform.value, platformUid: bindUid.value.trim() }
        });
        bindCode.value = data.code;
        bindStep.value = 2;
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.verify_error'));
    } finally {
        bindLoading.value = false;
    }
}

async function handleVerify() {
    bindLoading.value = true;
    try {
        await $fetch('/api/account/bind/verify', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                platform: bindPlatform.value,
                credential: isAtcoderBinding.value ? '' : bindCredential.value.trim()
            }
        });
        ElMessage.success(t('binding.verify_success'));
        bindDialogVisible.value = false;
        await fetchBindings();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.verify_error'));
    } finally {
        bindLoading.value = false;
    }
}

async function handleBindCodeforcesOAuth() {
    if (codeforcesLinked.value) {
        ElMessage.warning(
            t('binding.already_linked_platform', {
                platform: t('binding.platforms.codeforces')
            })
        );
        return;
    }

    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/codeforces/start',
            {
                headers: { Authorization: `Bearer ${token.value}` },
                query: {
                    mode: 'bind',
                    redirect: '/profile'
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.verify_error'));
    }
}

async function handleBindGitHubOAuth() {
    if (githubLinked.value) {
        ElMessage.warning(
            t('binding.already_linked_platform', {
                platform: t('binding.platforms.github')
            })
        );
        return;
    }

    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/github/start',
            {
                headers: { Authorization: `Bearer ${token.value}` },
                query: {
                    mode: 'bind',
                    redirect: '/profile'
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.verify_error'));
    }
}

async function handleBindGoogleOAuth() {
    if (googleLinked.value) {
        ElMessage.warning(
            t('binding.already_linked_platform', {
                platform: t('binding.platforms.google')
            })
        );
        return;
    }

    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/google/start',
            {
                headers: { Authorization: `Bearer ${token.value}` },
                query: {
                    mode: 'bind',
                    redirect: '/profile'
                }
            }
        );
        await navigateTo(result.authorizationUrl, { external: true });
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.verify_error'));
    }
}

async function handleUnlink(platform: string) {
    try {
        await $fetch(`/api/account/bind/${platform}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('binding.unlink_success'));
        await fetchBindings();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.unlink_error'));
    }
}

function copyCode() {
    navigator.clipboard.writeText(bindCode.value);
    ElMessage.success(t('binding.code_copied'));
}

async function handleCreateLuoguCredential() {
    luoguCredentialLoading.value = true;
    try {
        const result = await $fetch<{ token: string; expiresAt: number }>(
            '/api/account/luogu/login-credential',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token.value}` },
                body: {
                    duration: luoguCredentialDuration.value
                }
            }
        );

        luoguCredentialToken.value = result.token;
        luoguCredentialExpiresAt.value = result.expiresAt;
        navigator.clipboard.writeText(result.token);
        ElMessage.success(t('binding.luogu_login.created_copied'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.luogu_login.create_error'));
    } finally {
        luoguCredentialLoading.value = false;
    }
}

function copyLuoguCredential() {
    if (!luoguCredentialToken.value) return;
    navigator.clipboard.writeText(luoguCredentialToken.value);
    ElMessage.success(t('binding.code_copied'));
}
</script>

<style scoped lang="scss">
.profile {
    max-width: 580px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--text-primary);
    }

    &__avatar-section {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
        padding: 16px;
        background: var(--bg-secondary);
        border-radius: 8px;
        border: 1px solid var(--border-color);
    }

    &__avatar-wrapper {
        flex-shrink: 0;

        :deep(.el-avatar) {
            border: 2px solid var(--border-color);
            font-size: 28px;
        }
    }

    &__avatar-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
    }

    &__avatar-name {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.3;
    }

    &__avatar-username {
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.3;
    }

    &__form {
        max-width: 100%;
    }

    &__hint {
        font-weight: 400;
        color: var(--text-muted);
        font-size: 12px;
        margin-left: 6px;
    }

    &__email-meta {
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    &__editor {
        :deep(.el-textarea__inner) {
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 13px;
            line-height: 1.6;
        }
    }

    &__section-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        margin-bottom: 16px;
    }

    &__setting-row {
        margin-bottom: 18px;
    }

    &__setting-label {
        display: block;
        font-size: 13px;
        color: var(--text-secondary);
        font-weight: 500;
        margin-bottom: 8px;
    }

    &__bindings {
        margin-bottom: 14px;
    }

    &__binding-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        margin-bottom: 6px;
    }

    &__binding-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    &__binding-platform {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__binding-uid {
        font-size: 12px;
        color: var(--text-secondary);
    }

    &__binding-uid-hint {
        font-size: 11px;
        color: var(--text-muted);
    }

    &__no-bindings {
        font-size: 13px;
        color: var(--text-muted);
        margin-bottom: 14px;
    }

    &__bind-desc {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 14px;
        line-height: 1.6;
    }

    &__bind-desc--minor {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: -8px;

        a {
            color: var(--text-secondary);
            text-decoration: underline;
            word-break: break-all;
        }
    }

    &__bind-input {
        margin-bottom: 14px;
    }

    &__bind-actions {
        display: flex;
        justify-content: flex-end;
    }

    &__bind-actions-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;

        .el-button {
            margin-left: 0;
            width: 100%;
            justify-content: center;
        }
    }

    &__bind-btn-content {
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    &__bind-code {
        margin-bottom: 14px;
    }

    &__bind-code-label {
        display: block;
        font-size: 12px;
        color: var(--text-muted);
        margin-bottom: 4px;
    }

    &__bind-code-value {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        cursor: pointer;
        transition: border-color 0.15s;

        &:hover {
            border-color: var(--text-muted);
        }

        code {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            letter-spacing: 0.05em;
        }
    }

    &__bind-code-hint {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 4px;
    }

    &__luogu-login {
        margin-top: 14px;
        padding: 12px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: var(--bg-secondary);
    }

    &__luogu-login-title {
        margin: 0 0 6px;
        font-size: 14px;
        color: var(--text-primary);
    }

    &__luogu-login-desc {
        margin: 0 0 10px;
        font-size: 12px;
        color: var(--text-secondary);
    }

    &__luogu-login-note {
        margin: 0 0 6px;
        font-size: 12px;
        color: var(--text-muted);
        line-height: 1.5;
    }

    &__luogu-login-controls {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
    }

    &__luogu-login-select {
        width: 160px;
    }
}
</style>
