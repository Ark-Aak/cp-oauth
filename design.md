---
name: cp-oauth-design
description: CP OAuth 登录、绑定、授权、公开内容、开发者及管理工作台；为竞技编程用户提供尺寸克制、层级清楚、反馈明确的蓝灰身份界面。
version: 2026-10-06
---

## 1. 范围与优先级

[必须] 覆盖现有页面、共享导航、表单、列表、弹窗及浅/深主题。

[必须] 保留登录、MFA、绑定、授权、重新认证和任务切换的现有业务流程。

[建议] SVG 外部个人卡保留独立导出尺寸。

[必须] 冲突时依次保护安全事实与用户要求、无障碍、读者任务、项目约定、品牌表达和装饰细节。

## 2. 品牌与读者

[建议] 首屏为竞技编程用户、OAuth 集成开发者和管理员说明当前任务。

[建议] 主要按钮使用动作动词。

[必须] 危险动作显示目标身份。

[建议，决策] 以紧凑字号、可读文字导航和少量白色任务面板表达友好感。来源：用户要求“略微缩小 UI 尺寸，视觉更友好”；本次浏览器测量中的 103px 顶栏、240px 侧栏和重复品牌标题。

[建议] 沿用既有蓝灰配色、低噪声边线及本地字体资源。

## 3. 页面结构与构图

- [建议，决策] 工作台桌面侧栏使用 `--sidebar-width` 的 220px。来源：本次 240px 侧栏基线与轻度缩小要求。
- [建议，决策] 工作台桌面顶栏使用 64px 最小高度。来源：本次 103px 顶栏基线；偏好字段改为同行显示。
- [建议] 工作台内容保留最大 1200px 可用宽度。
- [建议] 任务表单保留最大 680px 宽度。
- [建议，决策] 文档正文保留最大 880px 宽度。来源：已有 `pages/about.vue` 的阅读布局与轻度缩小要求。
- [建议] 小于 1024px 时使用最小高度 56px 的顶栏和左侧 Element Plus drawer。
- [必须] 关闭 drawer 后不允许抽屉内容聚焦。
- [建议] 首页将标题和账号操作放在同一个主任务表面。
- [建议] 首页将公告置于主列。
- [建议] 首页将统计与近期用户置于次列。
- [建议] 小于 768px 时将首页内容重排为单列。
- [建议，决策] 小于 480px 时将首页登录与注册入口并排等宽显示。来源：本次 390px 基线中纵向按钮占据过多首屏；保持入口与顺序不变。
- [建议，决策] 认证与授权采用最大 420px 的单任务表面。来源：已有 440px 表面与轻度缩小要求。
- [建议] 短屏认证页保持正常文档流。
- [建议] 个人页只显示一个活动任务。
- [必须] 个人页保留资料、绑定、安全、授权应用、公开展示、偏好的既有任务顺序。
- [建议] 管理与开发者页面按标题和主要操作、当前结果、次要帮助的顺序排布。
- [建议] 文档以目录、顺序章节和末尾资料卡说明结束。
- [建议] 公开资料以身份、公开账号和获准公开的统计结束。

## 4. 视觉规则

### 排版与颜色

[建议，决策] 正文使用 `--font-size-body` 的 15px 和 1.65 行高。来源：已有 16px/1.6 基线与用户轻度缩小要求。

[建议，决策] 页面标题使用 `--font-size-title` 的 26px 和 1.3 行高。来源：已有 28px 标题与用户轻度缩小要求。

[建议，决策] 小于 768px 时将页面标题切换到 `--font-size-title-mobile` 的 22px。来源：已有 24px 手机标题与用户轻度缩小要求。

[建议，决策] 章节标题使用 `--font-size-section` 的 18px 和 1.4 行高。来源：已有 20px 章节标题与用户轻度缩小要求。

[建议，决策] 子标题使用 `--font-size-subheading` 的 16px 和 1.4 行高。来源：已有 17px 子标题与用户轻度缩小要求。

[建议] 控件、帮助和权限事实使用 `--font-size-control` 的 14px。

[建议，决策] 非关键元数据使用 `--font-size-meta` 的 13px。来源：仅收紧时间、账号标识和品牌辅助文字，不缩小错误及帮助。

[建议] 拉丁正文使用本地 Source Sans 3 Variable。

[建议] 中文使用既有 Noto Sans CJK SC/Microsoft YaHei 回退。

[建议] 日文优先使用既有 Noto Sans CJK JP/Yu Gothic 回退。

[建议] 数字使用 tabular-nums。

[建议] 代码使用既有 monospace 字体栈。

[建议] 浅色页面继续使用已有 `--el-bg-color-page`、`--el-bg-color`、`--el-text-color-*` 与 `--el-color-primary`。

