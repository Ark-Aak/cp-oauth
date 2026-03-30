<template>
    <div class="about">
        <h1 class="about__title">{{ $t('about.title') }}</h1>
        <p class="about__intro">{{ $t('about.intro') }}</p>

        <!-- OAuth2 Flow -->
        <el-card shadow="never" class="about__card">
            <template #header>
                <span class="about__card-title">{{ $t('about.flow.title') }}</span>
            </template>
            <p class="about__text">{{ $t('about.flow.description') }}</p>
            <ol class="about__steps">
                <li>{{ $t('about.flow.step1') }}</li>
                <li>{{ $t('about.flow.step2') }}</li>
                <li>{{ $t('about.flow.step3') }}</li>
                <li>{{ $t('about.flow.step4') }}</li>
                <li>{{ $t('about.flow.step5') }}</li>
            </ol>
        </el-card>

        <!-- Endpoints -->
        <el-card shadow="never" class="about__card">
            <template #header>
                <span class="about__card-title">{{ $t('about.endpoints.title') }}</span>
            </template>

            <div class="about__endpoint">
                <h3>GET /api/oauth/authorize</h3>
                <p class="about__text">{{ $t('about.endpoints.authorize_desc') }}</p>
                <div class="about__code" v-html="snippets.authorize" />
            </div>

            <el-divider />

            <div class="about__endpoint">
                <h3>POST /api/oauth/token</h3>
                <p class="about__text">{{ $t('about.endpoints.token_desc') }}</p>
                <div class="about__code" v-html="snippets.token" />
            </div>

            <el-divider />

            <div class="about__endpoint">
                <h3>GET /api/oauth/userinfo</h3>
                <p class="about__text">{{ $t('about.endpoints.userinfo_desc') }}</p>
                <div class="about__code" v-html="snippets.userinfo" />
            </div>
        </el-card>

        <!-- Scopes -->
        <el-card shadow="never" class="about__card">
            <template #header>
                <span class="about__card-title">{{ $t('about.scopes.title') }}</span>
            </template>
            <p class="about__text">{{ $t('about.scopes.description') }}</p>
            <el-table :data="scopeData" stripe class="about__scope-table">
                <el-table-column prop="scope" :label="$t('about.scopes.scope_col')" width="160">
                    <template #default="{ row }">
                        <code>{{ row.scope }}</code>
                    </template>
                </el-table-column>
                <el-table-column prop="data" :label="$t('about.scopes.data_col')" />
            </el-table>
        </el-card>

        <!-- PKCE -->
        <el-card shadow="never" class="about__card">
            <template #header>
                <span class="about__card-title">{{ $t('about.pkce.title') }}</span>
            </template>
            <p class="about__text">{{ $t('about.pkce.description') }}</p>
            <div class="about__code" v-html="snippets.pkce" />
        </el-card>
    </div>
</template>

<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown';

const { t } = useI18n();

useHead({ title: () => `${t('about.title')} - CP OAuth` });
const colorMode = useColorMode();
const currentTheme = computed(() => (colorMode.value === 'dark' ? 'dark' : 'light'));

const scopeData = computed(() => [
    { scope: 'openid', data: t('about.scopes.openid') },
    { scope: 'profile', data: t('about.scopes.profile') },
    { scope: 'email', data: t('about.scopes.email') },
    { scope: 'cp:linked', data: t('about.scopes.cp_linked') },
    { scope: 'link:luogu', data: t('about.scopes.link_luogu') },
    { scope: 'link:atcoder', data: t('about.scopes.link_atcoder') },
    { scope: 'link:codeforces', data: t('about.scopes.link_codeforces') },
    { scope: 'link:github', data: t('about.scopes.link_github') },
    { scope: 'link:google', data: t('about.scopes.link_google') },
    { scope: 'cp:summary', data: t('about.scopes.cp_summary') },
    { scope: 'cp:details', data: t('about.scopes.cp_details') }
]);

const authorizeSnippet = `\`\`\`http
GET /oauth/authorize?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=openid profile
  &state=random_state_string
  &code_challenge=BASE64URL_SHA256_HASH
  &code_challenge_method=S256
\`\`\``;

const tokenSnippet = `\`\`\`javascript
// Exchange authorization code for access token
const response = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'https://yourapp.com/callback',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    // Or for PKCE:
    // code_verifier: 'YOUR_CODE_VERIFIER'
  })
})

const { access_token, token_type, expires_in, scope } = await response.json()
\`\`\``;

const userinfoSnippet = `\`\`\`javascript
// Fetch user data with access token
const userinfo = await fetch('/api/oauth/userinfo', {
  headers: { Authorization: 'Bearer {access_token}' }
})

const data = await userinfo.json()
// Response varies based on granted scopes:
// { sub, username, display_name, avatar_url, bio, cp_summary, cp_details }
\`\`\``;

const pkceSnippet = `\`\`\`javascript
// Generate PKCE code verifier and challenge
const codeVerifier = generateRandomString(128)
const encoder = new TextEncoder()
const data = encoder.encode(codeVerifier)
const digest = await crypto.subtle.digest('SHA-256', data)
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')

// Include in authorization request:
// code_challenge=codeChallenge
// code_challenge_method=S256

// Include in token request:
// code_verifier=codeVerifier (instead of client_secret)
\`\`\``;

const snippets = reactive({
    authorize: '',
    token: '',
    userinfo: '',
    pkce: ''
});

async function renderAll() {
    const theme = currentTheme.value;
    const [a, tok, u, p] = await Promise.all([
        renderMarkdown(authorizeSnippet, theme),
        renderMarkdown(tokenSnippet, theme),
        renderMarkdown(userinfoSnippet, theme),
        renderMarkdown(pkceSnippet, theme)
    ]);
    snippets.authorize = a;
    snippets.token = tok;
    snippets.userinfo = u;
    snippets.pkce = p;
}

watch(currentTheme, renderAll);
await renderAll();
</script>

<style scoped lang="scss">
.about {
    max-width: 720px;

    &__title {
        font-size: 22px;
        font-weight: 600;
        margin-bottom: 6px;
        color: var(--text-primary);
        letter-spacing: -0.02em;
    }

    &__intro {
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 28px;
        line-height: 1.7;
    }

    &__card {
        margin-bottom: 20px;
        border: 1px solid var(--border-color);
    }

    &__card-title {
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
    }

    &__text {
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.7;
        margin-bottom: 12px;
    }

    &__steps {
        padding-left: 18px;
        margin-bottom: 4px;

        li {
            font-size: 13px;
            color: var(--text-secondary);
            line-height: 1.8;
            padding-left: 4px;
        }
    }

    &__endpoint {
        h3 {
            font-size: 13px;
            font-weight: 600;
            color: var(--text-primary);
            font-family: monospace;
            margin-bottom: 6px;
        }
    }

    &__code {
        margin-bottom: 4px;

        :deep(pre) {
            border: 1px solid var(--border-color);
            border-radius: 6px;
            overflow-x: auto;
            margin: 0;
        }

        :deep(.shiki) {
            padding: 12px 14px;
            border-radius: 6px;
            overflow-x: auto;
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12px;
            line-height: 1.6;
        }

        :deep(code) {
            font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
            font-size: 12px;
        }
    }

    &__scope-table {
        margin-top: 4px;

        code {
            font-family: monospace;
            font-size: 12px;
            color: var(--text-primary);
            background: var(--bg-tertiary);
            padding: 2px 5px;
            border-radius: 3px;
        }
    }
}
</style>
