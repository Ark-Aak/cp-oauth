import prettierConfig from 'eslint-config-prettier';
import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(prettierConfig, {
    rules: {
        'vue/no-v-html': 'off'
    }
});
