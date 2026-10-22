/** False during SSR and the hydration pass; true once the client app is interactive. */
export function useHydrated() {
    const hydrated = ref(false);
    onMounted(() => {
        hydrated.value = true;
    });
    return hydrated;
}
