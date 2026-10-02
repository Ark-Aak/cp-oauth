import { onMounted, ref } from 'vue';

// First-party credentials require client-bound CSRF headers; never allow native SSR submission.
export function useHydrationReady() {
    const ready = ref(false);
    onMounted(() => {
        ready.value = true;
    });
    return ready;
}
