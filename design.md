---
name: cp-oauth-design
description: Presentation rules for every CP OAuth web interface — the signed-in workspace with the left rail, authentication and consent screens, public profile and directory pages — in light and dark themes, for competitive programmers and OAuth integrators.
version: 2026-10-18
---

# CP OAuth design

## 1. Scope and priority

[MUST] Apply this file to all pages rendered by the Nuxt application, both layouts (`default`, `auth`) and both themes (`light`, `dark`).

[MUST] Exclude the SVG profile card served by the API and transactional email bodies.

Resolve conflicts in this order: facts and user requirements → accessibility and usability → reader tasks → this file's conventions → brand expression → decoration.

## 2. Brand and readers

Readers are competitive programmers and developers wiring OAuth clients. They read identifiers (UIDs, client IDs, scopes, redirect URIs) character by character and act on security prompts.

- **Precise**: every machine identifier is set in `--cp-font-mono`, never truncated without a full-value tooltip or copy control.
- **Ledger-like**: data is presented as ruled rows (hairline separators, right-aligned numbers), not tiles.
- **Quiet chrome, loud state**: chrome uses the neutral scale; color appears only for the primary action, the active navigation item, and status.
- **Plain copy**: titles name the object, buttons name the action and object ("Revoke access", "Add passkey"). No exclamation marks, no marketing adjectives.

## 3. Page structure and composition

### 3.1 Shell (default layout)

[MUST] Navigation lives in a left rail (`CpSidebar`), fixed, full height, `--cp-rail-width` wide at viewports ≥ 1024px.

[MUST] Below 1024px the rail becomes an off-canvas drawer opened from a 56px top bar (`.cp-topbar`) that shows the menu button and the wordmark. The drawer traps focus, closes on Escape, on backdrop click and on navigation, and returns focus to the menu button.

[SHOULD] Rail order, top to bottom: wordmark, grouped navigation (group label in mono kicker style), then a pinned footer with the account block, language and theme controls.

[SHOULD] The main column centers a container of `--cp-content-width` max width, padded `--cp-space-10` horizontally at ≥ 1024px and `--cp-space-4` below 768px. The site footer sits at the end of the main column, not under the rail.

### 3.2 Page types

| Page type           | First viewport                                                                                         | Primary content                                                                                           | Secondary content                                                      | End                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Workspace form page | `CpPageHeader` (kicker, h1, one-line description, actions right)                                       | Stacked `CpSheet`s, one per task, each with its own save action                                           | Inline `CpNote` under the sheet it concerns                            | Last sheet; destructive sheet (`tone="danger"`) always last          |
| Master list         | `CpPageHeader` with primary "create" action                                                            | Toolbar row (search, filters) on top of one sheet that holds the table or row list                        | Pagination right-aligned under the table                               | Pagination or empty state                                            |
| Overview            | Two columns at ≥ 1280px (7 / 5): statement + actions left, figures ledger right                        | Ruled lists (notices, members) in two columns                                                             | Quote line                                                             | Footer                                                               |
| Public profile      | Identity band: avatar, display name, `@username`, bio, linked identities as a ruled list               | Stats ledger, rating chart, long text (Markdown)                                                          | Embed snippet                                                          | Footer                                                               |
| Auth form           | `auth` layout: brand panel left (40%, min 360px), form column right; form width `--cp-auth-form-width` | One task per screen; multi-step tasks replace the form body in place and show a step line ("Step 2 of 3") | Alternatives (providers, passkey) under a labeled divider              | Switch link ("No account? Create one")                               |
| Decision page       | `auth` layout; requesting app name at the top (no client ID)                                           | Ruled list of requested permissions with descriptions                                                     | Signed-in account line and the return host (not the full redirect URI) | Decision bar: decline (default button) left, approve (primary) right |
| Result page         | `auth` layout; status heading with semantic icon                                                       | One sentence of explanation                                                                               | —                                                                      | One primary next-step button                                         |

[MUST] Below 900px the `auth` brand panel collapses into a 64px band above the form that keeps only the wordmark and the preferences controls.

[SHOULD] Do not repeat the page title inside the first sheet. A sheet title names its task ("Change password"), not the page.

## 4. Visual rules

### 4.1 Typography

[SHOULD] Decision: IBM Plex Sans for text and IBM Plex Mono for identifiers and figures (self-hosted via Fontsource; replaces the previous pairing to separate prose from machine strings). Source: user request for a full redesign.

