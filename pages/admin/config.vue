<template>
    <div class="admin">
        <h1 class="admin__title">{{ $t('admin.title') }}</h1>
        <el-tabs v-model="activeTab" @tab-click="handleTabClick">
            <el-tab-pane :label="$t('admin.users.tab')" name="users" />
            <el-tab-pane :label="$t('admin.config.tab')" name="config" />
        </el-tabs>

        <el-form
            v-loading="formLoading"
            :model="form"
            label-position="top"
            class="admin__form"
            @submit.prevent="handleSave"
        >
            <!-- Site -->
            <h2 class="admin__section-title">{{ $t('admin.config.site') }}</h2>
            <el-form-item :label="$t('admin.config.site_title')">
                <el-input v-model="form.site_title" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.registration')">
                <el-select v-model="form.registration_enabled">
                    <el-option value="true" :label="$t('admin.config.enabled')" />
                    <el-option value="false" :label="$t('admin.config.disabled')" />
                </el-select>
            </el-form-item>

            <!-- SMTP -->
            <h2 class="admin__section-title">{{ $t('admin.config.smtp') }}</h2>
            <el-form-item :label="$t('admin.config.smtp_host')">
                <el-input v-model="form.smtp_host" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.smtp_port')">
                <el-input v-model="form.smtp_port" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.smtp_user')">
                <el-input v-model="form.smtp_user" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.smtp_pass')">
                <el-input v-model="form.smtp_pass" type="password" show-password />
            </el-form-item>
            <el-form-item :label="$t('admin.config.smtp_from')">
                <el-input v-model="form.smtp_from" />
            </el-form-item>

            <!-- Turnstile -->
            <h2 class="admin__section-title">{{ $t('admin.config.turnstile') }}</h2>
            <el-form-item :label="$t('admin.config.turnstile_toggle')">
                <el-select v-model="form.turnstile_enabled">
                    <el-option value="true" :label="$t('admin.config.enabled')" />
                    <el-option value="false" :label="$t('admin.config.disabled')" />
                </el-select>
            </el-form-item>
            <el-form-item :label="$t('admin.config.turnstile_site_key')">
                <el-input v-model="form.turnstile_site_key" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.turnstile_secret')">
                <el-input v-model="form.turnstile_secret_key" type="password" show-password />
            </el-form-item>

            <el-form-item>
                <el-button type="primary" native-type="submit" :loading="saving">
                    {{ saving ? $t('admin.config.saving') : $t('admin.config.save') }}
                </el-button>
            </el-form-item>
        </el-form>
    </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';

const { t } = useI18n();
const token = useCookie('auth_token');
const activeTab = ref('config');
const saving = ref(false);
const formLoading = ref(false);

const form = reactive({
    site_title: '',
    registration_enabled: 'true',
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_pass: '',
    smtp_from: '',
    turnstile_enabled: 'false',
    turnstile_site_key: '',
    turnstile_secret_key: ''
});

function handleTabClick() {
    if (activeTab.value === 'users') {
        navigateTo('/admin');
    }
}

async function loadConfig() {
    formLoading.value = true;
    try {
        const data = await $fetch<Record<string, string>>('/api/admin/config', {
            headers: { Authorization: `Bearer ${token.value}` }
        });
        Object.assign(form, data);
    } catch {
        navigateTo('/');
    } finally {
        formLoading.value = false;
    }
}

async function handleSave() {
    saving.value = true;
    try {
        await $fetch('/api/admin/config', {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token.value}` },
            body: { ...form }
        });
        ElMessage.success(t('admin.config.saved'));
    } catch (e: unknown) {
        const err = e as { data?: { message?: string } };
        ElMessage.error(err.data?.message || t('admin.error'));
    } finally {
        saving.value = false;
    }
}

await loadConfig();
</script>

<style scoped lang="scss">
.admin {
    max-width: 600px;

    &__title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 20px;
        color: var(--text-primary);
    }

    &__form {
        max-width: 100%;
    }

    &__section-title {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 20px 0 12px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border-color);
    }
}
</style>
