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

            <el-tabs v-model="activeTab" class="profile__tabs">
                <el-tab-pane :label="$t('profile.tabs.basic')" name="basic">
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
                            <el-input
                                v-model="form.username"
                                :placeholder="$t('profile.username_hint')"
                            />
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
                            <el-button type="primary" native-type="submit" :loading="saving">
                                {{ saving ? $t('profile.saving') : $t('profile.save') }}
                            </el-button>
                        </el-form-item>
                    </el-form>
                </el-tab-pane>

                <el-tab-pane :label="$t('profile.tabs.public')" name="public">
                    <el-form
                        ref="publicFormRef"
                        :model="form"
                        label-position="top"
                        class="profile__form"
                        @submit.prevent="handleSave"
                    >
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

                        <div class="profile__section-title">
                            {{ $t('profile.public_accounts') }}
                        </div>
                        <p class="profile__section-desc">
                            {{ $t('profile.public_accounts_hint') }}
                        </p>

                        <div v-if="bindings.length" class="profile__visibility-panel">
                            <el-checkbox-group
                                v-model="visiblePlatforms"
                                class="profile__visibility-group"
                            >
                                <el-checkbox
                                    v-for="account in bindings"
                                    :key="`visibility-${account.id}`"
                                    :label="account.platform"
                                    border
                                    class="profile__visibility-item"
                                >
                                    <span class="profile__visibility-content">
                                        <span class="profile__binding-platform">
                                            <AppPlatformIcon :platform="account.platform" />
                                            <span>{{
                                                $t(`binding.platforms.${account.platform}`)
                                            }}</span>
                                        </span>
                                        <span class="profile__binding-uid">
                                            {{ account.platformUsername || account.platformUid }}
                                        </span>
                                    </span>
                                </el-checkbox>
                            </el-checkbox-group>
                        </div>
                        <p v-else class="profile__no-bindings">
                            {{ $t('profile.no_accounts_to_show') }}
                        </p>

                        <div
                            v-if="clistLinked"
                            class="profile__section-title"
                            style="margin-top: 18px"
                        >
                            {{ $t('profile.public_cp_stats') }}
                        </div>
                        <p v-if="clistLinked" class="profile__section-desc">
                            {{ $t('profile.public_cp_stats_hint') }}
                        </p>
                        <el-checkbox v-if="clistLinked" v-model="publicCpStats" border>
                            {{ $t('profile.public_cp_stats') }}
                        </el-checkbox>
                        <el-checkbox
                            v-if="clistLinked"
                            v-model="publicRatingHistory"
                            border
                            style="margin-top: 8px"
                        >
                            {{ $t('profile.public_rating_history') }}
                        </el-checkbox>
                        <p v-if="clistLinked" class="profile__section-desc" style="margin-top: 8px">
                            {{ $t('profile.public_rating_history_hint') }}
                        </p>

                        <el-form-item style="margin-top: 18px">
                            <el-button type="primary" native-type="submit" :loading="saving">
                                {{ saving ? $t('profile.saving') : $t('profile.save') }}
                            </el-button>
                        </el-form-item>
                    </el-form>
                </el-tab-pane>

                <el-tab-pane :label="$t('profile.tabs.bindings')" name="bindings">
                    <h2 class="profile__section-title">{{ $t('binding.title') }}</h2>

                    <div v-if="bindings.length" class="profile__bindings">
                        <div
                            v-for="account in bindings"
                            :key="account.id"
                            class="profile__binding-item"
                        >
                            <div class="profile__binding-info">
                                <span class="profile__binding-platform">
                                    <AppPlatformIcon :platform="account.platform" />
                                    <span>{{ $t(`binding.platforms.${account.platform}`) }}</span>
                                </span>
                                <span class="profile__binding-uid">
                                    {{ account.platformUsername || account.platformUid }}
                                    <span
                                        v-if="account.platformUsername"
                                        class="profile__binding-uid-hint"
                                    >
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
                                    <el-button size="small" type="danger" text>
                                        {{ $t('binding.unlink') }}
                                    </el-button>
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
                        <el-button :disabled="clistLinked" @click="handleBindClistOAuth">
                            <span class="profile__bind-btn-content">
                                <AppPlatformIcon platform="clist" />
                                <span
                                    >{{ $t('binding.link_account') }} —
                                    {{ $t('binding.platforms.clist') }}</span
                                >
                            </span>
                        </el-button>
                    </div>

                    <div v-if="luoguLinked" class="profile__luogu-login">
                        <h3 class="profile__luogu-login-title">
                            {{ $t('binding.luogu_login.title') }}
                        </h3>
                        <p class="profile__luogu-login-desc">
                            {{ $t('binding.luogu_login.desc') }}
                        </p>
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
                                    time: formatCSTTime(luoguCredentialExpiresAt, {
                                        withSeconds: true,
                                        withTimezone: true
                                    })
                                })
                            }}
                        </p>
                    </div>
                </el-tab-pane>

                <el-tab-pane :label="$t('profile.tabs.authorized_apps')" name="authorized_apps">
                    <h2 class="profile__section-title">
                        {{ $t('oauth.authorized_apps.title') }}
                    </h2>
                    <p class="profile__section-desc">
                        {{ $t('oauth.authorized_apps.description') }}
                    </p>

                    <div
                        v-if="authorizedApps.length"
                        class="profile__bindings profile__authorized-apps"
                    >
                        <div
                            v-for="app in authorizedApps"
                            :key="app.clientId"
                            class="profile__binding-item profile__authorized-app-item"
                        >
                            <div class="profile__binding-info">
                                <span class="profile__binding-platform">{{ app.name }}</span>
                                <span class="profile__binding-uid">
                                    {{
                                        app.scopes
                                            .map(s => $t(`oauth.scopes.${s.replace(':', '_')}`, s))
                                            .join(', ')
                                    }}
                                </span>
                                <span class="profile__binding-uid profile__binding-uid-hint">
                                    {{ $t('oauth.authorized_apps.authorized_at') }}:
                                    {{
                                        formatCSTTime(app.latestAuthorizedAt, {
                                            withTimezone: true
                                        })
                                    }}
                                </span>
                                <span class="profile__binding-uid profile__binding-uid-hint">
                                    {{
                                        $t('oauth.authorized_apps.access_tokens', {
                                            count: app.accessTokenCount
                                        })
                                    }}
                                    &middot;
                                    {{
                                        $t('oauth.authorized_apps.refresh_tokens', {
                                            count: app.refreshTokenCount
                                        })
                                    }}
                                </span>
                            </div>
                            <el-popconfirm
                                :title="$t('oauth.authorized_apps.revoke_confirm')"
                                @confirm="handleRevokeApp(app.clientId)"
                            >
                                <template #reference>
                                    <el-button
                                        size="small"
                                        type="danger"
                                        text
                                        :loading="revokingClientId === app.clientId"
                                    >
                                        {{ $t('oauth.authorized_apps.revoke') }}
                                    </el-button>
                                </template>
                            </el-popconfirm>
                        </div>
                    </div>
                    <p v-else class="profile__no-bindings">
                        {{ $t('oauth.authorized_apps.no_apps') }}
                    </p>
                </el-tab-pane>

                <el-tab-pane :label="$t('profile.tabs.preferences')" name="preferences">
                    <h2 class="profile__section-title">{{ $t('settings.title') }}</h2>

                    <div class="profile__setting-row">
                        <label class="profile__setting-label">{{
                            $t('settings.theme.label')
                        }}</label>
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
                        <label class="profile__setting-label">{{
                            $t('settings.language.label')
                        }}</label>
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
                </el-tab-pane>

                <el-tab-pane :label="$t('profile.tabs.security')" name="security">
                    <h2 class="profile__section-title">{{ $t('profile.security.title') }}</h2>

                    <div class="profile__security-block">
                        <h3 class="profile__security-subtitle">
                            {{ $t('profile.security.change_password') }}
                        </h3>
                        <el-form class="profile__form" @submit.prevent="handleChangePassword">
                            <el-form-item :label="$t('profile.security.current_password')">
                                <el-input
                                    v-model="passwordForm.currentPassword"
                                    type="password"
                                    show-password
                                />
                            </el-form-item>
                            <el-form-item :label="$t('profile.security.new_password')">
                                <el-input
                                    v-model="passwordForm.newPassword"
                                    type="password"
                                    show-password
                                />
                            </el-form-item>
                            <el-form-item>
                                <el-button
                                    type="primary"
                                    native-type="submit"
                                    :loading="changingPassword"
                                >
                                    {{ $t('profile.security.update_password') }}
                                </el-button>
                            </el-form-item>
                        </el-form>
                    </div>

                    <div class="profile__security-block">
                        <h3 class="profile__security-subtitle">
                            {{ $t('profile.security.twofactor') }}
                        </h3>
                        <p class="profile__section-desc">
                            {{
                                twoFactorEnabled
                                    ? $t('profile.security.enabled_with', {
                                          method: twoFactorMethodLabel
                                      })
                                    : $t('profile.security.not_enabled')
                            }}
                        </p>

                        <div v-if="!twoFactorEnabled" class="profile__security-actions">
                            <el-button
                                :loading="requestingEmailOtp"
                                @click="handleRequestEmailOtpEnable"
                            >
                                {{ $t('profile.security.enable_email_otp') }}
                            </el-button>
                            <el-button :loading="requestingTotp" @click="handleRequestTotpSetup">
                                {{ $t('profile.security.enable_totp') }}
                            </el-button>
                        </div>

                        <div v-if="emailOtpPending" class="profile__security-inline-form">
                            <el-input
                                v-model="emailOtpCode"
                                :placeholder="$t('profile.security.otp_code_placeholder')"
                            />
                            <el-button
                                type="primary"
                                :loading="confirmingEmailOtp"
                                @click="handleConfirmEmailOtpEnable"
                            >
                                {{ $t('profile.security.confirm_enable') }}
                            </el-button>
                        </div>

                        <div v-if="totpQrCode" class="profile__totp-setup">
                            <img
                                :src="totpQrCode"
                                :alt="$t('profile.security.totp_qr_alt')"
                                class="profile__totp-qr"
                            />
                            <p class="profile__bind-code-hint">
                                {{ $t('profile.security.totp_scan_hint') }}
                            </p>
                            <div class="profile__security-inline-form">
                                <el-input
                                    v-model="totpCode"
                                    :placeholder="$t('profile.security.otp_code_placeholder')"
                                />
                                <el-button
                                    type="primary"
                                    :loading="confirmingTotp"
                                    @click="handleConfirmTotpEnable"
                                >
                                    {{ $t('profile.security.confirm_enable') }}
                                </el-button>
                            </div>
                        </div>

                        <div v-if="twoFactorEnabled" class="profile__security-inline-form">
                            <el-input
                                v-model="disable2faPassword"
                                type="password"
                                show-password
                                :placeholder="$t('profile.security.password_for_disable')"
                            />
                            <el-button
                                type="danger"
                                :loading="disabling2fa"
                                @click="handleDisable2fa"
                            >
                                {{ $t('profile.security.disable_2fa') }}
                            </el-button>
                        </div>
                    </div>

                    <div class="profile__security-block">
                        <h3 class="profile__security-subtitle">
                            {{ $t('profile.security.passkeys') }}
                        </h3>
                        <div class="profile__security-inline-form">
                            <el-input
                                v-model="newPasskeyName"
                                :placeholder="$t('profile.security.passkey_name_placeholder')"
                            />
                            <el-button
                                type="primary"
                                :loading="registeringPasskey"
                                @click="handleRegisterPasskey"
                            >
                                {{ $t('profile.security.add_passkey') }}
                            </el-button>
                        </div>
                        <div v-if="passkeys.length" class="profile__bindings profile__passkey-list">
                            <div
                                v-for="item in passkeys"
                                :key="item.id"
                                class="profile__binding-item"
                            >
                                <div class="profile__binding-info">
                                    <span class="profile__binding-platform">{{ item.name }}</span>
                                    <span class="profile__binding-uid">{{
                                        formatCSTTime(item.createdAt, {
                                            withSeconds: true,
                                            withTimezone: true
                                        })
                                    }}</span>
                                </div>
                                <el-button
                                    text
                                    type="danger"
                                    :loading="removingPasskeyId === item.id"
                                    @click="handleDeletePasskey(item.id)"
                                >
                                    {{ $t('binding.unlink') }}
                                </el-button>
                            </div>
                        </div>
                        <p v-else class="profile__no-bindings">
                            {{ $t('profile.security.no_passkeys') }}
                        </p>
                    </div>

                    <div class="profile__security-block">
                        <h3 class="profile__security-subtitle">
                            {{ t('profile.security.luoguapi') }}
                        </h3>

                        <div v-if="luoguApiKeys" class="profile__bindings">
                            <p class="profile__section-desc profile__section-desc--normal">
                                {{
                                    t('profile.security.luoguapi_uid', {
                                        uid: luoguApiKeys.luoguUid
                                    })
                                }}
                            </p>
                            <div class="profile__luogu-api-actions">
                                <el-button type="primary" @click="openLuoguApiCreateKeyDialog">
                                    {{ t('profile.security.luoguapi_create_key') }}
                                </el-button>
                            </div>

                            <p v-if="!luoguApiKeys.decryptReady" class="profile__bind-code-hint">
                                {{ t('profile.security.luoguapi_unlock_required') }}
                            </p>

                            <div v-if="luoguApiKeys.apiTokens.length" class="profile__bindings">
                                <div
                                    v-for="item in luoguApiKeys.apiTokens"
                                    :key="item.keyId"
                                    class="profile__binding-item"
                                >
                                    <div class="profile__binding-info">
                                        <span class="profile__binding-platform">
                                            {{
                                                item.note ||
                                                t('profile.security.luoguapi_default_note')
                                            }}
                                        </span>
                                        <span
                                            class="profile__binding-uid profile__binding-uid-hint"
                                        >
                                            {{ t('profile.security.luoguapi_key_base32') }}:
                                            {{ item.keyId }}
                                        </span>
                                        <span
                                            class="profile__binding-uid profile__binding-uid-hint"
                                        >
                                            {{
                                                formatCSTTime(item.createdAt, {
                                                    withSeconds: true,
                                                    withTimezone: true
                                                })
                                            }}
                                        </span>
                                    </div>
                                    <el-popconfirm
                                        :title="t('profile.security.luoguapi_delete_confirm')"
                                        @confirm="handleDeleteLuoguApiKey(item.keyId)"
                                    >
                                        <template #reference>
                                            <el-button
                                                text
                                                type="danger"
                                                :loading="luoguApiDeletingKeyId === item.keyId"
                                            >
                                                {{ t('binding.unlink') }}
                                            </el-button>
                                        </template>
                                    </el-popconfirm>
                                </div>
                            </div>
                            <p v-else class="profile__no-bindings">
                                {{ t('profile.security.luoguapi_no_keys') }}
                            </p>
                        </div>
                        <template v-else>
                            <p class="profile__no-bindings">
                                {{ t('profile.security.not_setup_luoguapi') }}
                            </p>
                            <el-button type="primary" @click="luoguApiDialogVisible = true">
                                {{ t('profile.security.setup_luoguapi') }}
                            </el-button>
                        </template>
                    </div>
                </el-tab-pane>
            </el-tabs>

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

            <luogu-api-setup-dialog
                v-model="luoguApiDialogVisible"
                @success="handleLuoguApiSetupSuccess"
            />
            <luogu-api-key-dialog
                v-model="luoguApiKeyDialogVisible"
                :decrypt-ready="Boolean(luoguApiKeys?.decryptReady)"
                @success="handleLuoguApiKeyDialogSuccess"
            />
        </template>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { Copy, RefreshCw } from 'lucide-vue-next';