| Role                                      | Token               | Size / line                                          | Weight |
| ----------------------------------------- | ------------------- | ---------------------------------------------------- | ------ |
| Display (overview statement, brand panel) | `--cp-text-display` | 32 / 40                                              | 600    |
| Page title `h1`                           | `--cp-text-2xl`     | 24 / 32 (20 / 28 below 768px)                        | 600    |
| Sheet title `h2`                          | `--cp-text-lg`      | 16 / 24                                              | 600    |
| Body                                      | `--cp-text-md`      | 14 / 22                                              | 400    |
| Secondary, table cells                    | `--cp-text-sm`      | 13 / 20                                              | 400    |
| Kicker, column heads, metadata            | `--cp-text-xs`      | 12 / 16, mono, uppercase Latin, letter-spacing .06em | 500    |
| Figures                                   | `--cp-text-figure`  | 28 / 32, mono, `tabular-nums`                        | 500    |

[MUST] Each page renders exactly one `h1` (from `CpPageHeader` or the auth screen heading). Embedded Markdown starts at `h2`.

[SHOULD] Identifiers (usernames with `@`, UIDs, client IDs, scopes, URIs, codes) use `.cp-mono` at the surrounding size. Numbers in tables and ledgers use `font-variant-numeric: tabular-nums` and align right.

### 4.2 Color

[MUST] Keep the established palette: Element Plus variables in `assets/styles/theme.scss` (light primary `#2f6db5`, dark primary `#5fb3c8`, slate text scale, blue-gray borders). Pages consume semantic `--cp-*` tokens or `--el-*` variables, never literals.

| Role                                              | Token                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page canvas                                       | `--cp-canvas`                                                                                                                                         |
| Sheet surface                                     | `--cp-surface`                                                                                                                                        |
| Sunken fill (table head, code, inputs on canvas)  | `--cp-sunken`                                                                                                                                         |
| Hairline                                          | `--cp-line`; stronger rule `--cp-line-strong`                                                                                                         |
| Text                                              | `--cp-text`, `--cp-text-2`, `--cp-text-3`                                                                                                             |
| Accent (primary action, active nav, links, focus) | `--cp-accent`, tint `--cp-accent-soft`                                                                                                                |
| Status                                            | `--cp-success`, `--cp-warning`, `--cp-danger`, `--cp-info` with `-soft` tints                                                                         |
| Rail                                              | `--cp-rail-bg`, `--cp-rail-fg`, `--cp-rail-fg-strong`, `--cp-rail-muted`, `--cp-rail-hover`, `--cp-rail-active`, `--cp-rail-accent`, `--cp-rail-line` |

[MUST] Decision: the rail and the `auth` brand panel follow the page theme — `--el-bg-color` surface with a `--cp-line` hairline in both light and dark, no dark chrome in light theme. The active item uses `--cp-accent-soft` with a 2px accent bar. Source: user feedback that a dark rail in light theme looks wrong.

[MUST] The rail never shows a scrollbar: groups fit a 768px-tall viewport for an administrator; shorter windows still scroll the navigation with a hidden bar.

[MUST] Body text and identifiers reach 4.5:1 contrast on their surface; `--cp-text-3` is used only for metadata ≥ 12px.

### 4.3 Space, grid, surfaces

[SHOULD] Spacing uses the 4px scale `--cp-space-1…12` (4, 8, 12, 16, 20, 24, 32, 40, 48).

[SHOULD] A sheet (`CpSheet`) is `--cp-surface`, 1px `--cp-line` border, `--cp-radius-md` (6px), no shadow. Sheet header and body are padded `--cp-space-5` horizontally; rows inside a sheet are separated by hairlines that run edge to edge.

[MUST] Do not place a sheet inside a sheet. Group inside a sheet with hairline-separated rows or `CpField` lists.

[SHOULD] Vertical rhythm: page header → first sheet `--cp-space-6`; sheet → sheet `--cp-space-5`; field → field `--cp-space-4`.

[SHOULD] Controls use `--cp-radius-sm` (4px). Overlays (dialogs, dropdowns, popovers) are the only elements with shadow (`--el-box-shadow-light`).

[SHOULD] Breakpoints: 1280px (overview two columns), 1024px (rail ↔ drawer), 900px (auth panel collapse), 768px (paddings, title size, tables become row cards with label/value pairs).

### 4.4 Icons, images, charts

[SHOULD] Icons come from `lucide-vue-next`, 16px in buttons and rail, stroke width 1.75, colored with `currentColor`. Never place icons on colored tiles.

[SHOULD] Platform marks use `CpPlatformMark` with the SVGs in `public/icons/`; the mark is 16px next to the platform name, 20px in identity bands.

[SHOULD] Avatars (`CpAvatar`) are squares with `--cp-radius-sm`; the fallback shows the first character of the name in mono on `--cp-accent-soft`.

