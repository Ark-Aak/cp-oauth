import type { MeResponse } from '~/types/api';
import { emailSchema, profilePatchSchema } from '~/utils/validation';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';
import { profileError, profileFieldErrors } from '~/components/profile/profile-workbench';

export type ProfileIdentityPatch = Partial<
    Pick<
        MeResponse,
        | 'username'
        | 'displayName'
        | 'bio'
        | 'avatarUrl'
        | 'homepage'
        | 'publicLinkedPlatforms'
        | 'publicCpStats'
        | 'publicRatingHistory'
    >
>;
export interface ProfileEmailDelivery {
    verificationEmailSent: boolean;
    alreadyVerified: boolean;
    pendingEmail: boolean;
}

export function useProfileIdentity() {
    const auth = useAuth();
    const api = useApi();
    const reauthentication = useReauthentication();
    const { t } = useI18n();
    const saving = ref(false);
    const changingEmail = ref(false);
    const sendingVerification = ref(false);
    const mutationError = ref<string | null>(null);
    const fieldErrors = ref<Record<string, string>>({});
    const pending = computed(
        () => saving.value || changingEmail.value || sendingVerification.value
    );
    const status = computed(() =>
        auth.status.value === 'unknown'
            ? 'pending'
            : auth.status.value === 'error'
              ? 'error'
              : auth.status.value === 'authenticated'
                ? 'success'
                : 'idle'
    );

    function clearFailure() {
        mutationError.value = null;
        fieldErrors.value = {};
    }
    function fail(cause: unknown) {
        mutationError.value = profileError(cause, t('profile.update_error'));
        fieldErrors.value = profileFieldErrors(cause);
    }

    async function saveDirty(patch: ProfileIdentityPatch): Promise<MeResponse> {
        const current = auth.user.value;
        if (!current) throw new Error(t('reauth.session_expired'));
        if (pending.value) return current;
        clearFailure();
        const dirty: ProfileIdentityPatch = {};
        for (const key of Object.keys(patch) as (keyof ProfileIdentityPatch)[]) {
            const next = patch[key];
            if (next === undefined) continue;
            const previous = current[key];
            const equal =
                Array.isArray(next) && Array.isArray(previous)
                    ? next.length === previous.length &&
                      next.every(value => previous.includes(value))
                    : next === previous;
            if (!equal) Object.assign(dirty, { [key]: next });
        }
        if (!Object.keys(dirty).length) return current;
        const parsed = profilePatchSchema.safeParse(dirty);
        if (!parsed.success) {
            for (const issue of parsed.error.issues) {
                const key = String(issue.path[0] ?? '');
                if (key && !fieldErrors.value[key]) fieldErrors.value[key] = issue.message;
            }
            mutationError.value = t('profile.workbench.correct_fields');
            throw parsed.error;
        }
        saving.value = true;
        try {
            const updated = await api<MeResponse>('/api/auth/me', {
                method: 'PATCH',
                body: parsed.data
            });
            if (auth.user.value?.id === current.id) auth.user.value = updated;
            return updated;
        } catch (cause) {
            fail(cause);
            throw cause;
        } finally {
            saving.value = false;
        }
    }

    async function changeEmail(
        email: string,
        redirect: string
    ): Promise<(MeResponse & { verificationEmailSent: boolean }) | null> {
        if (pending.value) return null;
        clearFailure();
        const userId = auth.user.value?.id;
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) {
            fieldErrors.value.email = parsed.error.issues[0]?.message || t('common.error');
            mutationError.value = t('profile.workbench.correct_fields');
            throw parsed.error;
        }
        if (parsed.data === auth.user.value?.email) return null;
        changingEmail.value = true;
        try {
            const token = await reauthentication.require('email_change');
            if (!token) return null;
            reauthentication.consume('email_change', token);
            const updated = await api<MeResponse & { verificationEmailSent: boolean }>(
                '/api/auth/me',
                {
                    method: 'PATCH',
                    body: {
                        email: parsed.data,
                        reauthToken: token,
                        redirect: getSafeRedirectTarget(redirect)
                    }
                }
            );
            if (userId && auth.user.value?.id === userId) {
                auth.user.value = updated;
                auth.verificationEmailFailed.value = updated.verificationEmailSent === false;
            }
            return updated;
        } catch (cause) {
            fail(cause);
            throw cause;
        } finally {
            changingEmail.value = false;
        }
    }

    async function sendVerification(redirect: string): Promise<ProfileEmailDelivery | null> {
        if (pending.value) return null;
        clearFailure();
        const userId = auth.user.value?.id;
        sendingVerification.value = true;
        try {
            const result = await api<ProfileEmailDelivery>('/api/auth/verify', {
                method: 'POST',
                body: { redirect: getSafeRedirectTarget(redirect) }
            });
            if (userId && auth.user.value?.id === userId) {
                auth.verificationEmailFailed.value =
                    !result.verificationEmailSent && !result.alreadyVerified;
                try {
                    await auth.load(true);
                } catch {
                    // The shared identity error remains visible; delivery has a separate real outcome.
                }
            }
            return result;
        } catch (cause) {
            mutationError.value = profileError(cause, t('profile.verify_email_send_error'));
            throw cause;
        } finally {
            sendingVerification.value = false;
        }
    }

    return {
        profile: auth.user,
        status,
        error: auth.error,
        load: auth.load,
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
    };
}
