import type { LinkedAvatarSuggestion } from '~/utils/linked-avatar';
import { httpUrlSchema } from '~/utils/validation';

export function useLinkedAvatar() {
    const session = useSession();
    const pending = useState<
        (LinkedAvatarSuggestion & { userId: string; previousUrl: string | null }) | null
    >('cp-linked-avatar', () => null);

    function offer(suggestion: LinkedAvatarSuggestion) {
        const user = session.user.value;
        if (
            !user ||
            !httpUrlSchema.safeParse(suggestion.avatarUrl).success ||
            user.avatarUrl === suggestion.avatarUrl
        )
            return;
        pending.value = { ...suggestion, userId: user.id, previousUrl: user.avatarUrl };
    }

    return { pending, offer };
}
