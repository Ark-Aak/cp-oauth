<template>
    <div class="shell">
        <a class="shell__skip" href="#main">{{ t('common.nav.skip') }}</a>

        <aside class="shell__rail" :aria-label="t('common.nav.label')">
            <CpSidebar />
        </aside>

        <header class="shell__topbar">
            <button
                ref="menuButton"
                type="button"
                class="shell__menu"
                :aria-expanded="drawerOpen"
                aria-controls="cp-drawer"
                :aria-label="t('common.nav.open')"
                @click="openDrawer"
            >
                <Menu :size="18" :stroke-width="1.75" aria-hidden="true" />
            </button>
            <NuxtLink to="/" class="shell__wordmark">
                <span class="shell__mark" aria-hidden="true">CP</span>
                {{ config.siteTitle }}
            </NuxtLink>
        </header>

        <Transition name="shell-drawer">
            <div v-if="drawerOpen" class="shell__drawer-layer" @keydown.esc="closeDrawer">
                <div class="shell__backdrop" aria-hidden="true" @click="closeDrawer" />
                <div
                    id="cp-drawer"
                    ref="drawer"
                    class="shell__drawer"
                    role="dialog"
                    aria-modal="true"
                    :aria-label="t('common.nav.label')"
                    @keydown.tab="trapFocus"
                >
                    <button
                        type="button"
                        class="shell__close"
                        :aria-label="t('common.nav.close')"
                        @click="closeDrawer"
                    >
                        <X :size="18" :stroke-width="1.75" aria-hidden="true" />
                    </button>
                    <CpSidebar @navigate="closeDrawer" />
                </div>
            </div>
        </Transition>

        <div class="shell__main">
            <main id="main" class="shell__content" tabindex="-1">
                <slot />
            </main>
            <div class="shell__footer"><CpFooter /></div>
        </div>

        <CpReauthDialog />
    </div>
</template>

<script setup lang="ts">
import { Menu, X } from 'lucide-vue-next';

const { t } = useI18n();
const route = useRoute();
const { config } = usePublicConfig();
const drawerOpen = ref(false);
const drawer = ref<HTMLElement | null>(null);
const menuButton = ref<HTMLButtonElement | null>(null);

function focusables(): HTMLElement[] {
    return Array.from(
        drawer.value?.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
    );
}

async function openDrawer() {
    drawerOpen.value = true;
    await nextTick();
    focusables()[0]?.focus();
}

function closeDrawer() {
    if (!drawerOpen.value) return;
    drawerOpen.value = false;
    void nextTick(() => menuButton.value?.focus());
}

function trapFocus(event: KeyboardEvent) {
    const items = focusables();
    if (!items.length) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

watch(
    () => route.fullPath,
    () => {
        drawerOpen.value = false;
    }
);

watch(drawerOpen, open => {
    if (import.meta.client) document.documentElement.style.overflow = open ? 'hidden' : '';
});
</script>

<style scoped lang="scss">
.shell__skip {
    position: fixed;
    top: var(--cp-space-2);
    left: var(--cp-space-2);
    z-index: 100;
    padding: var(--cp-space-2) var(--cp-space-3);
    color: var(--cp-text);
    background: var(--cp-surface);
    border: 1px solid var(--cp-line-strong);
    border-radius: var(--cp-radius-sm);
    transform: translateY(-200%);

    &:focus {
        transform: none;
    }
}

.shell__rail {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 20;
    width: var(--cp-rail-width);
    border-right: 1px solid var(--cp-rail-line);
}

.shell__topbar {
    display: none;
}

.shell__main {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    padding: var(--cp-space-8) var(--cp-space-10) 0 calc(var(--cp-rail-width) + var(--cp-space-10));
}

.shell__content,
.shell__footer {
    width: 100%;
    max-width: var(--cp-content-width);
    margin: 0 auto;
}

.shell__content {
    flex: 1;
    outline: none;
}

.shell__drawer-layer {
    position: fixed;
    inset: 0;
    z-index: 50;
}

.shell__backdrop {
    position: absolute;
    inset: 0;
    background: var(--el-overlay-color-lighter);
}

.shell__drawer {
    position: absolute;
    inset: 0 auto 0 0;
    width: min(var(--cp-rail-width), 86vw);
    box-shadow: var(--el-box-shadow-dark);
}

.shell__close {
    position: absolute;
    top: 16px;
    right: 12px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: var(--cp-rail-muted);
    background: transparent;
    border: 0;
    border-radius: var(--cp-radius-sm);
    cursor: pointer;

    &:hover {
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-hover);
    }
}

.shell-drawer-enter-active,
.shell-drawer-leave-active {
    transition: opacity var(--cp-duration-slide) var(--cp-ease);

    .shell__drawer {
        transition: transform var(--cp-duration-slide) var(--cp-ease);
    }
}

.shell-drawer-enter-from,
.shell-drawer-leave-to {
    opacity: 0;

    .shell__drawer {
        transform: translateX(-100%);
    }
}

@media (max-width: 1023px) {
    .shell__rail {
        display: none;
    }

    .shell__topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        align-items: center;
        gap: var(--cp-space-3);
        height: var(--cp-topbar-height);
        padding: 0 var(--cp-space-4);
        color: var(--cp-rail-fg-strong);
        background: var(--cp-rail-bg);
        border-bottom: 1px solid var(--cp-rail-line);
    }

    .shell__menu {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--cp-rail-fg-strong);
        background: transparent;
        border: 1px solid var(--cp-rail-line);
        border-radius: var(--cp-radius-sm);
        cursor: pointer;

        &:focus-visible {
            outline-color: var(--cp-rail-accent);
        }
    }

    .shell__wordmark {
        display: inline-flex;
        align-items: center;
        gap: var(--cp-space-2);
        font-weight: var(--cp-weight-strong);
        color: var(--cp-rail-fg-strong);

        &:hover {
            color: var(--cp-rail-fg-strong);
            text-decoration: none;
        }
    }

    .shell__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        font-family: var(--cp-font-mono);
        font-size: 11px;
        font-weight: var(--cp-weight-medium);
        color: var(--cp-rail-bg);
        background: var(--cp-rail-accent);
        border-radius: var(--cp-radius-sm);
    }

    .shell__main {
        min-height: calc(100vh - var(--cp-topbar-height));
        padding: var(--cp-space-6) var(--cp-space-6) 0;
    }
}

@media (max-width: 767px) {
    .shell__main {
        padding: var(--cp-space-5) var(--cp-space-4) 0;
    }
}
</style>
