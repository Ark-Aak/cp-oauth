---
name: cp-oauth-design
description: CP OAuth 登录、绑定、授权、公开内容、开发者及管理工作台；为竞技编程用户提供尺寸克制、层级清楚、反馈明确的蓝灰身份界面。
version: 2026-10-11
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

[建议，决策] 以 36px 紧凑控件、带图标的左侧导航和白色卡片分区表达清楚而友好的工具站。来源：用户反馈扁平顶栏方案“太简陋”，要求改回侧边栏与卡片布局。

[建议] 沿用既有蓝灰配色、低噪声边线及本地字体资源。

## 3. 页面结构与构图

- [必须] 工作台桌面使用 `--sidebar-width` 的 232px 固定左侧导航（`AppSidebar`）：顶部品牌，中部图标与文字导航，底部账号卡（头像、昵称、账号标识、退出）。右侧工作区顶部为 48px（`--topbar-height`）粘性条，显示当前分区名与偏好入口。来源：用户要求侧边栏。
- [建议] 工作区内容最大 1240px，左右内边距桌面 32px、手机 16px。
- [建议] 独立任务表单（如站点配置）保留最大 680px 宽度。
- [必须] 主从设置布局中的活动面板填满导航右侧的可用宽度，不受普通任务表单 680px 上限限制。来源：用户要求加宽中央设置卡片。
- [建议，决策] 文档正文保留最大 880px 宽度。来源：已有 `pages/about.vue` 的阅读布局与轻度缩小要求。
- [建议] 小于 1024px 时隐藏侧栏，顶部条显示菜单按钮与品牌，菜单打开同一 `AppSidebar` 的左侧 drawer。
- [必须] 关闭 drawer 后不允许抽屉内容聚焦。
- [建议] 首页将标题和账号操作放在同一个欢迎卡片。
- [必须] 桌面欢迎表面与引用表面以 2:1 并排；小于 768px 时引用紧随欢迎表面向下重排。来源：用户要求调整一言位置。
- [建议，决策] 首页公告横跨主内容宽度；统计与近期成员作为次级行并排在公告之后。来源：本次 1440px 基线中公告列约 206px 高、旁侧次列约 835px，留下大片空白。
- [建议] 首页欢迎卡片不重复侧栏账号卡已显示的头像、昵称与账号标识。
- [建议] 小于 768px 时将首页内容重排为单列。
- [必须] 认证页使用最大 440px 的白色卡片（`auth-card`：1px 边框、浅阴影、32px 内边距，手机 24/16px）置于页面背景上；授权页卡片最大 520px。来源：用户要求卡片布局。
- [必须] 授权卡片以较大字号填满版面：22px 标题，应用名 18px 与首字母标识块并排于主色浅底横幅，权限逐条显示为 16px 文本的浅底圆角条目，当前账号为带 44px 头像的边框行，底部拒绝与授权按钮 1:2 并排、高 42px。来源：用户反馈授权页留白过多。
- [建议] 普通短屏认证页保持正常文档流。
- [必须] 所有认证页（登录、注册、找回与重置密码、邮箱验证结果、第三方回调、洛谷登录、授权）共用 `auth` 布局：无侧栏，右上角只放无背景语言与主题图标，底部使用全视宽分割线页脚；布局同样加载账号身份，使账号偏好在冷启动时生效。来源：用户要求移除登录顶栏、页脚模仿授权页；独立认证布局曾不加载身份。
- [建议，决策] 授权以外的认证页在表面上方居中显示一次站点名并链接首页；授权页不显示站点名。来源：移除顶栏后保留返回首页入口。
- [必须] 授权布局使用 100dvh 可见容器；短屏或长内容只在可键盘访问的主区域内滚动，不产生页面滚动或裁剪操作。其他认证页使用至少 100dvh 的正常文档流。来源：用户视高限制与无障碍要求。
- [建议] 认证表面按标题、一句说明、主表单与主按钮、其他方式、底部切换链接的顺序排布；每个状态只保留一个主按钮。
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

[必须] 长公告正文使用 14px 和 1.85 行高，按段落与列表分组；保留标题、正文、发布时间的清晰间距。来源：用户要求改善文本密度。

[必须] 认证表面标题使用 `--font-size-title-mobile` 的 22px、字重 700；授权标题同为 22px 并附一个主色图标。标题下一句说明使用 `auth-card__lead`，字段规则使用紧贴字段的 `auth-card__field-hint`（14px）并以 `aria-describedby` 关联。来源：用户要求登录限制说明不使用 13px；授权页留白反馈。

