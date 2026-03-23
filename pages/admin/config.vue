<template>
    <div class="admin">
        <h1 class="admin__title">{{ $t('admin.title') }}</h1>
        <el-tabs v-model="activeTab" @tab-change="handleTabChange">
            <el-tab-pane :label="$t('admin.users.tab')" name="users" />
            <el-tab-pane :label="$t('admin.notices.tab')" name="notices" />
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

            <!-- Codeforces OAuth -->
            <h2 class="admin__section-title">{{ $t('admin.config.codeforces') }}</h2>
            <el-form-item :label="$t('admin.config.codeforces_client_id')">
                <el-input v-model="form.codeforces_client_id" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.codeforces_client_secret')">
                <el-input v-model="form.codeforces_client_secret" type="password" show-password />
            </el-form-item>

            <!-- GitHub OAuth -->
            <h2 class="admin__section-title">{{ $t('admin.config.github') }}</h2>
            <el-form-item :label="$t('admin.config.github_client_id')">
                <el-input v-model="form.github_client_id" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.github_client_secret')">
                <el-input v-model="form.github_client_secret" type="password" show-password />
            </el-form-item>

            <!-- Google OAuth -->
            <h2 class="admin__section-title">{{ $t('admin.config.google') }}</h2>
            <el-form-item :label="$t('admin.config.google_client_id')">
                <el-input v-model="form.google_client_id" />
            </el-form-item>
            <el-form-item :label="$t('admin.config.google_client_secret')">
                <el-input v-model="form.google_client_secret" type="password" show-password />
            </el-form-item>

            <!-- Platform -->
            <h2 class="admin__section-title">{{ $t('admin.config.platform') }}</h2>
            <el-form-item :label="$t('admin.config.username_refresh_cooldown')">
                <el-input v-model="form.username_refresh_cooldown" />
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

useHead({ title: () => `${t('admin.config.tab')} - CP OAuth` });
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
    turnstile_secret_key: '',
    codeforces_client_id: '',
    codeforces_client_secret: '',
    github_client_id: '',
    github_client_secret: '',
    google_client_id: '',
    google_client_secret: '',
    username_refresh_cooldown: '1440'
});

function handleTabChange(name: string | number) {
    if (name === 'users') {
        navigateTo('/admin');
    }
    if (name === 'notices') {
        navigateTo('/admin/notices');
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
    max-width: 580px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 16px;
        color: var(--text-primary);
    }

    &__form {
        max-width: 100%;
    }

    &__section-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 18px 0 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--border-color);
    }
}
</style>
