<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.account')"
            :title="t('common.nav.profile')"
            :description="t('account.basic.description')"
        >
            <template #actions>
                <el-button @click="navigateTo(`/user/${me.username}`)">
                    {{ t('common.nav.publicProfile') }}
                </el-button>
            </template>
        </CpPageHeader>

        <div class="cp-stack">
            <CpSheet
                :title="t('account.basic.identityTitle')"
                :description="t('account.basic.identityText')"
            >
                <form class="account-form" method="post" novalidate @submit.prevent="saveIdentity">
                    <div class="account-form__avatar">
                        <CpAvatar
                            :src="previewAvatar"
                            :name="identity.displayName || identity.username"
                            :size="56"
                        />
                        <p class="cp-help">{{ t('account.basic.avatarHint') }}</p>
                    </div>
                    <div class="account-form__grid">
                        <div class="account-form__field">
                            <label :for="ids.username">{{ t('account.fields.username') }}</label>
                            <el-input
                                :id="ids.username"
                                v-model="identity.username"
                                name="username"
                                autocomplete="username"
                                spellcheck="false"
                                :maxlength="USERNAME_MAX_LENGTH"
                                :disabled="!hydrated || savingIdentity"
                            >
                                <template #prefix>@</template>
                            </el-input>
                            <p v-if="identityErrors.username" class="account-form__error">
                                {{ identityErrors.username }}
                            </p>
                            <p v-else class="cp-help">{{ t('account.basic.usernameRule') }}</p>
                        </div>
                        <div class="account-form__field">
                            <label :for="ids.displayName">{{
                                t('account.fields.displayName')
                            }}</label>
                            <el-input
                                :id="ids.displayName"
                                v-model="identity.displayName"
                                name="displayName"
                                autocomplete="nickname"
                                maxlength="80"
                                :disabled="!hydrated || savingIdentity"
                            />
                            <p v-if="identityErrors.displayName" class="account-form__error">
                                {{ identityErrors.displayName }}
                            </p>
                        </div>
                        <div class="account-form__field account-form__field--wide">
                            <label :for="ids.avatarUrl">{{ t('account.fields.avatarUrl') }}</label>
                            <el-input
                                :id="ids.avatarUrl"
                                v-model="identity.avatarUrl"
                                name="avatarUrl"
                                type="url"
                                inputmode="url"
                                spellcheck="false"
                                placeholder="https://"
                                :disabled="!hydrated || savingIdentity"
                            />
                            <p v-if="identityErrors.avatarUrl" class="account-form__error">
                                {{ identityErrors.avatarUrl }}
                            </p>
                        </div>
                        <div class="account-form__field account-form__field--wide">
                            <label :for="ids.bio">{{ t('account.fields.bio') }}</label>
                            <el-input
                                :id="ids.bio"
                                v-model="identity.bio"
                                name="bio"
                                type="textarea"
                                :autosize="{ minRows: 3, maxRows: 8 }"
                                maxlength="500"
                                show-word-limit
                                :disabled="!hydrated || savingIdentity"
                            />
                            <p v-if="identityErrors.bio" class="account-form__error">
                                {{ identityErrors.bio }}
                            </p>
                        </div>
                    </div>
                    <CpNote v-if="identityError" tone="danger">{{ identityError }}</CpNote>
                    <div class="account-form__actions">
                        <el-button
                            :disabled="!identityDirty || savingIdentity"
                            @click="resetIdentity"
                        >
                            {{ t('common.actions.cancel') }}
                        </el-button>
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="savingIdentity"
                            :disabled="!hydrated || !identityDirty || !identityValid"
                        >
                            {{ t('common.actions.saveChanges') }}
                        </el-button>
                    </div>
                </form>
            </CpSheet>

            <CpSheet
                :title="t('account.basic.homepageTitle')"
                :description="t('account.basic.homepageText')"
            >
                <template #actions>
                    <el-segmented v-model="homepageMode" :options="homepageModes" size="small" />
                </template>
                <form class="account-form" method="post" novalidate @submit.prevent="saveHomepage">
                    <template v-if="homepageMode === 'edit'">
                        <label class="cp-sr-only" :for="ids.homepage">{{
                            t('account.basic.homepageTitle')
                        }}</label>
                        <el-input
                            :id="ids.homepage"
                            v-model="homepage"
                            name="homepage"
                            type="textarea"
                            class="account-form__markdown"
                            :autosize="{ minRows: 8, maxRows: 24 }"
                            :placeholder="t('account.basic.homepagePlaceholder')"
                            :disabled="!hydrated || savingHomepage"
                        />
                        <p class="cp-help" :class="{ 'account-form__error': homepageTooLarge }">
                            {{ t('account.basic.homepageSize', { used: homepageKiB, limit: 16 }) }}
                        </p>
                    </template>
                    <div v-else class="account-form__preview">
                        <CpMarkdown v-if="homepage.trim()" :source="homepage" />
                        <p v-else class="cp-help">{{ t('account.basic.homepageEmpty') }}</p>
                    </div>
                    <CpNote v-if="homepageError" tone="danger">{{ homepageError }}</CpNote>
                    <div class="account-form__actions">
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="savingHomepage"
                            :disabled="!hydrated || !homepageDirty || homepageTooLarge"
                        >
                            {{ t('common.actions.save') }}
                        </el-button>
                    </div>
                </form>
            </CpSheet>

            <CpSheet
                :title="t('account.basic.emailTitle')"
                :description="t('account.basic.emailText')"
            >
                <dl>
                    <CpField :label="t('account.fields.email')" mono>
                        <span class="account-email">
                            {{ me.email }}
                            <CpStatus
                                :tone="me.emailVerified ? 'success' : 'warning'"
                                :label="
                                    me.emailVerified
                                        ? t('account.basic.verified')
                                        : t('account.basic.unverified')
                                "
                            />
                        </span>
                    </CpField>
                    <CpField v-if="me.pendingEmail" :label="t('account.basic.pendingEmail')" mono>
                        <span class="account-email">
                            {{ me.pendingEmail }}
                            <span v-if="me.pendingEmailExpiresAt" class="cp-help">
                                {{
                                    t('account.basic.pendingUntil', {
                                        time: dateTime(me.pendingEmailExpiresAt)
                                    })
                                }}
                            </span>
                        </span>
                    </CpField>
                    <CpField :label="t('account.basic.accountId')">
                        <CpCode :value="me.id" />
                    </CpField>
                </dl>
                <CpNote v-if="emailNotice" :tone="emailNotice.tone" class="account-email__note">
                    {{ emailNotice.text }}
                </CpNote>

                <form
                    v-if="changingEmail"
                    class="account-form account-email__form"
                    method="post"
                    novalidate
                    @submit.prevent="changeEmail"
                >
                    <div class="account-form__field">
                        <label :for="ids.newEmail">{{ t('account.basic.newEmail') }}</label>
                        <el-input
                            :id="ids.newEmail"
                            v-model="newEmail"
                            name="email"
                            type="email"
                            autocomplete="email"
                            :disabled="!hydrated || emailBusy"
                        />
                        <p v-if="emailFieldError" class="account-form__error">
                            {{ emailFieldError }}
                        </p>
                        <p v-else class="cp-help">{{ t('account.basic.newEmailHint') }}</p>
                    </div>
                    <div class="account-form__actions">
                        <el-button :disabled="emailBusy" @click="changingEmail = false">
                            {{ t('common.actions.cancel') }}
                        </el-button>
                        <el-button
                            type="primary"
                            native-type="submit"
                            :loading="emailBusy"
                            :disabled="!hydrated || !newEmail.trim()"
                        >
                            {{ t('account.basic.sendConfirmation') }}
                        </el-button>
                    </div>
                </form>

                <template #footer>
                    <el-button
                        v-if="!me.emailVerified || me.pendingEmail"
                        :loading="resending"
                        :disabled="!hydrated"
                        @click="resendVerification"
                    >
                        {{
                            me.pendingEmail
                                ? t('account.basic.resendPending')
                                : t('account.basic.resendVerification')
                        }}
                    </el-button>
                    <el-button
                        v-if="!changingEmail"
                        :disabled="!hydrated"
                        @click="startEmailChange"
                    >
                        {{ t('account.basic.changeEmail') }}
                    </el-button>
                </template>
            </CpSheet>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { MeResponse } from '~/types/api';
