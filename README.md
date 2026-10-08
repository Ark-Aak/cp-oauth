# CP OAuth

CP OAuth is an OAuth 2.0 provider built for competitive programming platforms. Users can register, link their competitive programming accounts (Luogu, AtCoder, Codeforces, Clist, etc.), and authorize third-party applications via standard OAuth 2.0 flows with PKCE support.

## Tech Stack

- **Runtime**: Node.js 22, Python 3.11
- **Framework**: Nuxt 4 (SSR) with Nitro server engine
- **Database**: PostgreSQL 16 (via Prisma ORM)
- **Cache**: Redis 7 (via ioredis)
- **UI**: Element Plus, Lucide icons, SCSS; locally bundled Lato and Fira Code fonts
- **Auth**: HttpOnly Redis-backed sessions, bcryptjs, TOTP 2FA, WebAuthn; JWT for external OAuth access tokens
- **i18n**: English, Chinese, Japanese

## Prerequisites

- **Node.js** 22 (`>=22 <23`)
- **Python** 3.11 recommended (required for the fixed-host Clist adapter)
- **PostgreSQL** >= 16
- **Redis** >= 7
- **npm** (comes with Node.js)

## Installation

### 1. Clone and install Node.js dependencies

```bash
git clone <repo-url> cp-oauth
cd cp-oauth
npm ci
```

### 2. Install Python dependencies

Use an isolated virtual environment and the exact dependency lock:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --only-binary=:all: --no-deps -r requirements.txt
export PYTHON_PATH="$PWD/.venv/bin/python"
```

On Windows use `.venv/Scripts/python.exe`. Docker includes `/opt/clist-venv` with `curl_cffi==0.13.0`; no Python sidecar is needed. The adapter accepts only HTTPS requests to `clist.by`, with bounded deadlines and response size.

### 3. Configure development environment

Copy `.env.example` to `.env`. Set both infrastructure passwords, the corresponding URL-encoded connection passwords, and the required runtime keys before starting services:

```env
POSTGRES_PASSWORD=<database-password>
REDIS_PASSWORD=<redis-password>
DATABASE_URL=postgresql://cpuser:<encoded-database-password>@localhost:5432/cpoauth
NUXT_REDIS_URL=redis://:<encoded-redis-password>@localhost:6379/0
NUXT_JWT_SECRET=<at-least-32-byte-secret>
NUXT_DATA_ENCRYPTION_KEY=<independent-32-byte-key-in-base64>
NUXT_PUBLIC_SITE_ORIGIN=http://localhost:3000
NUXT_TRUST_PROXY=false
```

Existing deployments must retain their OAuth JWT signing secret value when renaming it to `NUXT_JWT_SECRET`. The data encryption key must be independent and retained separately from database backups. Old `JWT_SECRET`, `REDIS_URL` and `PUBLIC_BASE_URL` names are not runtime fallbacks.

### 4. Start development infrastructure

```bash
docker compose up -d db redis
```

Compose is development infrastructure only. PostgreSQL and password-protected Redis bind to loopback; `POSTGRES_PORT` and `REDIS_PORT` select host ports.

### 5. Initialize database

For a **new development database**:

```bash
npx prisma generate
npx prisma migrate deploy
node --env-file=.env scripts/refactor-data.mjs --encrypt
node --env-file=.env scripts/refactor-data.mjs --check
```

The offline scripts never load `.env` implicitly; inject environment variables or explicitly select an env file as above. For an existing database, follow the cutover instructions below instead of applying a baseline over existing tables.

### 6. Start development server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Production Deployment

### Build

```bash
npm run build
```

`npm run build` regenerates Prisma Client from `prisma/schema.prisma` before compiling Nuxt into `.output`. It does not deploy database migrations, upload assets, or require production runtime keys. Asset upload remains an explicit operation after configuring the `S3_*` variables:

```bash
npm run upload:s3
```

The build emits `.output/public/_i18n/<build-hash>/{en,zh,ja}/messages.json` using a locale-only prerenderer. Application pages remain SSR; application startup checks are not disabled. For CDN/OSS deployment, set `NUXT_APP_CDN_URL` when building, upload the **entire** `.output/public` including `_i18n`, and deploy `.output/server` from the **same build**. An application-domain Nginx rule cannot repair missing files requested from a separate asset domain.

The locale-only build aborts if the i18n module does not provide a static language-resource route; a missing or callable replacement is not parsed or published as a resource URL.

Database migrations do not regenerate Prisma Client. Deploy the complete freshly built `.output`, including `.output/server/node_modules`, and restart application processes; generating only the project-root client after a build or retaining old server dependencies can leave the running client on the previous schema.

### Run

```bash
node .output/server/index.mjs
```

### Docker

```bash
docker build --target production -t cp-oauth:production .
docker build --target migration -t cp-oauth:migration .
docker run -p 3000:3000 \
  -e DATABASE_URL -e NUXT_REDIS_URL -e NUXT_JWT_SECRET \
  -e NUXT_DATA_ENCRYPTION_KEY -e NUXT_PUBLIC_SITE_ORIGIN -e NUXT_TRUST_PROXY \
  cp-oauth:production