[建议，决策] 非关键元数据使用 `--font-size-meta` 的 13px。来源：仅收紧时间、账号标识和品牌辅助文字，不缩小错误及帮助。

[必须] 拉丁正文使用本地 Lato。来源：用户指定字体。

[建议] 中文使用既有 Noto Sans CJK SC/Microsoft YaHei 回退。

[建议] 日文优先使用既有 Noto Sans CJK JP/Yu Gothic 回退。

[建议] 数字使用 tabular-nums。

[必须] 代码、标识符和代码编辑字段使用 `--font-code` 的本地 Fira Code。来源：用户指定字体。

[建议] 浅色页面继续使用已有 `--el-bg-color-page`、`--el-bg-color`、`--el-text-color-*` 与 `--el-color-primary`。

[建议] 深色页面继续使用 `.dark` 中的对应颜色 token。

[必须] 主要阅读文本和帮助文本保持至少 4.5:1 的对比度。

### 空间与表面

[建议] 间距使用既有 `--space-1..6`。

[必须] 页面每个顶层区域使用一个 `ui-card`（白底、1px `--card-border`、4px 圆角、`--card-shadow` 浅阴影、`--panel-padding` 20px，手机 16px）；并列卡片之间只用 24px 间距，不加分隔线。卡片标题使用 `ui-card__header` 与 `ui-card__title`。来源：用户要求卡片布局。

[必须] 卡片内部子区块使用 `ui-section` 上边线分组；条目列表使用 `--divider-subtle` 分隔线或浅底边框条目。

[必须] 内联提示使用 `ui-note`：3px 语义色左边线配同色浅底（`--accent-subtle`、`--el-color-warning-light-9`、`--el-color-danger-light-9`）。

[建议，决策] 桌面内容容器左右内边距使用 32px。来源：侧栏布局下的阅读宽度。

[建议] 手机内容容器左右内边距保留 16px。

[建议，决策] 手机工作台内容上下内边距同样使用 16px；移动标题和设置分组使用 16px 间距，避免叠加外层空白。来源：用户要求检查多余 margin/padding。

[建议] 分组间距使用 24px。

[必须] 主表面与常规控件圆角使用 4px；小圆角使用 2px，保留圆形头像。来源：用户要求减小全站圆角并实行极简主义。

[建议] 卡片内需要独立边界的对象（统计格、平台选择格、二维码区）使用 `--bg-secondary` 浅底小块，不再嵌套带阴影的卡片。

[建议] 浮层使用已有 Element Plus 阴影。

[必须] 页面自有样式不得硬编码第二套配色。

### 图标与数据

[必须] 界面操作与章节图标使用 Lucide，无彩色图标底板；平台品牌标识保留本地 SVG。来源：用户指定图标库。

[建议] 未知平台使用 Code 图标和可读名称。

[必须] 图表提供相邻的文本或表格数据。

[必须] 远程图片失败时保留姓名或项目名称。

[必须] 缺省或失败的用户图片显示稳定的几何头像；同一用户在不同表面保持一致。来源：用户要求 hash avatar。

### 控件和状态

- [必须] 按钮与输入高度使用 `--control-height` 的 36px；图标按钮 36×36（`is-icon-only`）；下拉选项、复选框、单选和分页按钮 32px。来源：用户选择全端 36px，替代原 44px 触控下限。
- [必须] 键盘焦点使用 2px 主色 outline 和 2px 偏移。
- [必须] 不裁剪焦点轮廓。
- [必须] 按钮随文字宽度，任何表单按钮不使用 `width: 100%`；每个表单或状态只有一个主按钮，放在表单末尾 `task-actions` 行左对齐，次要动作在其右侧。授权卡片的拒绝与授权按钮是唯一例外，按 1:2 栅格填满卡片宽度。来源：用户要求摈弃大按钮；授权页留白反馈。
- [必须] 删除、撤销、解绑等危险操作使用 `type="danger" text` 按钮，不使用带底框的 `plain` 样式。
- [建议] 页面级操作放在 `AppPageHeader` 的 `#actions`，与标题同行右对齐；手机端换行到标题下方左对齐。
- [必须] 小于 768px 时输入文字使用至少 16px 以避免 iOS 输入放大。
- [建议] 侧栏与 drawer 导航悬停使用轻背景。
- [建议] 当前导航同时使用主色、字重和明确的选中标记：侧栏为浅主色底加 3px 左侧标记，管理分区为浅主色底的胶囊标签。
- [建议] 次要操作使用中性边框或文字链接。
- [建议] 同一操作组内相邻 Element Plus 按钮只使用容器 gap。
- [必须] 深色主题中文字型和链接型按钮保留各自语义色，不套用实底按钮的深色文字。来源：本次深色开发者与管理页的删除按钮测得 rgb(10,10,10) 文字，几乎不可见。
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

