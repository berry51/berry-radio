# Berry Radio · 设计系统（DESIGN.md）

> 唯一设计锚。任何视觉改动先对照本文件，改动后同步更新本文件。
> 版本：0.6.0 · 2026-10-20

## 1. 设计读取

- **产品**：Obsidian 电台插件。四个入口共享同一个播放实例——笔记内嵌播放器、右侧栏面板、状态栏迷你播放器。
- **受众**：在笔记里长时间收听、边写边听的知识库用户。
- **气质**：极简精确，反 AI 套路（Anthropic frontend-design / anti-slop）。
- **拨盘**：`VARIANCE 4` · `MOTION 3` · `DENSITY 5`。
- **参考基准**：`qiaomu-radio-obsidian`（单一品牌强调色 + 发丝线 + 微染色表面），本插件沿用其色彩与层级逻辑，但**形状改为全直角**。

## 2. 功能契约（不可被风格牺牲）

- 存在的理由：不离开笔记就能听电台。
- 3 秒内必须看到：当前是哪台、是否在播、能否控制。
- 必须能完成：**播放/停止**、调音量、选台、收藏、按分类筛选。
- **没有「上一曲 / 下一曲」**：电台是直播流，没有曲目队列。控制区只有一个播放键（播放中显示停止方块，按下即断开连接，不是暂停——暂停会让缓冲继续跑，恢复时听到的是几分钟前的内容）。切台靠列表点选，不靠方向键式的按钮。

## 3. 形状：SHAPE CONSISTENCY LOCK（all-sharp）

**核心决定：全部 `border-radius: 0`，一个例外都没有。**

frontend-design 的 Shape Consistency Lock 只允许三选一：全直角 / 全柔和（12–16px）/ 全药丸。本项目锁 **all-sharp**——圆角、圆形封面、药丸 chip 全部取消；混用被视为破的设计。

| 元素 | 形状 | 尺寸 |
|---|---|---|
| 笔记卡片容器 | 直角，仅顶部发丝线（compact） | — |
| 封面 | 正方形 | 40px（compact）/ 84px（hero）/ 34px（侧栏，窄于 360px 隐藏） |
| 播放/停止键 | 正方形实心，只有一个 | 36px（compact）/ 40px（hero）/ 34px（侧栏，窄于 360px 30px） |
| 分类 chip | 直角矩形 | padding 3×9 |
| 状态点 | 6×6 方块 | — |
| 音量滑块 thumb | 11×11 方块 | — |
| 搜索框 / 下拉 | 直角矩形 | 高 30px |

> 注意：Obsidian 主题会给 `input[type=range]`、输入框加自己的圆角（实测 4px / 8px）。所有自定义控件的选择器必须带上元素名（如 `.br-volume input.br-volume__range`）以提高特异性，否则形状锁会被宿主样式击穿。

## 4. 色彩：单一品牌强调色

**核心决定：不做「每台一色」，也不跟随主题强调色。**

旧版用 `--br-hue`（按站名哈希派生 0–359 色相）驱动强调色、封面渐变与外发光，已移除；0.5.0 曾改为跟随 `--interactive-accent`，但主题默认紫仍有「AI 味」，0.6.0 起改为固定品牌色。

| 角色 | 令牌 | 值 |
|---|---|---|
| 唯一品牌强调色 | `--br-accent` | `#d86d43`（暖赤陶） |
| 强调色淡底 | `--br-accent-soft` | accent 13% |
| 面板（微染色） | `--br-panel` | `color-mix(bg-primary 95%, text-normal)` |
| 面板（更亮） | `--br-panel-raised` | `color-mix(bg-primary 98%, text-normal)` |
| 发丝线 | `--br-line` | `color-mix(text-normal 12%)` |
| 强发丝线 | `--br-line-strong` | `color-mix(text-normal 16%)` |
| 台名 / 正文 | `var(--text-normal)` | Obsidian |
| 次要信息 | `var(--text-muted)` / `var(--text-faint)` | Obsidian |
| 错误 | `var(--text-error)` | Obsidian |

**强调色只出现在四处**：实心播放键、正在播放状态点、选中的分类 chip（淡底 + 强调色字）、键盘焦点环；外加空态的「选择电台」实心按钮。其余一律中性。

**表面与文字仍用 Obsidian 变量**，所以浅色/深色主题自动适配；只有强调色是插件自己的品牌常量。

**电台的身份表达**：台名（字重/字号）+ 分类标 + 电台自己的台标（favicon）。不靠颜色。

## 5. 排版

- 中文正文/UI 用系统中文字体栈，零下载，不引外部字体。
- 层级靠 字号 + 字重 + 颜色，不靠阴影。UI 不用斜体。
- 台名 16px/650（笔记卡片）、20px（侧栏）；分类标 11px/500；meta 11.5px。
- 数字用 `font-variant-numeric: tabular-nums`，音量百分比不跳动。

## 6. 布局

两种笔记卡片排版，由 `settings.blockLayout` 切换：

- **compact（默认）· 方向 A「细线内嵌」**：无卡片容器、顶部一条发丝线、左对齐融入笔记流、40px 方形封面、36px 方形播放键。**frontend-design 明确反对居中 hero，故以此式为默认。**
- **hero · 唱片式**：竖排居中、84px 方形封面、40px 方形播放键。保留为可选，不再是默认。

### 控制区：恒定一行

**播放键与音量并排在同一行，垂直居中，永不换行，永不占第二行。**

```
[▮▮] 🔊 ──────●──── 66%
```