```

All stages use Node 22 on Debian Bookworm. Production runs as non-root, includes the locked Python virtual environment and fixed-host helper, and checks `/api/readyz`. The migration image contains Prisma CLI and offline scripts. Migrate and initialize encryption before starting the web image; web startup never changes the schema. `/api/healthz` is liveness, `/api/readyz` checks PostgreSQL and Redis without exposing connection details.

## Common Commands

```bash
# Development and assets
npm run dev                       # Nuxt SSR development server
npm run build                     # Generate Prisma Client, then build production artifact
npm run preview                   # Preview production build
npm run upload:s3                 # Explicit S3-compatible asset upload
npm run upload:oss                # Existing alias of upload:s3

# Verification
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration           # Explicit isolated _test database and loopback HTTP server
npm run format                    # Format files; review changes before committing

# Tracked schema and offline operations (environment must be injected)
npx prisma generate
npx prisma migrate deploy
npm run data:refactor -- --check   # Read-only preflight; also the default mode
npm run data:refactor -- --encrypt # Explicit stopped-write encryption cutover
npm run maintenance:oauth         # Expired OAuth credentials only
```

## Environment Variables

| Variable                                 | Required | Description                                                          |
| ---------------------------------------- | -------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                           | Yes      | PostgreSQL connection string                                         |
| `NUXT_REDIS_URL`                         | Yes      | Redis/rediss URL; sessions and safety locks fail closed              |
| `NUXT_JWT_SECRET`                        | Yes      | At least 32 bytes; preserve the existing OAuth signing value         |
| `NUXT_DATA_ENCRYPTION_KEY`               | Yes      | Independent 32-byte key, base64 encoded; validates the stored canary |
| `NUXT_PUBLIC_SITE_ORIGIN`                | Yes      | Canonical HTTPS origin; HTTP allowed only for exact loopback hosts   |
| `NUXT_TRUST_PROXY`                       | No       | `false` unless forwarding IPs through an explicitly trusted proxy    |
| `NUXT_PUBLIC_CLOUDFLARE_ANALYTICS_TOKEN` | No       | Empty disables the analytics script                                  |
| `NUXT_APP_CDN_URL`                       | No       | CDN base URL for Nuxt `_nuxt` assets                                 |
| `PYTHON_PATH`                            | No       | Path to Python binary (default: `python`)                            |
| `S3_UPLOAD_ENABLED`                      | No       | Set `true` to upload static files to S3-compatible storage           |
| `S3_REGION`                              | No       | S3 region (required when upload is enabled)                          |
| `S3_BUCKET`                              | No       | S3 bucket name (required when upload is enabled)                     |
| `S3_ACCESS_KEY_ID`                       | No       | Access key ID (required when upload is enabled)                      |
| `S3_SECRET_ACCESS_KEY`                   | No       | Secret access key (required when upload is enabled)                  |
| `S3_ENDPOINT`                            | No       | Custom S3 endpoint (for OSS/COS/MinIO etc.)                          |
| `S3_SESSION_TOKEN`                       | No       | Optional temporary session token                                     |
| `S3_PREFIX`                              | No       | Remote prefix for uploaded files                                     |
| `S3_BUILD_DIR`                           | No       | Local static directory to upload (default `.output/public`)          |
| `S3_UPLOAD_CONCURRENCY`                  | No       | Upload concurrency (default `8`)                                     |
| `S3_FORCE_PATH_STYLE`                    | No       | Force path-style URLs (default auto-enabled when endpoint set)       |

> Backward compatibility: `OSS_*` environment variables are still supported as aliases.

## OAuth 2.0 API

### Authorization Code Flow

1. Redirect user to `/oauth/authorize` with `client_id`, `redirect_uri`, `scope`, and PKCE parameters.
2. User consents on the authorization page.
3. User is redirected back to your `redirect_uri` with an authorization `code`.
4. Exchange `code` for `access_token` and `refresh_token` via POST `/api/oauth/token`.
5. Use `access_token` to call `/api/oauth/userinfo`.
6. When the `access_token` expires, use the `refresh_token` to obtain a new one via POST `/api/oauth/token` with `grant_type=refresh_token`.

### Endpoints

| Endpoint              | Method | Description                                                        |
| --------------------- | ------ | ------------------------------------------------------------------ |
| `/oauth/authorize`    | GET    | Initiate authorization, redirect to consent page                   |
| `/api/oauth/token`    | POST   | Exchange authorization code for tokens, or refresh an access token |
| `/api/oauth/userinfo` | GET    | Get user profile (filtered by granted scopes)                      |
| `/api/oauth/revoke`   | POST   | Revoke an access token or refresh token (RFC 7009)                 |

### Scopes

| Scope             | Description                                                                        |
| ----------------- | ---------------------------------------------------------------------------------- |
| `openid`          | Identity scope: returns `sub` when requested; not required for other OAuth scopes. |
| `profile`         | Basic profile: `username`, `display_name`, `avatar_url`, `bio`.                    |
| `email`           | Email address and verification status.                                             |
| `cp:linked`       | All linked competitive programming accounts.                                       |
| `link:luogu`      | Linked Luogu account info.                                                         |
| `link:atcoder`    | Linked AtCoder account info.                                                       |
| `link:leetcode`   | Linked LeetCode account info.                                                      |
| `link:codeforces` | Linked Codeforces account info.                                                    |
| `link:github`     | Linked GitHub account info.                                                        |
| `link:google`     | Linked Google account info.                                                        |
| `link:clist`      | Linked Clist account info.                                                         |
| `cp:summary`      | Aggregated CP stats (rating, contests, ranking) from Clist.by.                     |
| `cp:details`      | At most 200 recent rated contest changes for matching linked accounts.             |

> **Note on `cp:summary` and `cp:details`:** These scopes require the user to have a linked Clist.by account. Data is only returned for platforms where the user's account on this site matches the one linked on Clist.by. If no Clist.by account is linked, the response will include `{ "available": false, "message": "..." }`.

This is an OAuth authorization server, not a complete OpenID Connect provider: no ID Token or JWKS is issued. `/.well-known/oauth-authorization-server` publishes the actual supported capabilities; the existing `/.well-known/openid-configuration` path serves the same OAuth metadata for existing integrations.

Registered callback URIs match exactly. Use HTTPS, or HTTP only on literal `localhost`, `127.0.0.1`, or `[::1]`; credentials and fragments are rejected. Existing unsafe callback data remains visible to its owner with a repair warning, but cannot receive a new authorization code. Token and revocation requests accept JSON and `application/x-www-form-urlencoded`, with `client_secret_post` or the grant-bound PKCE behavior below. Protocol failures use `{ error, error_description }`, and sensitive responses are not cached.

### Userinfo Response Format

`GET /api/oauth/userinfo` returns a JSON object filtered by the granted scopes. Below is the full response when all scopes are granted:

```jsonc
{
    // openid
    "sub": "a1b2c3d4-uuid",

    // profile
    "username": "tourist",
    "display_name": "Gennady Korotkevich",
    "avatar_url": "https://example.com/avatar.png",
    "bio": "Competitive programmer",

    // email
    "email": "user@example.com",
    "email_verified": true,

    // cp:linked (or individual link:* scopes)
    "linked_accounts": [
        { "platform": "codeforces", "platformUid": "tourist", "platformUsername": "tourist" },
        { "platform": "atcoder", "platformUid": "tourist", "platformUsername": "tourist" },
        { "platform": "luogu", "platformUid": "123456", "platformUsername": "tourist" }
    ],
    "link_scopes": ["link:codeforces", "link:atcoder"], // only present if individual link:* scopes are granted

    // cp:summary — requires Clist.by linked account
    "cp_summary": {
        "available": true,
        "accounts": [
            {
                "resource": "codeforces.com",
                "resource_name": "Codeforces",
                "handle": "tourist",
                "rating": 3800,
                "n_contests": 150,
                "resource_rank": 1,
                "last_activity": "2026-03-20T15:00:00"
            },
            {
                "resource": "atcoder.jp",
                "resource_name": "AtCoder",
                "handle": "tourist",
                "rating": 4229,
                "n_contests": 80,
                "resource_rank": 1,
                "last_activity": "2026-03-15T12:00:00"
            }
        ],
        "highest_rating": {
            "resource": "atcoder.jp",
            "resource_name": "AtCoder",
            "handle": "tourist",
            "rating": 4229
        },
        "total_contests": 230
    },
    // If Clist.by is not linked:
    // "cp_summary": { "available": false, "message": "Link a Clist.by account to enable CP stats" }

    // cp:details — requires Clist.by linked account
    "cp_details": {
        "available": true,
        "rating_history": [
            {
                "resource": "codeforces.com",
                "resource_name": "Codeforces",
                "contest_id": 2001,
                "event": "Codeforces Round #900 (Div. 1)",
                "date": "2026-03-15T15:35:00",
                "handle": "tourist",
                "place": 1,
                "score": 7000,
                "old_rating": 3780,
                "new_rating": 3800,
                "rating_change": 20
            },
            {
                "resource": "atcoder.jp/heuristic",
                "resource_name": "AtCoder Heuristic",
                "contest_id": 500,
                "event": "AtCoder Heuristic Contest 030",
                "date": "2026-03-10T12:00:00",
                "handle": "tourist",
                "place": 3,
                "score": 1500000,
                "old_rating": 2800,
                "new_rating": 2850,
                "rating_change": 50
            }
        ]
    }
    // If Clist.by is not linked:
    // "cp_details": { "available": false, "message": "Link a Clist.by account to enable CP details" }
}
```

**Notes:**

- AtCoder Heuristic Contests are automatically separated from regular AtCoder contests. Their `resource` is `"atcoder.jp/heuristic"` and `resource_name` is `"AtCoder Heuristic"`.
- `resource_name` is a human-readable display name mapped from the domain (e.g. `"codeforces.com"` → `"Codeforces"`).
- When Clist.by API is unreachable, `cp_summary` / `cp_details` return `{ "available": false, "message": "Failed to fetch data from Clist.by" }` instead of causing the entire request to fail.

### Token Exchange Example

```javascript
const response = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        grant_type: 'authorization_code',
        code: 'AUTHORIZATION_CODE',
        redirect_uri: 'https://yourapp.com/callback',
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET'
    })
});

