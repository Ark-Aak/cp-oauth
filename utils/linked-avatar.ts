import { httpUrlSchema } from './validation';

export interface LinkedAvatarSuggestion {
    provider: 'luogu' | 'github';
    avatarUrl: string;
}

/** Offer only avatars from a successfully linked identity; never invent GitHub URLs. */
export function linkedAvatarSuggestion(
    provider: string,
    platformUid: string,
    avatarUrl?: string | null
): LinkedAvatarSuggestion | null {
    if (provider === 'luogu' && /^\d{1,20}$/.test(platformUid)) {
        return {
            provider,
            avatarUrl: `https://cdn.luogu.com.cn/upload/usericon/${platformUid}.png`
        };
    }
    if (provider === 'github' && avatarUrl && httpUrlSchema.safeParse(avatarUrl).success) {
        return { provider, avatarUrl };
    }
    return null;
}
