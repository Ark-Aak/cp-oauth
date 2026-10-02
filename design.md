---
name: cp-oauth-design
description: CP OAuth 登录、绑定、授权、开发者及管理工作台；以身份任务与可访问操作为优先，参考洛谷保存站的蓝灰层次和轻量内容排版。
version: 2026-10-02
---

## 1. 范围与优先级

覆盖全部现有页面、共享导航、表单、列表、弹窗和浅/深主题。SVG外部个人卡保留独立导出尺寸，不套交互布局。优先保护安全事实与用户任务、无障碍、框架约定，再处理品牌装饰。

## 2. 品牌与读者

服务竞技编程用户、OAuth集成开发者和管理员。首屏先说明当前任务，主要按钮用动作动词，危险动作显示目标身份。

[建议，决策] 参考 https://www.luogu.me/ 的浅蓝灰页面、蓝色图标、低噪声边线和主次内容分列，不复制标志、广告、分析脚本或版权资源。实际观察为1440×900和390×844浅色视口；原站64px纯图标轨道不直接复制，CP OAuth使用可读文字导航。

## 3. 页面结构与构图

- 工作台使用240px桌面文字侧栏，内容最大1200px；表单680px、文档900px。
- 小于1024px切56px顶栏与左侧Element Plus drawer，宽min(320px,100vw - 32px)。关闭drawer后内容不可聚焦。
- 首页主任务入口先于公告、统计和随机句子；公告主列、统计/近期用户次列，窄屏单列。
- 认证与授权使用440px单任务表面；短屏不添加vh顶部空洞，页脚在正常文档流中。
- 个人页只显示一个活动任务，任务顺序为资料、绑定、安全、授权应用、公开展示、偏好。
- 管理与开发者采用标题/主要操作、当前结果、次要帮助的顺序；不把普通数据再包入嵌套卡片。

## 4. 视觉规则

### 排版与颜色

[建议，决策] 正文16px/1.6，辅助与控件14px/1.5，h1桌面28px/1.3、手机24px，h2为20px/1.4。Source Sans 3 Variable自托管，中文使用本机Noto Sans CJK SC/Microsoft YaHei回退，日文优先Noto Sans CJK JP/Yu Gothic；数字tabular-nums，代码monospace。来源：批准的可读性要求与真实Fontsource包。

[建议，决策] 浅色页面#f6f9fd、主表面#ffffff、文字#10233f/#475569/#64748b、边线#dbe5ef，主操作#2f6db5。深色页面#0a0a0a、表面#141414/#1e1e1e、文字#f3f4f6/#d1d5db/#9ca3af、主操作#5fb3c8。来源：用户指定洛谷保存站参照及已计算的深色对比度问题；最终文字对比度至少4.5:1。

### 空间与表面

spacing使用4/8/12/16/24/32px六级token。容器桌面24–32px内边距、手机16px；分组间24px。圆角8px，静态分区以边线表达，浮层才使用明显阴影。页面自有样式不得硬编码第二套配色。

### 图标与数据

继续用lucide和已有本地平台SVG。缺失/未知平台用Code图标与可读名称，不请求第三方icon CDN。图表旁提供文本/表格，不能以hover作为唯一数据入口；远程图片失败保留姓名或项目名称。

### 控件和状态

- [必须] 控件目标至少44×44px；焦点2px主色outline、2px偏移，不能裁剪。
- [必须] 表单用持久label、autocomplete和对应字段错误，不以placeholder代替名称；OTP支持numeric键盘、one-time-code与粘贴。
- [必须] 初载、真实空、错误、保存中区分；失败保留输入并可重试，未知数据不显示0。
- [必须] dialog/drawer有可访问标题、Escape、焦点圈定与归还；导航是链接，动作是button，禁止嵌套交互元素。
- [必须] 每页一个h1和main landmark、无页面横向溢出；长ID和URL局部滚动/换行。
- [必须] secret只显示一次、关闭/成功后清状态；明确点击复制，失败不报成功。
- [必须] 敏感修改先重新认证；洛谷登录只用于已有绑定账户，不使用自动注册提示。

### 动效