[建议] 深色页面继续使用 `.dark` 中的对应颜色 token。

[必须] 主要阅读文本和帮助文本保持至少 4.5:1 的对比度。

### 空间与表面

[建议] 间距使用既有 `--space-1..6`。

[建议，决策] 主要表面的内边距使用 `--panel-padding` 的 20px。来源：用户轻度缩小要求；以独立语义角色保留既有间距名称。

[建议] 小于 768px 时将表面内边距切换到 16px。

[建议，决策] 桌面内容容器左右内边距使用 24px。来源：已有 32px 内边距与用户轻度缩小要求。

[建议] 手机内容容器左右内边距保留 16px。

[建议] 分组间距使用 24px。

[建议，决策] 主表面圆角使用 `--card-radius` 的 10px。来源：用户“视觉更友好”；仅柔化现有 8px 表面，不引入嵌套卡片。

[建议] 静态表面使用边线表达层级。

[建议] 浮层使用已有 Element Plus 阴影。

[必须] 页面自有样式不得硬编码第二套配色。

### 图标与数据

[建议] 图标复用 lucide 与本地平台 SVG。

[建议] 未知平台使用 Code 图标和可读名称。

[必须] 图表提供相邻的文本或表格数据。

[必须] 远程图片失败时保留姓名或项目名称。

### 控件和状态

- [必须] 控件目标保持至少 44×44px。
- [必须] 键盘焦点使用 2px 主色 outline 和 2px 偏移。
- [必须] 不裁剪焦点轮廓。
- [建议，决策] 按钮和输入以 44px 为常规高度。来源：本次认证按钮实测 47px；在无障碍约束内轻度缩小。
- [必须] 小于 768px 时输入文字使用至少 16px 以避免 iOS 输入放大。
- [建议] 导航悬停使用轻背景。
- [建议] 当前导航同时使用主色、字重和明确的选中标记。
- [建议] 次要操作使用中性边框或文字链接。
- [建议] 同一操作组内相邻 Element Plus 按钮只使用容器 gap。
- [必须] 表单用持久label、autocomplete和对应字段错误，不以placeholder代替名称；OTP支持numeric键盘、one-time-code与粘贴。
- [必须] 初载、真实空、错误、保存中区分；失败保留输入并可重试，未知数据不显示0。
- [必须] dialog/drawer有可访问标题、Escape、焦点圈定与归还；导航是链接，动作是button，禁止嵌套交互元素。
- [必须] 每页一个h1和main landmark、无页面横向溢出；长ID和URL局部滚动/换行。
- [必须] secret只显示一次、关闭/成功后清状态；明确点击复制，失败不报成功。
- [必须] 敏感修改先重新认证；洛谷登录只用于已有绑定账户，不使用自动注册提示。

### 动效

[建议] drawer 和状态转换使用 120–180ms。

[必须] `prefers-reduced-motion` 取消非必要移动。

[建议] 普通内容不使用瀑布入场或鼠标跟随装饰。

## 5. 可用原语

