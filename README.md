# CP OAuth

CP OAuth 是一个实现了**支持 PKCE 的 OAuth 2.0 授权码流程**的身份验证与授权服务。第三方应用可以通过它对用户进行身份验证，并请求细粒度的竞赛编程个人资料数据访问权限。

## 特性

- **标准 OAuth 2.0**：遵循授权码流程（Authorization Code Flow），安全可靠。
- **PKCE 支持**：为无法安全存储 `client_secret` 的公开客户端（如 SPA、移动应用）提供增强安全性。
- **细粒度权限**：通过 `scope` 参数精确控制可访问的用户数据范围。
- **清晰的 API**：提供标准的授权、令牌交换和用户信息获取端点。

## 授权码流程概览

1.  **发起授权**：将用户重定向到 `/oauth/authorize`，携带 `client_id`、`redirect_uri`、`scope` 及 PKCE 参数（如适用）。
2.  **用户同意**：用户在授权页面确认是否授予权限。
3.  **获取授权码**：用户同意后，重定向回您的 `redirect_uri`，并附带一个 `code`（授权码）。
4.  **交换令牌**：您的后端服务器使用 `code` 和 `client_secret`（或 PKCE 的 `code_verifier`）向 `/oauth/token` 换取 `access_token`。
5.  **获取用户信息**：使用 `access_token` 调用 `/oauth/userinfo` 获取用户数据。

## 快速开始

### 1. 注册应用
在 [CP OAuth 管理后台](https://auth.luogu.me/developer) 注册您的应用，获取 `client_id` 和 `client_secret`（公开客户端可选择仅使用 `client_id` 并启用 PKCE）。

### 2. 发起授权请求（前端重定向）
```http
GET /oauth/authorize?
  response_type=code
  &client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.com/callback
  &scope=openid profile
  &state=random_state_string
  &code_challenge=BASE64URL_SHA256_HASH
  &code_challenge_method=S256
```

### 3. 交换授权码为访问令牌（后端）
```javascript
const response = await fetch('/api/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'https://yourapp.com/callback',
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    // 若使用 PKCE，则传递 code_verifier 而非 client_secret
    // code_verifier: 'YOUR_CODE_VERIFIER'
  })
})

const { access_token, token_type, expires_in, scope } = await response.json()
```

### 4. 获取用户信息
```javascript
const userinfo = await fetch('/api/oauth/userinfo', {
  headers: { Authorization: `Bearer ${access_token}` }
})

const data = await userinfo.json()
// 响应内容取决于授予的 scope
// { sub, username, display_name, avatar_url, bio, cp_summary, cp_details }
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/oauth/authorize` | GET | 发起授权，重定向用户至授权页面。 |
| `/oauth/token` | POST | 使用授权码（或刷新令牌）换取访问令牌。 |
| `/oauth/userinfo` | GET | 返回当前授权用户的资料（根据权限范围过滤）。 |

## 权限范围（Scope）

请仅请求您的应用实际需要的范围。响应的用户数据会根据授予的 `scope` 动态过滤。

| Scope | 说明 |
|-------|------|
| `openid` | 必需，获取用户的唯一标识符（`sub`）。 |
| `profile` | 获取用户的基础信息，如 `username`、`display_name`、`avatar_url`、`bio`。 |
| `cp_summary` | 获取竞赛编程概要数据。 |
| `cp_details` | 获取更详细的竞赛编程数据。 |

## PKCE 使用示例（适用于公开客户端）

```javascript
// 生成 code_verifier 和 code_challenge
const codeVerifier = generateRandomString(128)
const encoder = new TextEncoder()
const data = encoder.encode(codeVerifier)
const digest = await crypto.subtle.digest('SHA-256', data)
const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

// 步骤1: 授权请求中携带 code_challenge
// /oauth/authorize?code_challenge={codeChallenge}&code_challenge_method=S256

// 步骤2: 令牌请求中携带 code_verifier（替换 client_secret）
fetch('/api/oauth/token', {
  method: 'POST',
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTHORIZATION_CODE',
    redirect_uri: 'https://yourapp.com/callback',
    client_id: 'YOUR_CLIENT_ID',
    code_verifier: codeVerifier   // 代替 client_secret
  })
})
```

## 更多信息

- 完整的开发者文档请访问：[https://auth.luogu.me/about](https://auth.luogu.me/about)
