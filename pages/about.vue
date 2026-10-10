<template>
    <article class="about">
        <AppPageHeader :title="$t('about.title')" :description="$t('about.guide_intro')">
            <template #actions>
                <NuxtLink to="/developer" class="about__action el-button el-button--primary">
                    {{ $t('about.create.action') }}
                </NuxtLink>
            </template>
        </AppPageHeader>

        <nav class="about__contents ui-card" :aria-label="$t('about.contents')">
            <h2>{{ $t('about.contents') }}</h2>
            <ol>
                <li>
                    <a href="#create">{{ $t('about.create.title') }}</a>
                </li>
                <li>
                    <a href="#flow">{{ $t('about.flow.title') }}</a>
                </li>
                <li>
                    <a href="#pkce">{{ $t('about.pkce.title') }}</a>
                </li>
                <li>
                    <a href="#credentials">{{ $t('about.credentials.title') }}</a>
                </li>
                <li>
                    <a href="#endpoints">{{ $t('about.endpoints.title') }}</a>
                </li>
                <li>
                    <a href="#scopes">{{ $t('about.scopes.title') }}</a>
                </li>
                <li>
                    <a href="#card">{{ $t('about.card.title') }}</a>
                </li>
            </ol>
        </nav>

        <section id="create" class="about__section" aria-labelledby="create-heading">
            <h2 id="create-heading">{{ $t('about.create.title') }}</h2>
            <p class="about__text">{{ $t('about.create.description') }}</p>
        </section>

        <section id="flow" class="about__section" aria-labelledby="flow-heading">
            <h2 id="flow-heading">{{ $t('about.flow.title') }}</h2>
            <p class="about__text">{{ $t('about.intro') }}</p>
            <ol class="about__steps">
                <li>{{ $t('about.flow.step1') }}</li>
                <li>{{ $t('about.flow.step2') }}</li>
                <li>{{ $t('about.flow.step3') }}</li>
                <li>{{ $t('about.flow.step4') }}</li>
                <li>{{ $t('about.flow.step5') }}</li>
                <li>{{ $t('about.flow.step6') }}</li>
            </ol>
            <p class="about__text">{{ $t('about.protocol_note') }}</p>
            <p class="about__text">
                {{ $t('about.metadata') }}
                <a
                    :href="`${oauthOrigin}/.well-known/oauth-authorization-server`"
                    class="about__metadata-link"
                >
                    <code>/.well-known/oauth-authorization-server</code>
                </a>
            </p>
            <p class="about__text">
                {{ $t('about.metadata_compatibility') }}
                <a
                    :href="`${oauthOrigin}/.well-known/openid-configuration`"
                    class="about__metadata-link"
                >
                    <code>/.well-known/openid-configuration</code>
                </a>
            </p>
            <p class="about__text about__boundary">{{ $t('about.cookie_boundary') }}</p>
        </section>

        <AppAsyncState
            v-if="snippetError"
            :pending="snippetStatus === 'pending'"
            :error="$t('markdown.render_error')"
            @retry="retrySnippets()"
        />
        <p v-else-if="snippetStatus === 'pending'" role="status" class="about__text">
            {{ $t('user.loading') }}
        </p>

        <section id="pkce" class="about__section" aria-labelledby="pkce-heading">
            <h2 id="pkce-heading">{{ $t('about.pkce.title') }}</h2>
            <p class="about__text">{{ $t('about.pkce.description') }}</p>
            <p class="about__text">{{ $t('about.pkce.verifier_rules') }}</p>
            <p class="about__text">{{ $t('about.pkce.grant_rule') }}</p>
            <div class="about__code">
                <div v-if="snippetStatus === 'success'" v-html="snippets?.pkce" />
                <pre v-else class="about__source"><code>{{ snippetSources.pkce }}</code></pre>
            </div>
            <h3>{{ $t('about.pkce.exchange_title') }}</h3>
            <div class="about__code">
                <div v-if="snippetStatus === 'success'" v-html="snippets?.publicToken" />
                <pre
                    v-else
                    class="about__source"
                ><code>{{ snippetSources.publicToken }}</code></pre>
            </div>
        </section>

        <section id="credentials" class="about__section" aria-labelledby="credentials-heading">
            <h2 id="credentials-heading">{{ $t('about.credentials.title') }}</h2>
            <p class="about__text">{{ $t('about.credentials.description') }}</p>
            <p class="about__text">{{ $t('about.credentials.grant_rule') }}</p>
            <div class="about__code">
                <div v-if="snippetStatus === 'success'" v-html="snippets?.token" />
                <pre v-else class="about__source"><code>{{ snippetSources.token }}</code></pre>
            </div>
        </section>

        <section id="endpoints" class="about__section" aria-labelledby="endpoints-heading">
            <h2 id="endpoints-heading">{{ $t('about.endpoints.title') }}</h2>

            <div class="about__endpoint">
                <h3><code>GET /oauth/authorize</code></h3>
                <p class="about__text">{{ $t('about.endpoints.authorize_desc') }}</p>
                <div class="about__code">
                    <div v-if="snippetStatus === 'success'" v-html="snippets?.authorize" />
                    <pre
                        v-else
                        class="about__source"
                    ><code>{{ snippetSources.authorize }}</code></pre>
                </div>
            </div>

            <div class="about__endpoint">
                <h3><code>POST /api/oauth/token</code> — {{ $t('about.refresh_title') }}</h3>
                <p class="about__text">{{ $t('about.endpoints.token_desc') }}</p>
                <p class="about__text">{{ $t('about.endpoints.token_lifetime') }}</p>
                <div class="about__code">
                    <div v-if="snippetStatus === 'success'" v-html="snippets?.refresh" />
                    <pre
                        v-else
                        class="about__source"
                    ><code>{{ snippetSources.refresh }}</code></pre>
                </div>
            </div>

            <div class="about__endpoint">
                <h3><code>GET /api/oauth/userinfo</code></h3>
                <p class="about__text">{{ $t('about.endpoints.userinfo_desc') }}</p>
                <div class="about__code">
                    <div v-if="snippetStatus === 'success'" v-html="snippets?.userinfo" />
                    <pre
                        v-else
                        class="about__source"
                    ><code>{{ snippetSources.userinfo }}</code></pre>
                </div>
            </div>

            <div class="about__endpoint">
                <h3><code>POST /api/oauth/revoke</code></h3>
                <p class="about__text">{{ $t('about.endpoints.revoke_desc') }}</p>
                <div class="about__code">
                    <div v-if="snippetStatus === 'success'" v-html="snippets?.revoke" />
                    <pre v-else class="about__source"><code>{{ snippetSources.revoke }}</code></pre>
                </div>
            </div>
        </section>

        <section id="scopes" class="about__section" aria-labelledby="scopes-heading">
            <h2 id="scopes-heading">{{ $t('about.scopes.title') }}</h2>
            <p class="about__text">{{ $t('about.scopes.description') }}</p>
            <div
                class="about__scope-table"
                tabindex="0"
                role="region"
                :aria-label="$t('about.scopes.title')"
            >
                <table>
                    <thead>
                        <tr>
                            <th scope="col">{{ $t('about.scopes.scope_col') }}</th>
                            <th scope="col">{{ $t('about.scopes.data_col') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in scopeData" :key="row.scope">
                            <th scope="row">
                                <code>{{ row.scope }}</code>
                            </th>
                            <td>{{ row.data }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <section id="card" class="about__section" aria-labelledby="card-heading">
            <h2 id="card-heading">{{ $t('about.card.title') }}</h2>
            <p class="about__text">{{ $t('about.card.description') }}</p>
            <p class="about__text">
                <strong>{{ $t('about.card.endpoint') }}</strong>
                <code>GET /api/users/{username}/card.svg</code>
            </p>
            <p class="about__text">{{ $t('about.card.params') }}</p>
            <h3>{{ $t('about.card.example') }}</h3>
            <div class="about__code">
                <div v-if="snippetStatus === 'success'" v-html="snippets?.card" />
                <pre v-else class="about__source"><code>{{ snippetSources.card }}</code></pre>
            </div>
        </section>
    </article>
</template>

<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown';
import { SCOPES } from '~/utils/oauth-scopes';

const { t } = useI18n();
const oauthOrigin = new URL(useRuntimeConfig().public.siteOrigin).origin;

useHead({
    title: () => `${t('about.title')} - CP OAuth`,
    link: [{ rel: 'canonical', href: `${oauthOrigin}/about` }]
});

const scopeData = computed(() =>
    Object.keys(SCOPES).map(scope => ({
        scope,
        data: t(`about.scopes.${scope.replace(':', '_')}`)
    }))
);

const authorizeSnippet = `\`\`\`http
GET ${oauthOrigin}/oauth/authorize?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=openid%20profile
  &state=random_state_string
  &code_challenge=BASE64URL_SHA256_HASH
  &code_challenge_method=S256
\`\`\``;

const tokenSnippet = `\`\`\`javascript
// Secret-authenticated applications: run this on your server, never expose the secret in a browser.
const response = await fetch('${oauthOrigin}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'https://yourapp.com/callback',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    code_verifier: 'YOUR_CODE_VERIFIER' // required if the authorization request used PKCE
    // Only a secret-authenticated grant requested without PKCE can omit code_verifier.
  })
})

const {
  access_token,   // JWT, expires in 1 hour
  refresh_token,  // opaque, expires in 30 days
  token_type,
  expires_in,
  scope
} = await response.json()
\`\`\``;

const publicTokenSnippet = `\`\`\`javascript
// Exchange a PKCE authorization code; do not send client_secret (not even an empty value).
const response = await fetch('${oauthOrigin}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'https://yourapp.com/callback',
    client_id: 'YOUR_CLIENT_ID',
    code_verifier: codeVerifier
  })
})
const { access_token, refresh_token, expires_in, scope } = await response.json()
// This grant's refresh and revoke requests also omit client_secret.
\`\`\``;

const refreshSnippet = `\`\`\`javascript
// Authentication follows the original grant, not a guessed client type.
const response = await fetch('${oauthOrigin}/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'refresh_token',
    refresh_token: 'YOUR_REFRESH_TOKEN',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET' // omit only when the original PKCE exchange omitted it
  })
})

// Returns new access_token + new refresh_token (rotation)
const { access_token, refresh_token, expires_in } = await response.json()
\`\`\``;

const userinfoSnippet = `\`\`\`javascript
// Fetch user data with access token
const userinfo = await fetch('${oauthOrigin}/api/oauth/userinfo', {
  headers: { Authorization: 'Bearer {access_token}' }
})

const data = await userinfo.json()
// Response varies based on granted scopes:
// {
//   sub,
//   username,
//   display_name,
//   avatar_url,
//   bio,
//   email,
//   email_verified,
//   linked_accounts,
//   cp_summary,
//   cp_details
// }
\`\`\``;

const pkceSnippet = `\`\`\`javascript
// 32 random bytes give a 43-character base64url verifier.
const verifierBytes = crypto.getRandomValues(new Uint8Array(32))
const codeVerifier = btoa(String.fromCharCode(...verifierBytes))
  .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')
const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier))
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '')

// Keep state and verifier securely for the same-browser callback; validate state there.
const authorizationUrl = new URL('${oauthOrigin}/oauth/authorize')
authorizationUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: 'YOUR_CLIENT_ID',
  redirect_uri: 'https://yourapp.com/callback',
  scope: 'openid profile',
  state: crypto.randomUUID(),
  code_challenge: codeChallenge,
  code_challenge_method: 'S256'
}).toString()
// Exchange the returned code with code_verifier: codeVerifier.
// Omit client_secret entirely for a public grant; its refresh/revoke also need no secret.
// An empty or incorrect client_secret is never accepted, even with valid PKCE.
\`\`\``;

const cardSnippet = `\`\`\`markdown
![CP OAuth Profile](${oauthOrigin}/api/users/YOUR_USERNAME/card.svg)

<!-- Dark theme -->
![CP OAuth Profile](${oauthOrigin}/api/users/YOUR_USERNAME/card.svg?theme=dark)

<!-- Custom width -->
![CP OAuth Profile](${oauthOrigin}/api/users/YOUR_USERNAME/card.svg?width=600&theme=dark)
\`\`\``;

const revokeSnippet = `\`\`\`javascript
// Revoke a token (RFC 7009)
await fetch('${oauthOrigin}/api/oauth/revoke', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET', // omit only for a grant originally exchanged without it
    token: 'TOKEN_TO_REVOKE',
    token_type_hint: 'refresh_token' // or 'access_token'
  })
})
// Validly authenticated requests return 200 even for an unknown or already revoked token.
// JSON and application/x-www-form-urlencoded are supported; Basic authentication is not.
\`\`\``;

const snippetSources = {
    authorize: authorizeSnippet,
    token: tokenSnippet,
    publicToken: publicTokenSnippet,
    refresh: refreshSnippet,
    userinfo: userinfoSnippet,
    pkce: pkceSnippet,
    card: cardSnippet,
    revoke: revokeSnippet
};
type SnippetName = keyof typeof snippetSources;

const {
    data: snippets,
    error: snippetError,
    status: snippetStatus,
    refresh: retrySnippets
} = await useAsyncData('about:markdown', async () => {
    const entries = await Promise.all(
        Object.entries(snippetSources).map(async ([name, source]) => [
            name,
            (await renderMarkdown(source)).replace(/<pre\b/g, '<pre tabindex="0"')
        ])
    );
    return Object.fromEntries(entries) as Record<SnippetName, string>;
});
</script>

<style scoped lang="scss">
.about {
    min-width: 0;
    max-width: 880px;
    font-size: var(--font-size-body);

    &__contents {
        margin-bottom: 0;
        padding: var(--panel-padding);
        font-size: var(--font-size-control);

        ol {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0 var(--space-5);
            margin: var(--space-3) 0 0;
            padding-left: var(--space-5);
        }

        li {
            min-width: 0;
            color: var(--text-muted);
        }

        a {
            display: flex;
            align-items: center;
            min-height: 44px;
            min-width: 44px;
            padding: var(--space-2) var(--space-1);
            color: var(--accent);
            overflow-wrap: anywhere;
        }
    }

    &__section {
        min-width: 0;
        padding: var(--space-5) 0;
        border-bottom: 1px solid var(--border-color);
        scroll-margin-top: 80px;

        &:last-child {
            border-bottom: 0;
        }

        h2,
        h3 {
            margin-bottom: var(--space-3);
            overflow-wrap: anywhere;
        }

        > :last-child {
            margin-bottom: 0;
        }
    }

    &__text {
        color: var(--text-secondary);
        margin-bottom: var(--space-3);
        overflow-wrap: anywhere;
    }

    &__boundary {
        padding-left: var(--space-4);
        border-left: 2px solid var(--border-color);
    }

    &__metadata-link {
        display: inline-flex;
        align-items: center;
        min-width: 44px;
        min-height: 44px;
        max-width: 100%;

        code {
            min-width: 0;
            overflow-wrap: anywhere;
        }
    }

    &__steps {
        padding-left: var(--space-5);
        margin: 0 0 var(--space-4);
        color: var(--text-secondary);

        li + li {
            margin-top: var(--space-2);
        }
    }

    &__action {
        max-width: 100%;
        min-width: 44px;
        white-space: normal;
        min-height: 44px;
        height: auto;
        text-align: center;
    }

    &__endpoint + &__endpoint {
        margin-top: var(--space-5);
    }

    &__source {
        padding: var(--space-4);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
    }

    &__code {
        min-width: 0;
        margin-bottom: var(--space-4);

        :deep(pre) {
            max-width: 100%;
            border: 1px solid var(--border-color);
            border-radius: var(--card-radius);
            padding: var(--space-4);
            overflow-x: auto;
            margin: 0;
            font-size: var(--font-size-control);
            line-height: 1.6;
        }

        :deep(code) {
            font-size: var(--font-size-control);
        }
    }

    &__scope-table {
        max-width: 100%;
        overflow-x: auto;

        table {
            width: 100%;
            border-collapse: collapse;
            font-size: var(--font-size-control);
        }

        th,
        td {
            padding: var(--space-3);
            text-align: left;
            vertical-align: top;
            border-bottom: 1px solid var(--border-color);
            overflow-wrap: anywhere;
        }

        th:first-child {
            width: 144px;
            white-space: nowrap;
        }

        th {
            font-weight: 600;
        }

        td {
            color: var(--text-secondary);
        }

        code {
            white-space: nowrap;
        }
    }
}

@media (max-width: 767px) {
    .about__contents ol {
        column-gap: var(--space-4);
    }
}

@media (max-width: 479px) {
    .about__contents ol {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