import { USERNAME_MAX_LENGTH, USERNAME_REGEX, normalizeUsername } from '~/utils/username';

const { t } = useI18n();
const api = useApi();
const { describe, read } = useApiError();
const { dateTime } = useFormat();
const hydrated = useHydrated();
const session = useSession();
const reauth = useReauth();

const me = computed(() => session.user.value as MeResponse);
const ids = {
    username: useId(),
    displayName: useId(),
    avatarUrl: useId(),
    bio: useId(),
    homepage: useId(),
    newEmail: useId()
};

/* Identity */
const identity = reactive({ username: '', displayName: '', avatarUrl: '', bio: '' });
const identityErrors = ref<Record<string, string>>({});
const identityError = ref('');
const savingIdentity = ref(false);

function resetIdentity() {
    identity.username = me.value.username;
    identity.displayName = me.value.displayName ?? '';
    identity.avatarUrl = me.value.avatarUrl ?? '';
    identity.bio = me.value.bio ?? '';
    identityErrors.value = {};
    identityError.value = '';
}
resetIdentity();

const identityPatch = computed(() => {
    const patch: Record<string, string | null> = {};
    const username = normalizeUsername(identity.username);
    if (username !== me.value.username) patch.username = username;
    if (identity.displayName.trim() !== (me.value.displayName ?? '')) {
        patch.displayName = identity.displayName.trim() || null;
    }
    if (identity.avatarUrl.trim() !== (me.value.avatarUrl ?? '')) {
        patch.avatarUrl = identity.avatarUrl.trim() || null;
    }
    if (identity.bio.trim() !== (me.value.bio ?? '')) patch.bio = identity.bio.trim() || null;
    return patch;
});
const identityDirty = computed(() => Object.keys(identityPatch.value).length > 0);
const identityValid = computed(() => USERNAME_REGEX.test(normalizeUsername(identity.username)));