drawer/状态转换120–180ms；prefers-reduced-motion取消非必要移动。普通内容不使用瀑布入场或鼠标跟随装饰。

## 5. 可用原语

| 角色           | 实现名称或值                                                              | 来源                                                               | 使用条件                                     | 状态   |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------- | ------ |
| 页面/文字/强调 | --bg-primary/secondary/tertiary、--text-primary/secondary/muted、--accent | assets/scss/main.scss；色值来自 assets/scss/element-overrides.scss | 所有页面                                     | 已实现 |
| 表面           | --card-bg/border/radius/shadow、--border-color                            | assets/scss/main.scss                                              | 分区与浮层                                   | 已实现 |
| 间距           | --space-1..6                                                              | assets/scss/main.scss                                              | 4/8/12/16/24/32px                            | 已实现 |
| 页面标题       | AppPageHeader(title,description?)、actions slot                           | components/AppPageHeader.vue                                       | 每页唯一标题                                 | 已实现 |
| 异步结果       | AppAsyncState(pending,error?,empty?,emptyText?)、retry event              | components/AppAsyncState.vue                                       | 区块结果/错误/空                             | 已实现 |
| 偏好           | AppPreferences                                                            | components/AppPreferences.vue                                      | 游客和登录顶栏及偏好任务；登录用户保存到账号 | 已实现 |
| 用户/平台身份  | AppUserAvatar/AppPlatformIcon(platform)                                   | components/AppUserAvatar.vue、components/AppPlatformIcon.vue       | 头像、平台标识；未知或失败图标使用 Code      | 已实现 |
| 表单/弹窗      | el-form/el-input/el-button/el-dialog/el-drawer                            | Element Plus                                                       | 复用组件实际焦点/键盘能力                    | 已实现 |
| 任务布局       | task-panel、task-section、task-section\_\_hint、task-actions              | assets/scss/main.scss                                              | 680px任务表单、分区与操作；不覆盖焦点/表面   | 已实现 |
| 内容分区       | ui-card、ui-quote-block、ui-stat-grid                                     | assets/scss/main.scss                                              | 有边界的结果、引用与两列统计；不嵌套普通卡片 | 已实现 |
| 页面布局       | default、auth                                                             | layouts/default.vue、layouts/auth.vue                              | 工作台侧栏/手机抽屉、认证单任务页            | 已实现 |

以上名称为公开原语。页面自有样式采用自身BEM命名空间，可调整业务排布，不覆盖原语的字体、颜色、焦点或表面；需要变化应修改共用token而不是添加平行实现。

## 6. 文案与数据

动作写“绑定账号”“撤销授权”“保存资料”，避免泛用“确定”。错误说明原因及下一步，不输出内部路径、堆栈、上游正文或秘密。所有文案同步en/zh/ja；html lang分别en/zh-CN/ja。时间保持现有UTC+8业务语义并明确UTC+08:00标签。授权页显示实际客户端、回调origin及权限，不编造ID Token能力。洛谷入口明确先注册CP OAuth并绑定洛谷后才能登录。

## 7. 反模式

- [必须] 不把失败结果显示成“暂无数据”或0。
- [必须] 不把密码/OTP/reauth证明写进URL、localStorage或可读cookie。
- [建议] 不把居中宣传标题加卡片网格当所有任务页模板。
- [建议] 不嵌套卡片、不给每条普通元数据彩色胶囊或装饰图标底板。
- [必须] 不用小号低对比文字承载错误、帮助或权限事实。
- [建议] 不直接复制参考站的纯图标轨道、品牌资产或广告。

## 8. 实现与接入

Nuxt4 SSR/Element Plus/lucide不换框架。CSS入口加载Fontsource本地资源及唯一token层；主题由color-mode .dark切换，Shiki双主题CSS不重新渲染。状态由请求隔离useAuth/useApi/usePublicConfig共用，不新增Pinia。页面按任务composable取数，只有活动面板请求；图表客户端接近视口后lazy import。登录用户的主题和语言以账号保存值为准，SSR水合后覆盖浏览器旧偏好；游客使用本地偏好。浏览器检查证据保存在任务记录，不以原语已实现代替页面检查。
