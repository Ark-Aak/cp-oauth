<template>
    <section class="profile-identity" aria-labelledby="profile-identity-title">
        <h2 id="profile-identity-title">{{ t('profile.tabs.basic') }}</h2>
        <p class="profile-identity__intro">{{ t('profile.workbench.identity_hint') }}</p>
        <div class="profile-identity__person">
            <AppUserAvatar
                :size="64"
                :src="draft.avatarUrl || undefined"
                :name="draft.displayName || draft.username"
            />
            <div>
                <strong>{{ draft.displayName || draft.username }}</strong>
                <p class="profile-identity__username">@{{ profile?.username }}</p>
            </div>
        </div>
        <p
            v-if="mutationError"
            ref="errorElement"
            class="profile-identity__error"
            tabindex="-1"
            role="alert"
        >
            {{ mutationError }}
        </p>
        <p v-if="notice" class="profile-identity__notice" role="status" aria-live="polite">
            {{ notice }}
        </p>

        <form class="profile-identity__form" method="post" novalidate @submit.prevent="save">
            <div class="profile-identity__field">
                <label for="profile-identity-displayName">{{ t('profile.display_name') }}</label>
                <el-input
                    id="profile-identity-displayName"
                    v-model="draft.displayName"
                    :aria-label="t('profile.display_name')"
                    autocomplete="nickname"
                    :disabled="!ready || pending"
                    :aria-invalid="!!fieldErrors.displayName"
                    :aria-describedby="
                        fieldErrors.displayName ? 'profile-identity-displayName-error' : undefined
                    "
                />
                <p
                    v-if="fieldErrors.displayName"
                    id="profile-identity-displayName-error"
                    class="profile-identity__error"
                >
                    {{ fieldErrors.displayName }}
                </p>
            </div>
            <div class="profile-identity__field">
                <label for="profile-identity-username">{{ t('profile.username') }}</label>
                <el-input
                    id="profile-identity-username"
                    v-model="draft.username"
                    :aria-label="t('profile.username')"
                    autocomplete="username"
                    :disabled="!ready || pending"
                    :aria-invalid="!!fieldErrors.username"
                    aria-describedby="profile-identity-username-hint profile-identity-username-error"
                />
                <p id="profile-identity-username-hint" class="profile-identity__hint">
                    {{ t('profile.username_hint') }}
                </p>
                <p
                    v-if="fieldErrors.username"
                    id="profile-identity-username-error"
                    class="profile-identity__error"
                >
                    {{ fieldErrors.username }}
                </p>
            </div>
            <div class="profile-identity__field">
                <label for="profile-identity-avatarUrl">{{ t('profile.avatar_url') }}</label>
                <el-input
                    id="profile-identity-avatarUrl"
                    v-model="draft.avatarUrl"
                    :aria-label="t('profile.avatar_url')"
                    type="url"
                    autocomplete="url"
                    :disabled="!ready || pending"
                    :aria-invalid="!!fieldErrors.avatarUrl"
                    aria-describedby="profile-identity-avatarUrl-hint profile-identity-avatarUrl-error"
                />
                <p id="profile-identity-avatarUrl-hint" class="profile-identity__hint">
                    {{ t('profile.avatar_url_hint') }}
                </p>
                <p
                    v-if="fieldErrors.avatarUrl"
                    id="profile-identity-avatarUrl-error"
                    class="profile-identity__error"
                >
                    {{ fieldErrors.avatarUrl }}
                </p>
            </div>
            <div class="profile-identity__field">
                <label for="profile-identity-bio">{{ t('profile.bio') }}</label>
                <el-input
                    id="profile-identity-bio"
                    v-model="draft.bio"
                    :aria-label="t('profile.bio')"
                    type="textarea"
                    :rows="4"
                    :disabled="!ready || pending"
                    :aria-invalid="!!fieldErrors.bio"
                    :aria-describedby="fieldErrors.bio ? 'profile-identity-bio-error' : undefined"
                />
                <p
                    v-if="fieldErrors.bio"
                    id="profile-identity-bio-error"
                    class="profile-identity__error"
                >
                    {{ fieldErrors.bio }}
                </p>
            </div>
            <div class="profile-identity__actions">
                <el-button
                    type="primary"
                    native-type="submit"
                    :loading="saving"
                    :disabled="!ready || pending || !identityDirty"
                    >{{ t(saving ? 'profile.saving' : 'profile.save') }}</el-button
                >
            </div>
        </form>

        <section class="profile-identity__email" aria-labelledby="profile-email-title">
            <h3 id="profile-email-title">{{ t('profile.email') }}</h3>
            <dl class="profile-identity__email-details">
                <dt>{{ t('reauth.current_email') }}</dt>
                <dd>{{ profile?.email }}</dd>
                <dt>{{ t('profile.workbench.email_status') }}</dt>
                <dd>
                    {{
                        t(
                            profile?.emailVerified
                                ? 'profile.email_verified'
                                : 'profile.email_unverified'
                        )
                    }}
                </dd>
            </dl>
            <div v-if="profile?.pendingEmail" class="profile-identity__pending-email">
                <p>
                    {{
                        t(
                            pendingEmailExpired
                                ? 'reauth.pending_email_expired'
                                : 'reauth.pending_email',
                            { email: profile.pendingEmail }
                        )
                    }}
                </p>
                <p v-if="profile.pendingEmailExpiresAt" class="profile-identity__hint">
                    {{
                        t('profile.workbench.expires_at', {
                            time: formatCSTTime(profile.pendingEmailExpiresAt, {
                                withTimezone: true
                            })
                        })
                    }}
                </p>
            </div>
            <p v-if="verificationEmailFailed" class="profile-identity__delivery" role="status">
                {{ t('identity.verification_delivery_failed') }}
            </p>
            <el-button
                v-if="!profile?.emailVerified || profile?.pendingEmail || verificationEmailFailed"
                :loading="sendingVerification"
                :disabled="!ready || pending"
                @click="resend"
                >{{ t('identity.verification_resend') }}</el-button
            >
            <form
                class="profile-identity__form profile-identity__new-email"
                method="post"
                novalidate
                @submit.prevent="changeAddress"
            >
                <div class="profile-identity__field">
                    <label for="profile-identity-email">{{ t('reauth.new_email') }}</label>
                    <el-input
                        id="profile-identity-email"
                        v-model="newEmail"
                        :aria-label="t('reauth.new_email')"
                        type="email"
                        autocomplete="email"
                        :disabled="!ready || pending"
                        :aria-invalid="!!fieldErrors.email"
                        aria-describedby="profile-identity-email-hint profile-identity-email-error"
                    />
                    <p id="profile-identity-email-hint" class="profile-identity__hint">
                        {{ t('reauth.email_change_hint') }}
                    </p>
                    <p
                        v-if="fieldErrors.email"
                        id="profile-identity-email-error"
                        class="profile-identity__error"
                    >
                        {{ fieldErrors.email }}
                    </p>
                </div>
                <el-button
                    native-type="submit"
                    :loading="changingEmail"
                    :disabled="
                        !ready ||
                        pending ||
                        !newEmail.trim() ||
                        newEmail.trim().toLowerCase() === profile?.email
                    "
                    >{{ t('reauth.change_email') }}</el-button
                >
            </form>
        </section>
    </section>
