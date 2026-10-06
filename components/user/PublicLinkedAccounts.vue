<template>
    <ul class="public-accounts">
        <li
            v-for="(account, index) in accounts"
            :key="`${account.platform}:${account.platformUid}`"
            class="public-accounts__item"
        >
            <span class="public-accounts__platform">
                <AppPlatformIcon :platform="account.platform" />
                <span>{{ $t(PLATFORMS[account.platform].translationKey) }}</span>
            </span>
            <a
                v-if="profileUrls[index]"
                :href="profileUrls[index]!"
                target="_blank"
                rel="noopener noreferrer"
                class="public-accounts__identity"
            >
                <span class="public-accounts__identity-label">
                    {{ account.platformUsername || account.platformUid }}
                </span>
                <ExternalLink :size="12" :stroke-width="1.5" aria-hidden="true" />
            </a>
            <span v-else class="public-accounts__identity">
                <span class="public-accounts__identity-label">
                    {{ account.platformUsername || account.platformUid }}
                </span>
            </span>
        </li>
    </ul>
</template>

<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next';
import { PLATFORMS } from '~/utils/platforms';
import type { PublicLinkedAccount } from '~/types/api';

const props = defineProps<{ accounts: PublicLinkedAccount[] }>();
const profileUrls = computed(() => props.accounts.map(getProfileUrl));

function getProfileUrl(account: PublicLinkedAccount): string | null {
    const uid = encodeURIComponent(account.platformUid);
    const username = account.platformUsername ? encodeURIComponent(account.platformUsername) : null;
    switch (account.platform) {
        case 'luogu':
            return /^\d+$/.test(account.platformUid)
                ? `https://www.luogu.com.cn/user/${uid}`
                : null;
        case 'codeforces':
            return username ? `https://codeforces.com/profile/${username}` : null;
        case 'atcoder':
            return `https://atcoder.jp/users/${uid}`;
        case 'leetcode':
            return `https://leetcode.cn/u/${uid}/`;
        case 'github':
            return username ? `https://github.com/${username}` : null;
        case 'clist':
            return username ? `https://clist.by/coder/${username}/` : null;
        default:
            return null;
    }
}
</script>

<style scoped lang="scss">
.public-accounts {
    list-style: none;
    margin: 0;
    padding: 0;

    &__item {
        display: grid;
        grid-template-columns: minmax(0, auto) minmax(0, 1fr);
        align-items: center;
        gap: var(--space-2) var(--space-4);
        min-width: 0;
        min-height: 52px;
        padding: var(--space-1) 0;
        border-bottom: 1px solid var(--card-border);

        &:last-child {
            border-bottom: 0;
        }
    }

    &__platform,
    &__identity {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        overflow-wrap: anywhere;
    }

    &__platform {
        color: var(--text-secondary);
        font-size: var(--font-size-control);
    }

    &__platform span,
    &__identity-label {
        min-width: 0;
        overflow-wrap: anywhere;
    }

    &__identity {
        justify-self: end;
        max-width: 100%;
        min-width: 44px;
        min-height: 44px;
        padding: var(--space-1) 0;

        svg {
            flex-shrink: 0;
        }
    }

    a {
        color: var(--accent);

        &:hover {
            text-decoration: underline;
        }
    }
}

@media (max-width: 479px) {
    .public-accounts {
        &__item {
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
        }

        &__identity {
            justify-self: start;
        }
    }
}
</style>