[SHOULD] Charts (Chart.js, client-only) use one `--cp-accent` series line with 1.5px stroke, points 2px, grid lines `--cp-line`, axis labels `--cp-text-xs` mono. Charts read colors from computed CSS variables and redraw on theme change.

### 4.5 Controls and states

[SHOULD] Element Plus components supply buttons, inputs, selects, switches, tables, dialogs, pagination and messages. Primary action per sheet: `type="primary"`; secondary: default; destructive: `type="danger"` (plain in rows, solid inside confirmation dialogs).

[MUST] In dark theme, primary buttons and the selected segment use `--cp-canvas` text on the accent fill (white on `#5fb3c8` is below 4.5:1).

[MUST] Every focusable element shows a 2px `--cp-accent` outline with 2px offset on `:focus-visible`.

[SHOULD] Loading: `CpDataState` shows a 3-row skeleton of hairline rows for lists and a spinner line for sheets; buttons show their own `loading` state and keep their label.

[SHOULD] Empty: `CpDataState` empty slot shows one sentence explaining why it is empty and at most one action. Error: one sentence with the server message and a "Retry" button.

[MUST] Server-rendered credential forms keep inputs and submit buttons disabled until hydration, and every form declares `method="post"`.

[SHOULD] Status is shown with `CpStatus`: a 6px square marker in the status color followed by the label in `--cp-text-2`. Inline guidance uses `CpNote` (tone tint background, 1px tone border at 35% opacity, leading icon).

### 4.6 Motion

[SHOULD] Hover and color transitions run 120ms ease-out; the drawer slides 200ms; dialogs use Element Plus defaults.

[MUST] Under `prefers-reduced-motion: reduce` disable transforms and transitions except opacity.

## 5. Available primitives

Public primitives are the components in `components/` with the `Cp` prefix, the classes listed below and the `--cp-*` tokens in `assets/styles/tokens.scss`. Pages do not guess unlisted names.

| Role                   | Name                                                                                                                                                                                                                 | Source                            | Use                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| Tokens                 | `--cp-*`                                                                                                                                                                                                             | `assets/styles/tokens.scss`       | All page styles                                  |
| Element Plus theme     | `--el-*` overrides                                                                                                                                                                                                   | `assets/styles/theme.scss`        | Do not redefine in pages                         |
| Base, prose, utilities | `.cp-mono`, `.cp-kicker`, `.cp-num`, `.cp-prose`, `.cp-sr-only`, `.cp-stack`, `.cp-row`, `.cp-muted`, `.cp-help`; ruled lists `.cp-rows` with `.cp-rows__main`, `.cp-rows__title`, `.cp-rows__meta`, `.cp-rows__end` | `assets/styles/base.scss`         | Typography, stacks and row lists in flush sheets |
| Rail                   | `CpSidebar`                                                                                                                                                                                                          | `components/CpSidebar.vue`        | Only in `layouts/default.vue`                    |
| Page header            | `CpPageHeader` props `title`, `kicker?`, `description?`; slot `actions`                                                                                                                                              | `components/CpPageHeader.vue`     | Every workspace, list and public page            |
| Sheet                  | `CpSheet` props `title?`, `description?`, `tone?: 'default' \| 'danger'`, `flush?`; slots `actions`, default, `footer`                                                                                               | `components/CpSheet.vue`          | Task containers                                  |
| Key/value row          | `CpField` props `label`, `mono?`; default slot value                                                                                                                                                                 | `components/CpField.vue`          | Read-only facts inside sheets                    |
| Data state             | `CpDataState` props `pending`, `error?`, `empty?`, `emptyText?`, `rows?`; emits `retry`; slots default, `empty`                                                                                                      | `components/CpDataState.vue`      | Any fetched region                               |
| Note                   | `CpNote` props `tone: 'info' \| 'success' \| 'warning' \| 'danger'`, `title?`                                                                                                                                        | `components/CpNote.vue`           | Inline guidance and results                      |
| Status                 | `CpStatus` props `tone`, `label`                                                                                                                                                                                     | `components/CpStatus.vue`         | Row status                                       |
| Identifier             | `CpCode` props `value`, `copy?`, `secret?`, `block?`; a `secret` value is masked and never exposed through `title`                                                                                                   | `components/CpCode.vue`           | IDs, secrets, URIs, snippets                     |
| Avatar                 | `CpAvatar` props `src?`, `name`, `size?`                                                                                                                                                                             | `components/CpAvatar.vue`         | People                                           |
| Platform               | `CpPlatformMark` props `platform`, `label?`, `size?`                                                                                                                                                                 | `components/CpPlatformMark.vue`   | Linked identities                                |
| Markdown               | `CpMarkdown` props `source`, `autolink?`                                                                                                                                                                             | `components/CpMarkdown.vue`       | User long text                                   |
| Preferences            | `CpPreferences` props `surface?: 'rail' \| 'page'`                                                                                                                                                                   | `components/CpPreferences.vue`    | Rail footer, auth layout panel                   |
| Captcha                | `CpTurnstile` props `action`; `v-model` token; exposes `reset()`                                                                                                                                                     | `components/CpTurnstile.vue`      | Forms requiring Turnstile                        |
| Reauth                 | `useReauth().request(purpose)` with `CpReauthDialog` mounted in the default layout                                                                                                                                   | `composables/useReauth.ts`        | Sensitive changes                                |
| Second factor          | `CpMfaForm` props `challengeId`, `method`; emits `done(result)`, `cancel`                                                                                                                                            | `components/CpMfaForm.vue`        | Any step that may return a two-factor challenge  |
| Ownership proof        | `CpProofChallenge` props `platform`, `code`, `platformUid`, `expiresIn?`, `busy?`, `error?`; emits `submit(credential)`, `back`                                                                                      | `components/CpProofChallenge.vue` | Luogu / AtCoder / LeetCode code challenges       |
| Auth screen            | `CpAuthScreen` props `title`, `description?`, `step?`, `icon?`, `tone?`, `alternativesLabel?`; slots default, `alternatives`, `footer`                                                                               | `components/CpAuthScreen.vue`     | Auth, decision and result pages                  |
| Theme entry            | `useColorMode()`; account sync via `usePreferences()`                                                                                                                                                                | `composables/usePreferences.ts`   | Theme/locale controls                            |

