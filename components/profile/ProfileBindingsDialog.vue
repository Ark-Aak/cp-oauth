<template>
    <el-dialog
        :model-value="platform !== null"
        :title="platform ? t('connections.link.title', { platform: PLATFORMS[platform].name }) : ''"
        width="min(520px, calc(100vw - 32px))"
        append-to-body
        :close-on-click-modal="false"
        @update:model-value="value => !value && close()"
    >
        <template v-if="platform">
            <CpProofChallenge
                v-if="challenge"
                :platform="platform"
                :code="challenge.code"
                :platform-uid="claimedUid"
                :expires-in="challenge.expiresIn"
                :busy="busy"
                :error="error"
                @submit="verify"
                @back="challenge = null"
            />
            <form v-else class="bind-dialog" method="post" novalidate @submit.prevent="request">
                <p class="cp-help">{{ t(`connections.link.intro.${platform}`) }}</p>
                <div class="bind-dialog__field">
                    <label :for="inputId">{{ t(`connections.link.uidLabel.${platform}`) }}</label>
                    <el-input
                        :id="inputId"
                        v-model="uid"
                        name="platformUid"
                        autocomplete="off"
                        spellcheck="false"
                        maxlength="100"
                        :inputmode="platform === 'luogu' ? 'numeric' : 'text'"
                        :placeholder="t(`connections.link.uidPlaceholder.${platform}`)"
                        :disabled="busy"
                    />
                    <p v-if="uidInvalid" class="bind-dialog__error">
                        {{ t('connections.link.luoguUidRule') }}
                    </p>
                </div>
                <CpNote v-if="error" tone="danger">{{ error }}</CpNote>
                <div class="bind-dialog__actions">
                    <el-button :disabled="busy" @click="close">{{
                        t('common.actions.cancel')
                    }}</el-button>
                    <el-button
                        type="primary"
                        native-type="submit"
                        :loading="busy"
                        :disabled="!uid.trim() || uidInvalid"
                    >
                        {{ t('connections.link.getCode') }}
                    </el-button>
                </div>
            </form>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import type { LinkedAccount } from '~/types/api';
import { PLATFORMS, type VerifiablePlatform } from '~/utils/platforms';

const platform = defineModel<VerifiablePlatform | null>({ required: true });
const emit = defineEmits<{ linked: [account: LinkedAccount] }>();

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();
const reauth = useReauth();
const inputId = useId();

const uid = ref('');
const claimedUid = ref('');
const busy = ref(false);
const error = ref('');
const challenge = ref<{ requestId: string; code: string; expiresIn: number } | null>(null);

const uidInvalid = computed(
    () =>
        platform.value === 'luogu' &&
        uid.value.trim() !== '' &&
        !/^\d{1,20}$/.test(uid.value.trim())
);

watch(platform, () => {
    uid.value = '';
    claimedUid.value = '';
    error.value = '';
    challenge.value = null;
});

function close() {
    if (busy.value) return;
    platform.value = null;
}

async function request() {
    if (!platform.value || !uid.value.trim() || uidInvalid.value) return;
    busy.value = true;
    error.value = '';
    try {
        const reauthToken = await reauth.request('binding_change');
        if (!reauthToken) return;
        claimedUid.value = uid.value.trim();
        challenge.value = await api<{ requestId: string; code: string; expiresIn: number }>(
            '/api/account/bind/request',
            {
                method: 'POST',
                body: { platform: platform.value, platformUid: claimedUid.value, reauthToken }
            }
        );
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}

async function verify(credential: string) {
    if (!challenge.value) return;
    busy.value = true;
    error.value = '';
    try {
        const account = await api<LinkedAccount>('/api/account/bind/verify', {
            method: 'POST',
            body: { requestId: challenge.value.requestId, credential }
        });
        busy.value = false;
        emit('linked', account);
        platform.value = null;
    } catch (cause) {
        error.value = describe(cause);
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped lang="scss">
.bind-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-4);
}

.bind-dialog__field {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-1);

    label {
        font-size: var(--cp-text-sm);
        font-weight: var(--cp-weight-medium);
        color: var(--cp-text);
    }
}

.bind-dialog__error {
    font-size: var(--cp-text-sm);
    color: var(--cp-danger);
}

.bind-dialog__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--cp-space-2);

    .el-button + .el-button {
        margin-left: 0;
    }
}
</style>