import { buildLoginPath } from '~/utils/auth-redirect';
import { formatCSTTime } from '~/utils/time';
import {
    LUOGU_LOGIN_DURATION_OPTIONS,
    type LuoguLoginDuration
} from '~/utils/luogu-login-credential';
import { isValidUsername, normalizeUsername } from '~/utils/username';
import LuoguApiSetupDialog from '~/components/LuoguApiSetupDialog.vue';
import LuoguApiKeyDialog from '~/components/LuoguApiKeyDialog.vue';

type LocaleCode = 'en' | 'zh' | 'ja';
const localeCodes: LocaleCode[] = ['en', 'zh', 'ja'];

function isLocaleCode(value: string): value is LocaleCode {
    return localeCodes.includes(value as LocaleCode);
}

type LinkedPlatform = 'luogu' | 'atcoder' | 'codeforces' | 'github' | 'google' | 'clist';

interface ProfileData {
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    username?: string;
    bio?: string;
    homepage?: string;
    avatarUrl?: string;
    publicLinkedPlatforms?: LinkedPlatform[];
    publicLinkedPlatformsConfigured?: boolean;
    publicCpStats?: boolean;
    publicRatingHistory?: boolean;
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
const activeTab = ref('basic');

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
const visiblePlatforms = ref<LinkedPlatform[]>([]);
const originalVisiblePlatforms = ref<LinkedPlatform[]>([]);
const publicLinkedPlatformsFromServer = ref<LinkedPlatform[]>(
    Array.isArray(d?.publicLinkedPlatforms) ? d.publicLinkedPlatforms : []
);
const publicLinkedPlatformsConfigured = ref(Boolean(d?.publicLinkedPlatformsConfigured));
const publicCpStats = ref(Boolean(d?.publicCpStats));
const publicRatingHistory = ref(Boolean(d?.publicRatingHistory));
colorMode.preference = selectedTheme.value;
if (d?.locale && isLocaleCode(d.locale) && d.locale !== locale.value) {
    setLocale(d.locale);
}

async function handleSave() {
    const body: Record<string, unknown> = {
        displayName: form.displayName,
        bio: form.bio,
        homepage: form.homepage,
        avatarUrl: form.avatarUrl
    };
    let changedUsername: string | null = null;
    let changedEmail: string | null = null;

    const trimmedEmail = form.email.trim().toLowerCase();
    if (trimmedEmail !== originalEmail.value) {
        body.email = trimmedEmail;
        changedEmail = trimmedEmail;
    }

    const trimmedUsername = normalizeUsername(form.username);
    if (trimmedUsername !== originalUsername.value) {
        if (!isValidUsername(trimmedUsername)) {
            ElMessage.error(t('profile.username_invalid'));
            return;
        }
        body.username = trimmedUsername;
        changedUsername = trimmedUsername;
    }

    const availablePlatforms = new Set(bindings.value.map(account => account.platform));
    const normalizedVisiblePlatforms = Array.from(
        new Set(visiblePlatforms.value.filter(platform => availablePlatforms.has(platform)))
    ).sort();
    const normalizedOriginalVisiblePlatforms = [...originalVisiblePlatforms.value].sort();
    if (
        normalizedVisiblePlatforms.length !== normalizedOriginalVisiblePlatforms.length ||
        normalizedVisiblePlatforms.some((platform, index) => {
            return normalizedOriginalVisiblePlatforms[index] !== platform;
        })
    ) {
        body.publicLinkedPlatforms = normalizedVisiblePlatforms;
    }

    body.publicCpStats = publicCpStats.value;
    body.publicRatingHistory = publicRatingHistory.value;

    saving.value = true;
    try {
        const updated = await $fetch<ProfileData>('/api/auth/me', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body
        });
        if (changedUsername) {
            originalUsername.value = changedUsername;
            form.username = changedUsername;
        }
        if (changedEmail && updated.email) {
            originalEmail.value = updated.email;
            form.email = updated.email;
        }
        emailVerified.value = Boolean(updated.emailVerified);
        if (Array.isArray(body.publicLinkedPlatforms)) {
            const savedPlatforms = body.publicLinkedPlatforms as LinkedPlatform[];
            originalVisiblePlatforms.value = [...savedPlatforms];
            publicLinkedPlatformsFromServer.value = [...savedPlatforms];
            visiblePlatforms.value = [...savedPlatforms];
            publicLinkedPlatformsConfigured.value = true;
        }
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

const passwordForm = reactive({
    currentPassword: '',
    newPassword: ''
});
const changingPassword = ref(false);

const twoFactorEnabled = ref(false);
const twoFactorMethod = ref('');
const emailOtpPending = ref(false);
const emailOtpCode = ref('');
const requestingEmailOtp = ref(false);
const confirmingEmailOtp = ref(false);
const requestingTotp = ref(false);
const confirmingTotp = ref(false);
const disabling2fa = ref(false);
const disable2faPassword = ref('');
const totpQrCode = ref('');
const totpCode = ref('');

interface PasskeyItem {
    id: string;
    name: string;
    createdAt: string;
}

type LuoguApiKeyData = {
    luoguUid: number;
    decryptReady: boolean;
    apiTokens: {
        createdAt: string;
        keyId: string;
        note: string;
    }[];
} | null;

const passkeys = ref<PasskeyItem[]>([]);
const newPasskeyName = ref('My Passkey');
const registeringPasskey = ref(false);
const removingPasskeyId = ref('');
const luoguApiKeys = ref<LuoguApiKeyData>(null);
const luoguApiDialogVisible = ref(false);
const luoguApiDeletingKeyId = ref('');
const luoguApiKeyDialogVisible = ref(false);

const twoFactorMethodLabel = computed(() => {
    if (twoFactorMethod.value === 'email_otp') return t('profile.security.method_email_otp');
    if (twoFactorMethod.value === 'totp') return t('profile.security.method_totp');
    return '-';
});

function toBase64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    const binary = atob(normalized + padding);
    return Uint8Array.from(binary, ch => ch.charCodeAt(0));
}

function toArrayBuffer(value: string): ArrayBuffer {
    const bytes = fromBase64Url(value);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function fetchSecurityStatus() {
    try {
        const data = await $fetch<{ twoFactorEnabled: boolean; twoFactorMethod: string | null }>(
            '/api/auth/2fa/status',
            { headers: { Authorization: `Bearer ${token.value}` } }
        );
        twoFactorEnabled.value = data.twoFactorEnabled;
        twoFactorMethod.value = data.twoFactorMethod || '';
    } catch {
        // silent
    }
}

async function fetchPasskeys() {
    try {
        passkeys.value = await $fetch<PasskeyItem[]>('/api/auth/passkey/credentials', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        // silent
    }
}

async function fetchLuoguApiKeys() {
    try {
        luoguApiKeys.value = await $fetch<LuoguApiKeyData>('/api/luoguOpenApi/keys', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        // silent
    }
}

async function handleLuoguApiSetupSuccess() {
    await fetchLuoguApiKeys();
}

function openLuoguApiCreateKeyDialog() {
    luoguApiKeyDialogVisible.value = true;
}

async function handleLuoguApiKeyDialogSuccess() {
    await fetchLuoguApiKeys();
}

async function handleDeleteLuoguApiKey(keyId: string) {
    luoguApiDeletingKeyId.value = keyId;
    try {
        await $fetch(`/api/luoguOpenApi/keys/${encodeURIComponent(keyId)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('binding.unlink_success'));
        await fetchLuoguApiKeys();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.unlink_error'));
    } finally {
        luoguApiDeletingKeyId.value = '';
    }
}

await Promise.all([fetchSecurityStatus(), fetchPasskeys(), fetchLuoguApiKeys()]);

async function handleChangePassword() {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) return;
    changingPassword.value = true;
    try {
        await $fetch('/api/auth/password/change', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
            }
        });
        passwordForm.currentPassword = '';
        passwordForm.newPassword = '';
        ElMessage.success(t('profile.security.password_updated'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        changingPassword.value = false;
    }
}

async function handleRequestEmailOtpEnable() {
    requestingEmailOtp.value = true;
    try {
        await $fetch('/api/auth/2fa/setup/email/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        emailOtpPending.value = true;
        ElMessage.success(t('profile.security.otp_sent'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        requestingEmailOtp.value = false;
    }
}

async function handleConfirmEmailOtpEnable() {
    if (!emailOtpCode.value) return;
    confirmingEmailOtp.value = true;
    try {
        await $fetch('/api/auth/2fa/setup/email/confirm', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { code: emailOtpCode.value }
        });
        emailOtpPending.value = false;
        emailOtpCode.value = '';
        await fetchSecurityStatus();
        ElMessage.success(t('profile.security.2fa_enabled'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        confirmingEmailOtp.value = false;
    }
}

async function handleRequestTotpSetup() {
    requestingTotp.value = true;
    try {
        const data = await $fetch<{ qrCodeDataUrl: string }>('/api/auth/2fa/setup/totp/request', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        totpQrCode.value = data.qrCodeDataUrl;
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        requestingTotp.value = false;
    }
}

async function handleConfirmTotpEnable() {
    if (!totpCode.value) return;
    confirmingTotp.value = true;
    try {
        await $fetch('/api/auth/2fa/setup/totp/confirm', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { code: totpCode.value }
        });
        totpCode.value = '';
        totpQrCode.value = '';
        await fetchSecurityStatus();
        ElMessage.success(t('profile.security.2fa_enabled'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        confirmingTotp.value = false;
    }
}

async function handleDisable2fa() {
    if (!disable2faPassword.value) return;
    disabling2fa.value = true;
    try {
        await $fetch('/api/auth/2fa/disable', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { password: disable2faPassword.value }
        });
        disable2faPassword.value = '';
        await fetchSecurityStatus();
        ElMessage.success(t('profile.security.2fa_disabled'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('profile.update_error'));
    } finally {
        disabling2fa.value = false;
    }
}

async function handleRegisterPasskey() {
    if (!window.PublicKeyCredential) {
        ElMessage.error(t('auth.login.passkey_not_supported'));
        return;
    }
    registeringPasskey.value = true;
    try {
        const options = await $fetch<{
            challenge: string;
            rp: { name: string; id?: string };
            user: { id: string; name: string; displayName: string };
            pubKeyCredParams: PublicKeyCredentialParameters[];
            timeout?: number;
            attestation?: AttestationConveyancePreference;
            authenticatorSelection?: AuthenticatorSelectionCriteria;
            excludeCredentials?: Array<{
                id: string;
                type: PublicKeyCredentialType;
                transports?: AuthenticatorTransport[];
            }>;
        }>('/api/auth/passkey/register/options', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` }
        });

        const publicKey: PublicKeyCredentialCreationOptions = {
            ...options,
            challenge: toArrayBuffer(options.challenge),
            user: {
                ...options.user,
                id: toArrayBuffer(options.user.id)
            },
            excludeCredentials: options.excludeCredentials?.map(item => ({
                ...item,
                id: toArrayBuffer(item.id)
            }))
        };

        const credential = (await navigator.credentials.create({
            publicKey
        })) as PublicKeyCredential | null;

        if (!credential) throw new Error('No credential returned');

        const attestation = credential.response as AuthenticatorAttestationResponse;
        const response = {
            id: credential.id,
            rawId: toBase64Url(new Uint8Array(credential.rawId)),
            type: credential.type,
            response: {
                clientDataJSON: toBase64Url(new Uint8Array(attestation.clientDataJSON)),
                attestationObject: toBase64Url(new Uint8Array(attestation.attestationObject)),
                transports: attestation.getTransports ? attestation.getTransports() : []
            },
            clientExtensionResults: credential.getClientExtensionResults()
        };

        await $fetch('/api/auth/passkey/register/verify', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token.value}` },
            body: {
                name: newPasskeyName.value || 'My Passkey',
                response
            }
        });

        await fetchPasskeys();
        ElMessage.success(t('profile.security.passkey_added'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string }; message?: string };
        ElMessage.error(err.data?.message || err.message || t('profile.update_error'));
    } finally {
        registeringPasskey.value = false;
    }
}

async function handleDeletePasskey(id: string) {
    removingPasskeyId.value = id;
    try {
        await $fetch(`/api/auth/passkey/credentials/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        await fetchPasskeys();
        ElMessage.success(t('binding.unlink_success'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('binding.unlink_error'));
    } finally {
        removingPasskeyId.value = '';
    }
}

// --- Linked Accounts ---
interface LinkedAccount {
    id: string;
    platform: LinkedPlatform;
    platformUid: string;
    platformUsername: string | null;
    verifiedAt: string;
}

const bindings = ref<LinkedAccount[]>([]);
const refreshingPlatform = ref('');
const refreshablePlatforms = new Set(['luogu', 'codeforces', 'github', 'clist']);

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
            const target = bindings.value[idx];
            if (target) {
                target.platformUsername = result.platformUsername;
            }
        }
        ElMessage.success(t('binding.refresh_success'));
    } catch (e: unknown) {
        const err = e as { statusCode?: number; data?: { message?: string } };
        if (err.statusCode === 429) {
            ElMessage.warning(err.data?.message || t('binding.refresh_cooldown'));
        } else if (err.statusCode === 409) {
            if (account.platform === 'github') {
                ElMessage.warning(err.data?.message || t('binding.refresh_token_missing'));
            } else {
                ElMessage.warning(err.data?.message || t('binding.refresh_rebind_required'));
            }
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
const clistLinked = computed(() => bindings.value.some(account => account.platform === 'clist'));
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

        const currentPlatforms = bindings.value.map(account => account.platform);
        if (!publicLinkedPlatformsConfigured.value) {
            visiblePlatforms.value = [...currentPlatforms];
            originalVisiblePlatforms.value = [...currentPlatforms];
            return;
        }

        const currentSet = new Set(currentPlatforms);
        const sanitized = publicLinkedPlatformsFromServer.value.filter(platform => {
            return currentSet.has(platform);
        });
        visiblePlatforms.value = [...sanitized];
        originalVisiblePlatforms.value = [...sanitized];
    } catch {
        // silent
    }
}

fetchBindings();

// --- Authorized Apps ---
interface AuthorizedApp {
    clientId: string;
    name: string;
    scopes: string[];
    latestAuthorizedAt: string;
    accessTokenCount: number;
    refreshTokenCount: number;
}

const authorizedApps = ref<AuthorizedApp[]>([]);
const revokingClientId = ref('');

async function fetchAuthorizedApps() {
    try {
        authorizedApps.value = await $fetch<AuthorizedApp[]>('/api/oauth/authorized-apps', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
    } catch {
        // silent
    }
}

fetchAuthorizedApps();

async function handleRevokeApp(clientId: string) {
    revokingClientId.value = clientId;
    try {
        await $fetch(`/api/oauth/authorized-apps/${clientId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token.value}` }
        });
        ElMessage.success(t('oauth.authorized_apps.revoke_success'));
        await fetchAuthorizedApps();
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('oauth.authorized_apps.revoke_error'));
    } finally {
        revokingClientId.value = '';
    }
}

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

