<template>
    <div class="showcase">
        <h1 class="showcase__title">{{ $t('showcase.title') }}</h1>
        <p class="showcase__subtitle">{{ $t('showcase.subtitle') }}</p>

        <el-tabs v-model="activeTab">
            <el-tab-pane :label="$t('showcase.sites_tab')" name="sites" />
            <el-tab-pane :label="$t('showcase.projects_tab')" name="projects" />
        </el-tabs>

        <div v-loading="pending" class="showcase__content">
            <template v-if="activeTab === 'sites'">
                <div v-if="sites.length" class="showcase__grid">
                    <a
                        v-for="item in sites"
                        :key="item.id"
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="showcase__card"
                    >
                        <img
                            :src="item.iconUrl || getFavicon(item.url)"
                            :alt="item.name"
                            class="showcase__icon"
                            loading="lazy"
                            @error="handleIconError"
                        />
                        <div class="showcase__card-body">
                            <h3 class="showcase__card-name">
                                {{ item.name }}
                                <ExternalLink :size="12" :stroke-width="1.5" />
                            </h3>
                            <p v-if="item.description" class="showcase__card-desc">
                                {{ item.description }}
                            </p>
                        </div>
                    </a>
                </div>
                <el-empty v-else :description="$t('showcase.no_sites')" :image-size="64" />
            </template>

            <template v-if="activeTab === 'projects'">
                <div v-if="projects.length" class="showcase__grid">
                    <a
                        v-for="item in projects"
                        :key="item.id"
                        :href="item.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="showcase__card"
                    >
                        <img
                            :src="item.iconUrl || getFavicon(item.url)"
                            :alt="item.name"
                            class="showcase__icon"
                            loading="lazy"
                            @error="handleIconError"
                        />
                        <div class="showcase__card-body">
                            <h3 class="showcase__card-name">
                                {{ item.name }}
                                <ExternalLink :size="12" :stroke-width="1.5" />
                            </h3>
                            <p v-if="item.description" class="showcase__card-desc">
                                {{ item.description }}
                            </p>
                        </div>
                    </a>
                </div>
                <el-empty v-else :description="$t('showcase.no_projects')" :image-size="64" />
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next';

const { t } = useI18n();

useHead({ title: () => `${t('showcase.title')} - CP OAuth` });

const activeTab = ref('sites');

interface ShowcaseItem {
    id: string;
    name: string;
    description: string;
    url: string;
    iconUrl: string | null;
}

interface ShowcaseData {
    sites: ShowcaseItem[];
    projects: ShowcaseItem[];
}

const { data, pending } = await useFetch<ShowcaseData>('/api/public/showcase');

const sites = computed(() => data.value?.sites || []);
const projects = computed(() => data.value?.projects || []);

function getFavicon(url: string): string {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
        return '';
    }
}

function handleIconError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.style.display = 'none';
}
</script>

<style scoped lang="scss">
.showcase {
    max-width: 760px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 4px;
        color: var(--text-primary);
    }

    &__subtitle {
        font-size: 13px;
        color: var(--text-secondary);
        margin-bottom: 20px;
    }

    &__content {
        min-height: 120px;
    }

    &__grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    &__card {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 16px;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        background: var(--bg-primary);
        text-decoration: none;
        transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease;

        &:hover {
            border-color: var(--accent);
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
        }
    }

    &__icon {
        width: 36px;
        height: 36px;
        border-radius: 6px;
        flex-shrink: 0;
        object-fit: contain;
        background: var(--bg-tertiary);
    }

    &__card-body {
        min-width: 0;
        flex: 1;
    }

    &__card-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 4px;
        display: inline-flex;
        align-items: center;
        gap: 5px;
    }

    &__card-desc {
        font-size: 12px;
        color: var(--text-secondary);
        margin: 0;
        line-height: 1.6;
    }
}
</style>
