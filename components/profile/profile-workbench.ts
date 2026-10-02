import { inject, onBeforeUnmount, type InjectionKey } from 'vue';

export const PROFILE_TASKS = [
    'basic',
    'bindings',
    'security',
    'authorized_apps',
    'public',
    'preferences'
] as const;
export type ProfileTask = (typeof PROFILE_TASKS)[number];
export type ProfileRequestStatus = 'idle' | 'pending' | 'success' | 'error';

export interface ProfileTaskGuard {
    dirty?: () => boolean;
    pending?: () => boolean;
    beforeLeave?: () => Promise<void>;
}

export const PROFILE_TASK_GUARD: InjectionKey<(guard: ProfileTaskGuard) => () => void> =
    Symbol('profile-task-guard');

export function useProfileTaskGuard(guard: ProfileTaskGuard) {
    const register = inject(PROFILE_TASK_GUARD);
    const unregister = register?.(guard);
    onBeforeUnmount(() => unregister?.());
}

export function profileError(cause: unknown, fallback: string): string {
    const failure = cause as {
        data?: { message?: string; statusMessage?: string };
        statusMessage?: string;
    } | null;
    return (
        failure?.data?.message || failure?.data?.statusMessage || failure?.statusMessage || fallback
    );
}

export function profileFieldErrors(cause: unknown): Record<string, string> {
    const failure = cause as {
        data?: { data?: { fields?: Record<string, string> } };
    } | null;
    return failure?.data?.data?.fields || {};
}