async function handleBindClistOAuth() {
    if (clistLinked.value) {
        ElMessage.warning(
            t('binding.already_linked_platform', {
                platform: t('binding.platforms.clist')
            })
        );
        return;
    }

    try {
        const result = await $fetch<{ authorizationUrl: string }>(
            '/api/auth/thirdparty/clist/start',
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
        visiblePlatforms.value = visiblePlatforms.value.filter(item => item !== platform);
        originalVisiblePlatforms.value = originalVisiblePlatforms.value.filter(
            item => item !== platform
        );
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
    max-width: 760px;

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

    &__tabs {
        margin-top: 8px;
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

    &__section-desc {
        font-size: 12px;
        color: var(--text-muted);
        margin: -8px 0 14px;
    }

    &__section-desc--normal {
        margin: 0 0 10px;
    }

    &__setting-row {
        margin-bottom: 18px;
    }

    &__security-block {
        margin-bottom: 18px;
        padding: 14px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-secondary);
    }

    &__security-subtitle {
        margin: 0 0 10px;
        font-size: 14px;
        color: var(--text-primary);
        font-weight: 600;
    }

    &__security-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    &__security-inline-form {
        margin-top: 10px;
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
    }

    &__totp-setup {
        margin-top: 10px;
    }

    &__totp-qr {
        width: 172px;
        height: 172px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
        background: #fff;
        padding: 6px;
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

    &__passkey-list {
        margin-top: 12px;
    }

    &__authorized-apps {
        margin-bottom: 14px;
    }

    &__authorized-app-item {
        .profile__binding-info {
            gap: 3px;
        }
    }

    &__visibility-panel {
        margin-bottom: 16px;
    }

    &__visibility-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    &__visibility-item {
        width: 100%;
        margin: 0;
        height: auto;
        padding: 10px 12px;

        :deep(.el-checkbox__label) {
            width: 100%;
            padding-left: 8px;
        }
    }

    &__visibility-content {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        gap: 10px;
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
            line-break: anywhere;
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

    &__luogu-api-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
        flex-wrap: wrap;
    }
}
</style>
