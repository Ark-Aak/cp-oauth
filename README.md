# CP OAuth

CP OAuth is an OAuth 2.0 provider built for competitive programming platforms. Users can register, link their competitive programming accounts (Luogu, AtCoder, Codeforces, Clist, etc.), and authorize third-party applications via standard OAuth 2.0 flows with PKCE support.

## Tech Stack

- **Runtime**: Node.js 20, Python 3.10+
- **Framework**: Nuxt 4 (SSR) with Nitro server engine
- **Database**: PostgreSQL 16 (via Prisma ORM)
- **Cache**: Redis 7 (via ioredis)
- **UI**: Element Plus, Lucide icons, SCSS
- **Auth**: JWT, bcrypt, TOTP 2FA, WebAuthn
- **i18n**: English, Chinese, Japanese

## Prerequisites

- **Node.js** >= 20
- **Python** >= 3.10 (required for Clist OAuth integration)
- **PostgreSQL** >= 16
- **Redis** >= 7
- **npm** (comes with Node.js)

## Installation

### 1. Clone and install Node.js dependencies

```bash
git clone <repo-url> cp-oauth
cd cp-oauth
npm install
```

### 2. Install Python dependencies

Python is required for the Clist OAuth TLS bypass (clist.by's Cloudflare blocks standard HTTP clients).

```bash
pip install -r requirements.txt
```

This installs `curl_cffi`, which provides browser-like TLS fingerprints to bypass Cloudflare's TLS detection.

> **Note**: If your Python binary is not `python` (e.g. `python3`), set the `PYTHON_PATH` environment variable:
>
> ```bash
> export PYTHON_PATH=python3
> ```

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts PostgreSQL (port 5432) and Redis (port 6379).

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
DATABASE_URL=postgresql://cpuser:cppass@localhost:5432/cpoauth
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secure-random-secret
```

### 5. Initialize database

```bash
npx prisma generate
npx prisma migrate dev
```

### 6. Start development server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Production Deployment

### Build

```bash
npx prisma generate
npm run build
```

If S3 upload is enabled, `npm run build` will also upload static assets from `.output/public`.
Set `S3_UPLOAD_ENABLED=true` and the required S3 env vars before building.

You can run upload separately with:

```bash
npm run upload:s3
```

### Run

```bash
node .output/server/index.mjs
```

### Docker

```bash
docker build -t cp-oauth .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=... \
  cp-oauth
```

> **Docker note**: The default Dockerfile uses `node:20-alpine` which does not include Python. If you need Clist OAuth support in Docker, use a custom image that includes both Node.js and Python with `curl_cffi`, or deploy the Python dependency as a sidecar.

## Common Commands

```bash
# Development
npm run dev              # Start Nuxt dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run upload:s3         # Upload .output/public to S3-compatible storage
npm run upload:oss        # Alias of upload:s3

# Code quality
npm run lint             # ESLint check
npm run format           # Prettier format

# Database
npx prisma generate      # Regenerate Prisma client
npx prisma migrate dev   # Create and apply migrations
npx prisma db push       # Push schema without migrations

# Infrastructure
docker compose up -d     # Start PostgreSQL + Redis
```

## Environment Variables

| Variable                | Required | Description                                                    |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `DATABASE_URL`          | Yes      | PostgreSQL connection string                                   |
| `REDIS_URL`             | Yes      | Redis connection string                                        |
| `JWT_SECRET`            | Yes      | Secret for signing JWT tokens                                  |
| `NUXT_APP_CDN_URL`      | No       | CDN base URL for Nuxt `_nuxt` assets                           |
| `PYTHON_PATH`           | No       | Path to Python binary (default: `python`)                      |
| `S3_UPLOAD_ENABLED`     | No       | Set `true` to upload static files to S3-compatible storage     |
| `S3_REGION`             | No       | S3 region (required when upload is enabled)                    |
| `S3_BUCKET`             | No       | S3 bucket name (required when upload is enabled)               |
| `S3_ACCESS_KEY_ID`      | No       | Access key ID (required when upload is enabled)                |
| `S3_SECRET_ACCESS_KEY`  | No       | Secret access key (required when upload is enabled)            |
| `S3_ENDPOINT`           | No       | Custom S3 endpoint (for OSS/COS/MinIO etc.)                    |
| `S3_SESSION_TOKEN`      | No       | Optional temporary session token                               |
| `S3_PREFIX`             | No       | Remote prefix for uploaded files                               |
| `S3_BUILD_DIR`          | No       | Local static directory to upload (default `.output/public`)    |
| `S3_UPLOAD_CONCURRENCY` | No       | Upload concurrency (default `8`)                               |
| `S3_FORCE_PATH_STYLE`   | No       | Force path-style URLs (default auto-enabled when endpoint set) |

> Backward compatibility: `OSS_*` environment variables are still supported as aliases.

## OAuth 2.0 API

### Authorization Code Flow

1. Redirect user to `/oauth/authorize` with `client_id`, `redirect_uri`, `scope`, and PKCE parameters.
2. User consents on the authorization page.
3. User is redirected back to your `redirect_uri` with an authorization `code`.
4. Exchange `code` for `access_token` via POST `/api/oauth/token`.
5. Use `access_token` to call `/api/oauth/userinfo`.

### Endpoints

| Endpoint              | Method | Description                                      |
| --------------------- | ------ | ------------------------------------------------ |
| `/oauth/authorize`    | GET    | Initiate authorization, redirect to consent page |
| `/api/oauth/token`    | POST   | Exchange authorization code for access token     |
| `/api/oauth/userinfo` | GET    | Get user profile (filtered by granted scopes)    |

### Scopes

| Scope             | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `openid`          | Required. Returns user's unique identifier (`sub`).             |
| `profile`         | Basic profile: `username`, `display_name`, `avatar_url`, `bio`. |
| `email`           | Email address and verification status.                          |
| `cp:linked`       | All linked competitive programming accounts.                    |
| `link:luogu`      | Linked Luogu account info.                                      |
| `link:atcoder`    | Linked AtCoder account info.                                    |
| `link:codeforces` | Linked Codeforces account info.                                 |
| `link:github`     | Linked GitHub account info.                                     |
| `link:google`     | Linked Google account info.                                     |
| `link:clist`      | Linked Clist account info.                                      |
| `cp:summary`      | Aggregated CP stats (rating, contests, ranking) from Clist.by.  |
| `cp:details`      | Full rating history from Clist.by.                              |

> **Note on `cp:summary` and `cp:details`:** These scopes require the user to have a linked Clist.by account. Data is only returned for platforms where the user's account on this site matches the one linked on Clist.by. If no Clist.by account is linked, the response will include `{ "available": false, "message": "..." }`.

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

const { access_token, token_type, expires_in, scope } = await response.json();
```

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
- The card is cached for 1 hour (via `Cache-Control`).
- Platform icons are embedded inline in the SVG, so the card works everywhere without external dependencies.

## Third-Party Login Providers

Users can sign in or register via external OAuth providers. Configure credentials in the admin panel (`/admin/config`):

| Provider   | Type                        |
| ---------- | --------------------------- |
| GitHub     | OAuth 2.0                   |
| Google     | OpenID Connect              |
| Codeforces | OpenID Connect              |
| Clist      | OAuth 2.0 (with TLS bypass) |
| Luogu      | Paste-based verification    |

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
│       ├── auth.ts        # JWT authentication
│       ├── oauth.ts       # OAuth 2.0 core logic
│       ├── clist-oauth.ts # Clist OAuth integration
│       ├── clist-fetch.ts # Node.js wrapper for TLS bypass
│       ├── clist-fetch.py # Python TLS bypass via curl_cffi
│       └── ...
├── prisma/
│   └── schema.prisma      # Database schema
├── i18n/locales/          # Translation files (en, zh, ja)
├── assets/scss/           # Global styles
├── requirements.txt       # Python dependencies
├── docker-compose.yml     # PostgreSQL + Redis
├── Dockerfile             # Production container
└── package.json           # Node.js dependencies
```