Page-specific styles use scoped styles and BEM blocks named after the page (`.profile-security__…`). They may arrange primitives (grid, order, width) but must not change a primitive's typography, colors, borders, radius or focus style.

### Usage

```vue
<CpPageHeader
    kicker="account / security"
    title="Security"
    description="Password, two-step verification and passkeys."
>
    <template #actions><el-button>Sign out</el-button></template>
</CpPageHeader>
<CpSheet title="Passkeys" description="Sign in without a password.">
    <template #actions><el-button type="primary">Add passkey</el-button></template>
    <CpDataState :pending="false" :empty="true" empty-text="No passkeys yet." />
</CpSheet>
```

## 6. Copy and number formats

[SHOULD] Sentence case for titles, labels and buttons in English; no trailing period on labels and buttons; help text is one sentence with a period.

[SHOULD] Errors state what failed and the next step ("Couldn't save the profile. Check the highlighted fields."). Show the server's field message under the field it names.

[SHOULD] Dates use `Intl.DateTimeFormat` for the active locale: `dateStyle: 'medium'` for dates, plus `timeStyle: 'short'` when time matters. Durations of challenges read "Expires in 10 minutes".

[SHOULD] Counts use `Intl.NumberFormat` with grouping. Rating changes show an explicit sign (`+42`, `−17`) colored success / danger.

[MUST] Do not invent capabilities, statistics or provider names; copy only describes behavior the server implements.

## 7. Anti-patterns

- [SHOULD] A centered hero with a card grid as the default page structure.
- [MUST] Sheets inside sheets.
- [SHOULD] Decorative icon tiles or colored icon backgrounds.
- [SHOULD] Font sizes, weights or color literals outside the tokens.
- [SHOULD] Small low-contrast text for primary information.
- [SHOULD] Pill labels for ordinary metadata, including scopes; scopes and roles use `.cp-mono` text or `CpStatus`.
- [SHOULD] Secondary tab bars inside workspace pages; the rail is the only navigation.
- [SHOULD] Truncated identifiers without a copy control or full-value title.

## 8. Implementation and integration

Nuxt 4 SSR with Element Plus (`@element-plus/nuxt`, styles imported once), `lucide-vue-next`, SCSS. Global styles load in this order from `nuxt.config.ts`: `assets/styles/vendor.css` (Element Plus CSS, Element Plus dark CSS variables, Fontsource IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500), `assets/styles/theme.scss`, `assets/styles/tokens.scss`, `assets/styles/base.scss`, `assets/styles/element.scss` (Element Plus component adjustments).

Theme switching uses `@nuxtjs/color-mode` with the `.dark` class on `html`; Element Plus dark variables follow the same class. Signed-in users' saved theme and language override local preferences after hydration (`usePreferences`). Markdown code blocks carry Shiki light and dark variables and switch with the class without re-rendering.
