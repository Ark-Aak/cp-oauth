interface HitokotoResponse {
    hitokoto?: string;
    from?: string;
    from_who?: string | null;
}

export default defineEventHandler(async () => {
    try {
        const data = await $fetch<HitokotoResponse>('https://v1.hitokoto.cn/?encode=json', {
            timeout: 5000,
            retry: 0
        });

        if (!data.hitokoto) {
            throw new Error('Invalid hitokoto response');
        }

        return {
            text: data.hitokoto,
            source: data.from || 'Hitokoto',
            fromWho: data.from_who || null
        };
    } catch {
        return {
            text: 'Competitive programming is not only about solving problems, but expanding the boundaries of thought.',
            source: 'CP OAuth',
            fromWho: null
        };
    }
});
