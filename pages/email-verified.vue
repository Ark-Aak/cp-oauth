<template>
    <CpAuthScreen
        :title="content.title"
        :description="content.text"
        :icon="content.icon"
        :tone="content.tone"
    >
        <el-button type="primary" @click="navigateTo(content.target)">{{
            content.action
        }}</el-button>
    </CpAuthScreen>
</template>

<script setup lang="ts">
import { CircleAlert, CircleCheck, Clock, Mail } from 'lucide-vue-next';

definePageMeta({ layout: 'auth' });

type Status = 'success' | 'error' | 'expired' | 'conflict';

const { t } = useI18n();
const route = useRoute();
const { user } = useSession();

const status = computed<Status>(() => {
    const value = route.query.status;
    return value === 'success' || value === 'expired' || value === 'conflict' ? value : 'error';
});
const redirect = computed(() =>
    getSafeRedirectTarget(route.query.redirect as string | undefined, '/profile')
);

const content = computed(() => {
    const signIn = redirect.value === '/profile' ? '/login' : buildLoginPath(redirect.value);
    const retry = user.value ? '/profile?tab=basic' : buildLoginPath('/profile?tab=basic');
    const retryAction = user.value ? t('auth.verified.openProfile') : t('common.actions.signIn');
    switch (status.value) {
        case 'success':
            return {
                title: t('auth.verified.successTitle'),
                text: t('auth.verified.successText'),
                icon: CircleCheck,
                tone: 'success' as const,
                target: signIn,
                action: t('common.actions.signIn')
            };
        case 'expired':
            return {
                title: t('auth.verified.expiredTitle'),
                text: t('auth.verified.expiredText'),
                icon: Clock,
                tone: 'warning' as const,
                target: retry,
                action: retryAction
            };
        case 'conflict':
            return {
                title: t('auth.verified.conflictTitle'),
                text: t('auth.verified.conflictText'),
                icon: Mail,
                tone: 'warning' as const,
                target: retry,
                action: retryAction
            };
        default:
            return {
                title: t('auth.verified.errorTitle'),
                text: t('auth.verified.errorText'),
                icon: CircleAlert,
                tone: 'danger' as const,
                target: retry,
                action: retryAction
            };
    }
});

useHead(() => ({ title: content.value.title }));
</script>