</template>

<script setup lang="ts">
import type { MeResponse } from '~/types/api';
import type { ProfileIdentityPatch } from '~/composables/useProfileIdentity';
import { normalizeUsername } from '~/utils/username';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { formatCSTTime } from '~/utils/time';
import { useProfileTaskGuard } from './profile-workbench';

const { t } = useI18n();
const route = useRoute();
const ready = ref(false);
const auth = useAuth();
const {
    profile,
    saveDirty,
    changeEmail,
    sendVerification,
    saving,
    changingEmail,
    sendingVerification,
    pending,
    mutationError,
    fieldErrors,
    clearFailure
} = useProfileIdentity();
const { verificationEmailFailed } = auth;
const fields = ['displayName', 'username', 'avatarUrl', 'bio'] as const;
function values(user: MeResponse | null) {
    return {
        displayName: user?.displayName || '',
        username: user?.username || '',
        avatarUrl: user?.avatarUrl || '',
        bio: user?.bio || ''
    };
}
const draft = reactive(values(profile.value));
const saved = ref(values(profile.value));
const newEmail = ref('');
const notice = ref('');
const errorElement = ref<HTMLElement>();
const identityDirty = computed(() => fields.some(key => draft[key] !== saved.value[key]));
const pendingEmailExpired = computed(
    () =>
        !!profile.value?.pendingEmailExpiresAt &&
        new Date(profile.value.pendingEmailExpiresAt).getTime() <= Date.now()
);
const redirect = computed(() => getSafeRedirectTarget(route.query.redirect, route.fullPath));