const previewAvatar = computed(() => {
    const value = identity.avatarUrl.trim();
    return /^https?:\/\//i.test(value) ? value : null;
});

watch(
    () => identity.username,
    value => {
        identityErrors.value.username =
            value && !USERNAME_REGEX.test(normalizeUsername(value))
                ? t('account.basic.usernameRule')
                : '';
    }
);

async function saveIdentity() {
    if (!identityDirty.value || !identityValid.value) return;
    savingIdentity.value = true;
    identityError.value = '';
    identityErrors.value = {};
    try {
        session.setUser(
            await api<MeResponse>('/api/auth/me', { method: 'PATCH', body: identityPatch.value })
        );
        resetIdentity();
        ElMessage.success(t('common.states.saved'));
    } catch (error) {
        const info = read(error);
        const next: Record<string, string> = { ...info.fields };
        if (info.status === 409) next.username = t('account.basic.usernameTaken');
        identityErrors.value = next;
        if (info.status !== 409 && !Object.keys(info.fields).length)
            identityError.value = describe(error);
    } finally {
        savingIdentity.value = false;
    }
}

/* Homepage */
const homepage = ref(me.value.homepage ?? '');
const homepageMode = ref<'edit' | 'preview'>('edit');
const homepageModes = computed(() => [
    { label: t('account.basic.edit'), value: 'edit' },
    { label: t('account.basic.preview'), value: 'preview' }
]);
const homepageBytes = computed(() => new TextEncoder().encode(homepage.value).length);
const homepageKiB = computed(() => (homepageBytes.value / 1024).toFixed(1));
const homepageTooLarge = computed(() => homepageBytes.value > 16 * 1024);
const homepageDirty = computed(() => homepage.value !== (me.value.homepage ?? ''));
const homepageError = ref('');
const savingHomepage = ref(false);

