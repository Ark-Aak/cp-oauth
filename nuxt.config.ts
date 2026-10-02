const cdnUrl = process.env.NODE_ENV === 'production' ? process.env.NUXT_APP_CDN_URL || '' : '';
const locales = [
    { code: 'en' as const, name: 'English', file: 'en.json' },
    { code: 'zh' as const, name: '中文', file: 'zh.json' },
    { code: 'ja' as const, name: '日本語', file: 'ja.json' }
];
const i18nRoutePrefix = '/_i18n';

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
        locales,
        defaultLocale: 'en',
        langDir: 'locales/',
        strategy: 'no_prefix',
        serverRoutePrefix: i18nRoutePrefix
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
    hooks: {
        'nitro:init'(nitro) {
            if (nitro.options.dev) return;
            const messagesReplacement = nitro.options.replace.__I18N_SERVER_ROUTE__;
            if (typeof messagesReplacement !== 'string') {
                throw new Error('Expected a static i18n resource route from the i18n module');
            }
            const messagesPrefix = JSON.parse(messagesReplacement);
            const messagesRoute = `${i18nRoutePrefix}/:hash/:locale/messages.json`;
            nitro.hooks.hook('prerender:routes', routes => {
                for (const { code } of locales) {
                    routes.add(`${messagesPrefix}/${code}/messages.json`);
                }
            });
            nitro.hooks.hook('prerender:config', config => {
                // Only language resources are prerendered; application services stay runtime-only.
                config.srcDir = `${nitro.options.buildDir}/i18n-prerender`;
                config.scanDirs = [];
                config.renderer = undefined;
                config.handlers = nitro.options.handlers.filter(
                    handler => handler.route === messagesRoute
                );
                config.plugins = nitro.options.plugins.filter(plugin =>
                    plugin.replace(/\\/g, '/').includes('/@nuxtjs/i18n/')
                );
            });
        }
    },
    nitro: {
        prerender: { failOnError: true },
        externals: {
            external: ['@prisma/client', '.prisma/client']
        }
    }
});