useProfileTaskGuard({
    dirty: () => identityDirty.value || !!newEmail.value,
    pending: () => pending.value
});
watch(
    () => profile.value?.id,
    () => {
        Object.assign(draft, values(profile.value));
        saved.value = values(profile.value);
        newEmail.value = '';
        notice.value = '';
        clearFailure();
    }
);

async function focusFailure() {
    await nextTick();
    const first = Object.keys(fieldErrors.value)[0];
    if (first) document.getElementById(`profile-identity-${first}`)?.focus();
    else errorElement.value?.focus();
}
async function save() {
    if (pending.value || !identityDirty.value) return;
    notice.value = '';
    const patch: ProfileIdentityPatch = {};
    for (const key of fields) {
        if (draft[key] !== saved.value[key])
            patch[key] = key === 'username' ? normalizeUsername(draft[key]) : draft[key];
    }
    try {
        const updated = await saveDirty(patch);
        saved.value = values(updated);
        Object.assign(draft, saved.value);
        notice.value = t('profile.updated');
    } catch {
        await focusFailure();
    }
}
async function changeAddress() {
    if (pending.value || !newEmail.value.trim()) return;
    notice.value = '';
    try {
        const result = await changeEmail(newEmail.value, redirect.value);
        if (!result) return;
        newEmail.value = '';
        notice.value = t(
            result.verificationEmailSent
                ? 'reauth.email_confirmation_sent'
                : 'identity.verification_delivery_failed'
        );
    } catch {
        await focusFailure();
    }
}
async function resend() {
    if (pending.value) return;
    notice.value = '';
    try {
        const result = await sendVerification(redirect.value);
        if (!result) return;
        notice.value = t(
            result.alreadyVerified
                ? 'profile.email_verified'
                : result.verificationEmailSent
                  ? 'profile.verify_email_sent'
                  : 'identity.verification_delivery_failed'
        );
    } catch {
        await focusFailure();
    }
}
onMounted(() => {
    ready.value = true;
});
onBeforeUnmount(() => {
    newEmail.value = '';
});
</script>

<style scoped lang="scss">
.profile-identity {
    max-width: 680px;
    min-width: 0;
    &__intro,
    &__hint,
    &__username {
        color: var(--text-secondary);
    }
    &__intro {
        margin: var(--space-2) 0 var(--space-5);
    }
    &__hint {
        font-size: 14px;
        margin: var(--space-1) 0 0;
    }
    &__person {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        margin-bottom: var(--space-5);
        overflow-wrap: anywhere;
    }
    &__username {
        margin: 0;
        font-size: 14px;
    }
    &__form {
        display: grid;
        gap: var(--space-5);
    }
    &__field {
        display: grid;
        gap: var(--space-2);
    }
    &__field label {
        font-size: 14px;
        font-weight: 600;
    }
    &__error {
        color: var(--el-color-danger);
        overflow-wrap: anywhere;
        margin: var(--space-2) 0;
    }
    &__notice {
        margin: 0 0 var(--space-4);
    }
    &__email {
        border-top: 1px solid var(--border-color);
        margin-top: var(--space-6);
        padding-top: var(--space-5);
    }
    &__email-details {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: var(--space-2) var(--space-4);
        margin: var(--space-4) 0;
    }
    &__email-details dt {
        color: var(--text-secondary);
        font-size: 14px;
    }
    &__email-details dd {
        margin: 0;
        overflow-wrap: anywhere;
    }
    &__pending-email {
        padding: var(--space-3) 0;
    }
    &__pending-email p {
        margin: 0 0 var(--space-2);
        overflow-wrap: anywhere;
    }
    &__delivery {
        color: var(--text-secondary);
        margin: var(--space-3) 0;
    }
    &__new-email {
        margin-top: var(--space-5);
        justify-items: start;
    }
    &__new-email .profile-identity__field {
        width: 100%;
    }
    @media (max-width: 479px) {
        &__email-details {
            grid-template-columns: 1fr;
            gap: var(--space-1);
        }
        &__email-details dd {
            margin-bottom: var(--space-3);
        }
        &__actions :deep(.el-button),
        &__new-email :deep(.el-button) {
            width: 100%;
            white-space: normal;
        }
    }
}
</style>