async function saveHomepage() {
    if (!homepageDirty.value || homepageTooLarge.value) return;
    savingHomepage.value = true;
    homepageError.value = '';
    try {
        session.setUser(
            await api<MeResponse>('/api/auth/me', {
                method: 'PATCH',
                body: { homepage: homepage.value.trim() ? homepage.value : null }
            })
        );
        homepage.value = me.value.homepage ?? '';
        ElMessage.success(t('common.states.saved'));
    } catch (error) {
        homepageError.value = describe(error);
    } finally {
        savingHomepage.value = false;
    }
}

/* Email */
const changingEmail = ref(false);
const newEmail = ref('');
const emailBusy = ref(false);
const emailFieldError = ref('');
const resending = ref(false);
const emailNotice = ref<{ tone: 'success' | 'warning' | 'danger'; text: string } | null>(null);

function startEmailChange() {
    changingEmail.value = true;
    newEmail.value = '';
    emailFieldError.value = '';
    emailNotice.value = null;
}

async function changeEmail() {
    emailBusy.value = true;
    emailFieldError.value = '';
    emailNotice.value = null;
    try {
        const reauthToken = await reauth.request('email_change');
        if (!reauthToken) return;
        const result = await api<MeResponse & { verificationEmailSent?: boolean }>('/api/auth/me', {
            method: 'PATCH',
            body: { email: newEmail.value.trim(), reauthToken, redirect: '/profile?tab=basic' }
        });
        const { verificationEmailSent, ...next } = result;
        session.setUser(next);
        changingEmail.value = false;
        emailNotice.value =
            verificationEmailSent === false
                ? { tone: 'warning', text: t('account.basic.emailNotSent') }
                : {
                      tone: 'success',
                      text: t('account.basic.emailSent', { email: next.pendingEmail ?? next.email })
                  };
    } catch (error) {
        const info = read(error);
        emailFieldError.value = info.fields.email ?? '';
        if (!emailFieldError.value) emailNotice.value = { tone: 'danger', text: describe(error) };
    } finally {
        emailBusy.value = false;
    }
}

async function resendVerification() {
    resending.value = true;
    emailNotice.value = null;
    try {
        const result = await api<{
            alreadyVerified: boolean;
            verificationEmailSent: boolean;
            pendingEmail: boolean;
        }>('/api/auth/verify', { method: 'POST', body: { redirect: '/profile?tab=basic' } });
        if (result.alreadyVerified && !result.pendingEmail) {
            emailNotice.value = { tone: 'success', text: t('account.basic.alreadyVerified') };
            await session.refresh();
        } else if (!result.verificationEmailSent) {
            emailNotice.value = { tone: 'warning', text: t('account.basic.emailNotSent') };
        } else {
            emailNotice.value = {
                tone: 'success',
                text: t('account.basic.emailSent', {
                    email: me.value.pendingEmail ?? me.value.email
                })
            };
        }
    } catch (error) {
        emailNotice.value = { tone: 'danger', text: describe(error) };
    } finally {
        resending.value = false;
    }
}
</script>

<style scoped lang="scss">
.account-form {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.account-form__avatar {
    display: flex;
    align-items: center;
    gap: var(--cp-space-4);
}

.account-form__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--cp-space-4);
}

.account-form__field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);
    min-width: 0;

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.account-form__field--wide {
    grid-column: 1 / -1;
}

.account-form__error {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-sm);
    color: var(--cp-danger);
}

.account-form__markdown :deep(textarea) {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-sm);
}

.account-form__preview {
    min-height: 120px;
    padding: var(--cp-space-4);
    background: var(--cp-sunken);
    border: 1px solid var(--cp-line);
    border-radius: var(--cp-radius-sm);
}

.account-form__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}

.account-email {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--cp-space-2) var(--cp-space-3);
}

.account-email__note,
.account-email__form {
    margin-top: var(--cp-space-4);
}

@media (max-width: 767px) {
    .account-form__grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
