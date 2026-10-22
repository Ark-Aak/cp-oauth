const cdnUrl = process.env.NODE_ENV === 'production' ? process.env.NUXT_APP_CDN_URL || '' : '';
const localeNamespaces = [
    'common',
    'auth',
    'oauth',
    'account',
    'connections',
    'security',
    'developer',
    'admin',
    'public'
];
const localeFiles = (code: string) => localeNamespaces.map(name => `${code}/${name}.json`);
const locales = [
    { code: 'en' as const, language: 'en', name: 'English', files: localeFiles('en') },
    { code: 'zh' as const, language: 'zh-CN', name: '中文', files: localeFiles('zh') },
    { code: 'ja' as const, language: 'ja', name: '日本語', files: localeFiles('ja') }
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
        '~/assets/styles/vendor.css',
        '~/assets/styles/theme.scss',
        '~/assets/styles/tokens.scss',
        '~/assets/styles/base.scss',
        '~/assets/styles/element.scss'
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
        fallback: 'light',
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
                'rehype-sanitize',
                'rehype-stringify',
                'unist-util-visit',
                '@shikijs/rehype/core',
                'shiki/core',
                'shiki/engine/javascript',
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