- 播放键扁平 `40px`（compact 卡片 `36px`、侧栏 `34px`，窄侧栏 `30px`）；音量 `flex: 0 1 200px`，窄容器降到 `110px` 下限，不允许撑满整行。
- 播放中用**暂停图标**（`pause`），不用停止方块。行为仍是真停止（直播流没有续播），但图标要符合用户对「按一下就停」的直觉，方块会让人以为这是录制类控件。
- 三处入口（笔记卡片 / 侧栏 / 状态栏）都是这一个形状，没有第二套。
- 卡片总高因此从带独立音量行的 `172px` 降到 `144px`。**这是硬约束：任何新增控件都必须在同一行内解决，或进设置，不许把控制区撑成三行。**

### 音量滑块：自绘轨道 + 自绘滑块

原生 `input[type=range]` 的 `::-webkit-slider-thumb` 要靠 `margin-top` 抵消轨道高度才能垂直居中，
宿主主题一改 `::-webkit-slider-runnable-track` 的高度，滑块就会偏上几像素，且**从外部无法修正**
（伪元素样式不可读、优先级还常被主题压过）。

因此轨道、填充、滑块全部自绘，原生 input 透明叠在上层只负责点击 / 拖动 / 键盘：

```
.br-volume__control  ← position: relative，行高 14px
  .br-volume__track  ← 3px 发丝线
  .br-volume__fill   ← top: 50% + translateY(-50%)
  .br-volume__thumb  ← top: 50% + translateY(-50%)，left: var(--br-vol)
  input              ← opacity: 0，铺满，只管交互
```

滑块与轨道共中线是 `top: 50%` 的几何结果，不再依赖任何 margin 计算，任何主题下都不会偏。
`--br-vol` 同时驱动填充宽度与滑块位置，两者永远对得上。

侧栏面板：与列表之间**只用一条顶部发丝线分隔**，不做卡片盒、不做背景色块（`background: transparent`），
整条播放器压成一行：封面 · 台名/状态 · 播放键 · 音量。窄于 `360px` 时封面让位给台名，窄于 `430px` 时音量只留滑杆本体。
### 状态栏：常驻控制点

状态栏的唯一目的是**不离开当前笔记就能控制电台**。因此：

- 设置里开启后条目**常驻**，不再只在播放时出现；停止后台名保留（显示「选择电台」或上一台的名字），条目不消失。
- 控件只有三个：播放/停止键、台名、切台箭头。台名和箭头都打开同一个下拉菜单。
- 切台菜单是**覆盖层**，绝不能切换当前笔记；菜单内容：最近收听（6）· 收藏（6）· 搜索电台… · 打开电台面板。
- 菜单自己画（`.br-menu`），不用 Obsidian 的 `Menu`：桌面端它是系统原生菜单，圆角 + 系统配色，与 all-sharp 语言冲突，也没法用 CSS 精修。
- 没有电台在播时台名弱化（`is-idle` 用 `--text-faint`），但条目仍可点。

状态栏：播放/停止迷你键 + 台名 + 切台箭头，只有文字色变化；隐藏时连宿主 `status-bar-item` 一起收掉，不在状态栏里留空的点击区。

### 贴底：底部不留死空间

Obsidian 给 `.workspace-leaf-content .view-content` 设了 `padding-bottom: max(safe-area-inset-bottom, 32px)`，
那是给 `position: fixed` 的状态栏留的位置。状态栏一旦被用户关掉，这 32px 就变成播放器和视口底部之间的死空间。

规则：`padding-bottom: var(--br-status-inset)`，由视图在 `onOpen` / `layout-change` / `resize` 时测量状态栏实际高度写入
（显示 = 高度值，隐藏 = `0px`）。选择器必须写成 `.workspace-leaf-content .view-content.br-view` 才能压过 Obsidian 的规则。
**硬约束：状态栏隐藏时，播放器必须紧贴视图底部，不允许出现任何空白带。**

## 7. 深度与动效

- **禁止**：径向光晕渐变、外发光 `box-shadow`、纯黑投影（`rgb(0 0 0 / …)`）、封面脉冲光环、任何装饰性 glow。
- 深度只用两种手段：发丝线（`inset 0 0 0 1px`）与 `--background-secondary` 的微妙表面差。
- 动效只服务状态反馈：加载旋转、均衡器条、按下 `scale(0.96)`。播放中不做脉冲。
- 全部动效在 `prefers-reduced-motion: reduce` 下关闭。

## 8. Do / Don't

**Do**
- 表面与文字用 Obsidian CSS 变量，浅/深自动适配。
- 一个视觉焦点、一条发丝线、一个强调色。
- 键盘焦点用 2px 强调色描边 + 2px offset。
- 空态与错误态给出明确下一步（「选择电台」）。
- 自定义控件的选择器带元素名，压过宿主默认圆角。

**Don't**
- 任何非 0 的 `border-radius`。
- 按电台或分类派生色相；跟随主题强调色造出紫色播放键。
- 渐变大字、玻璃拟态、无语义卡片海、居中 hero + 三等分卡片。
- 纯黑投影、`transition: all`、`ease-in`、`scale(0)` 入场。

## 9. 响应式

- 笔记卡片 `container-type: inline-size`，`@container (max-width: 340px)` 收紧间距。
- 侧栏变窄时同样收紧。
- 长台名两行截断，不撑破布局。

## 10. 验收证据

- **形状断言**（`scripts/verify-shape.cjs`）：扫描插件作用域内全部元素（实测 722 个），`border-radius` 违规数必须为 **0**；同时断言无 `radial-gradient`、无纯黑投影。
- **配色断言**：`--br-accent` 去重后只有一个值 `#d86d43`；播放键背景 `rgb(216, 109, 67)`、radius `0px`；选中 chip 为 accent-soft 底 + accent 字。
- **功能验收**（`scripts/verify-in-obsidian.cjs`）：播放 `currentTime` 递增、暂停生效、零渲染异常。
- **单测**：43/43 通过。
