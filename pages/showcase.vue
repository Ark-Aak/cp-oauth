<template>
    <div class="showcase">
        <AppPageHeader :title="$t('showcase.title')" :description="$t('showcase.subtitle')" />

        <AppAsyncState
            :pending="pending"
            :error="error ? $t('identity.network_error') : null"
            @retry="refresh()"
        >
            <div class="showcase__content">
                <section
                    v-for="section in sections"
                    :key="section.id"
                    class="showcase__section ui-card"
                    :aria-labelledby="`showcase-${section.id}`"
                >
                    <h2 :id="`showcase-${section.id}`">{{ section.title }}</h2>
                    <AppAsyncState
                        :pending="false"
                        :empty="!section.items.length"
                        :empty-text="section.emptyText"
                        :empty-icon="Globe"
                    >
                        <ul class="showcase__list">
                            <li v-for="item in section.items" :key="item.id">
                                <component
                                    :is="item.url ? 'a' : 'div'"
                                    :href="item.url || undefined"
                                    :target="item.url ? '_blank' : undefined"
                                    :rel="item.url ? 'noopener noreferrer' : undefined"
                                    class="showcase__item ui-navigation-link"
                                >
                                    <img
                                        v-if="!failedIcons[item.id] && (item.iconUrl || item.url)"
                                        :src="item.iconUrl || getFavicon(item.url)"
                                        alt=""
                                        class="showcase__icon"
                                        loading="lazy"
                                        @error="failedIcons[item.id] = true"
                                    />
                                    <Code
                                        v-else
                                        class="showcase__icon showcase__icon--fallback"
                                        aria-hidden="true"
                                    />
                                    <div class="showcase__item-body">
                                        <h3 class="showcase__item-name">{{ item.name }}</h3>
                                        <p
                                            v-if="item.description"
                                            class="showcase__item-description"
                                        >
                                            {{ item.description }}
                                        </p>
                                    </div>
                                </component>
                            </li>
                        </ul>
                    </AppAsyncState>
                </section>
            </div>
        </AppAsyncState>
    </div>
</template>

<script setup lang="ts">
import { Code, Globe } from 'lucide-vue-next';
import type { ShowcaseItem } from '~/types/api';

const { t } = useI18n();

useHead({ title: () => `${t('showcase.title')} - CP OAuth` });

const failedIcons = ref<Record<string, boolean>>({});

interface ShowcaseData {
    sites: ShowcaseItem[];
    projects: ShowcaseItem[];
}

const api = useApi();
const { data, pending, error, refresh } = await useAsyncData('public:showcase', () =>
    api<ShowcaseData>('/api/public/showcase')
);

const sections = computed(() => [
    {
        id: 'projects',
        title: t('showcase.projects_tab'),
        emptyText: t('showcase.no_projects'),
        items: data.value?.projects || []
    },
    {
        id: 'sites',
        title: t('showcase.sites_tab'),
        emptyText: t('showcase.no_sites'),
        items: data.value?.sites || []
    }
]);

function getFavicon(url: string | null): string {
    if (!url) return '';
    try {
        const target = new URL(url);
        return `${target.protocol}//${target.host}/favicon.ico`;
    } catch {
        return '';
    }
}
</script>

<style scoped lang="scss">
.showcase {
    min-width: 0;

    &__content {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: var(--space-5);
        align-items: start;
    }

    &__section {
        min-width: 0;
        padding: var(--panel-padding);

        h2 {
            margin-bottom: var(--space-3);
        }
    }

    &__list {
        list-style: none;
        margin: 0;
        padding: 0;

        li {
            min-width: 0;
        }

        li + li {
            border-top: 1px solid var(--border-color);
        }
    }

    &__item {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-4) 0;
        min-height: 72px;
        text-decoration: none;
        min-width: 44px;
        border-radius: var(--card-radius);
    }

    a.showcase__item:hover {
        background: var(--bg-secondary);
    }

    a.showcase__item:hover .showcase__item-name {
        color: var(--accent);
        text-decoration: underline;
        text-underline-offset: 3px;
    }

    &__icon {
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        object-fit: contain;
        border-radius: var(--card-radius);

        &--fallback {
            color: var(--accent);
            border-radius: 0;
        }
    }

    &__item-body {
        min-width: 0;
        flex: 1;
        overflow-wrap: anywhere;
    }

    &__item-name {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        color: var(--text-primary);

        span {
            min-width: 0;
        }

        svg {
            flex-shrink: 0;
        }
    }

    &__item-description {
        margin-top: var(--space-1);
        color: var(--text-secondary);
        font-size: var(--font-size-body);
    }
}

@media (max-width: 767px) {
    .showcase__content {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
