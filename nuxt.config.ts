const cdnUrl = process.env.NODE_ENV === 'production' ? process.env.NUXT_APP_CDN_URL || '' : '';

export default defineNuxtConfig({
    compatibilityDate: '2025-03-21',
    devtools: { enabled: true },
    ssr: true,
    app: {
        head: {
            title: 'CP OAuth'
        },
        cdnURL: cdnUrl
    },
    modules: [
        '@nuxt/eslint',
        '@nuxtjs/i18n',
        '@nuxtjs/color-mode',
        ['@element-plus/nuxt', { importStyle: false }]
    ],
    css: [
        'element-plus/dist/index.css',
        '@fontsource-variable/source-sans-3',
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
                'chart.js'
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
        jwtSecret: '',
        redisUrl: '',
        dataEncryptionKey: '',
        trustProxy: '',
        public: {
            appName: 'CP OAuth',
            siteOrigin: '',
            cloudflareAnalyticsToken: ''
        }
    },
    nitro: {
        externals: {
            external: ['@prisma/client', '.prisma/client']
        }
    }
});