const { access_token, refresh_token, token_type, expires_in, scope } = await response.json();
// access_token: JWT, expires in 1 hour
// refresh_token: opaque token, expires in 30 days
```

### Refresh Token Example

```javascript
const response = await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: 'YOUR_REFRESH_TOKEN',
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET' // omit only for grants initially exchanged with PKCE and no secret
    })
});

// Returns new access_token + new refresh_token (rotation)
const { access_token, refresh_token, expires_in } = await response.json();
```

> **Note:** Refresh token rotation is enforced — each refresh request invalidates the old refresh token and issues a new one.

A PKCE exchange without `client_secret` creates a public grant: refresh and revoke require `client_id` plus the token, but no secret. If a secret is supplied during the initial exchange, it must be correct and the resulting grant continues to require it. Existing stored grants retain their previous secret requirement after migration; public clients can authorize again to obtain the new public-grant behavior. Supplying an empty or wrong secret never downgrades a confidential grant.

### Token Revocation (RFC 7009)

```javascript
await fetch('/api/oauth/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        token: 'TOKEN_TO_REVOKE',
        client_id: 'YOUR_CLIENT_ID',
        client_secret: 'YOUR_CLIENT_SECRET', // omit only for the public grant described above
        token_type_hint: 'refresh_token' // or 'access_token'
    })
});
// Unknown tokens return 200; invalid client authentication is still rejected.
```

Revoking a refresh token also invalidates all access tokens issued to the same client and user. Users can also manage authorized applications and revoke access from their profile page.
Revocation is limited to the requesting client, and an incorrect type hint still checks the other token type. Revoking an application also deletes pending authorization codes, so an old unexchanged code cannot restore access. The authorized-app list includes only live access/refresh credentials and pending codes, with `pendingAuthorizationCodeCount` for the latter.

### PKCE Example (Public Clients)

```javascript
// Generate code_verifier and code_challenge
const codeVerifier = generateRandomString(128);
const data = new TextEncoder().encode(codeVerifier);
const digest = await crypto.subtle.digest('SHA-256', data);
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// Step 1: Include code_challenge in authorization request
// /oauth/authorize?code_challenge={codeChallenge}&code_challenge_method=S256

