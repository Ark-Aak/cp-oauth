<template>
    <div>
        <CpPageHeader
            :kicker="t('common.nav.explore')"
            :title="t('public.showcase.title')"
            :description="t('public.showcase.description')"
        />

        <CpDataState
            :pending="pending"
            :error="error ? describe(error) : null"
            :rows="6"
            @retry="refresh"
        >
            <div class="cp-stack">
                <CpSheet
                    v-for="group in groups"
                    :key="group.key"
                    :title="group.title"
                    :description="group.description"
                    flush
                >
                    <ul v-if="group.items.length" class="cp-rows">
                        <li v-for="item in group.items" :key="item.id">
                            <PublicShowcaseIcon :src="item.iconUrl" :name="item.name" />
                            <div class="cp-rows__main">
                                <a
                                    v-if="item.url"
                                    :href="item.url"
                                    class="cp-rows__title"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    {{ item.name }}
                                </a>
                                <span v-else class="cp-rows__title">{{ item.name }}</span>
                                <span v-if="item.description" class="cp-rows__meta">
                                    {{ item.description }}
                                </span>
                            </div>
                            <span v-if="item.url" class="showcase__host cp-mono">
                                {{ hostOf(item.url) }}
                            </span>
                        </li>
                    </ul>
                    <p v-else class="showcase__empty">{{ group.empty }}</p>
                </CpSheet>
            </div>
        </CpDataState>
    </div>
</template>

<script setup lang="ts">
interface PublicShowcaseItem {
    id: string;
    category: 'site' | 'project';
    name: string;
    description: string;
    url: string | null;
    iconUrl: string | null;
}

const { t } = useI18n();
const api = useApi();
const { describe } = useApiError();

useHead({ title: t('public.showcase.title') });

const { data, pending, error, refresh } = await useAsyncData('public-showcase', () =>
    api<{ sites: PublicShowcaseItem[]; projects: PublicShowcaseItem[] }>('/api/public/showcase')
);

const groups = computed(() => [
    {
        key: 'sites',
        title: t('public.showcase.sites'),
        description: t('public.showcase.sitesText'),
        empty: t('public.showcase.noSites'),
        items: data.value?.sites ?? []
    },
    {
        key: 'projects',
        title: t('public.showcase.projects'),
        description: t('public.showcase.projectsText'),
        empty: t('public.showcase.noProjects'),
        items: data.value?.projects ?? []
    }
]);

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}
</script>

<style scoped lang="scss">
.showcase__host {
    flex: none;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

.showcase__empty {
    padding: var(--cp-space-4) var(--cp-space-5);
    font-size: var(--cp-text-sm);
    color: var(--cp-text-3);
}

@media (max-width: 767px) {
    .showcase__host {
        display: none;
    }
}
</style>