| 角色           | 实现名称或值                                                                                                                                      | 来源                                                               | 使用条件                                            | 状态   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------- | ------ |
| 页面/文字/强调 | --bg-primary、--bg-secondary、--bg-tertiary、--text-primary、--text-secondary、--text-muted、--accent、--accent-subtle                            | assets/scss/main.scss；色值来自 assets/scss/element-overrides.scss | 所有页面                                            | 已实现 |
| 表面与边线     | --card-bg、--card-border、--card-radius、--card-shadow、--border-color、--divider-subtle                                                          | assets/scss/main.scss                                              | 分区与浮层                                          | 已实现 |
| 间距           | --space-1、--space-2、--space-3、--space-4、--space-5、--space-6、--panel-padding                                                                 | assets/scss/main.scss                                              | 分组间距与表面内边距                                | 已实现 |
| 排版           | --font-size-body、--font-size-control、--font-size-meta、--font-size-title、--font-size-title-mobile、--font-size-section、--font-size-subheading | assets/scss/main.scss                                              | 对应文字角色；不得新增平行字号                      | 已实现 |
| 字体           | --font-body、--font-code                                                                                                                          | assets/scss/main.scss；本地字体加载入口为 assets/css/vendor.css    | Lato 正文；Fira Code 代码；中文与日文保留本机回退   | 已实现 |
| 布局尺寸       | --sidebar-width、--control-height、--topbar-height                                                                                                | assets/scss/main.scss                                              | 232px 侧栏、36px 控件、48px 工作区顶部条            | 已实现 |
| 页面标题       | AppPageHeader(title,description?,icon?)、actions slot                                                                                             | components/AppPageHeader.vue                                       | 每页唯一标题；可选 24px Lucide 图标                 | 已实现 |
| 异步结果       | `AppAsyncState(pending,error?,empty?,emptyText?,emptyIcon?)`、retry event                                                                         | components/AppAsyncState.vue                                       | 区块结果/错误/空；保留失败重试与空状态图标          | 已实现 |
| 偏好           | `AppPreferences(mode?: fields/icons)`                                                                                                             | components/AppPreferences.vue                                      | 常规字段与无背景图标按钮两种展示；共享保存反馈      | 已实现 |
| 用户/平台身份  | AppUserAvatar(size?,src?,name?,seed?)/AppPlatformIcon(platform)                                                                                   | components/AppUserAvatar.vue、components/AppPlatformIcon.vue       | 用户图片与几何回退；平台标识及 Code 回退            | 已实现 |
| 表单/弹窗/分页 | el-form/el-input/el-select/el-option/el-button/el-dialog/el-drawer/el-pagination；`is-icon-only` 图标按钮                                         | Element Plus；assets/scss/element-overrides.scss                   | 复用键盘能力；控件 36px，选项、复选与分页 32px      | 已实现 |
| 任务布局       | `task-section`、`task-section__hint`、`task-actions`                                                                                              | assets/scss/main.scss                                              | 表单末尾操作行；按钮随文字宽度                      | 已实现 |
| 卡片与分区     | `ui-card`、`ui-card__header`、`ui-card__title`、`ui-stack`、`ui-section`                                                                          | assets/scss/main.scss                                              | 顶层区域卡片；卡片内子区块以上边线分组              | 已实现 |
| 内联提示       | `ui-note`、`ui-note--accent`、`ui-note--warning`、`ui-note--danger`                                                                               | assets/scss/main.scss                                              | 语义色左边线配同色浅底                              | 已实现 |
| 页面布局       | `default`、`auth`                                                                                                                                 | layouts/default.vue、layouts/auth.vue                              | 工作台侧栏/手机抽屉；认证页卡片、图标偏好与全宽页脚 | 已实现 |
| 工作台导航     | `AppSidebar(user,anonymous,logoutPending)`，emits `logout`、`navigate`                                                                            | components/AppSidebar.vue                                          | 桌面固定侧栏与手机 drawer 共用                      | 已实现 |
| 认证表面       | `auth-card`、`auth-card__title`、`auth-card__lead`、`auth-card__desc`、`auth-card__field-hint`、`auth-card__divider`、`auth-card__footer`         | layouts/auth.vue                                                   | 认证、授权与回调的白色卡片                          | 已实现 |
| 评级历史       | UserRatingHistoryChart(history)                                                                                                                   | components/user/RatingHistoryChart.client.vue                      | 公开许可的历史数据；保留可展开数据表                | 已实现 |
| 文字导航       | `ui-menu-link`、`ui-navigation-link`                                                                                                              | assets/scss/main.scss                                              | 菜单、导航及非普通阅读链接；保留可见选中状态        | 已实现 |
| 空状态         | `AppEmptyState(text?,icon?)`、default slot                                                                                                        | components/AppEmptyState.vue                                       | 真实空结果；不能替代加载或错误                      | 已实现 |
| 输入格式提示   | `AppInputFormatHint(format)`，format 为 `markdown` 或 `html`                                                                                      | components/AppInputFormatHint.vue                                  | 对应内容编辑字段；保留真实格式说明                  | 已实现 |

