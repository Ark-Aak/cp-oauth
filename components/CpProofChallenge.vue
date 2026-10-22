<template>
    <form class="cp-proof" method="post" novalidate @submit.prevent="submit">
        <ol class="cp-proof__steps">
            <li class="cp-proof__step">
                <span class="cp-proof__index cp-num" aria-hidden="true">1</span>
                <div class="cp-proof__content">
                    <p>{{ t('common.proof.copy') }}</p>
                    <CpCode :value="code" block />
                </div>
            </li>
            <li class="cp-proof__step">
                <span class="cp-proof__index cp-num" aria-hidden="true">2</span>
                <div class="cp-proof__content">
                    <p>{{ t(`common.proof.place.${platform}`) }}</p>
                    <a :href="PLACE_LINKS[platform]" target="_blank" rel="noopener noreferrer">
                        {{ t(`common.proof.open.${platform}`) }}
                    </a>
                </div>
            </li>
            <li class="cp-proof__step">
                <span class="cp-proof__index cp-num" aria-hidden="true">3</span>
                <div class="cp-proof__content">
                    <p>{{ t(`common.proof.submit.${platform}`) }}</p>
                    <template v-if="platform === 'luogu'">
                        <label class="cp-proof__label" :for="inputId">
                            {{ t('common.proof.pasteLabel') }}
                        </label>
                        <el-input
                            :id="inputId"
                            v-model="paste"
                            name="paste"
                            autocomplete="off"
                            spellcheck="false"
                            :placeholder="t('common.proof.pastePlaceholder')"
                            :disabled="!hydrated || busy"
                        />
                    </template>
                    <p v-else-if="platform === 'leetcode'" class="cp-help">
                        {{ t('common.proof.checking') }}
                        <span class="cp-mono">{{ platformUid }}</span>
                    </p>
                </div>
            </li>
        </ol>
        <p v-if="expiresIn" class="cp-help">
            {{ t('common.proof.expires', { minutes: Math.round(expiresIn / 60) }) }}
        </p>
        <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
        <div class="cp-proof__actions">
            <el-button :disabled="busy" @click="emit('back')">{{
                t('common.actions.back')
            }}</el-button>
            <el-button
                type="primary"
                native-type="submit"
                :loading="busy"
                :disabled="!hydrated || !ready"
            >
                {{ t('common.proof.verify') }}
            </el-button>
        </div>
    </form>
</template>

<script setup lang="ts">
import type { VerifiablePlatform } from '~/utils/platforms';

const props = withDefaults(
    defineProps<{
        platform: VerifiablePlatform;
        code: string;
        /** Claimed identity; for LeetCode it doubles as the submitted credential. */
        platformUid: string;
        expiresIn?: number;
        busy?: boolean;
        error?: string;
    }>(),
    { expiresIn: undefined, busy: false, error: '' }
);
const emit = defineEmits<{ submit: [credential: string]; back: [] }>();

const PLACE_LINKS: Record<VerifiablePlatform, string> = {
    luogu: 'https://www.luogu.com.cn/paste',
    atcoder: 'https://atcoder.jp/settings',
    leetcode: 'https://leetcode.cn/profile/info/'
};

const { t } = useI18n();
const hydrated = useHydrated();
const inputId = useId();
const paste = ref('');

const ready = computed(() => props.platform !== 'luogu' || paste.value.trim().length > 0);

function submit() {
    if (!ready.value || props.busy) return;
    const credential =
        props.platform === 'luogu'
            ? paste.value.trim()
            : props.platform === 'leetcode'
              ? props.platformUid
              : '';
    emit('submit', credential);
}
</script>

<style scoped lang="scss">
.cp-proof {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.cp-proof__steps {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--cp-line);
}

.cp-proof__step {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: var(--cp-space-3);
    padding: var(--cp-space-3) 0;
    border-bottom: 1px solid var(--cp-line);
}

.cp-proof__index {
    font-size: var(--cp-text-sm);
    line-height: var(--cp-leading-md);
    color: var(--cp-text-3);
}

.cp-proof__content {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-2);
    min-width: 0;
    color: var(--cp-text-2);
}

.cp-proof__label {
    font-size: var(--cp-text-sm);
    font-weight: var(--cp-weight-medium);
    color: var(--cp-text);
}

.cp-proof__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    :deep(.el-button + .el-button) {
        margin-left: 0;
    }
}
</style>