// Step 2: Include code_verifier in token request (replaces client_secret)
await fetch('/api/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        grant_type: 'authorization_code',
        code: 'AUTHORIZATION_CODE',
        redirect_uri: 'https://yourapp.com/callback',
        client_id: 'YOUR_CLIENT_ID',
        code_verifier: codeVerifier
    })
});
```

## User Profile Card

Generate an SVG card image showing a user's linked platform accounts. Useful for embedding in GitHub READMEs, blogs, or any place that supports images.

### Endpoint

```
GET /api/users/{username}/card.svg
```

### Parameters

| Parameter | Type   | Default | Description                    |
| --------- | ------ | ------- | ------------------------------ |
| `width`   | number | 480     | Card width in pixels (300-800) |
| `theme`   | string | `light` | Color theme: `light` or `dark` |
| `lang`    | string | `en`    | Language: `en`, `zh`, or `ja`  |

### Usage

**Markdown:**

```markdown
![CP OAuth Profile](https://www.cpoauth.com/api/users/YOUR_USERNAME/card.svg)
```

**Markdown (dark theme):**

```markdown
![CP OAuth Profile](https://www.cpoauth.com/api/users/YOUR_USERNAME/card.svg?theme=dark)
```

**HTML:**

```html
<img
    src="https://www.cpoauth.com/api/users/YOUR_USERNAME/card.svg?theme=dark&width=600"
    alt="CP OAuth Profile"
/>
```

### Notes

- The card respects the user's privacy settings — only platforms marked as public in profile settings will be displayed.
- Public profile JSON and cards use `Cache-Control: no-store`; already cached copies from the old deployment require CDN purging or their old expiry.
- Platform icons are embedded inline in the SVG, so the card works everywhere without external dependencies.

## Public Profile Data

`GET /api/users/{username}` keeps the combined public response. `?includeStats=false` returns basic profile and explicitly visible linked accounts without waiting for Clist. `GET /api/users/{username}/stats` returns allowed competition data separately; `cpStatsStatus` and `ratingHistoryStatus` distinguish `available` (including a real empty result) from `unavailable`. Neither private bindings nor provider tokens are returned. When both public-stat options are off, no provider token is fetched or refreshed.

Clist data is restricted to exact verified local identities, not every account on the same platform; unknown resources fail closed. New accounts have an empty public-platform list. The maintenance migration preserves each older user's currently visible platforms as an explicit list; future bindings are not silently public. Embedded Markdown is sanitized before highlighting, and its headings begin below the page title.

Administrative user changes accept only `user`/`admin` and true JSON booleans. Deletion or demotion of the last administrator returns 409 under a shared transaction lock; role changes invalidate old sessions. Invalid pagination, oversized notice content, non-integer ordering and unsafe showcase links return field errors without partial writes. Historical unsafe showcase links are non-clickable and flagged for an operator to repair, not deleted automatically.

## First-Party Authentication

The web application uses an opaque `cp_oauth_session` cookie (`HttpOnly`, `SameSite=Lax`, seven days, `Secure` in production). JavaScript never reads a login token. First-party mutations and OAuth login-start requests send `X-CP-OAuth-CSRF: 1`; cross-origin requests are rejected. OAuth clients still use their separate bearer access tokens at `/api/oauth/userinfo` and the published client/token protocol.

All password, Passkey, OAuth-provider and Luogu primary sign-ins respect the account's current MFA method. A pending sign-in returns `{ requiresTwoFactor, method, challengeId, redirect }` without creating a session; only a successful current factor completes it. Challenges expire after ten minutes, have five attempts, and are bound to the initiating browser and identity version. Successful first-party authentication returns `{ authenticated: true, redirect }`, not a JWT or a token-bearing user object.

Sensitive changes require a single-use, five-minute proof bound to the current session, user, identity version and purpose: `email_change`, `password_change`, `mfa_change`, `passkey_add`, `passkey_delete`, or `binding_change`. Confirm through the current password, a verified Passkey, or an already-linked identity plus current MFA. Send `reauthToken` in mutation bodies, or `X-CP-OAuth-Reauth` for DELETE and provider-binding start requests. Multi-step setup consumes the proof at its start and rechecks the original session at completion. A proof-backed credential change rotates the current session and invalidates old sessions; merely refreshing a linked username does not require another proof.

`POST /api/auth/logout` atomically revokes the current server-side session and clears the cookie. Existing users sign in again once at the security cutover; the deployment retains the OAuth signing secret value and migrates existing OAuth credentials without replacing them.

## Email and Password Security

First-party account changes use the HttpOnly session cookie and `X-CP-OAuth-CSRF: 1`, not an OAuth access token. `PATCH /api/auth/me` accepts only changed profile fields; email changes additionally require a single-use `email_change` reauthentication proof. The response includes `pendingEmail` and `pendingEmailExpiresAt` while the verified primary email and email-based MFA recipient remain unchanged. Pending addresses do not reserve an email already owned by another account.

`POST /api/auth/verify` accepts `{ "redirect": "/profile?tab=basic" }` and resends the pending-address confirmation first, or the primary-address verification if no change is pending. Verification links expire after 24 hours and are consumed atomically. The final email uniqueness check happens at confirmation: a conflicting address produces an HTTP 409 result page and leaves the previous email intact. An intent is saved before sending mail; `verificationEmailSent: false` means delivery failed and the user can request another message.

New passwords require at least eight characters and at most 72 UTF-8 bytes; existing passwords remain valid authentication inputs. `POST /api/auth/password/change` requires a `password_change` reauthentication proof and `newPassword`, with an optional `currentPassword` check. Success rotates the current browser's session and invalidates other sessions, unconsumed authorization codes, access tokens and refresh tokens. Password changes and resets also cancel pending email changes.

`POST /api/auth/password/forgot` accepts `{ "email": "user@example.com", "redirect": "/profile" }` and returns the same `{ "success": true }` for unknown accounts and failed delivery. Reset links expire after 30 minutes. `POST /api/auth/password/reset` atomically consumes the token; invalid, expired or replayed tokens return HTTP 400 with `data.code: "RESET_TOKEN_INVALID_OR_EXPIRED"`. Successful resets and email confirmations invalidate old sessions and clear the browser cookie without creating a new session; sign in again to continue the original task. Email links and result pages preserve only validated same-site redirect targets.

SMTP delivery reuses its transporter until SMTP configuration changes, with a 10-second connection/greeting timeout and a 20-second socket timeout. Email titles and link attributes are HTML-escaped; logs omit recipients, message contents, credentials and raw delivery errors.

## System Configuration

The administrator page at `/admin/config` uses a write-only secret contract. `GET /api/admin/config` returns `{ values, secrets }`: `values` contains only registered non-secret keys, and each secret is represented by `{ configured: boolean }`. Stored passwords, OAuth secrets, internal keys, and unknown database keys are never returned.

`PATCH /api/admin/config` accepts only this shape:

```json
{
    "values": { "site_title": "CP OAuth", "smtp_port": "587" },
    "secrets": { "smtp_pass": "replacement-password" },
    "clearSecrets": ["github_client_secret"]
}
```

Omitted values stay unchanged. An empty secret input preserves the existing secret; only `clearSecrets` removes one. Setting and clearing the same key is rejected. Unknown keys, wrong types, invalid bounds, and enabling Turnstile without both keys return HTTP 400 with `data.code: "VALIDATION_ERROR"` and field errors. The whole request is validated before a single database transaction writes it; failures leave the previous configuration intact.

Boolean settings accept only the strings `"true"` and `"false"`. Integer ranges are 1–20 for recent users, 1–65535 for the SMTP port, and 1–43200 minutes for the username-refresh cooldown. Other configuration strings are limited to 2048 characters. A provider login is available only when both its client ID and secret are configured.

Configuration snapshots read the requested keys once from PostgreSQL, with registry defaults for missing rows, and do not use Redis caching. Server consumers use the batch API, for example `const { site_title, smtp_host } = await getConfig(['site_title', 'smtp_host'])`. `/api/public/config` preserves the existing camelCase response and sends `Cache-Control: no-store`; administrator responses are also not cached.

The six secret keys (`smtp_pass`, `turnstile_secret_key`, and the four provider client secrets) are stored as AES-256-GCM `enc:v1:<iv>:<tag>:<ciphertext>` envelopes with row-specific authenticated context. `NUXT_DATA_ENCRYPTION_KEY` must encode exactly 32 bytes in base64 and must be independent of the JWT key. Existing plaintext secrets require the offline encryption migration; runtime reads reject plaintext, malformed envelopes, and wrong keys with HTTP 503 rather than falling back. The internal `__data_key_check` canary uses context `SystemConfig:__data_key_check` and plaintext `cp-oauth-key-check-v1`; it is excluded from both configuration DTOs.

`server/utils/secrets.ts` exports pure encryption/decryption and key-decoding functions for server and offline consumers. `server/utils/data-encryption.ts` provides runtime `getDataEncryptionKey()` and `verifyDataKeyCanary(key)`. New-user transactions should call `requireRegistrationEnabled(tx)` while holding the administrator-role lock so registration changes and account creation share the same boundary.

The unit tests include configuration-input and encryption boundaries. Setting `CONFIG_TEST_DATABASE_URL` when running `npm run test:unit` additionally exercises actual HTTP configuration handlers and rollback against an isolated temporary schema; the URL is rejected unless its host is loopback and its database name ends in `_test`. Without that explicit variable, the database-backed configuration test is skipped.

## Third-Party Login Providers

GitHub, Google, Codeforces and Clist can create accounts on first sign-in when registration is enabled. Configure their credentials in the admin panel (`/admin/config`). Luogu sign-in is different: it only authenticates an existing CP OAuth account with an already-linked Luogu UID; it never automatically registers a user.

| Provider   | Type                                                       |
| ---------- | ---------------------------------------------------------- |
| GitHub     | OAuth 2.0                                                  |
| Google     | OpenID Connect                                             |
| Codeforces | OpenID Connect                                             |
| Clist      | OAuth 2.0 (with TLS bypass)                                |
| Luogu      | Short-lived paste challenge; existing linked accounts only |

For Luogu login, register a CP OAuth account first, link your Luogu account from your profile, then use the Luogu login challenge. An unlinked UID cannot log in or create an account through this login entry. Only the generated challenge code belongs in the public paste; no CP OAuth login credential should be published.

## Project Structure

```
cp-oauth/
├── pages/                 # Nuxt file-based routing
│   ├── admin/             # Admin pages (config, users, notices)
│   ├── oauth/             # OAuth flow & third-party callbacks
│   └── ...
├── server/
│   ├── api/               # API routes
│   │   ├── auth/          # Login, register, email verify
│   │   ├── oauth/         # OAuth endpoints (authorize, token, userinfo)
│   │   ├── account/       # Linked accounts management
│   │   ├── admin/         # Admin APIs
│   │   └── public/        # Public config endpoint
│   └── utils/             # Server utilities
│       ├── prisma.ts      # Database client
│       ├── redis.ts       # Cache client
│       ├── auth.ts        # Versioned HttpOnly sessions
│       ├── oauth.ts       # OAuth 2.0 core logic
│       ├── clist-oauth.ts # Clist OAuth integration
│       ├── clist-fetch.ts # Node.js wrapper for TLS bypass
│       ├── clist-fetch.py # Python TLS bypass via curl_cffi
│       └── ...
├── prisma/
│   ├── schema.prisma      # Current database schema
│   ├── baseline.prisma    # Legacy schema drift reference
│   └── migrations/        # Tracked baseline and security cutover
├── i18n/locales/          # Translation files (en, zh, ja)
├── assets/scss/           # Global styles
├── requirements.txt       # Python dependencies
├── docker-compose.yml     # PostgreSQL + Redis
├── Dockerfile             # Production container
└── package.json           # Node.js dependencies
```

## Offline Cutover and Maintenance

The tracked migrations are `20261001000000_baseline` and `20261001000100_refactor_security`. The latter renames and hashes existing OAuth credentials and PKCE challenges, normalizes unambiguous identities, adds security constraints/indexes, and freezes each legacy user's currently visible platform list. Explicitly configured lists remain unchanged; new users default to no public bindings.

For an existing database, use a maintenance window, not a rolling dual-read deployment:

1. Run `node scripts/refactor-data.mjs --check` against the explicitly selected database. Check schema drift against `prisma/baseline.prisma`. Ownership conflicts, illegal roles, a nonempty database without an administrator, unsafe OAuth redirects and key-validation errors stop the cutover; never merge, rename or elevate users automatically. Unsafe historical showcase links are reported for manual repair without deleting their data.
2. Rehearse on a restricted restored copy. Stop all old application writes and verify recoverable PostgreSQL/necessary Redis backups, the old image and old environment. Preserve the OAuth JWT signing value and canonical origin; provide the new independent encryption key.
3. Only for a matching pre-existing baseline without migration history, run `prisma migrate resolve --applied 20261001000000_baseline`. Then deploy tracked migrations, run `node scripts/refactor-data.mjs --encrypt`, and run `--check` with the same key. An existing migration history needs an explicit verified handoff, not a second baseline resolution.
4. Encryption validates all existing envelopes before writing, initializes or verifies the key canary, and processes 100-row transactions. Same-key reruns are safe and resumable; a wrong key never re-encrypts existing data. Keep writes stopped on any failure. Store data keys separately from restricted backups containing legacy plaintext.
5. Purge old public-card CDN copies. Clean old Redis state only after proving namespace ownership, using bounded SCAN operations; never FLUSHALL or delete another application's keys. Start the new image, check readiness and registered callbacks, and exercise login/MFA/OAuth refresh/revocation before reopening writes.
6. On failed cutover, keep writes stopped and restore the database/necessary Redis snapshot and old image together. A code-only rollback cannot read the new encrypted/hash schema. Once new writes have been accepted, data retention must be decided before restoring an old snapshot.

All existing first-party users sign in again once. Existing lawful OAuth codes/access/refresh tokens remain usable through their migrated hashes; old refresh tokens retain their secret requirement. A newly authorized secretless PKCE grant supports secretless refresh/revocation. Public Luogu bearer credentials and MFA bypasses are deliberately not retained.

Schedule `npm run maintenance:oauth` daily at **00:15 UTC**, as a deployment job using the migration image, not web startup or a public endpoint. It holds a session advisory try-lock on a single connection, captures one cutoff and deletes only expired codes/access/refresh tokens in 1000-row ID batches. Lock contention exits successfully without work. Connect directly to PostgreSQL or use session pooling; transaction-pooled connections are unsuitable for session advisory locks.

## Task Workbench and Verification

`design.md` binds the Luogu.me-inspired blue/gray hierarchy to the existing Element Plus tokens, self-hosted font, readable navigation and task layouts. Profile tasks remain query-addressable (`basic`, `bindings`, `security`, `authorized_apps`, `public`, `preferences`); only the active panel fetches its task data. Mobile navigation supports focus trapping, Escape and focus return. Forms retain labels, field errors, drafts on failure and explicit sensitive-action confirmation.

Theme and locale controls are available to guests and signed-in users. Account preferences override stale local storage after SSR hydration; guest preferences stay local. English, Chinese and Japanese share the same light/dark components. Luogu login is only for an already linked account, never automatic registration.

`.github/workflows/verify.yml` uses Node 22, Python 3.11, isolated PostgreSQL 16/Redis 7, job-only masked keys and no provider/S3 credentials. It runs behavior tests, lint, typecheck, a pure build, real HTTP integration, tracked migration/encryption checks and both Docker targets. Production-container checks include readiness, non-root execution and the actual Node-to-Python fixed-host HTTP adapter.

Local integration requires an explicitly selected loopback database ending in `_test`, a loopback `TEST_BASE_URL`, and matching test runtime configuration. Set `TEST_DATABASE_URL` for migration/maintenance fixtures, `CONFIG_TEST_DATABASE_URL` for isolated configuration regressions, and `PYTHON_PATH` to run the deterministic Python adapter boundaries. Third-party live login still requires legitimate provider credentials and registered callbacks; fixed fixtures do not prove a live external login.

### Startup invariant

Nitro 2 invokes plugins synchronously rather than awaiting their returned promises. Runtime configuration validation therefore throws synchronously; the asynchronous key-canary check gates every route until it finishes. An invalid stored data key terminates the process with exit code 1 rather than leaving a listening application after an unhandled rejection. `tests/integration/runtime-startup.test.mjs` uses unused nonzero ports, captures startup diagnostics, rejects any readyz 200 for missing/incorrect keys, and verifies that the same artifact reaches readiness with valid configuration. The assertions cover exit/readiness behavior and OS error codes, not incidental log wording.

## Dependency Audit Boundary

The final verification did not upgrade the pinned Nuxt/Vue baseline or run `npm audit fix --force`. On 2026-10-02, `npm audit --omit=dev` reported **48 flagged packages, including 4 critical** in the installed dependency graph. The critical packages are `@nuxt/devtools`, `seroval`, `shell-quote` and `tar`; none is listed in the built server's dependency inventory. That inventory does contain other flagged packages, including `devalue`, `defu`, `lodash-es` and `nodemailer`, so this refactor is **not a clean dependency-security audit**. Package advisories are not proof that every reported exploit is reachable, and these findings are not claimed as fixed.

Representative primary advisories: [Nuxt DevTools](https://github.com/advisories/GHSA-279x-mwfv-vcqv), [devalue](https://github.com/advisories/GHSA-77vg-94rm-hx3p), [Nodemailer](https://github.com/advisories/GHSA-c7w3-x93f-qmm8). Review the current JSON audit report and compatibility impact before a production deployment; no production switch was performed here.