以上名称为公开原语。页面自有样式采用自身BEM命名空间，可调整业务排布，不覆盖原语的字体、颜色、焦点或表面；需要变化应修改共用token而不是添加平行实现。

### 概念—名称

| 概念       | 名称           |
| ---------- | -------------- |
| 工作台导航 | AppSidebar     |
| 页面主标题 | AppPageHeader  |
| 内容区域   | ui-card        |
| 认证表面   | auth-card      |
| 字段偏好   | AppPreferences |
| 主操作色   | --accent       |
| 结果状态   | AppAsyncState  |

最小调用：`<AppPageHeader :title="t('profile.title')" />`；操作插槽为 `#actions`。

偏好调用：`<AppPreferences />`；工作区顶部条放入可访问的偏好弹出层，字段在 480px 以下纵向拉伸。认证布局使用无背景图标模式 `<AppPreferences mode="icons" />`。

## 6. 文案与数据

动作使用具体动词，避免泛用“确定”。错误说明原因及下一步，不输出内部路径、堆栈、上游正文或秘密。时间显示明确的时区标签。面向用户的权限列表只显示可读描述，不附内部标识符；不编造能力或安全结论。

术语与语气在三种语言中一致：英文按钮与标题用句首大写，使用 Sign in/Sign out；中文统一用“你”“账号”“绑定”“通行密钥”“算法竞赛”；日文用です・ます体、“パスキー”“連携”。进度文字用单字符省略号“…”，成功反馈只陈述结果，不用感叹号。第三方登录按钮只显示平台名，完整动作放在可访问名称中。

## 7. 反模式

- [必须] 不把失败结果显示成“暂无数据”或0。
- [必须] 不把密码/OTP/reauth证明写进URL、localStorage或可读cookie。
- [建议] 不把居中宣传标题加卡片网格当所有任务页模板。
- [建议] 不在卡片内再嵌套带阴影的卡片；内部分组用 `ui-section` 或浅底小块。
- [必须] 不使用整行撑满的表单按钮。来源：用户要求摈弃大按钮。
- [建议] 不为普通元数据使用彩色胶囊。
- [建议] 不添加装饰性图标块或彩色图标底板。
- [建议] 不使用原语之外的字号、字重或颜色字面值。
- [建议] 不使用整体缩放来缩小界面。
- [建议] 不在认证表面内重复站点名；站点名只在表面上方出现一次。
- [必须] 不用小号低对比文字承载错误、帮助或权限事实。
- [建议] 不直接复制参考站的纯图标轨道、品牌资产或广告。

## 8. 实现与接入

Nuxt4 SSR/Element Plus/lucide不换框架。CSS按 `assets/css/vendor.css`、`assets/scss/main.scss`、`assets/scss/element-overrides.scss` 顺序加载；vendor.css导入既有Element Plus及Fontsource本地字体，main.scss保留唯一token层。主题由color-mode .dark切换，Shiki双主题CSS不重新渲染。状态由请求隔离useAuth/useApi/usePublicConfig共用，不新增Pinia。页面按任务composable取数，只有活动面板请求；图表客户端接近视口后lazy import。登录用户的主题和语言以账号保存值为准，SSR水合后覆盖浏览器旧偏好；游客使用本地偏好。浏览器检查证据保存在任务记录，不以原语已实现代替页面检查。