| 角色           | 实现名称或值                                                                                                                                      | 来源                                                               | 使用条件                                               | 状态   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------ | ------ |
| 页面/文字/强调 | --bg-primary、--bg-secondary、--bg-tertiary、--text-primary、--text-secondary、--text-muted、--accent、--accent-subtle                            | assets/scss/main.scss；色值来自 assets/scss/element-overrides.scss | 所有页面                                               | 已实现 |
| 表面与边线     | --card-bg、--card-border、--card-radius、--card-shadow、--border-color、--divider-subtle                                                          | assets/scss/main.scss                                              | 分区与浮层                                             | 已实现 |
| 间距           | --space-1、--space-2、--space-3、--space-4、--space-5、--space-6、--panel-padding                                                                 | assets/scss/main.scss                                              | 分组间距与表面内边距                                   | 已实现 |
| 排版           | --font-size-body、--font-size-control、--font-size-meta、--font-size-title、--font-size-title-mobile、--font-size-section、--font-size-subheading | assets/scss/main.scss                                              | 对应文字角色；不得新增平行字号                         | 已实现 |
| 字体           | --font-body                                                                                                                                       | assets/scss/main.scss；加载入口为 nuxt.config.ts                   | 正文和继承该字体的控件；中文与日文保留本机回退         | 已实现 |
| 导航宽度       | --sidebar-width                                                                                                                                   | assets/scss/main.scss                                              | 桌面工作台                                             | 已实现 |
| 页面标题       | AppPageHeader(title,description?)、actions slot                                                                                                   | components/AppPageHeader.vue                                       | 每页唯一标题                                           | 已实现 |
| 异步结果       | AppAsyncState(pending,error?,empty?,emptyText?)、retry event                                                                                      | components/AppAsyncState.vue                                       | 区块结果/错误/空                                       | 已实现 |
| 偏好           | AppPreferences(inline?)                                                                                                                           | components/AppPreferences.vue                                      | 顶栏同行显示；弹出层与任务保持字段布局                 | 已实现 |
| 用户/平台身份  | AppUserAvatar/AppPlatformIcon(platform)                                                                                                           | components/AppUserAvatar.vue、components/AppPlatformIcon.vue       | 头像、平台标识；未知或失败图标使用 Code                | 已实现 |
| 表单/弹窗/分页 | el-form/el-input/el-select/el-option/el-button/el-dialog/el-drawer/el-pagination                                                                  | Element Plus；assets/scss/element-overrides.scss                   | 复用键盘能力；展开选项、分页按钮和页码目标至少 44×44px | 已实现 |
| 任务布局       | task-panel、task-section、task-section\_\_hint、task-actions                                                                                      | assets/scss/main.scss                                              | 680px 白色任务表面与分区；不嵌套普通卡片               | 已实现 |
| 内容分区       | ui-card、ui-quote-block、ui-stat-grid                                                                                                             | assets/scss/main.scss                                              | 有边界的结果、引用与两列统计；不嵌套普通卡片           | 已实现 |
| 页面布局       | default、auth                                                                                                                                     | layouts/default.vue、layouts/auth.vue                              | 工作台侧栏/手机抽屉、认证单任务页                      | 已实现 |
| 认证表面       | auth-card、auth-card**title、auth-card**desc、auth-card\_\_actions                                                                                | layouts/auth.vue                                                   | 认证、授权与回调；使用语义 section 而非嵌套卡片        | 已实现 |
| 评级历史       | UserRatingHistoryChart(history)                                                                                                                   | components/user/RatingHistoryChart.client.vue                      | 公开许可的历史数据；保留可展开数据表                   | 已实现 |

以上名称为公开原语。页面自有样式采用自身BEM命名空间，可调整业务排布，不覆盖原语的字体、颜色、焦点或表面；需要变化应修改共用token而不是添加平行实现。

### 概念—名称

| 概念       | 名称           |
| ---------- | -------------- |
| 工作台导航 | AppSidebar     |
| 页面主标题 | AppPageHeader  |
| 任务表单   | task-panel     |
| 认证表面   | auth-card      |
| 字段偏好   | AppPreferences |
| 主操作色   | --accent       |
| 结果状态   | AppAsyncState  |

最小调用：`<AppPageHeader :title="t('profile.title')" />`；操作插槽为 `#actions`。

顶栏偏好调用：`<AppPreferences inline />`；任务内偏好调用：`<AppPreferences />`。

## 6. 文案与数据

动作写“绑定账号”“撤销授权”“保存资料”，避免泛用“确定”。错误说明原因及下一步，不输出内部路径、堆栈、上游正文或秘密。所有文案同步en/zh/ja；html lang分别en/zh-CN/ja。时间保持现有UTC+8业务语义并明确UTC+08:00标签。授权页显示实际客户端、回调origin及权限，不编造ID Token能力。洛谷入口明确先注册CP OAuth并绑定洛谷后才能登录。

## 7. 反模式

- [必须] 不把失败结果显示成“暂无数据”或0。
- [必须] 不把密码/OTP/reauth证明写进URL、localStorage或可读cookie。
- [建议] 不把居中宣传标题加卡片网格当所有任务页模板。
- [建议] 不嵌套普通结果卡片。
- [建议] 不为普通元数据使用彩色胶囊。
- [建议] 不添加装饰性图标块或彩色图标底板。
- [建议] 不使用原语之外的字号、字重或颜色字面值。
- [建议] 不使用整体缩放来缩小界面。
- [建议] 不在认证表面重复顶栏已有的品牌文字。
- [必须] 不用小号低对比文字承载错误、帮助或权限事实。
- [建议] 不直接复制参考站的纯图标轨道、品牌资产或广告。

## 8. 实现与接入

Nuxt4 SSR/Element Plus/lucide不换框架。CSS入口加载Fontsource本地资源及唯一token层；主题由color-mode .dark切换，Shiki双主题CSS不重新渲染。状态由请求隔离useAuth/useApi/usePublicConfig共用，不新增Pinia。页面按任务composable取数，只有活动面板请求；图表客户端接近视口后lazy import。登录用户的主题和语言以账号保存值为准，SSR水合后覆盖浏览器旧偏好；游客使用本地偏好。浏览器检查证据保存在任务记录，不以原语已实现代替页面检查。
