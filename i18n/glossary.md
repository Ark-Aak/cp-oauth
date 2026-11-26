# UI Terminology Glossary

- Canonical source locale: `en` (en-US)
- Supported locales: `en`, `zh-CN` (`zh`), `ja`

Update this glossary before introducing new core concepts, statuses, or destructive action verbs. Keep navigation labels, page titles, breadcrumbs, and entry buttons aligned across locales.

| English (Source)         | POS / Context                               | zh-CN                | ja                              | Do Not Use                      | Notes / Disambiguation                                                     |
| ------------------------ | ------------------------------------------- | -------------------- | ------------------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| Account                  | Noun · CP OAuth user account                | 账号                 | アカウント                      | 账户                            | Used in auth, profile, and admin user management                           |
| User                     | Noun · admin nav & user list                | 用户                 | ユーザー                        | —                               | Navigation label and page title for `/admin`                               |
| Member                   | Noun · standard role / overview list        | 成员                 | メンバー                        | 普通用户                        | Role label (`user`) and overview newest-members list                       |
| Administrator            | Noun · privileged role                      | 管理员               | 管理者                          | 超级管理员                      | Role label (`admin`)                                                       |
| Sign in / Sign out       | Verb · session auth                         | 登录 / 退出登录      | ログイン / ログアウト           | 登入 / 登出 / サインイン        | Canonical auth verbs across all locales                                    |
| Create account           | Verb · registration CTA & title             | 注册账号             | アカウントを作成                | 创建账号（主入口）              | Aligns nav/CTA with registration heading                                   |
| Profile                  | Noun · user basic info tab                  | 个人资料             | プロフィール                    | 基本资料（页标题）              | Nav item and `/profile?tab=basic` heading                                  |
| Public profile           | Noun · public page & privacy tab            | 公开主页             | 公開プロフィール                | 公开资料（页标题）              | Nav item, `/profile?tab=privacy` heading, and `/user/[username]`           |
| Linked account           | Noun · verified external platform account   | 关联账号             | 連携アカウント                  | 绑定账号                        | Nav item, `/profile?tab=bindings`, and scopes                              |
| Link / Unlink            | Verb · attach/detach external platform      | 关联 / 解除关联      | 連携 / 連携を解除               | 绑定 / 解绑                     | Always pair `Link` with `Unlink`                                           |
| Authorized apps          | Noun · OAuth apps granted access            | 已授权应用           | 許可したアプリ                  | 授权应用列表                    | Nav item and `/profile?tab=apps` heading                                   |
| Authorize / Allow / Deny | Verb · OAuth consent                        | 授权 / 允许 / 拒绝   | 許可 / 拒否                     | 批准 / 同意 / 認可（混用）      | Unified `許可` in `ja` for user-facing consent                             |
| Revoke access            | Verb · cancel app authorization             | 撤销授权             | アクセスを取り消す              | 取消授权                        | Destructive credential action                                              |
| OAuth client             | Noun · developer-registered OAuth app       | OAuth 客户端         | OAuth クライアント              | OAuth 应用（开发者页混用）      | Unified across nav, `/developer`, errors, and overview stats               |
| Two-step verification    | Noun · MFA                                  | 两步验证             | 2段階認証                       | 双重验证 / 二次验证             | Unified across auth, security, and reauth                                  |
| Passkey                  | Noun · WebAuthn credential                  | 通行密钥             | パスキー                        | 密钥 / 生物识别                 | Unified across login, security, and reauth                                 |
| Verification code        | Noun · 6-digit OTP or ownership proof code  | 验证码               | 確認コード                      | 校验码 / 認証コード             | Single term for MFA and platform proof codes                               |
| Verify                   | Verb · submit code or ownership proof       | 验证                 | 認証する                        | 确认（验证场景）                | Distinct from generic `Confirm` in `ja`                                    |
| Verified / Not verified  | Status · email verification                 | 已验证 / 未验证      | 確認済み / 未確認               | 已确认（邮箱状态）              | Consistent across profile, admin, and OAuth consent                        |
| Delete                   | Verb · permanent destruction                | 删除                 | 削除                            | 移除（永久删除场景）            | Irreversible deletion; always states consequence                           |
| Remove                   | Verb · detach item/credential               | 移除                 | 削除（パスキーは削除に統一）    | 解除（パスキー削除）            | Passkey deletion uses `Delete` (`删除` / `削除`) to match dialog and toast |
| Clear                    | Verb · empty a configured secret            | 清除                 | クリア                          | 删除（配置表单清空）            | Distinct from record deletion in `/admin/config`                           |
| Discard                  | Verb · reset unsaved form edits             | 放弃更改             | 変更を破棄                      | 取消（表单重置）                | Split from modal `Cancel` to avoid polysemy                                |
| Showcase                 | Noun · public directory of sites & projects | 展示                 | ショーケース                    | 应用展示（含项目与库）          | Covers both Sites and Projects                                             |
| Contest statistics       | Noun · Clist.by summary metrics             | 比赛统计             | コンテスト統計                  | 比赛概况                        | Consistent across privacy, scopes, and public profile                      |
| Rating / Rating history  | Noun · competitive programming rating       | Rating / Rating 记录 | レーティング / レーティング履歴 | レート（混用）                  | Unified `レーティング` in `ja`                                             |
| CAPTCHA / Cap            | Noun · bot check                            | 人机验证 / Cap       | CAPTCHA / Cap                   | 安全验证（混用）                | `Cap` in admin config; `人机验证` / `CAPTCHA` for error copy               |
| About                    | Noun · about page & nav                     | 关于                 | CP OAuth について               | 关于我们 / このサービスについて | Nav label aligned with page title                                          |
