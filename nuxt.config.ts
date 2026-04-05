export default defineNuxtConfig({
    compatibilityDate: '2025-03-21',
    devtools: { enabled: true },
    ssr: true,
    app: {
        head: {
            title: 'CP OAuth'
        },
        cdnURL:
            process.env.NODE_ENV === 'production'
                ? process.env.NUXT_APP_CDN_URL || process.env.CDN_URL || ''
                : ''
    },
    modules: [
        '@nuxt/eslint',
        '@pinia/nuxt',
        '@nuxtjs/i18n',
        '@nuxtjs/color-mode',
        ['@element-plus/nuxt', { importStyle: false }]
    ],
    css: [
        'element-plus/dist/index.css',
        '~/assets/scss/main.scss',
        '~/assets/scss/element-overrides.scss'
    ],
    i18n: {
        locales: [
            { code: 'en', name: 'English', file: 'en.json' },
            { code: 'zh', name: '中文', file: 'zh.json' },
            { code: 'ja', name: '日本語', file: 'ja.json' }
        ],
        defaultLocale: 'en',
        langDir: 'locales/',
        strategy: 'no_prefix'
    },
    colorMode: {
        preference: 'system',
        fallback: 'dark',
        classSuffix: '',
        storageKey: 'cp-oauth-color-mode'
    },
    vite: {
        optimizeDeps: {
            include: [
                'dayjs',
                'dayjs/plugin/*.js',
                'lodash-unified',
                '@vue/devtools-core',
                '@vue/devtools-kit',
                'lucide-vue-next',
                'unified',
                'remark-parse',
                'remark-gfm',
                'remark-rehype',
                'rehype-stringify',
                '@shikijs/rehype',
                '@element-plus/icons-vue',
                'chart.js',
                'chart.js/auto'
            ]
        },
        css: {
            preprocessorOptions: {
                scss: {
                    additionalData: ''
                }
            }
        }
    },
    runtimeConfig: {
        jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
        databaseUrl: process.env.DATABASE_URL || '',
        redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
        public: {
            appName: 'CP OAuth'
        }
    },
    nitro: {
        externals: {
            external: ['@prisma/client', '.prisma/client']
        },
        prerender: {
            routes: ['/about']
        }
    },
    routeRules: {
        '/about': { prerender: true }
    }
});
