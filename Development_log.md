# Development Log

## 2026-08-06 HKT

### Plot applet 改用 Dashboard CCB 自动打开

- 移除 generated Python 中依赖操作系统和 Python 环境路径的 `subprocess`、`sys.executable`、`shutil.which()` 与 `Popen()`。
- 有启用且合法的 Plot 时，`build()` 自动请求 `ccb` virtual device，`launch_applets()` 使用 `self.ccb.issue("create_applet", ...)`。
- applet command 保留 Dashboard 原生 `${artiq_applet}` template，由 Dashboard 在 Windows、Linux 或 MSYS 环境中展开并管理进程。
- Plot 面板与 README 明确提示一次性设置：Dashboard Applets → Global CCB policy → Create and enable/disable applets。
- 重名 Plot 会在相同 group 内自动增加编号，避免后一个 CCB 请求覆盖前一个不同 Plot。

## 2026-08-06 HKT

### Sweep 平均数据明确命名

- Sweep 的 scan-level 结果从 `counts/count_rate` 统一更名为 `average_counts/average_count_rate`，避免与逐 shot 数据混淆。
- 无 Sweep 的逐 repetition 数据仍使用 `counts/count_rate`；Sweep 的逐 shot 数据仍使用 `raw_counts/raw_count_rate`。
- Plot 选项、生成的 Dataset、applet 命令、run brief 和导入兼容逻辑使用相同命名。
- 导入旧 metadata 时，`scan_index + counts/count_rate` 会自动迁移到新的 average 名称。

## 2026-08-06 HKT

### Plot 轴与按需 count-rate datasets

- Sweep Plot 仅提供两组长度匹配的轴：`scan_index` 对 `average_counts/average_count_rate`，以及 `shot_index` 对 `raw_counts/raw_count_rate`。
- 不生成第三种重复物理 sweep value 的 raw x 轴；Sweep 参数仍保留在 run brief 与 Builder metadata 中。
- `scan_index`、`shot_index`、`average_count_rate` 和 `raw_count_rate` 都只在启用的合法 Plot 请求时生成。
- Plot UI 会根据 X 轴过滤 Y 轴，禁止把 scan 长度与 raw-shot 长度的数据组合到同一 Applet。
- 标准 `plot_xy` 命令直接使用用户选择的合法 x/y dataset；无效或关闭的 Plot 不生成 dataset 或 Applet 启动代码。

### raw_counts 改为一维 shot 顺序

- Sweep + repetition 的 Counter `raw_counts` 改为长度 `scan_points * repetition_num_per_point` 的一维数组，避免不同 ARTIQ/Dashboard 版本对二维增量 mutation 的处理差异。
- 所有路径统一使用 `shot_index = scan_index * repetition_num_per_point + repetition_index`，并以整数索引写入 `raw_counts[shot_index]`。
- 回归测试覆盖 Fetch batch = 1、全部 shots 放入一个 batch，以及需要多个 batch 的三种路径，并明确禁止二维索引重新出现。

### Generator 可读性

- 多通道 sequence 的每个 `with sequential` lane 前增加 `# Channel: <channel_id>` 注释。
- Fixed、Argument 和 Sweep 路径使用相同注释格式，方便从生成代码中快速定位硬件通道。
- 单通道 sequence 继续直接输出任务代码，不额外生成 lane 包装或 channel 注释。
- 固定、无 sweep 的重复次数从 `loop_count` 改为更直观的 `repetition`。
- 固定 repetition 与固定 counter batching 直接使用 `self.repetition`，不再生成恒等别名 `self.total_shoot = self.repetition`。
- 无 counter、无 sweep、repetition > 1 时使用 `for repetition_index in range(self.repetition)`；sequence gap 为 0 时省略 `inter_loop_delay_ms`。
- `total_shoot` 只保留在 scan × repetition 需要扁平 shot 数的 counter sweep 路径。
- Counter 标准 batching 路径中的扁平循环变量由 `logical_index` 改为 `shot_index`；无 sweep 时表示 repetition shot，sweep 时表示跨全部 scan points 的全局 shot 序号。
- Sweep Counter 的延迟 Dataset 发布阶段仅在确实需要生成一维 `scan_x` 时重新计算单一 sweep value；没有 `scan_x` Plot 时不再输出未使用的 `scan_value_*` 赋值。
- 没有 count-rate Plot 时，固定 batching 的最终发布直接从 raw buffer 写入 `counts`，不再生成仅使用一次的 `*_value` 临时变量；Sweep 平均值也直接写入 `counts`，只有 count-rate Plot 需要复用平均值时才生成 `*_avg`。

### 关闭未保存实验确认

- 每个实验 tab 持有独立的 `isDirty` 状态；新建、导入或修改时标记为未保存，成功保存后清除，打开 Saved experiment 时保持已保存状态。
- 新实验或保存后又被修改的实验会弹出确认：取消则保留 tab，确认才关闭并丢弃未保存修改。
- 已成功保存且之后没有修改的实验直接关闭，不增加额外操作。
- 旧版本持久化的 open tabs 因没有 `isDirty` 字段，会保守地按未保存处理，避免升级后误删实验。

### Module ID 调试显示

- Module properties 的 Name 标题右侧新增 `Module ID: ON/OFF` 开关，默认关闭。
- 开启后，properties 显示当前 module 的完整内部 ID，Timeline 所有 task block 同时显示各自 ID。
- ID 使用较小的等宽字体；开启时 task block 高度从 48px 增至 60px，但保持在原有 74px lane 内。
- 此功能只控制显示，不要求 task name 唯一，也不改变 module ID、保存格式或 Python sweep 变量命名。

### 测试记录

- Generator regression tests 覆盖 DDS/TTL lane 注释，以及固定 repetition=2、无 counter、无 sweep、零 sequence gap 的最小输出。
- TypeScript production build。

## 2026-08-05 HKT

### UI 修复

- 修复开启 ARTIQ argument 后，参数名称/单位与 `Arg: ON` 控件在窄属性面板中重叠的问题。
- 参数标题和操作控件改为上下两层布局。
- argument name 输入框现在会占用剩余宽度并可安全收缩，不再挤压参数标签或 Sweep 按钮。
- argument 关闭且名称输入框隐藏时，控件不再占用剩余宽度，Sweep 按钮会紧邻 `Arg: OFF`。
- Open、Tone、Run settings、Export、Select channels 和参数包菜单支持点击外部任意位置自动关闭。
- 点击弹窗内部保持打开；从一个弹窗切换到另一个弹窗时，旧弹窗会自动收起。
- Timeline channel 不再按 Select channels 的勾选先后排列，统一使用固定硬件顺序：Urukul board/channel、普通 TTL、TTL counter，各组内部按数字升序。
- 默认 channel 数据源也使用同一排序规则，避免其他 channel 展示或导出出现不同顺序。
- 新打开 Builder 时 `Metadata` 和 `Run brief` 默认均为 `OFF`；需要时仍可由用户单独打开。

### Generator 简化

- 固定 sequence 在 `repetition = 1`、无 sweep、无 counter 时，不再生成 `loop_count`、`total_sequences`、`inter_loop_delay_ms` 和单次外层循环。
- 这种最小实验现在直接生成实际 TTL/DDS sequence；多次 repetition 和 counter 实验仍保留所需循环与数据结构。
- Fixed/no-sweep 的多通道时间线改为每个 channel 一条 `with sequential` lane，统一放在一个 `with parallel` 中。
- 同一 channel 的多个 task 按 start time 排序并使用相邻 task 间隔；不同 channel 使用各自相对零点的初始 delay。
- Fixed 与 sweep 现在共用 channel lane 分组逻辑，生成代码结构与 UI 通道布局一致。
- 同一 DDS channel 的后续 task 如果选择 `CONTINUOUS`，且 frequency、amplitude、phase 来源完全相同，generator 会复用已有 DDS 配置并省略重复 `set()`。
- DDS attenuation 独立比较；未变化时省略重复 `set_att()`，变化时仍单独生成 attenuation 更新。
- `ABSOLUTE`、`TRACKING` 或任一波形参数变化时始终保留 `set()`，避免优化改变 phase mode 语义。
- Sweep sequence 也在每个 DDS task 对应的 channel lane 位置设置参数，避免同一 channel 多段不同 DDS 配置被预设置中的最后一段覆盖。
- Python 顶层 `with parallel` 内的每个 channel `with sequential` 分支使用与 Timeline 相同的固定硬件顺序，不受 task 创建时间或开始时间影响。
- 无 counter 的 sweep/scan 实验改为外层 `scan_index`、内层 `repetition_index`；sweep value 每个 scan point 只计算一次，不再用 `logical_index` 整数除法还原 scan index。
- 无 counter scan 且 repetition=1 时省略内层 repetition loop；无 counter scan 不再生成扁平总 shot 数。
- 仍需扁平 shot 数的固定 repetition 和 counter batching 路径，把生成变量 `total_sequences` 统一改名为 `total_shoot`。
- Sweep 的 sequence gap 为 0 时不再生成未使用的 `inter_loop_delay_ms = 0.0`。

### Start slack 运行设置

- Run settings 在 `Sequence gap` 下新增 `Start slack`，支持 `s`、`ms`、`us` 单位，默认 `0 ms`。
- `Start slack = 0` 时，生成代码不包含 `start_slack_ms` 或额外 delay。
- 设置为正数时，generator 在第一段 sequence 前增加对应 RTIO scheduling slack，并生成解释性注释。
- 保存/打开和 Python metadata 导入导出会保留该设置；旧数据缺少字段时按 `0 ms` 处理。
- 修复 metadata `editorState` 漏写 `fetchBatchSize`、但导入校验要求该字段的问题。

### DDS phase 修复

- 修复固定 DDS phase 只显示在 UI/metadata、没有传入 AD9910 `set(...)` 的问题。
- 固定 phase 现在从 degree 转换为 turns，并生成对应的 `phase_mode=PHASE_MODE_...`。
- 任何包含 DDS 的生成代码都会导入 AD9910 phase mode 常量，覆盖固定值、argument 和 sweep 三种 phase 来源。
- Phase mode 选择器现在始终显示在 Phase 参数下，不再要求先开启 Phase sweep；固定 Phase 也可以选择 ABSOLUTE、CONTINUOUS 或 TRACKING。
- Phase mode 固定排列在 Phase 的 Argument/Sweep 操作行之后、数值或 sweep fields 之前，确保配置 Phase 时先选择 mode。

### 测试记录

- Generator regression tests，包括无 counter scan 嵌套循环、`total_shoot` 命名、固定 channel 顺序、channel-lane、DDS continuous 配置复用、参数变化重新设置和同 channel DDS sweep 用例。
- 浏览器验证：counter 已选中后再勾选 `ttl1`，Timeline 仍把 `ttl1` 排在 counter 前。
- TypeScript production build。

## 2026-08-04 14:05 HKT

### 功能变更

- 新增第一版 ARTIQ argument 支持。
- 在 module properties 面板中，可以把部分数值参数标记为 `Arg: ON`，并设置生成到 ARTIQ dashboard 里的 argument 名字。
- 当前支持：
  - DDS frequency
  - DDS amplitude
  - DDS phase
  - DDS duration
  - DDS attenuation
  - TTL output duration
- generator 会为启用的参数生成 `self.setattr_argument(..., NumberValue(...))`。
- 生成的 DDS / TTL 代码会读取 `self.<argument_name>` 作为对应参数值。
- 如果某个参数已经由 sweep 控制，则同一个参数不会再生成 argument，避免一个参数同时有两个控制来源。
- README 新增 `ARTIQ Arguments` 说明。

### 动机

- 用户希望在 ARTIQ dashboard 中临时调节常用数值，例如 DDS amplitude，而不需要每次回到生成器或手动改 Python。
- 第一版只让 argument 改“数值参数”，不允许 argument 改 channel、task enable 或 sequence 结构，避免和 visual sequence builder 的单一时间轴数据源冲突。
- `interactive_argument` / 信号源调试模式如果之后需要，应作为单独模式设计，不混进普通 sequence experiment。

### 涉及文件

- `src/types.ts`
  - 新增 `ArgumentConfig`、`DdsArgumentKey`、`ModuleArgumentConfig`。
  - `SequenceModule` 新增可选 `argumentConfig`。
- `src/experimentStorage.ts`
  - 新增 `normalizeArgumentConfig(...)`，保证保存/加载实验时 argument 配置是 JSON-safe 的普通数据。
- `src/App.tsx`
  - DDS 参数、DDS attenuation、TTL output duration 增加 `Arg: ON/OFF` 控件和 argument name 输入框。
  - sweep 已启用的同一参数会禁用 argument 控件。
- `src/App.css`
  - 新增 argument 控件样式，并复用现有暗/亮色 token。
- `src/pythonGenerator.ts`
  - 新增 argument 收集、命名去重、`setattr_argument` 生成逻辑。
  - DDS frequency/amplitude/phase/duration/attenuation 和 TTL output duration 接入 argument 值。
  - phase argument 保持 UI degree，生成代码中转换为 turns。
  - attenuation argument 限制为 `0` 到 `31.5` dB。
- `scripts/checkGeneratorBatching.mjs`
  - 新增 generator 回归测试，检查 argument 生成和 sweep/argument 同参数优先级。
- `README.md`
  - 新增 ARTIQ argument 使用边界说明。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- `SequenceModule.argumentConfig` 用来记录当前 task 中哪些数值参数暴露为 ARTIQ argument，以及对应 argument 名字。
- parameter package 不保存 argument 配置，避免复用 package 时把旧 argument name 一起复制过去。

### UI 交互有没有变化

- 有。
- 支持的参数旁边出现 `Arg: ON/OFF`。
- 开启后显示 argument name 输入框。
- 如果该参数正在 sweep，argument 控件会禁用。

### ARTIQ code generator 有没有变化

- 有。
- 启用 argument 后，`build()` 中生成 `self.setattr_argument(...)`。
- timing / DDS set / attenuation 代码会读取 dashboard argument 值。
- 没有改变 sequence scheduling、counter fetch batching、dataset 写入、plot applet 或 sweep 的核心逻辑。

### 测试记录

- 已检查：
  - TypeScript 编译
  - generator 回归测试
  - production build

### 之后还要注意什么

- 第一版不要添加 channel/task enable argument。
- 如果之后真的需要 ARTIQ 当“自由信号源”使用，建议单独做 Debug / Signal source mode。
- 如果后续允许 package 携带 argument preset，需要重新设计 argument name 冲突和跨实验复用规则。

## 2026-07-29 14:18 HKT

### 功能变更

- 精简 ARTIQ Python generator 的 dataset 写入逻辑。
- 默认只生成核心测量结果 dataset：
  - no-sweep 测量默认生成 `measurement.<counter>.counts`。
  - sweep 测量默认生成 `measurement.<counter>.counts`。
  - sweep 且每个 scan point 有多次 repetition 时，额外默认生成 `measurement.<counter>.raw_counts`，保留原始二维数据。
- `shot_index`、`scan_x`、`count_rate` 改为 plot-driven dataset：
  - 只有 enabled 且 valid 的 plot 需要它们时才生成。
- 删除默认生成的繁琐 metadata dataset：
  - `scan_parameter`
  - `scan_unit`
  - `scan_channel`
  - `scan_start`
  - `scan_end`
  - `scan_step`
  - `scan_points`
  - `repetitions`
  - `measurement.*.metadata.*`
- 更新 generator 回归测试，防止这些默认 metadata / plot-only dataset 被重新写回。
- 重写 README 初始内容，并新增 `Python Generator Dataset Logic` 说明。

### 动机

- 用户希望生成的 Python 更干净，不要把任务简报里已经能说明的信息重复塞进 ARTIQ dataset 表。
- dataset 应该主要保留真实实验结果、原始数据和画图需要的数据。
- `count_rate`、`shot_index`、`scan_x` 这类数据更适合作为 plot 需求驱动，而不是所有实验默认生成。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 `MeasurementDatasetPlan`。
  - 新增 `buildMeasurementDatasetPlan(...)`，统一根据 enabled valid plots 决定 plot-only dataset。
  - 精简 fixed/no-sweep dataset 初始化和写入逻辑。
  - 精简 sweep dataset 初始化和写入逻辑。
  - 移除默认 sweep metadata dataset 和 measurement metadata dataset 写入。
  - `setup_datasets()` 只有在确实有 dataset 要初始化时才生成。
  - `import numpy as np` 只有在确实需要 NumPy dataset 初始化时才生成。
  - run brief 的 dataset 列表改为只报告实际生成的 dataset。
- `scripts/checkGeneratorBatching.mjs`
  - 增加默认不生成 `shot_index` / `count_rate` / `metadata.*` / `scan_* metadata` 的检查。
  - 增加 plot 选择后才生成 `shot_index`、`scan_x`、`count_rate` 的检查。
- `README.md`
  - 重写项目说明骨架。
  - 新增 Python generator dataset 逻辑说明。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有改变 sequence/task/plot 的前端数据结构。
- 只改变生成出来的 ARTIQ Python 中 dataset 的默认输出策略。

### UI 交互有没有变化

- 没有。
- Plot panel 的勾选结果现在会更明确地影响 Python 中是否生成 `shot_index`、`scan_x`、`count_rate`。

### ARTIQ code generator 有没有变化

- 有。
- 默认 dataset 更少：
  - 不再默认生成 sweep metadata dataset。
  - 不再默认生成 measurement metadata dataset。
  - 不再默认生成 no-sweep `shot_index`。
  - 不再默认生成 `count_rate`。
- 核心测量结果仍然写入：
  - no-sweep: `measurement.<counter>.counts`
  - sweep: `measurement.<counter>.counts`
  - sweep repeated: `measurement.<counter>.raw_counts`
- Plot 需要的 x/y dataset 会按 enabled valid plot 自动补齐。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:generator`
  - `npm run build`

### 之后还要注意什么

- 如果之后 Plot panel 增加“原始 repetition 点图”，可以在同一个 dataset plan 里继续加入 raw plot-only dataset，例如 flat raw x/y。
- README 目前已经开始形成交付版骨架，后续还需要补充安装、部署、GitHub Pages、ARTIQ 环境和设备配置说明。

## 2026-07-29 13:34 HKT

### 功能变更

- 调整色调滑块档位顺序。
- 新顺序为：
  - `System`
  - `Soft`
  - `Medium`
  - `Dim`
  - `Dark`
- 移除手动 `Light` 档。
- 新增 `Medium` 档，颜色比 `Soft` 稍深，但仍属于亮色系。

### 动机

- 用户希望 `System` 放在最左边，作为默认/起始选择。
- 原来 `System` 所在的中间位置更适合放一个介于 `Soft` 和深色之间的中间亮度。
- 后两个深色档 `Dim` / `Dark` 当前可以保留。

### 涉及文件

- `src/App.tsx`
  - 调整 `toneOptions` 顺序。
  - 将 fallback tone option 改为最左侧 `System`。
- `src/App.css`
  - 删除 `:root[data-tone="light"]` 手动主题。
  - 新增 `:root[data-tone="medium"]` 主题 token。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有改变 experiment / sequence 数据结构。
- 浏览器本地 tone preference 如果之前存的是旧 `light`，会因不在新选项中而回到 `System`。

### UI 交互有没有变化

- 有。
- 色调滑块最左侧现在是 `System`。
- 中间新增 `Medium` 档。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果 `Medium` 仍然偏亮或偏暗，可以继续只调整 `:root[data-tone="medium"]` 的 token，不需要改 UI 或业务逻辑。

## 2026-07-28 22:31 HKT

### 功能变更

- 在 `Open` 右侧新增色调设置按钮。
- 点击后显示分档色调滑块，支持：
  - `Light`
  - `Soft`
  - `System`
  - `Dim`
  - `Dark`
- 色调偏好保存到浏览器 `localStorage`，下次打开网页会自动恢复。

### 动机

- 仅跟随系统亮 / 暗色时，界面可能出现“太亮”或“太暗”的情况。
- 分档色调滑块可以让用户在不破坏对比度的前提下选择更舒服的整体明暗。
- 这次基于已有主题 token 扩展，不把样式做成末尾覆盖补丁。

### 涉及文件

- `src/App.tsx`
  - 新增 `tonePreference` 状态。
  - 新增 `Palette` 图标按钮和 tone 下拉面板。
  - 将 tone preference 写入 `document.documentElement.dataset.tone`。
  - 将 tone preference 保存到 `localStorage`。
- `src/App.css`
  - 新增 `:root[data-tone="light"]`、`:root[data-tone="soft"]`、`:root[data-tone="dim"]`、`:root[data-tone="dark"]` 主题 token。
  - 新增 `.tone-picker`、`.tone-menu`、`.tone-slider` 等样式。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有改变 experiment / sequence 数据结构。
- 新增的是浏览器 UI 偏好，不进入 experiment 保存、Python metadata 或 generator。

### UI 交互有没有变化

- 有。
- `Open` 右侧新增色调按钮。
- 点击后可用滑块切换整体色调。
- `System` 档继续跟随系统亮 / 暗色。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已检查：
  - 主题 token 没有自引用。

### 之后还要注意什么

- 后续新增 UI 时继续使用主题 token，避免写死单一深色或浅色。
- 如果用户想要更精细控制，可以在现有五档基础上扩展档位，但应优先保证文字和 task block 的可读性。

## 2026-07-28 22:18 HKT

### 功能变更

- 将 experiment tab 标签改为可直接重命名。
- 双击 tab 名称进入编辑态。
- 按 Enter 或输入框失焦后提交新名称。
- 按 Escape 取消编辑。
- 新名称会写入 `sequenceName`，也就是导出 Python 文件名的来源。

### 动机

- 之前删除了顶部 `File name` 输入框后，用户没有明显入口修改 experiment file name。
- 直接在 tab 标签上改名更符合现在简化后的 UI 结构，也减少顶部参数区的复杂度。

### 涉及文件

- `src/App.tsx`
  - 新增 tab rename 编辑状态。
  - 新增进入编辑、提交编辑、取消编辑逻辑。
  - tab 标签在编辑态渲染为输入框。
- `src/App.css`
  - 新增 `.experiment-tab-rename` 样式，让 tab 内输入框保持原有 tab 视觉。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- 现有 `sequenceName` 现在可以从 tab 标签直接编辑。

### UI 交互有没有变化

- 有。
- 单击 tab 仍然切换 experiment。
- 双击 tab 名称可以重命名。
- Enter / blur 提交，Escape 取消。

### ARTIQ code generator 有没有变化

- 没有。
- 但由于 `sequenceName` 会影响导出文件名，重命名 tab 后导出的 Python 文件名会同步变化。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果用户希望更明显，也可以之后在 tab 上增加右键菜单或小铅笔图标，但当前先保持界面简洁。

## 2026-07-23 14:54 HKT

### 功能变更

- 更新 ARTIQ Python generator，确保每个生成的顶层 `@kernel` 方法在退出前执行：
  - `self.core.wait_until_mu(now_mu())`

### 动机

- ARTIQ kernel 退出前需要等待硬件 RTIO timeline 上已经排定的事件完成。
- 这条语句应作为 kernel 退出前最后的可执行语句，避免 host 侧继续执行时硬件时间线尚未完成。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 `appendKernelTimelineCompletionWait()` helper。
  - 在 sweep 和 no-sweep 两条 `run_kernel()` 生成路径末尾加入 `self.core.wait_until_mu(now_mu())`。
- `scripts/checkGeneratorBatching.mjs`
  - 新增回归检查，确认生成 Python 包含 kernel timeline completion wait，并且它位于 host-side `run()` 之前。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 生成的 `run_kernel()` 现在会在结束前等待 RTIO timeline 完成。
- 不改变 task scheduling、dataset 写入、counter fetch batching、sweep 或 applet 逻辑。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 后续如果新增其它 `@kernel` 顶层入口，也必须使用同一个 helper 或同等逻辑，避免漏掉 timeline completion wait。

## 2026-07-23 14:47 HKT

### 功能变更

- 增加跟随系统的亮色 / 暗色主题能力。
- 暗色主题保持当前视觉风格。
- 当浏览器或操作系统处于 light mode 时，应用会自动切换到亮色主题。

### 动机

- 用户希望网页色调和系统一致，可以是暗色调，也可以是亮色调。
- 这次不采用在 CSS 末尾大量覆盖的方式，而是从底层主题 token 加入亮色可能性，避免继续堆叠难维护的样式。

### 涉及文件

- `src/App.css`
  - 在 `:root` 中建立更完整的语义颜色变量，例如 `--control-bg`、`--menu-bg`、`--timeline-head-bg`、`--code-bg`、`--accent-soft`、`--shadow` 等。
  - 新增 `@media (prefers-color-scheme: light)`，在系统亮色模式下切换同一套 token 的取值。
  - 将主要 UI 组件的硬编码背景、边框、阴影、网格、代码预览颜色改为引用主题变量。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有新增按钮或设置项。
- 主题会自动跟随系统 / 浏览器的 `prefers-color-scheme`。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已检查：
  - CSS 主题变量没有自引用。
  - 主要组件层面的背景 / 颜色硬编码已改为主题变量。

### 之后还要注意什么

- 如果后续想允许用户在网页内手动选择 `System / Light / Dark`，可以在现有 token 基础上加 `data-theme`，不需要重写组件样式。
- 后续新增 UI 时优先使用主题变量，不要直接写死深色或浅色。

## 2026-07-23 14:36 HKT

### 功能变更

- 修复代码预览抽屉打开后没有完全浮在最上层的问题。

### 动机

- 点击右侧代码预览按钮后，代码页面应作为最高层 overlay 显示。
- 之前 timeline toolbar 中的状态按钮仍可能显示在代码抽屉上方，造成图层混乱。

### 涉及文件

- `src/App.css`
  - 提高 `.code-drawer` 的 `z-index`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化。
- 代码抽屉打开后现在会覆盖其它页面控件。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果后续加入 modal / toast / dropdown，需要统一维护一套 z-index 层级表，避免不同 overlay 互相抢层级。

## 2026-07-23 14:29 HKT

### 功能变更

- 修复 `Run settings` 下拉面板中 `Sequence gap` 单位选择框向右溢出的问题。

### 动机

- macOS 原生 select 有自己的最小显示宽度，导致 `s/ms/us` 单位选择框突出到面板外。
- 面板内控件应该完整收在下拉窗口里，避免视觉上像 UI 断裂。

### 涉及文件

- `src/App.css`
  - 略微加宽 `.run-settings-panel`。
  - 缩短 `.run-setting-unit-input` 的单位列宽。
  - 为 `.run-setting-unit-input select` 添加固定宽度和较小 padding。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化，只有下拉面板内部布局修正。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果之后还遇到原生 select 在不同系统上的宽度问题，可以考虑把时间单位改成自定义小菜单或 segmented 控件。

## 2026-07-23 14:24 HKT

### 功能变更

- 将顶部 `Run settings` 文字按钮改为图形按钮。
- 提高 `Run settings` 下拉面板和 `Export` 下拉菜单的层级。

### 动机

- 顶部工具栏空间有限，运行设置用图标表示更紧凑。
- 下拉菜单应该始终浮在 timeline、状态按钮和其它面板之上，避免视觉上被遮挡。

### 涉及文件

- `src/App.tsx`
  - 引入 `SlidersHorizontal` 图标。
  - 将 `Run settings` 按钮改为图标按钮，并保留 `title` / `aria-label`。
- `src/App.css`
  - 将 toolbar 层级提高。
  - 将 `Run settings` 和 `Export` 下拉面板的 `z-index` 提高到更高层级。
  - 将 `Run settings` 触发按钮改成标准方形 icon button 尺寸。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- `Run settings` 现在通过图形按钮打开。
- 两个下拉菜单会显示在更高层，不再被其它 timeline / 面板元素覆盖。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果之后图标含义不够直观，可以加一个 hover tooltip 文案或改成更符合仪器设置语义的图标。

## 2026-07-23 14:16 HKT

### 功能变更

- 将顶部实验参数行改为更紧凑的布局：
  - 左侧显示横向 `Experiment name:` + 输入框。
  - `Fetch batch`、`Repetition`、`Sequence gap` 收进一个 `Run settings` 下拉面板。
- 新实验默认值调整为：
  - `fetchBatchSize = 0`
  - `repetition = 1`
  - `sequence gap = 0`
- `fetchBatchSize = 0` 现在表示自动 batch size，避免生成 Python 出现非法的 `range(..., 0)`。

### 动机

- 原来每个参数都有上方 label，会占用一整排空间，视觉上显得拥挤。
- `Fetch batch`、`Repetition`、`Sequence gap` 属于运行设置，不需要一直展开占据顶部主工具栏。
- 默认 `fetch batch = 0` 更像“未手动指定 batch”，适合作为新实验默认状态。

### 涉及文件

- `src/App.tsx`
  - 新增 `Run settings` 下拉状态。
  - 将顶部参数 UI 改为横向 `Experiment name:` 和运行设置下拉。
  - 将默认 `fetchBatchSize` 改为 `0`，初始 repetition 改为 `1`。
  - 前端 `fetch batch` 校验范围改为 `0-100`。
- `src/App.css`
  - 新增 `.inline-experiment-name`、`.run-settings-menu`、`.run-settings-panel` 等样式。
  - 删除旧 toolbar 参数列宽假设。
- `src/pythonGenerator.ts`
  - generator 校验允许 `fetchBatchSize = 0`。
  - 新增有效 batch size 计算：UI 为 0 时，生成代码使用总 sequence 数作为安全 batch step。
- `src/experimentStorage.ts`
  - 保存/加载归一化允许 `fetchBatchSize = 0`。
- `src/pythonMetadataImport.ts`
  - Python metadata import 校验允许 `fetchBatchSize = 0`。
- `scripts/checkGeneratorBatching.mjs`
  - 更新 batch 校验回归测试，覆盖 `fetchBatchSize = 0`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- `fetchBatchSize` 字段含义小改：`0` 表示自动 batch size。

### UI 交互有没有变化

- 有。
- 顶部只直接显示 `Experiment name:`。
- 点击 `Run settings` 后，在下拉面板中编辑 `Fetch batch`、`Repetition`、`Sequence gap`。

### ARTIQ code generator 有没有变化

- 有小改。
- 当 `fetchBatchSize = 0` 且存在 counter measurement 时，生成代码会使用安全的有效 batch size，不会生成 `self.sequence_batch_size = 0`。
- 没有改变 task scheduling、dataset、sweep 或 measurement 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:generator`
  - `npm run build`

### 之后还要注意什么

- 如果之后希望 `fetch batch = 0` 明确显示为 `Auto`，可以再把输入框换成 `Auto / custom` 的更直观控件。

## 2026-07-23 13:52 HKT

### 功能变更

- 缩短 timeline toolbar 中 `Timeline unit` 选择框宽度。

### 动机

- `Timeline unit` 只需要显示 `s/ms/us`，原宽度过长。
- 缩短后工具条更紧凑，留出更多空间给右侧状态和导出开关。

### 涉及文件

- `src/App.css`
  - 将 `.compact-select` 宽度从 `130px` 调整为 `82px`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化，只有控件宽度变短。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果不同浏览器原生 select 样式占用更宽，可以再微调到 `90px`。

## 2026-07-23 13:50 HKT

### 功能变更

- 进一步压缩顶部 experiment 参数行的控件宽度。
- `Experiment name`、`Fetch batch`、`Repetition` 改为紧凑固定宽度。
- 顶部参数行不再占满整行，参数靠左，操作按钮靠右，中间保留空白。
- `Not saved` / 保存状态移动到 timeline toolbar 右侧。

### 动机

- 顶部参数控件不需要铺满整行，过长会浪费空间。
- `Not saved` 更像当前 timeline/editor 状态，放在 timeline 工具条右侧更自然。
- 中间留白可以让顶部布局更清楚，不显得所有控件挤在一起。

### 涉及文件

- `src/App.tsx`
  - 将保存状态从顶部参数行移动到 channel/timeline toolbar。
- `src/App.css`
  - `.toolbar-controls-row` 从 grid 改为 flex。
  - 参数控件设置紧凑固定宽度。
  - 第一组操作按钮通过自动左边距靠右。
  - 新增 `.timeline-save-status` 样式。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化，只有布局位置和宽度变化。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果保存状态文字变长，可能需要后续加最大宽度和省略号，避免挤压 metadata / run brief 按钮。

## 2026-07-23 13:47 HKT

### 功能变更

- 优化顶部 experiment 参数行的列宽。
- 缩短 `Experiment name` 输入区域。
- 加宽 `Fetch batch`、`Repetition`、`Sequence gap` 的显示区域。
- `Sequence gap` label 现在保持横向显示，不再被挤成两行。

### 动机

- 之前 `Experiment name` 占据过多横向空间，导致后面的参数控件被挤压。
- `Sequence gap` 文字换行影响阅读，也让顶部参数区显得凌乱。

### 涉及文件

- `src/App.css`
  - 调整 `.toolbar-controls-row` grid columns。
  - 调整 `.unit-input` 内部输入框和单位选择框宽度。
  - 增加 label 不换行约束。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化，只有布局压缩和可读性优化。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果顶部继续增加控件，可以考虑将保存状态或部分图标按钮收进二级菜单，避免再次挤压参数输入框。

## 2026-07-23 13:43 HKT

### 功能变更

- 加强顶部 experiment tabs 下方的视觉分割线。
- 删除第二行 experiment 参数区中的 `File name` 输入框。

### 动机

- experiment tab 名称已经能表达当前文件/页面名称，第二行再显示 `File name` 会重复。
- 顶部 tab 区和当前 experiment 参数区需要更明确的视觉边界，类似浏览器 tab 栏和网页内容之间的分隔。

### 涉及文件

- `src/App.tsx`
  - 移除 toolbar 第二行中的 `File name` label/input。
- `src/App.css`
  - 加重 `.toolbar-top-row` 下方分割线。
  - 让分割线横向延伸到 toolbar 两侧边缘。
  - 调整 `.toolbar-controls-row` 列布局，匹配删除 `File name` 后的新参数行。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 第二行不再编辑 `File name`。
- 当前 experiment 的名称仍然通过顶部 tab 显示。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 由于 `File name` 输入框被移除，后续如果需要重命名 tab/file name，应考虑在 tab 本身提供重命名入口。

## 2026-07-23 11:38 HKT

### 功能变更

- 在顶部 experiment tabs 行下方增加明显分割线。

### 动机

- tabs 属于最高层的实验切换区，下面一行属于当前 experiment 参数区。
- 增加分割线后，两个区域的视觉层级更清楚。

### 涉及文件

- `src/App.css`
  - 给 `.toolbar-top-row` 增加底部 padding 和半透明 accent border。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化，只有视觉分隔增强。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果顶部空间继续压缩，可以再微调分割线颜色和上下间距，避免显得太重。

## 2026-07-23 11:26 HKT

### 功能变更

- 调整顶部两行布局。
- experiment tabs 现在移动到最上方，放在 `ARTIQ Sequence Builder` 标题右侧。
- 当前 experiment 的参数行移动到第二行，包括 `File name`、`Experiment name`、`Fetch batch`、`Repetition`、`Sequence gap`、保存/导入/导出/code 按钮。
- `Open saved experiment` 收缩成一个紧凑的 `Open` 下拉按钮。
- 打开 saved experiment 仍然默认新建一个 experiment tab。

### 动机

- experiment tabs 表示当前浏览器窗口内打开的多个实验，应处在最高层级。
- `File name`、`Experiment name` 等参数属于当前选中的具体 experiment，更适合放在 tab 下方。
- 原来的 saved experiment selector 占据太多横向和纵向空间，改为 `Open` 下拉更紧凑。

### 涉及文件

- `src/App.tsx`
  - 重排 toolbar JSX。
  - 将 experiment tabs 从 workspace 顶部移动到 toolbar 第一行。
  - 将 saved experiment picker 改为紧凑 `Open` 下拉按钮。
  - 当前 experiment 参数移动到 toolbar 第二行。
- `src/App.css`
  - 新增 `.toolbar-top-row` 和 `.toolbar-controls-row`。
  - 删除旧 `.experiment-top-row` 相关布局。
  - 更新 saved experiment picker 的紧凑样式。
  - 更新窄屏响应式 toolbar 布局。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 顶部第一行现在是品牌、experiment tabs、`Open`。
- 顶部第二行现在是当前 experiment 的参数和操作按钮。
- 点击 `Open` 下拉中的 saved experiment 会继续新开 tab，不覆盖当前 tab。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果顶部继续增加开关按钮，需要避免第二行过度拥挤；可以考虑后续把部分导出/调试开关收进一个设置菜单。

## 2026-07-23 11:20 HKT

### 功能变更

- 新增 `Run brief` 导出开关。
- 用户可以选择生成的 Python 是否包含 `print_run_brief()` 任务简报方法和 `run()` 中的调用。
- 默认保持开启，关闭后导出的 Python 更短。

### 动机

- `print_run_brief()` 对调试和检查实验结构有帮助，但会让导出的 Python 变长。
- 用户需要在“运行时日志更完整”和“导出代码更简洁”之间自由选择。

### 涉及文件

- `src/pythonGenerator.ts`
  - `ArtiqPythonGenerationOptions` 新增 `includeRunBrief`。
  - sweep 和 no-sweep 两条 generator 路径都支持跳过 `print_run_brief()` 生成。
  - 关闭时也不会在 `run()` 中调用 `self.print_run_brief()`。
- `src/App.tsx`
  - 新增 `includeRunBrief` UI state。
  - Python preview / export 调用 generator 时传入该选项。
  - 在 timeline toolbar 右侧新增 `Run brief: ON/OFF` 按钮。
- `src/App.css`
  - 复用 metadata toggle 样式，并让 `Run brief` 按钮紧跟 metadata 按钮。
- `scripts/checkGeneratorBatching.mjs`
  - 增加回归检查，确认默认生成 run brief，关闭选项后不生成方法和调用。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 当前开关是 UI state，不写入 experiment 数据结构。

### UI 交互有没有变化

- 有。
- timeline toolbar 右侧新增 `Run brief: ON/OFF` 按钮。

### ARTIQ code generator 有没有变化

- 有。
- generator 支持可选跳过 compact run brief。
- ARTIQ timing、dataset、applet、metadata 逻辑不受影响。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果之后增加更多调试型输出，可以考虑统一放到一个 `Debug output` 菜单里，避免 toolbar 继续变长。

## 2026-07-23 11:16 HKT

### 功能变更

- 新增 `Sequence Builder metadata` 导出开关。
- 用户可以在 timeline toolbar 右侧切换导出的 Python 是否包含 `SEQUENCE_BUILDER_METADATA` 注释块。
- 默认保持开启，方便之后从本工具导出的 Python round-trip import 回 visual editor。

### 动机

- 顶部 metadata block 对未来 Python import 很有用，但会让导出的实验代码显得冗长。
- 用户需要在“可回导入”和“代码更简洁”之间自由选择。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 `ArtiqPythonGenerationOptions`。
  - `generateArtiqPython()` 新增 `includeSequenceBuilderMetadata` 选项。
  - metadata block 只在该选项开启时嵌入。
- `src/App.tsx`
  - 新增 `includeSequenceBuilderMetadata` UI state。
  - Python preview / export 调用 generator 时传入该选项。
  - 在 timeline toolbar 右侧新增 `Metadata: ON/OFF` 按钮。
- `src/App.css`
  - 新增 metadata toggle 的紧凑样式。
- `scripts/checkGeneratorBatching.mjs`
  - 增加回归检查，确认默认包含 metadata，关闭选项后不包含 metadata markers。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 当前开关是 UI state，不写入 experiment 数据结构。

### UI 交互有没有变化

- 有。
- timeline toolbar 右侧新增 `Metadata: ON/OFF` 按钮。
- 关闭后 Python preview 和 Export Python 都不会包含 Sequence Builder metadata 注释块。

### ARTIQ code generator 有没有变化

- 有。
- generator 支持可选跳过 Sequence Builder metadata block。
- ARTIQ 实验运行逻辑、dataset 生成、timeline scheduling 不变。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果用户关闭 metadata 后导出 Python，这个 Python 之后将不能通过 metadata round-trip import 自动恢复 visual editor state。

## 2026-07-16 17:09 HKT

### 功能变更

- 简化 sweep repetition 为 1 时的 ARTIQ Python 生成代码。
- 当 sweep 实验的 repetition 设置为 1 时，不再生成 `self.repetition_num_per_point = 1`。
- 当 sweep 实验的 repetition 设置为 1 时，不再生成 `logical_index`，直接使用 `scan_index` 循环。
- 当 sweep 实验的 repetition 设置为 1 且有 measurement/counter task 时，不再生成二维 `raw_counts`，而是直接按 `scan_index` 写入一维 `counts` / `count_rate`。

### 动机

- repetition 为 1 时不存在真正的“每个 scan point 下多次重复”这一层结构。
- 继续生成 `repetition_num_per_point`、`logical_index`、二维 raw dataset 会让导出的 Python 看起来比实际实验复杂。
- 生成代码应尽量贴近实验语义：有重复才展开 repetition，没有重复就直接 scan。

### 涉及文件

- `src/pythonGenerator.ts`
  - sweep prepare 阶段根据 repetition 数量决定是否生成 `self.repetition_num_per_point` 和 `self.total_sequences`。
  - sweep kernel 阶段在 repetition 为 1 时直接 `for scan_index in range(self.scan_points)`。
  - sweep dataset 初始化和发布阶段在 repetition 为 1 时不生成 repetition metadata / raw_counts。
  - run brief 在 repetition 为 1 时不引用 `self.repetition_num_per_point`。
- `scripts/checkGeneratorBatching.mjs`
  - 增加 repetition=1 + sweep + 无测量任务的回归检查。
  - 增加 repetition=1 + sweep + 有测量任务的回归检查。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- sweep repetition 为 1 时，生成代码不再体现 repetition 层。
- sweep repetition 大于 1 时，保留原来的 scan/repetition 展开、batch、raw_counts 逻辑。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 后续如果新增其他 per-repetition 记录功能，也要遵守同样原则：只有 repetition 大于 1 时才生成 repetition 维度。

## 2026-07-16 16:19 HKT

### 功能变更

- 无 measurement/counter task 的实验不再生成 fetch batching 相关代码。
- 无测量 fixed 实验改为直接 `for sequence_index in range(self.total_sequences)`。
- 无测量 sweep 实验改为直接 `for logical_index in range(self.total_sequences)`，只用 `scan_index` 计算 sweep value。

### 动机

- fetch batch size 只用于避免 counter gate 结果长时间不读取导致队列压力。
- 如果实验没有任何测量任务，就没有 deferred fetch/readout 阶段，也不需要 batch boundary `break_realtime()`。
- 这时 sequence 之间的时间间隔应完全由 `Sequence gap` / `inter_loop_delay_ms` 决定。

### 涉及文件

- `src/pythonGenerator.ts`
  - 只有存在 measurement/counter task 时才生成 `self.sequence_batch_size`。
  - 只有存在 measurement/counter task 时才生成 `batch_start`、`batch_end`、Phase B fetch 和 batch boundary `break_realtime()`。
  - 无测量 fixed/sweep 路径使用简单 sequence loop，并按 `inter_loop_delay_ms` 插入 sequence gap。
- `scripts/checkGeneratorBatching.mjs`
  - 增加无测量 fixed/sweep 的回归检查，确认不生成 batch 相关代码。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 无测量任务时，生成 Python 不再考虑 fetch batch size。
- 有测量任务时，原来的 batching/fetch/readout 逻辑保持不变。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果未来新增其他需要 deferred readout 的设备，也应把它纳入“是否需要 batching”的判断，而不是只看 counter task。

## 2026-07-16 15:55 HKT

### 功能变更

- 清理 sweep kernel 排时序阶段中无用的 `repetition_index` 赋值。
- 当 sweep 实验没有 counter measurement 时，dataset 发布阶段不再生成空的 `for repetition_index ...: pass` 循环。
- 当 sweep 实验没有 counter measurement 时，不再生成 `raw_counts` 形状注释，也不再打印 counter readout batch warning。

### 动机

- Phase A 排时序阶段只需要 `scan_index` 来计算当前 sweep value。
- `repetition_index` 只在 Phase C 写入 raw dataset 的二维位置时有意义。
- 没有 measurement/counter 任务时，生成空 repetition loop 会让代码显得冗余。
- 无读数实验中出现 `raw_counts` 和 counter warning 文案也会误导用户，以为当前实验有读数缓存。

### 涉及文件

- `src/pythonGenerator.ts`
  - Phase A 中删除 `repetition_index = logical_index % self.repetition_num_per_point`。
  - Phase C 中仅在存在 counter measurement block 时生成 `for repetition_index ...` raw dataset 写入循环。
  - dataset 注释和 batch warning 根据是否存在 counter measurement block 动态生成。
  - 更新相关注释，避免暗示 Phase A 需要 repetition index。
- `scripts/checkGeneratorBatching.mjs`
  - 更新回归检查，确认 Phase A 不再生成无用 `repetition_index` 赋值。
  - 增加无测量 sweep 的回归检查，确认不会生成 repetition loop 和 `raw_counts`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 生成 Python 更简洁：
  - 排时序阶段保留 `scan_index = logical_index // self.repetition_num_per_point`。
  - raw dataset 写入阶段仍保留真正需要的 `for repetition_index in range(...)`。
  - 没有 counter measurement 时，不生成 repetition/raw_counts 相关代码和提示。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 之后继续清理 generator 时，要区分“排时序需要的变量”和“dataset 发布需要的变量”，不要把 dataset 维度逻辑误删。

## 2026-07-16 15:31 HKT

### 功能变更

- 清理 ARTIQ Python generator 中冗余的 `self.repetitions` 别名。
- sweep 代码现在直接使用 `self.repetition_num_per_point`。
- no-sweep 代码现在直接使用 `self.loop_count`。

### 动机

- 之前生成代码里会出现 `self.repetitions = self.repetition_num_per_point` 或 `self.repetitions = self.loop_count`，语义重复，阅读时容易困惑。
- 清理后生成代码更直接：一个概念只保留一个运行时变量来源。

### 涉及文件

- `src/pythonGenerator.ts`
  - 删除生成 `self.repetitions = ...` 的代码。
  - 将 run brief、sweep dataset metadata、raw_counts shape 打印中的 `self.repetitions` 引用改为真实来源。
- `scripts/checkGeneratorBatching.mjs`
  - 增加回归检查，确认生成 Python 中不再出现 `self.repetitions = ...`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 只是生成 Python 代码中的运行时别名被移除。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 生成代码不再包含 `self.repetitions = self.repetition_num_per_point` 或 `self.repetitions = self.loop_count`。
- sweep 逻辑仍然使用 `self.repetition_num_per_point` 控制每个 scan point 的 repetition 数。
- no-sweep 逻辑仍然使用 `self.loop_count` 控制总 repetition 数。

### 测试记录

- 已通过：
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 说明：
  - 曾尝试运行 `npm run test:generator-batching`，但项目中没有这个 npm script；实际 generator batching 检查由 `npm run test:generator` 覆盖。

### 之后还要注意什么

- 后续新增生成代码变量时，应避免为同一个物理概念创建多个运行时别名，除非确实能提升可读性。

## 2026-07-16 14:31 HKT

### 功能变更

- 修复 `Select channels` 展开菜单被 timeline 左侧 channel 名称覆盖的问题。

### 动机

- timeline 左侧 channel label 使用 sticky / z-index 保持可见，层级高于 channel selector 菜单，导致菜单打开时底下的 channel 名称浮到菜单上方。
- channel selector 菜单应该作为当前交互浮层显示在 timeline 之上。

### 涉及文件

- `src/App.css`
  - 提高 `.channel-selector` 和 `.channel-menu` 的 z-index。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 打开 `Select channels` 后，菜单会完整覆盖 timeline，不再被已选 channel 名称遮挡。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果以后继续添加 timeline 浮层，需要统一管理 z-index，避免菜单、tooltip、sticky channel label 互相遮挡。

## 2026-07-16 13:03 HKT

### 功能变更

- 给 `Saved packages` 中每个 package row 的 `×` 删除按钮增加二次确认。

### 动机

- 删除 package 是不可撤销操作，直接点击 `×` 删除容易误触。
- 二次确认可以避免用户误删已保存的参数 package。

### 涉及文件

- `src/App.tsx`
  - `removeSavedPackage()` 删除前先调用 `window.confirm()`。
  - 用户取消确认时，不修改 package library 和当前选择状态。
- `scripts/checkPackageUi.mjs`
  - 增加静态检查，确认 package 删除流程保留确认弹窗。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 点击 package row 后面的 `×` 后，会先显示确认弹窗。
- 只有确认后才会真正删除 package。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:package-ui`
  - `npm run build`

### 之后还要注意什么

- 如果以后把浏览器原生 confirm 换成应用内 modal，需要保持删除逻辑仍然只在用户确认后执行。

## 2026-07-16 13:00 HKT

### 功能变更

- 调整 `Saved packages` 的删除入口。
- 删除按钮不再放在每个 package category 选择框外侧。
- 改为打开 package dropdown 后，在每个具体 package 行右侧显示一个 `×` 删除按钮。

### 动机

- 原来的 `×` 看起来像是在删除整个 category，语义不够清楚。
- 用户想删除的是某一个具体 package，所以删除入口应该跟随具体 package row。
- 原生 `select/option` 不能可靠承载可点击删除按钮，因此这里改成轻量自定义 dropdown。

### 涉及文件

- `src/App.tsx`
  - `Saved packages` 从原生 select 改成自定义 dropdown。
  - 新增当前打开的 package category 状态。
  - 每个 package row 内新增独立删除按钮，并用 `event.stopPropagation()` 避免删除时同时选择 package。
- `src/App.css`
  - 新增 package dropdown、menu、row delete button 样式。
  - 移除外侧 category delete button 对应布局。
- `scripts/checkPackageUi.mjs`
  - 更新 UI 静态检查，确认新的 dropdown/delete row 结构存在。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- package library、package id、category、payload 结构都不变。

### UI 交互有没有变化

- 有。
- 点击 category 选择框会打开自定义 package 菜单。
- 每个 package 后面都有自己的 `×` 删除按钮。
- 内置 package 的删除按钮会禁用，用户保存的 package 可以删除。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:package-ui`
  - `npm run test:packages`
  - `npm run build`

### 之后还要注意什么

- 之后如果要让 dropdown 支持点击外部自动关闭、键盘上下选择，可以在这个自定义 dropdown 基础上继续增强。

## 2026-07-16 11:54 HKT

### 功能变更

- 修复点击 `Save as package` 后页面黑屏的问题。
- `Save as package` 的保存计算从 React state updater 中移出，避免 updater 内抛错导致整页崩溃。
- DDS package 保存时，如果当前 module 缺少 `ddsParameters`，会根据现有 `frequencyMHz`、`amplitude`、`phaseDeg`、`durationMs` 自动补齐标准 DDS parameter structure。

### 动机

- React 的 functional state updater 里抛出的错误不会被外层 `try/catch` 稳定兜住，可能直接触发页面崩溃。
- 某些已有 DDS task 可能还没有完整 `ddsParameters`，但仍然有 legacy DDS 字段；保存 package 时应正常转换，而不是报错。

### 涉及文件

- `src/App.tsx`
  - `savePanelModuleAsPackage()` 改为先计算 next package list，再调用 `setSavedPackages(next)`。
  - 保存失败时显示具体错误信息，不再黑屏。
- `src/packageStorage.ts`
  - 新增 DDS parameter fallback builder。
  - DDS package payload 在缺少 `ddsParameters` 时自动从现有 DDS 字段生成完整参数结构。
- `scripts/checkPackageLibrary.mjs`
  - 增加保存没有 `ddsParameters` 的 DDS module 的回归测试。
- `Development_log.md`
  - 新增本次中文 debug 记录。

### 数据结构有没有变化

- 没有新增字段。
- DDS package 仍使用现有 `ddsParameters` 结构；只是保存时补齐缺失结构。

### UI 交互有没有变化

- 有。
- 点击 `Save as package` 时不再因为保存错误导致页面黑屏。
- 保存失败会在 Module properties 区域显示错误信息。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:packages`
  - `npm run test:package-ui`
  - `npm run test:generator`
  - `npm run build`

### 之后还要注意什么

- 以后不要在 React state updater 内执行可能抛错的持久化/validation 逻辑；应先在 handler 中计算并捕获错误，再更新 state。

## 2026-07-16 11:46 HKT

### 功能变更

- 完成 Saved Parameter Packages 第三步：最终清理、validation 和测试补强。
- 移除/确认没有旧 stacked package card/list 实现残留。
- package category mapping 集中到 `packageStorage.ts` 的 `packageCategoryDefinitions`。
- 加强 package schema validation。
- 加强 malformed localStorage 防护。
- 同一 category 内 package name 现在大小写不敏感地保持唯一。
- 保存 package 时不再自动追加后缀，而是明确报错。
- 新增 package UI 静态检查脚本。

### 动机

- 前两步已经建立了新 package data layer 和 category dropdown UI。
- 最后一步需要清理旧实现、补齐边界校验，避免未发布前留下两套 package 结构或隐式兼容逻辑。

### 涉及文件

- `src/packageStorage.ts`
  - 新增 `packageCategoryDefinitions` 作为 canonical category mapping。
  - 新增 package schema / payload / sweep validation。
  - 新增 package ID 唯一性检查。
  - 新增同类 package name 大小写不敏感唯一性检查。
  - malformed localStorage 现在会 warning 并回退为空 user package library。
  - 保存 package 前会 validate canonical schema。
  - export 前会 validate merged library。
- `src/App.tsx`
  - Saved Packages UI 改为使用 `packageCategoryDefinitions`，不再重复 category mapping。
- `scripts/checkPackageLibrary.mjs`
  - 增加 malformed localStorage、duplicate id、invalid category/payload、duplicate name、case-insensitive duplicate name、跨 category 同名允许等测试。
- `scripts/checkPackageUi.mjs`
  - 新增 UI 源码检查，确认旧 card/list class 不存在、三类 dropdown 和 Export Packages 存在、没有 Import JSON 控件。
- `package.json`
  - 新增 `test:package-ui` 脚本。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- public package schema 没有再新增字段。
- canonical schema 仍是：
  - `schemaVersion: 1`
  - `packages.ddsSignals`
  - `packages.ttlCounterMeasures`
  - `packages.ttlPulses`
- package category mapping 现在集中定义为：
  - `ddsSignal`
  - `ttlCounterMeasure`
  - `ttlPulse`

### UI 交互有没有变化

- 有少量验证行为变化。
- 同一 category 内保存重名 package 会报错，不再自动改名。
- package name 只比较同类，跨 category 允许同名。
- malformed localStorage 不会让页面崩溃，会按空 user package library 继续显示。
- 没有新增 Import JSON UI。

### ARTIQ code generator 有没有变化

- 没有。
- 没有修改 timeline、Python generator、counter batching、dataset、DDS/TTL runtime 或 sweep 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:packages`
  - `npm run test:package-ui`
  - `npm run test:generator`
  - `npm run build`
- 已检查：
  - 旧 `package-card` / `package-main` / `package-list` 只出现在测试中的禁止断言里。
  - 旧 localStorage key `artiq_sequence_builder_saved_packages` 不再存在。
  - 没有 `Import Packages` / `Import JSON` 控件。
  - Export JSON 不包含 `source` / `isBuiltIn` / dropdown selection / draft module 这类内部状态。

### 之后还要注意什么

- 之后如果往默认 JSON 添加 built-in packages，必须给每个 package 显式稳定 `id`，并保证同一 category 内 name 不重复。
- JSON import 仍未实现，后续应作为独立任务设计 validation、merge 和 conflict 策略。

## 2026-07-16 11:36 HKT

### 功能变更

- 重设计 Saved Packages UI。
- 删除旧的 package card / stacked list 显示方式。
- Saved Packages 区域现在固定显示三个 category section：
  - `DDS Signal`
  - `TTL Counter / Measure`
  - `TTL Pulses`
- 每个 category 使用独立 dropdown/select。
- dropdown 中只显示对应 category 的 package name。
- 新增 `Export Packages` 按钮，调用现有 package library JSON export。
- 用户 package 可以通过当前 category 的 Delete 按钮删除。
- built-in default package 只读，不显示可用删除动作。

### 动机

- 上一步已经把 package data layer 拆成三类 package library。
- UI 需要按同样的三类结构展示，避免所有 package 混在一个长列表里。
- dropdown 选择比 card 堆叠更紧凑，适合当前 bottom card 区域。

### 涉及文件

- `src/App.tsx`
  - 引入 `downloadParameterPackageLibrary`、`getPackagesByCategory`、`isBuiltInPackage`。
  - 新增三个 package category section 定义。
  - 新增三类 dropdown 的独立 selection state。
  - 选择 package 时只加载到 Create Module draft，不直接加入 timeline。
  - 从 package 创建 DDS draft 时使用 deep copy，并优先恢复 `ddsParameters`。
  - `Save as package` 现在拒绝空白 package name。
  - 删除 user package 后只清除对应 category 的 dropdown selection，不清空 Create Module form。
- `src/App.css`
  - 移除旧 card list 样式。
  - 新增 compact category dropdown 布局。
  - 新增 `Export Packages` button 布局。
- `src/packageStorage.ts`
  - `savePackageFromModule` 的 package name 现在会拒绝空白名称。
- `scripts/checkPackageLibrary.mjs`
  - 增加空白 package name 会被拒绝的测试。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增 package schema 字段。
- 继续使用上一轮建立的：
  - `schemaVersion: 1`
  - `packages.ddsSignals`
  - `packages.ttlCounterMeasures`
  - `packages.ttlPulses`
- 本次只调整 UI 如何读取和操作该 library。

### UI 交互有没有变化

- 有。
- `Saved packages` 不再显示 package cards。
- 每个 category 都有一个 dropdown：
  - 空 category 显示 `No saved packages`，并禁用。
  - 有 package 时显示 `Select a package` placeholder。
- 选择 package 会打开右侧 Create Module editor，并填入 saved parameters。
- 选择 package 不会创建 timeline task。
- 用户仍需点击 `Create` 才能把 draft module 加入 timeline。
- `Export Packages` 会导出完整 package library JSON。
- 没有增加 Import JSON 控件。

### ARTIQ code generator 有没有变化

- 没有。
- 没有修改 timeline、DDS/TTL runtime、counter batching、dataset 或 Python generation。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:packages`
  - `npm run test:generator`
  - `npm run build`
- 已检查：
  - 旧 `package-card` / `package-main` / `package-list` JSX 和 CSS 已移除。
  - Saved Packages UI 现在只有 category dropdown 结构。
  - `Export Packages` 接到现有 export function。

### 之后还要注意什么

- 下一步如果实现 JSON import，需要接入同一套 package library schema，不能在 UI 内部直接解析/写 localStorage。
- 如果默认 JSON 之后加入 built-in packages，需要确保它们显式带稳定 `id` 和正确 `category`。

## 2026-07-16 11:29 HKT

### 功能变更

- 重构 Parameter Package 数据层。
- 新增项目内置默认 package JSON 文件：
  - `src/data/default_parameter_packages.json`
- 新增统一 package schema：
  - `schemaVersion: 1`
  - `packages.ddsSignals`
  - `packages.ttlCounterMeasures`
  - `packages.ttlPulses`
- 用户创建的 package 现在只保存到新的 localStorage key：
  - `artiq-sequence-builder.parameter-packages.v1`
- UI 使用内置默认 packages + 用户 packages 的 merged library。
- 新增完整 JSON export function：
  - `exportParameterPackageLibrary()`
  - `downloadParameterPackageLibrary()`
- 本次不实现 JSON import。

### 动机

- 之前 saved package 是一个扁平 localStorage array，不适合之后维护内置模板、用户模板、分类导出和将来的导入功能。
- 新 schema 让 DDS Signal、TTL Counter / Measure、TTL Pulse 三类 package 明确分开，后续拓展更清楚。

### 涉及文件

- `src/data/default_parameter_packages.json`
  - 新增内置默认 package JSON 文件，初始为空数组。
- `src/types.ts`
  - 新增 `ParameterPackageCategory`。
  - `SavedModulePackage` 新增 `category`。
  - 新增 `ParameterPackageSchema`。
  - `SavedModulePackageParams` 新增可选 `ddsParameters`，复用现有 DDS 参数/ sweep 类型。
- `src/packageStorage.ts`
  - 删除旧扁平数组存储实现。
  - 新增默认 package 加载、用户 package 加载、合并库、分类过滤、创建、删除、内置判断、JSON export/download。
  - localStorage 访问集中在此文件。
- `src/App.tsx`
  - Saved Packages UI 最小接入新数据层。
  - 从 package 创建 DDS draft 时优先恢复 `ddsParameters`。
  - 内置 package 不显示删除按钮。
- `scripts/checkPackageLibrary.mjs`
  - 新增 package data layer 测试。
- `package.json`
  - 新增 `test:packages` 脚本。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- Package public JSON 结构改为：
  - `schemaVersion: 1`
  - `packages.ddsSignals`
  - `packages.ttlCounterMeasures`
  - `packages.ttlPulses`
- Package category 使用：
  - `ddsSignal`
  - `ttlCounterMeasure`
  - `ttlPulse`
- 用户 package localStorage 只保存用户创建 package，不复制内置默认 package。
- 没有添加 legacy migration、旧 key fallback、deprecated 字段或旧格式兼容。

### UI 交互有没有变化

- 视觉上基本不变。
- Saved Packages 列表现在显示 merged library。
- 内置默认 package 将来出现在列表中时可被选择使用，但不会显示删除按钮。
- 当前没有新增 JSON import UI。

### ARTIQ code generator 有没有变化

- 没有。
- 没有修改 timeline、batch execution、counter fetch、dataset、sweep、DDS/TTL 生成逻辑。

### 测试记录

- 已通过：
  - `npm run test:packages`
  - `npm run test:generator`
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- `test:packages` 覆盖：
  - 默认 JSON schema 可加载。
  - 默认空 package 不会写入 localStorage。
  - DDS / TTL Counter Measure / TTL Pulse 三类 package 分开保存。
  - 删除用户 package 会更新 localStorage。
  - JSON export 生成 `schemaVersion: 1` 和三类数组。
  - export 不包含 `source` 这类内部 metadata。

### 之后还要注意什么

- 下一步如果要做 UI redesign，可以在当前 data layer 上增加分类 tab、内置/用户标识、导出按钮等。
- JSON import 还没有实现，后续需要单独做 parser、validation、merge/conflict 策略。

## 2026-07-16 11:10 HKT

### 功能变更

- 新增顶栏 `Fetch batch` 数值输入。
- `Fetch batch` 控制 generated ARTIQ Python 中连续 schedule 多少个完整 shot 后再执行 counter `fetch_count()`。
- 默认值为 `100`。
- 允许范围为整数 `1` 到 `100`。
- generator 不再使用固定写死的 batch size。
- Python metadata / round-trip editor state 现在包含 `fetchBatchSize`。

### 动机

- 不同实验长度、counter 数量和 RTIO 压力不同，固定 `100` 不够灵活。
- 用户需要在保持 batch 内连续 timing 的同时，控制每次 counter readout 前排队的 shot 数。

### 涉及文件

- `src/types.ts`
  - `SequenceState` 新增顶层字段 `fetchBatchSize`。
- `src/App.tsx`
  - 新增 `Fetch batch` toolbar input。
  - 新增输入草稿和校验：空值、小数、0、负数、101 以上都视为无效。
  - 无效时阻止 Python preview/export/save 使用该设置。
  - 默认实验和空白实验设置 `fetchBatchSize: 100`。
- `src/App.css`
  - toolbar 重新加入一个紧凑列给 `Fetch batch`。
  - 新增 invalid input 样式和小型错误提示。
- `src/experimentStorage.ts`
  - 保存/加载的 normalized state 包含 `fetchBatchSize`。
- `src/pythonMetadataImport.ts`
  - import metadata 时要求 `editorState.fetchBatchSize` 存在且为 1 到 100 的整数。
- `src/pythonGenerator.ts`
  - 删除固定 batch size 常量。
  - `self.sequence_batch_size` 由 `state.fetchBatchSize` 生成。
  - generator 对 `fetchBatchSize` 做 1 到 100 整数校验。
  - sweep / no-sweep batch loop 都使用同一个配置值。
- `scripts/checkGeneratorBatching.mjs`
  - 增加最小值 1、最大值 100、无效值 0、101、小数的测试。
  - 增加整除 batch、非整除 batch、总 shot 小于 batch、跨 scan/repetition batch、多 counter 的文本断言。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- `SequenceState` 新增：
  - `fetchBatchSize: number`
- 新保存 experiment 和 Python metadata 会包含该字段。
- 没有增加旧字段 alias、deprecated 字段或额外 migration schema。

### UI 交互有没有变化

- 有。
- 顶栏 `Experiment name` 后面新增 `Fetch batch` 输入框。
- 输入框设置：
  - `min=1`
  - `max=100`
  - `step=1`
- 无效输入会显示红色边框和简短错误提示。
- 无效输入不会被静默 round 或 clamp。

### ARTIQ code generator 有没有变化

- 有。
- generated Python 中：
  - `self.sequence_batch_size = <fetchBatchSize>`
- batch loop 仍然使用：
  - `batch_end = min(batch_start + self.sequence_batch_size, self.total_sequences)`
- counter readout 仍只发生在 batch 之间。
- dataset 写入仍在所有 batch 完成之后。
- 多 counter 时，batch size 仍表示 shot 数，不是 counter value 数。
- sweep 时，`logical_index` 仍映射回：
  - `scan_index`
  - `repetition_index`

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:generator`
  - `npm run build`
- `test:generator` 覆盖：
  - `fetchBatchSize = 1`
  - `fetchBatchSize = 100`
  - invalid `0`
  - invalid `101`
  - invalid decimal
  - exact divisible batch
  - final partial batch
  - total shots smaller than batch size
  - sweep scan/repetition mapping across batch boundaries
  - multiple active counters
  - dataset mutation remains after batch fetch phase

### 之后还要注意什么

- 如果真实硬件上某些 counter FIFO 对 batch size 更敏感，可以根据实验经验把 UI 上限从 `100` 调低或做设备相关推荐值。
- 当前设置控制 shot 数；多 counter 时每个 shot 会为每个 counter 排队一个 result。

## 2026-07-16 11:01 HKT

### 功能变更

- 完全删除顶栏 `Fixed / Infinite` experiment mode selector。
- 应用现在只支持有限次数实验执行。
- `Repetition` 成为唯一控制 experiment execution count 的入口。
- 顶栏布局移除原 selector 占位，`Repetition` 和 `Sequence gap` 自然左移。
- generated Python 不再包含 infinite loop / `while True` 生成分支。
- 新保存和新导出的 metadata 中不再包含 loop mode 字段。

### 动机

- 当前应用还没有正式发布，不需要保留未使用的 Fixed/Infinite 模式和兼容逻辑。
- 删除模式分支可以减少用户困惑，也让 generator 始终围绕有限 repetition batch execution 维护。

### 涉及文件

- `src/types.ts`
  - 从 `LoopConfig` 删除 `mode` 字段。
- `src/App.tsx`
  - 删除顶栏 `Fixed / Infinite` segmented selector。
  - 删除 repetition input 的 infinite-mode disable 逻辑。
  - 删除默认 state / blank state 中的 `loop.mode`。
- `src/App.css`
  - 删除 toolbar grid 中原 selector 对应的列，让后续控件左移。
- `src/experimentStorage.ts`
  - `loop` 保存/归一化改为显式字段构造，不再保留旧 `mode` 字段。
- `src/pythonGenerator.ts`
  - 删除 metadata 中的 `loopMode`。
  - 删除 infinite mode code generation 分支。
  - 删除 infinite streaming dataset/readout helper。
  - sweep 和 no-sweep 都固定使用 finite repetition 逻辑。
- `scripts/checkGeneratorBatching.mjs`
  - 删除测试 state 中的 `mode` 字段。
  - 新增断言：generated Python 不包含 `while True` 和 `loopMode`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- `LoopConfig` 不再包含 `mode`。
- 新保存 experiment 的 `loop` 只包含：
  - `count`
  - `interLoopDelayMs`
  - `interLoopDelayUnit`
- 没有加入旧字段兼容、fallback parsing 或 migration。

### UI 交互有没有变化

- 有。
- 顶栏不再显示 `Fixed / Infinite`。
- `Experiment name` 输入框宽度保持原 grid column 设置。
- `Repetition` 和 `Sequence gap` 移到 `Experiment name` 后面。
- 不保留不可见 spacer 或占位容器。

### ARTIQ code generator 有没有变化

- 有。
- generated Python 永远使用 finite repetition / batch execution path。
- 不再生成 infinite `while True` path。
- sweep mode 中 `repetition_num_per_point` 直接来自 `Repetition`。
- no-sweep mode 中 `loop_count` 直接来自 `Repetition`。
- batch execution、counter fetch、dataset write、sequence gap 的核心逻辑保持不变。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:generator`
  - `npm run build`
- 额外检查：
  - 搜索 `Fixed` / `Infinite` / `loop.mode` / `loopMode` / `isInfinite`，已清除属于该功能的代码引用。
  - 剩余的 `mode` 引用属于 phase mode、sweep legacy mode 或 signal output model，不属于 experiment mode。

### 之后还要注意什么

- 如果未来真的需要无限运行，应作为新的明确功能重新设计，不要恢复旧 selector。
- 旧 localStorage 里如果还有 `mode` 字段，下一次保存会因为显式字段构造而不再写回。

## 2026-07-13 12:19 HKT

### 功能变更

- 更新 ARTIQ Python generator 的执行模型。
- generated experiment 现在会把完整 logical sequence 按最多 100 次一组分 batch 执行。
- 每个 batch 内只 schedule timing/gate，不执行 `fetch_count()`，也不写 dataset。
- 每个 batch timing 完成后，按原 schedule 顺序读取所有 counter result，并先写入 kernel 里的 raw buffer。
- 非最后一个 batch 后调用 `self.core.break_realtime()`，用于恢复 RTIO slack；它不是实验物理延迟。
- 所有 batch 完成后，再按原来的 scan/repetition 结构写入 dataset。
- 顶栏 `Delay` 文案改为 `Sequence gap`。
- `Sequence gap` 允许为 0，不允许为负数。
- 新增 generator 文本检查脚本 `npm run test:generator`。

### 动机

- 之前长时间实验会先 schedule 全部 timing，然后最后统一读 counter；如果 experiment 很长，中间不让 CPU/RTIO 恢复 slack，可能不够稳。
- 新模型在不改变 logical sequence 顺序和 dataset 含义的前提下，把执行拆成小批次，减少一次性排队和读数压力。
- `Delay` 这个词容易和自动推导的 timeline delay 混淆，因此 UI 改成更明确的 `Sequence gap`。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 `sequenceBatchSize = 100`。
  - 新增 counter raw buffer、batch readout、fixed/sweep dataset publish helper。
  - no-sweep fixed mode 改为 batch schedule -> batch readout -> final dataset publish。
  - sweep mode 改为 flattened logical order：`scan_index * repetitions + repetition_index`。
  - sweep mode 的 raw/average dataset 写入移动到所有 batch 完成之后。
  - infinite mode 仍然按 recurring batch streaming 处理，因为它没有“最终 batch”。
  - generator 增加 `Sequence gap` 非负检查。
- `src/App.tsx`
  - 顶栏 `Delay` label 改为 `Sequence gap`。
  - 输入时将负值夹到 0。
  - 单位选择 aria label 改为 `Sequence gap unit`。
- `src/experimentStorage.ts`
  - 加载旧实验时将负的 `interLoopDelayMs` 归一化为 0。
- `scripts/checkGeneratorBatching.mjs`
  - 新增 generator 文本测试，检查 batch loop、readout buffer、Phase C dataset publish。
- `package.json`
  - 新增 `test:generator` 脚本。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有改变保存格式。
- 内部字段仍保留 `interLoopDelayMs` / `interLoopDelayUnit`，用于兼容旧 localStorage、metadata 和已保存 experiment。
- 语义上这个字段现在在 UI 中解释为 `Sequence gap`。

### UI 交互有没有变化

- 有。
- 顶栏 `Delay` 改为 `Sequence gap`。
- 用户可以输入 `0`，表示连续 logical sequences 之间不插入额外物理 gap。
- 用户输入负数会被归零，不会进入生成器。

### ARTIQ code generator 有没有变化

- 有。
- no-sweep fixed mode：
  - 生成 `self.total_sequences = self.loop_count`。
  - 生成 `self.sequence_batch_size = 100`。
  - 每个 batch 内 schedule 完整 sequence。
  - batch timing 后统一 `fetch_count()` 到 raw buffer。
  - 所有 batch 完成后用 `mutate_dataset()` 写入 `measurement.<counter>.counts` 和 `count_rate`。
- sweep mode：
  - 生成 `self.total_sequences = self.scan_points * self.repetition_num_per_point`。
  - logical order 使用 `logical_index // repetitions` 和 `logical_index % repetitions` 还原 scan/repetition。
  - 所有 counter raw result 先写入 flat buffer。
  - 最后重建 `(scan_index, repetition_index)`，写入 `raw_counts`、`raw_count_rate`、average counts 和 count rate。
- `Sequence gap` 只在同一个 batch 内的相邻 logical sequences 之间生成。
- batch 边界不额外生成 `delay(sequence_gap)`，只生成 `self.core.break_realtime()`。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run test:generator`
  - `npm run build`
- `test:generator` 检查：
  - fixed mode 生成 batch loop。
  - `fetch_count()` 出现在 timing phase 后。
  - dataset publish 出现在 batch readout 后。
  - sweep mode 使用 flattened logical order，并最终写回 raw dataset。

### 之后还要注意什么

- 这次保持旧字段名 `interLoopDelayMs` 不动，之后如果要彻底改名成 `sequenceGapMs`，需要做 metadata/localStorage migration。
- infinite mode 没有“实验结束后统一写 dataset”的自然终点，因此目前仍按 recurring batch streaming 写入。
- 如果真实 ARTIQ kernel 对动态长度 Python list buffer 有限制，后续可能需要改成更 ARTIQ-native 的 fixed-size buffer 表达方式。

## 2026-06-24 15:03 HKT

### 功能变更

- 删除顶栏中的重复 `New experiment` 图标按钮。
- 保留 experiment tab 行旁边的 `+` 按钮作为创建新实验的入口。
- 保留顶栏中的 `Import Python` / upload 按钮。

### 动机

- 顶栏 `New experiment` 按钮和 tab 区域旁边的 `+` 功能重复。
- tab 区域的 `+` 更直观地表达“新增一个实验 tab”，因此删除顶栏重复入口让 UI 更简洁。

### 涉及文件

- `src/App.tsx`
  - 移除顶栏 `New experiment` button。
  - 移除不再使用的 `FilePlus2` icon import。
- `src/App.css`
  - 移除 toolbar 中对应的一个 `36px` grid column，避免留下空位。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 顶栏不再显示重复的新建实验按钮。
- 新建实验功能仍可通过 experiment tab 行旁边的 `+` 使用。
- Import/Upload、Clear、Save、Export 等按钮保持不变。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已确认：
  - `FilePlus2` 不再出现在 `src/App.tsx`。
  - `New experiment` 入口只剩 experiment tab 行旁边的 `+`。

### 之后还要注意什么

- 如果用户未来希望顶栏也能快速新建实验，可以考虑用更明确的文本按钮放回，但当前保留单一入口更简洁。

## 2026-06-24 11:22 HKT

### 功能变更

- 更新 generated ARTIQ Python 中 `launch_applets()` 的自动启动逻辑。
- applet 自动启动现在优先使用当前 Python interpreter：
  - `sys.executable -m artiq.applets.plot_xy <y_dataset> --x <x_dataset>`
- `launch_applets()` 内部现在局部导入：
  - `subprocess`
  - `sys`
  - `shutil`
- 如果 `shutil.which("artiq_applet")` 能找到可执行文件，会作为第二个 fallback command。
- manual fallback message 改成真实 terminal command，不再使用 dashboard applet placeholder。
- generated Python 文件中不再生成 `${artiq_applet}...` 作为手动命令。

### 动机

- Windows / MSYS2 / CLANG64 环境下，`artiq_applet` 不一定能被 `subprocess.Popen(..., shell=False)` 直接找到。
- `${artiq_applet}` 是 ARTIQ dashboard applet 面板中的 placeholder，不是普通 terminal command。
- 使用 `sys.executable -m artiq.applets.plot_xy` 更适合在同一个 ARTIQ Python 环境中启动 applet。

### 涉及文件

- `src/pythonGenerator.ts`
  - 重写 `generateAppletLaunchCode(...)` 生成的 helper。
  - 新增 generated helper 内的 `plots = [{"y": ..., "x": ...}]` 结构。
  - Run Brief 中的 applet summary 改用真实 terminal-style command。
  - 移除 generated Python 顶层 `import subprocess`，改为 helper 内局部 import。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- plot package / selectedPlots 结构保持不变。

### UI 交互有没有变化

- 没有。
- 这是 generated Python 自动启动 applet 的行为变化。

### ARTIQ code generator 有没有变化

- 有。
- `launch_applets()` 现在：
  - 保持 host-side。
  - 使用 `shell=False`。
  - 多 plot 逐个尝试启动。
  - 启动失败时只打印 warning 和真实 manual command，不会中断实验。
- 没有修改 kernel、RTIO timing、dataset 写入或 counter readout 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 generator 抽样验证：
  - generated Python 的 `launch_applets()` 内含 `import subprocess`、`import sys`、`import shutil`。
  - command 优先使用 `sys.executable -m artiq.applets.plot_xy`。
  - 仍然保留 `shutil.which("artiq_applet")` fallback。
  - 使用 `subprocess.Popen(command, shell=False)`。
  - generated Python 不包含 `${artiq_applet}` dashboard placeholder。

### 之后还要注意什么

- UI 中如果未来重新显示 dashboard applet command，可以继续使用 `${artiq_applet}` placeholder；但 generated Python 内应继续使用真实 terminal command。
- 需要在真实 Windows/MSYS2/CLANG64 ARTIQ 环境中最终验证 applet window 是否能被当前 Python interpreter 成功启动。

## 2026-06-18 17:20 HKT

### 功能变更

- 新增 DDS attenuation 参数上限限制。
- DDS attenuation 最大允许值为 `31.5 dB`。
- Properties 面板中的 attenuation input 增加：
  - `min = 0`
  - `max = 31.5`
- 当用户输入超过 `31.5 dB` 时，面板会显示错误信息。
- ARTIQ Python generator 也会阻止生成超过上限的 DDS attenuation。

### 动机

- DDS attenuation 硬件/设备参数最大可设置到 `31.5 dB`。
- 需要避免 UI 或导入旧实验后生成非法 `set_att(...)` 代码。

### 涉及文件

- `src/App.tsx`
  - 新增 `maxDdsAttenuationDb = 31.5`。
  - attenuation 输入框增加最大值限制。
  - DDS task validation message 中加入 attenuation 上限错误。
- `src/pythonGenerator.ts`
  - 新增 generator 层 attenuation 上限检查。
  - 如果任何 DDS task 的 `attenuationDb > 31.5`，生成错误信息并阻止正常 ARTIQ Python 输出。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 仍使用现有 `attenuationDb: number` 字段。

### UI 交互有没有变化

- 有。
- DDS properties panel 中 attenuation 超过 `31.5 dB` 时会显示错误。
- 输入框本身标记最大值为 `31.5`。

### ARTIQ code generator 有没有变化

- 有。
- generator 现在会在生成前检查 DDS attenuation 上限。
- 没有修改 `set_att(...)` 的生成位置，也没有修改 timing / counter / dataset / sweep 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 generator 抽样验证：
  - DDS attenuation = `40 dB` 时，`getArtiqGenerationError(...)` 返回包含 `31.5 dB or less` 的错误。
  - `generateArtiqPython(...)` 也会输出相同限制的错误占位内容。

### 之后还要注意什么

- 当前实现是报错而不是自动 clamp，避免用户误以为实际设置成功。
- 如果未来加入设备数据库参数化限制，可以把 `31.5` 移到统一 device/config model 中。

## 2026-06-18 15:22 HKT

### 功能变更

- 为 ARTIQ Python generator 新增第一版 `Experiment Run Brief`。
- 每个 generated experiment class 现在会包含 host-side 方法：
  - `print_run_brief(self)`
- `run()` 会在进入 `run_kernel()` 前调用：
  - `self.print_run_brief()`
- Run Brief 会打印紧凑实验摘要：
  - experiment name
  - generated-by label
  - run mode：`no sweep` / `single sweep` / `multi sweep`
  - sweep 参数摘要
  - repetitions per scan point
  - scan points
  - total measurement shots
  - DDS / TTL output / counter channel 列表
  - numeric result dataset 名称、shape 和 meaning
  - applet commands 或 `none`

### 动机

- 运行实验前需要在 ARTIQ log 中快速确认当前实验配置。
- 第一版只打印 compact metadata，不打印完整 sequence，也不打印任何实际测量数据。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 `generateRunBriefCode(...)`。
  - 新增 compact print helper。
  - sweep / no-sweep 两条 generator 路径都会生成 `print_run_brief(self)`。
  - run brief 和 applet launcher 使用同一套 applet command source。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 不新增 run brief dataset。

### UI 交互有没有变化

- 没有。
- Run Brief 默认启用，目前没有 UI toggle。

### ARTIQ code generator 有没有变化

- 有。
- 生成的 Python 会增加 host-side `print_run_brief(self)` 方法。
- `self.print_run_brief()` 会在 `run()` 中、进入 `@kernel run_kernel()` 前执行。
- 没有修改 RTIO timing、task scheduling、counter gate/fetch_count、dataset 写入或 applet launch 的核心逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 generator 抽样验证：
  - generated Python 包含 `def print_run_brief(self):`。
  - `self.print_run_brief()` 出现在 `run()` 中。
  - `print_run_brief` 位于 `@kernel` 方法之前，是 host-side method。
  - sweep 示例会打印 `Run mode: single sweep`。
  - dataset summary 只打印 dataset name / shape / meaning，不打印实际 counts/raw_counts 数值。
  - applet summary 会打印相同 applet command。

### 之后还要注意什么

- 这只是 compact run brief，不是 verbose full sequence log。
- 如果后续需要更详细的 run report，可以另做 verbose mode 或 run_brief dataset，但本次没有实现。

## 2026-06-18 14:50 HKT

### 功能变更

- 更新 ARTIQ Python generator：数值实验结果 datasets 现在使用固定大小的 NumPy array 初始化。
- generated Python 现在会包含：
  - `import numpy as np`
- no-sweep measurement datasets：
  - `shot_index` 使用 `np.arange(...)`
  - `measurement.<counter>.counts` 使用固定长度 `np.full(..., dtype=np.int32)`
  - `measurement.<counter>.count_rate` 使用固定长度 `np.full(..., np.nan, dtype=float)`
- sweep measurement datasets：
  - `scan_x` 使用固定长度 `np.full(self.scan_points, np.nan, dtype=float)`
  - averaged `counts` / `count_rate` 使用 shape `(scan_points,)`
  - raw repetition data 改为二维：
    - `measurement.<counter>.raw_counts`
    - `measurement.<counter>.raw_count_rate`
  - `raw_counts` shape 为 `(scan_points, repetitions)`，其中 axis 0 是 scan index，axis 1 是 repetition index。
- kernel 中数值结果写入统一使用 `mutate_dataset()`，不再生成 `append_to_dataset()`。

### 动机

- 之前很多 numeric datasets 在 ARTIQ dashboard 中显示为 `list(n)`，不方便查看。
- 使用固定大小 NumPy array 可以让 dashboard 更明确地展示数据形状，也更适合后续分析和归档。

### 涉及文件

- `src/pythonGenerator.ts`
  - numeric result dataset 初始化改为 NumPy array。
  - 添加 dataset 初始化说明 comment。
  - sweep raw repetition storage 从 flat dataset 改为二维 dataset。
  - 保留 metadata datasets 为普通 string / scalar。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- Sequence Builder 内部 task / sequence 数据结构没有变化。
- 生成的 ARTIQ dataset 结构有变化：
  - sweep raw data 从 `raw_counts_flat` / `raw_count_rate_flat` 改为二维 `raw_counts` / `raw_count_rate`。
  - no-sweep 和 sweep 的 numeric result arrays 由 Python list 改为 NumPy array。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- host-side `setup_datasets()` 中创建 NumPy arrays。
- `@kernel` 中只使用 `mutate_dataset()` 写入已有 dataset。
- 没有改变 RTIO timing、gate/fetch_count 两阶段逻辑或 applet dataset 名称。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 generator 抽样验证：
  - no-sweep Python 包含 `import numpy as np` 和 `np.arange(self.loop_count, dtype=np.int32)`。
  - 当时的 sweep Python 使用二维 `np.full((self.scan_points, self.repetition_num_per_point), -1, dtype=np.int32)`；该设计已在 2026-08-06 的后续修改中替换为一维 scan-major `raw_counts`。
  - generated Python 中不再包含 `append_to_dataset`。

### 之后还要注意什么

- infinite mode 现在使用固定长度 ring buffer，以 `shot % self.loop_count` 覆盖写入 dataset。
- 如果未来希望 infinite mode 无限增长 dataset，需要单独设计与 fixed-size NumPy array 不同的显示策略。
- ARTIQ dashboard 对 NumPy array 的显示细节需要在真实 ARTIQ 环境中再确认一次。

## 2026-06-18 12:10 HKT

### 功能变更

- 做了一次页面密度和顶栏按钮间距的 UI 微调。
- 右上角 code preview 按钮和 `Export` 按钮之间距离变小。
- 页面整体视觉稍微收缩：
  - 顶栏 padding 略减。
  - workspace padding 略减。
  - channel selector、editor grid、bottom cards 的 gap 略减。
  - timeline 默认最小高度略减。
  - 右侧 Module properties column 略微收窄。

### 动机

- 用户反馈右上角最右侧按钮离 `Export` 太远，且当前页面整体略显偏大。
- 本次目标是轻微压缩视觉密度，不改变功能结构。

### 涉及文件

- `src/App.css`
  - 调整 toolbar gap / padding。
  - 调整 workspace、editor grid、bottom area、channel selector 的间距。
  - 调整 timeline min-height 和 properties panel 宽度。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 只有视觉布局变化。
- 所有按钮功能、导入导出、保存、timeline 编辑逻辑保持不变。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果后续仍觉得整体偏大，可以继续小幅降低 lane height、task block height 或全局字号，但这次先避免过度压缩影响可读性。

## 2026-06-18 12:03 HKT

### 功能变更

- 新增 `Import Python` 功能。
- 用户可以选择 `.py` 文件，网页会读取其中的 Sequence Builder metadata comment block，并恢复 visual editor state。
- 只支持导入本 app 自己导出的 Python 文件，不解析任意手写 ARTIQ Python。
- 新增导入 helper：
  - `extractSequenceBuilderMetadataBlock(fileText)`
  - `cleanPythonCommentedJson(commentedText)`
  - `parseSequenceBuilderMetadata(fileText)`
  - `validateSequenceBuilderMetadata(metadata)`
  - `applySequenceBuilderMetadataToEditor(metadata, defaults)`
  - `parseSequenceBuilderPythonImport(fileText, defaults)`
- 导入成功后：
  - 当前 tab 的 timeline/task state 会被 metadata 恢复。
  - plot configurations 会恢复到当前页面状态。
  - 当前实验状态显示为 `Imported but unsaved`。
- 导入失败不会部分覆盖当前实验。

### 动机

- Step 1 已经在导出 Python 中嵌入 metadata。
- 这一步实现 round-trip 的读取端，让导出的 Python 可以重新回到 visual sequence editor。

### 涉及文件

- `src/pythonMetadataImport.ts`
  - 新增 Python metadata block 提取、comment JSON 清理、JSON parse、metadata validation 和 state application helper。
  - 提供三类明确错误：
    - 没有 metadata block。
    - metadata JSON 无法解析。
    - metadata 与当前 editor 不兼容。
- `src/App.tsx`
  - 顶栏新增 `Import Python` 图标按钮和隐藏 file input。
  - 读取 `.py` 文件文本并调用 import helper。
  - 成功时恢复当前 tab、清除选中 task/draft、恢复 plots，并标记为未保存。
  - 失败时显示错误，不修改当前实验。
- `src/experimentStorage.ts`
  - 导出 `normalizeSequenceState(...)`，让 import helper 复用现有 saved experiment migration / normalization 逻辑。
- `src/App.css`
  - 为顶栏新增 import 按钮列。
  - 新增隐藏 file input 样式。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有修改现有 sequence/task/saved experiment 数据结构。
- 新增的是导入 helper 的 TypeScript 类型，用来描述 metadata import 结果。

### UI 交互有没有变化

- 有。
- 顶栏新增 `Import Python` 按钮。
- 点击后打开文件选择器，只接受 `.py` / Python text 文件。
- 导入成功后 timeline 和 properties panel 可以继续使用现有编辑逻辑。

### ARTIQ code generator 有没有变化

- 没有。
- 本次只读取 metadata comment block，不改变 Python generation 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 helper 抽样测试：
  - 使用 generator 生成带 metadata 的 Python。
  - 使用 import parser 读回，确认恢复 3 个 modules 和 1 个 plot。
  - 使用无 metadata 的随机 Python 字符串测试，确认返回指定 no-metadata 错误。

### 之后还要注意什么

- 当前导入只认 metadata marker，不解析 Python 代码本体。
- 后续如果 metadata schemaVersion 增加，需要在 `src/pythonMetadataImport.ts` 中加入版本迁移逻辑。
- 未来可以考虑导入时创建新 tab，而不是替换当前 tab；当前实现按本次需求恢复到当前 homepage/editor。

## 2026-06-18 11:53 HKT

### 功能变更

- 为每个 generated / exported ARTIQ Python 文件嵌入 Sequence Builder metadata block。
- metadata block 使用固定 marker：
  - `# --- SEQUENCE_BUILDER_METADATA_START ---`
  - `# --- SEQUENCE_BUILDER_METADATA_END ---`
- metadata JSON 每一行都以 `# ` 开头，因此是纯 Python comment，不影响 ARTIQ runtime。
- 新增 helper：
  - `buildSequenceBuilderMetadata(...)`
  - `renderSequenceBuilderMetadataBlock(...)`
- metadata 会从当前 editor state 和 plot state 直接生成，不从 Python code 反向解析。

### 动机

- 后续要支持把本 app 自己生成的 Python 文件重新导入 visual sequence editor。
- 第一步先在导出的 Python 文件中保存足够完整、机器可读的 source-of-truth 数据，避免未来需要解析任意手写 ARTIQ Python。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 metadata 构建和渲染 helper。
  - 为正常 no-sweep 代码、sweep 代码和 generation error 占位输出统一嵌入 metadata。
  - metadata 包含 schema version、format、export time、file name、experiment class、loop/repetition、available/visible channels、modules、task 参数、DDS sweep、TTL duration sweep、plot configs 等信息。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有修改现有 sequence/task/saved experiment 数据结构。
- 新增的是导出 Python 文件中的 comment metadata 格式：
  - `schemaVersion: 1`
  - `format: "ARTIQ Sequence Builder"`

### UI 交互有没有变化

- 没有新增导入 UI。
- Python preview / exported Python 内容会在顶部多出 metadata comment block。

### ARTIQ code generator 有没有变化

- ARTIQ runtime 逻辑没有变化。
- 只在生成文件顶部添加纯 comment metadata block。
- 如果 metadata 生成失败，会保留原 Python code 并在 console 中输出 warning，不阻止导出。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做 metadata 抽样验证：
  - 生成包含 DDS、TTL output、TTL counter measure、sweep 和 plot 的 Python 字符串。
  - 确认 metadata start/end marker 存在。
  - 去掉每行 `# ` 后可以成功 `JSON.parse`。
  - 确认 metadata 中包含 3 个 modules 和 1 个 plot。

### 之后还要注意什么

- 下一步可以实现 import parser，只支持读取带有上述 marker 的 Sequence Builder generated Python。
- 暂时不要尝试解析任意手写 ARTIQ Python；未来导入应优先读取 metadata JSON。

## 2026-06-17 17:09 HKT

### 功能变更

- 细化 `Export signal diagram` 的绘图方式。
- 导出的 signal diagram 现在更像每个 channel 的小型 voltage-vs-time plot：
  - TTL output：绘制连续阶跃方波 trace，并使用集中 output model 中的 low/high voltage。
  - DDS output：在 active task window 内绘制代表性 sine wave trace，外部保持 baseline。
  - TTL counter / input：继续显示为 measurement gate 阴影区域，不当作电压输出。
- DDS sine wave 使用视觉下采样，只显示可读的代表性周期数，不尝试绘制真实 RF 每个周期。
- DDS task label 保留真实参数，包括 frequency、amplitude、attenuation、phase。

### 动机

- 之前导出的 signal diagram 更像 block/envelope diagram，不能直观看出 TTL 方波和 DDS RF 输出的 trace 形态。
- 真实硬件电压校准尚未完成，因此 DDS 仍然默认使用 normalized RF output，并在图中明确标注。

### 涉及文件

- `src/signalDiagramExport.ts`
  - 新增绘图 helper，用于数值到 y 轴位置的映射、数值格式化和 DDS amplitude scale。
  - TTL output row 改为连续 stepped voltage trace。
  - DDS row 改为 representative sine trace。
  - measurement row 保持 gate window 表示。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 没有修改 sequence、task、saved experiment 或 output model 的数据结构。

### UI 交互有没有变化

- 没有改变网页交互。
- 变化只体现在点击 `Export signal diagram` 后生成的 PNG 图像内容。

### ARTIQ code generator 有没有变化

- 没有。
- 本次没有修改 ARTIQ Python generation、task scheduling、dataset 或 applet launch 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 当前 DDS trace 是 normalized / estimated visualization，不是经过硬件校准的真实电压。
- 后续如果获得 DDS 电压校准，可以继续在 `src/signalOutputModel.ts` 中扩展 calibrated model，并决定是否应用 attenuation 到电压换算。

## 2026-06-17 13:13 HKT

### 功能变更

- 新增 `Export signal diagram` PNG 导出功能。
- Export menu 中的 `Export signal diagram` 从占位项接入实际导出。
- 导出图会按 channel row 显示 signal-vs-time：
  - TTL output：按配置模型绘制方波。
  - DDS output：绘制 normalized amplitude envelope。
  - TTL counter / measurement：绘制 measurement gate 阴影区域。
- 导出文件名为：
  - `<experiment_name>_signals.png`

### 动机

- 需要在不改变 ARTIQ code generation 的前提下，额外导出一个信号随时间变化的可视化图。
- 真实硬件电压校准尚未完成，因此 DDS 不能硬编码成真实电压，必须明确显示为 normalized / estimated signal。

### 涉及文件

- `src/signalOutputModel.ts`
  - 新增集中 output model 配置。
  - TTL output 默认 low/high 为 `0 V / 5 V`。
  - DDS 默认 `mode = "normalized"`，暂不应用 attenuation 到电压换算。
  - measurement channel 默认作为 gate 显示。
- `src/signalDiagramExport.ts`
  - 新增 signal diagram canvas PNG 导出。
  - 绘制 time axis、channel rows、TTL 方波、DDS envelope、measurement gate。
  - 添加说明 note，提醒 DDS traces 是 normalized，除非提供 calibrated channel voltage model。
- `src/App.tsx`
  - Export menu 中 `Export signal diagram` 接入 `exportSignalDiagram(state)`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有修改 sequence / task / saved experiment 数据结构。
- 新增的是独立的导出配置 helper，不改变实验数据。

### UI 交互有没有变化

- 有。
- Export menu 中 `Export signal diagram` 现在可点击并下载 PNG。
- 原 `Export Python` 和 `Export timeline diagram` 保持不变。

### ARTIQ code generator 有没有变化

- 没有。
- signal diagram export 完全独立于 ARTIQ Python generation。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器轻量验证：
  - 页面存在 `Export` trigger。

### 之后还要注意什么

- 当前 DDS 显示为 normalized amplitude envelope，不代表真实电压。
- 后续如果获得通道校准，可以在 `src/signalOutputModel.ts` 中扩展 calibrated model，并决定是否应用 `10^(-attenuation_dB / 20)`。
- 如果需要更细的 DDS 表示，可以后续增加 downsampled representative sine wave 模式。

## 2026-06-17 13:02 HKT

### 功能变更

- 调整 timeline diagram PNG 导出标题行 metadata。
- metadata 现在显示为：
  - 日期时间
  - `N channels`
  - `0-xxx unit`
- 移除 `Timeline diagram` 字样。
- metadata 放在 experiment name 右侧，并自动避免与 experiment name 重叠。

### 动机

- 用户希望导出图标题行更简洁，直接记录时间、channel 数量和时间范围。
- 长 experiment name 和 metadata 同行时需要避免文字重合。

### 涉及文件

- `src/timelineDiagramExport.ts`
  - 修改 header metadata 文案。
  - 根据 metadata 宽度计算右侧位置。
  - experiment name 会按剩余空间自动截断。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果未来需要更多 metadata，可以考虑放到第二行或图例区域，避免标题行过长。

## 2026-06-17 12:58 HKT

### 功能变更

- 优化 timeline diagram PNG 导出布局。
- 导出图片会根据最后一个 task 的 end time 自动裁剪右侧空白。
- 导出结束时间会在最后 task 后保留少量 padding。
- 时间轴 tick 会基于裁剪后的导出时长重新计算。
- metadata 从标题下方移动到标题同一行右侧。

### 动机

- 之前导出图会保留较长的空白 timeline 区域，图片过宽且信息密度低。
- metadata 放在标题下方时容易被顶部区域裁掉。
- 新布局更紧凑，也更适合放入记录或报告。

### 涉及文件

- `src/timelineDiagramExport.ts`
  - 使用 latest task end time 计算导出时长。
  - 使用 `max(usedDuration * 5%, majorTickStep)` 作为右侧时间 padding。
  - 图片宽度基于裁剪后的 timeline 和最后一个 tick 计算。
  - metadata 改为与 experiment title 同行显示。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。
- 只改变导出的 PNG 图像布局。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果某个 task label 特别长，仍会在 block 内用省略号截断。
- 如果需要完整文字说明，可以后续增加 legend 或导出更高分辨率版本。

## 2026-06-17 12:51 HKT

### 功能变更

- 顶部 toolbar 删除大号 `Generate Python` 按钮。
- 删除单独的 `Download Python` 和 `Export timeline diagram` toolbar icon 按钮。
- 新增紧凑的 `Export` dropdown menu。
- Export menu 包含：
  - `Export Python`
  - `Export timeline diagram`
  - `Export signal diagram`
- `Export signal diagram` 当前为 disabled 占位项，后续实现 signal diagram 后再接入。

### 动机

- Python code preview 已经会随 sequence 自动更新，不再需要一个容易误解为“手动生成代码”的大按钮。
- 将导出相关操作收拢到一个菜单中，可以节省顶部 toolbar 空间，也让 Python / timeline / signal diagram 导出语义更清晰。

### 涉及文件

- `src/App.tsx`
  - 新增 export menu state。
  - 新增 `exportPythonFromMenu()` 和 `exportTimelineDiagramFromMenu()`。
  - toolbar 中用 `Export` dropdown 替换原 `Generate Python` / download buttons。
  - 保留 code preview toggle 按钮。
- `src/App.css`
  - 新增 `.export-menu`、`.export-trigger`、`.export-menu-panel` 样式。
  - 调整 toolbar grid 列宽以适配单个 Export menu。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 导出功能从多个 toolbar 按钮改为一个 `Export` 菜单。
- `Export Python` 复用原 Python 下载逻辑。
- `Export timeline diagram` 复用原 timeline PNG 导出逻辑。
- `Export signal diagram` 暂不可用，作为未来功能占位。

### ARTIQ code generator 有没有变化

- 没有。
- Python code 仍然自动根据当前 sequence state 更新。
- 本次只改变 toolbar/export 组织方式。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器快速验证：
  - 页面中存在 1 个 `Export` trigger。
  - `Generate Python` 文案不再显示。
  - Export menu 中显示 3 个菜单项。
  - `Export signal diagram` 为 disabled。

### 之后还要注意什么

- 后续实现 signal diagram export 后，将 disabled menu item 接到实际导出函数即可。
- 如果菜单项继续增加，可以考虑给 export menu 分组或添加说明文字。

## 2026-06-17 12:44 HKT

### 功能变更

- 新增 timeline diagram 图片导出功能。
- toolbar 新增 `Export timeline diagram` 按钮。
- 点击后会根据当前 sequence 生成并下载 PNG 图片。
- 导出的图包含：
  - 顶部时间轴。
  - 左侧 channel name 和 channel type。
  - 当前 visible channels 和所有 used channels。
  - 按 `startMs / durationMs` 定位的 task blocks。
  - task name / type 和关键参数摘要。

### 动机

- 除了导出 ARTIQ Python，实验 sequence 也需要可视化图片，方便记录、汇报和检查任务时序。
- 图片导出应来自当前 sequence 数据模型，而不是手动画一份独立状态。

### 涉及文件

- `src/timelineDiagramExport.ts`
  - 新增 canvas PNG 导出 helper。
  - 自动选择可读时间单位：
    - 短 sequence 使用 `us`。
    - ms 量级使用 `ms`。
    - 长 sequence 使用 `s`。
  - 使用 nice tick step 绘制时间轴。
  - 绘制 channel rows 和 task blocks。
- `src/App.tsx`
  - 新增 `downloadTimelineDiagram()`。
  - toolbar 新增 `Export timeline diagram` 按钮。
- `src/App.css`
  - toolbar 增加一个按钮列宽。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 导出直接读取当前 `SequenceState`、`modules`、`availableChannels` 和 `visibleChannelIds`。

### UI 交互有没有变化

- 有。
- toolbar 中新增一个图像导出按钮。
- 原 Python export / download 行为不变。

### ARTIQ code generator 有没有变化

- 没有。
- 这是独立的 UI / image export 功能。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器快速验证：
  - 页面中存在 1 个 `Export timeline diagram` 按钮。
  - 当前 timeline 中有 task blocks 可供导出。

### 之后还要注意什么

- 当前 PNG 使用 canvas 绘制，长 sequence 会生成较宽图片。
- 如果之后需要论文级矢量图，可以再增加 SVG export。
- 如果 task 参数继续增多，可能需要增加自动换行或 legend。

## 2026-06-17 12:36 HKT

### 功能变更

- 调整 experiment editor 顶部布局。
- Experiment tabs 和 saved experiment picker 合并到同一条顶部行。
- `Open saved experiment` 和 `Not saved / Saved` 状态放在同一行，状态显示在右侧。
- 主编辑区整体上移，减少 tabs 和 timeline controls 之间的垂直空白。

### 动机

- 原布局中 saved experiment 区域位置偏低，导致 tabs 下方到 timeline/editor 区域之间出现较大空白。
- 将 tabs 和 saved experiment picker 组织成同一行后，页面更紧凑，主 timeline 面板更靠上。

### 涉及文件

- `src/App.tsx`
  - 新增 `experiment-top-row` 包裹 tabs 和 saved experiment picker。
  - 调整 saved experiment heading，把 save status 放到同一行右侧。
- `src/App.css`
  - 新增 `.experiment-top-row` 布局。
  - 调整 `.experiment-tabs`、`.experiment-status`、`.saved-experiment-picker` 的间距和对齐。
  - 增加窄屏时 top row 自动换行的规则。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有新增或修改交互。
- 只改变顶部布局和垂直间距。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果 experiment tabs 数量很多，顶行会优先让 tabs 横向滚动；窄屏下 saved experiment picker 会换到下一行。

## 2026-06-17 12:29 HKT

### 功能变更

- 调整 timeline controls 区域布局。
- `Select channels` 按钮移动到该行最左侧。
- `Saved / Not saved` 状态移动到 `Open saved experiment` 上方。

### 动机

- channel selection 是 timeline 操作入口，放在最左侧更符合当前编辑流程。
- 保存状态和 saved experiment picker 语义相关，放在同一区域更清晰。

### 涉及文件

- `src/App.tsx`
  - 调整 `channel-selector` 中控件顺序。
  - 将 `saveStatus` 移入 saved experiment picker。
- `src/App.css`
  - 调整 `.experiment-status` 为右侧对齐布局。
  - 增加 `.save-status-text` 样式。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有新增交互。
- 只是控件位置改变。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果 saved experiment picker 宽度在窄屏仍然拥挤，可以后续把它移动到单独一行。

## 2026-06-17 12:23 HKT

### 功能变更

- 新增 timeline zoom / resolution 控制。
- Timeline unit 旁新增 4 个按钮：
  - Zoom out
  - Zoom in
  - Fit timeline
  - Reset timeline zoom
- `pixelsPerMs` 作为 timeline scale 使用，控制 canonical ms 到 pixel 的映射。
- tick / grid spacing 改为 nice number 自动选择。
- timeline grid 背景间距跟随 zoom scale 更新。

### 动机

- 仅切换 timeline label unit 不能解决短 us-scale task 被挤在一起的问题。
- 需要改变 timeline 的 pixels-per-time 比例，让 10 us 等短任务在视觉上有足够宽度。

### 涉及文件

- `src/App.tsx`
  - 新增 zoom controls。
  - 新增 nice tick step 计算。
  - 新增 Fit / Reset / Zoom in / Zoom out handlers。
  - timeline width、tick、gap region、task block 继续基于 canonical `startMs / durationMs` 和当前 `pixelsPerMs` 渲染。
  - 使用 `ResizeObserver` 读取 timeline viewport width，供 Fit 计算使用。
- `src/App.css`
  - 新增 `.timeline-zoom-controls` 样式。
  - timeline grid background-size 改为 CSS variables。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- 复用已有 `state.pixelsPerMs` 作为 timeline zoom scale。
- 旧实验没有额外迁移需求。

### UI 交互有没有变化

- 有。
- 用户现在可以手动放大 / 缩小 timeline。
- 用户可以点击 Fit 根据当前 sequence 自动选择合适 scale。
- 用户可以点击 Reset 回到默认 scale。
- zoom 只影响视觉显示，不改变 task start / duration / gap。

### ARTIQ code generator 有没有变化

- 没有。
- timeline zoom 不影响导出的 Python code。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器快速验证：
  - Timeline unit 旁显示 4 个 zoom 按钮。
  - 点击 Zoom in 后，示例 DDS block 宽度从 300px 变为 405px。
  - task block 的 canonical timing 没有通过 zoom 操作被修改。

### 之后还要注意什么

- 当前 Fit 在极长 sequence + 极短 task 同时存在时会优先选择折中 scale；用户可以再手动 Zoom in 查看细节。
- 如果之后实现真正 viewport start / end，需要继续确保 mouse-to-time 计算使用当前 scale。

## 2026-06-17 12:13 HKT

### 功能变更

- 缩短 toolbar 中 loop delay 控件的文案。
- `Delay between repetitions` 改为 `Delay`。
- 缩短 delay 数值输入框和单位选择框，避免网页端挤在一起。

### 动机

- 原文案太长，在 toolbar 中换行并挤压输入框和单位下拉框。
- 简化为 `Delay` 后更适合紧凑工具栏布局。

### 涉及文件

- `src/App.tsx`
  - 修改 delay label 文案。
- `src/App.css`
  - 调整 `.unit-input` 的 grid 宽度。
  - 缩短 delay input 和 unit select。
  - 调整 toolbar 对应列宽。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化。
- 只是 delay 控件更短、更紧凑。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果 toolbar 后续继续增加控件，可能需要把部分操作按钮移动到第二行或更多菜单。

## 2026-06-17 12:08 HKT

### 功能变更

- 修正上一版 time unit 系统的实现方向。
- 删除 / 隐藏实验级全局 `Time unit` 控件。
- 删除 channel-level time unit 控件。
- 保留并明确三类独立单位：
  - 每个 task block 自己的 `timeUnit`。
  - repetition / loop delay 自己的 `interLoopDelayUnit`。
  - timeline ruler 自己的 `timelineTimeUnit`。
- task properties panel 的 Time unit 现在只有：
  - `s`
  - `ms`
  - `us`
- 不再显示 `Use channel`。
- `Delay between repetitions` 改为数值输入 + 独立单位下拉。

### 动机

- 真实需求不是一个实验全局显示单位，而是不同 task 可以用不同时间尺度设计实验。
- 例如 TTL pulse 可以用 `us`，DDS pulse 可以用 `ms`，长等待可以用 `s`，并且它们可以同时存在于同一个 sequence。
- loop delay 也不是 task，因此需要自己的单位设置。

### 涉及文件

- `src/types.ts`
  - 移除 channel-level `timeUnit`。
  - `SequenceModule.timeUnit` 改为 task-level 必有字段。
  - `LoopConfig` 新增 `interLoopDelayUnit`。
  - 移除 `SequenceState.timeUnit` 作为可见全局单位模型。
- `src/timeUnits.ts`
  - `resolveTaskTimeUnit()` 只解析 task 自己的 unit。
  - `resolveTimelineTimeUnit()` 只解析 timeline unit，fallback 为 `ms`。
- `src/experimentStorage.ts`
  - 旧实验没有 task unit 时补 `ms`。
  - 旧实验没有 `interLoopDelayUnit` 时补 `ms`。
  - 旧实验没有 `timelineTimeUnit` 时补 `ms`。
  - 不再保存 / 恢复 channel unit。
- `src/App.tsx`
  - 删除 toolbar 中的全局 Time unit。
  - 删除 channel menu 中的 channel unit selector。
  - task properties panel 保留 task-level Time unit，选项为 `s / ms / us`。
  - loop delay UI 改为 `Delay between repetitions` + unit dropdown。
  - 新 task 默认 `timeUnit = "ms"`。
- `src/App.css`
  - 调整 loop delay 数值输入 + 单位下拉的布局。
- `src/pythonGenerator.ts`
  - loop delay 为 0 时不再生成 delay。
  - fixed repetition 和 sweep repetition 中，非零 loop delay 只生成在 repetitions 之间，不生成在最后一次之后。
- `Development_log.md`
  - 新增本次中文修正记录。

### 数据结构有没有变化

- 有。
- 当前语义为：
  - `module.timeUnit`：每个 task 自己的显示 / 输入单位。
  - `state.loop.interLoopDelayMs`：loop delay 的 canonical ms 值。
  - `state.loop.interLoopDelayUnit`：loop delay 的显示 / 输入单位。
  - `state.timelineTimeUnit`：timeline ruler / gap tooltip 的显示单位。
- 内部 timing 值仍然是 canonical ms：
  - `startMs`
  - `durationMs`
  - `gapAfterPrevious`
  - duration sweep start / end / step

### UI 交互有没有变化

- 有。
- 用户不再设置实验全局单位。
- 用户可以在每个 task properties panel 中设置该 task 的单位。
- 用户可以单独设置 Delay between repetitions 的单位。
- 用户可以单独设置 Timeline unit。
- 切换这些单位只改变显示 / 输入解释，不改变 block 位置、宽度、吸附、overlap、gap、lock 或 generator timing。

### ARTIQ code generator 有没有变化

- 有少量 loop delay 生成逻辑调整。
- generator 仍然统一使用 canonical ms，不保留 UI 选择的单位。
- `loopDelay = 0` 时不生成 delay。
- `loopDelay > 0` 时，只在 repetitions 之间生成 delay，不在最终 repetition 之后生成。
- task unit / timeline unit 不影响导出的 Python timing。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器快速验证：
  - toolbar 中不再显示全局 `Time unit`。
  - toolbar 中显示 `Delay between repetitions`，并带独立单位下拉。
  - channel selector 中仍有 `Timeline unit`。
  - task properties panel 中有 task-level `Time unit`。
  - task properties panel 中不再显示 `Use channel`。

### 之后还要注意什么

- 旧 localStorage 中如果保留了上一版的 `state.timeUnit` 或 `channel.timeUnit`，现在会被忽略。
- 如果后续希望 TTL 新 task 默认 `us`、DDS 默认 `ms`，可以只改 `createModule()` 的默认 `timeUnit`，不影响 canonical timing。

## 2026-06-17 11:58 HKT

### 功能变更

- 调整 timeline 左侧 channel name 列的层级。
- 横向滚动 timeline 时，task block / grid 不再覆盖 channel name。
- 左上角 time axis spacer 也改为 sticky left，保持和 channel name 列一致。

### 动机

- channel name 是 lane 的定位信息，需要始终保持在最上层。
- 当 timeline 横向滚动或 task block 靠近左侧时，block 不应该盖住 channel name。

### 涉及文件

- `src/App.css`
  - 提高 `.lane-label` 的 `z-index`。
  - 给 `.lane-label` 保持不透明背景并增加右侧分隔阴影。
  - 给 `.axis-spacer` 增加 sticky left 和更高层级。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有新的交互。
- 只是 timeline 横向滚动时，左侧 channel name 列会覆盖滚动内容。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果之后把 timeline 拆成真正的固定左列和可滚动右列，需要重新检查 sticky / z-index 层级。

## 2026-06-17 11:53 HKT

### 功能变更

- 微调 timeline task block 内部文字排版。
- 修复 channel lane 中 task block 底部参数文字显示不完整的问题。

### 动机

- task block 高度较小，三行文字在居中布局和原 padding 下容易贴近底部，被 `overflow: hidden` 裁掉一部分。
- 调整为靠上排列并收紧行距后，参数行可以完整显示。

### 涉及文件

- `src/App.css`
  - `.module-block` 从居中排列改为靠上排列。
  - 减小垂直 gap。
  - 微调 padding。
  - 为 block 内 `strong / span / small` 设置更稳定的 line-height。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有交互变化。
- 只有 task block 内文字显示更完整。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果之后 block 内显示更多参数，可能需要根据 block 宽度 / 高度做动态隐藏次要信息。

## 2026-06-17 11:47 HKT

### 功能变更

- 新增 Sequence Builder UI 的时间单位选择系统。
- 内部 canonical timing 仍然使用 ms，不改变 timeline / task / sweep / generator 的真实时间模型。
- 新增三层显示单位：
  - 全局默认 time unit。
  - timeline display unit。
  - channel-level property unit。
  - task-level property unit。
- 支持单位：
  - `s`
  - `ms`
  - `us`
- task properties 中的 start / end / duration / gap 会按 resolved task unit 显示和输入。
- DDS duration sweep 和 TTL output duration sweep 的 start / end / step 会按 resolved task unit 显示和输入。
- timeline ruler、task block duration 文本和 gap hover tooltip 会按 timeline display unit 显示。

### 动机

- 实验编辑时，不同尺度的操作更适合不同单位：
  - DDS / MOT loading 常用 ms。
  - TTL pulse / gate 有时更适合 us。
- 需要让 UI 输入更方便，但不能因为切换显示单位改变真实实验 timing。

### 涉及文件

- `src/types.ts`
  - 新增 `TimeUnit` 类型。
  - `SequenceState` 新增 `timelineTimeUnit`。
  - `ChannelConfig` 新增可选 `timeUnit`。
  - `SequenceModule` 新增可选 `timeUnit`。
- `src/timeUnits.ts`
  - 新增统一时间单位转换 helper。
  - 包含 normalize、canonical 转换、resolved unit 和 display formatting。
- `src/App.tsx`
  - 新增全局 time unit dropdown。
  - 新增 timeline unit dropdown。
  - channel selection menu 中新增 channel unit dropdown。
  - module properties panel 中新增 task unit dropdown。
  - properties timing inputs 改为显示单位输入，提交时转换回 ms。
  - DDS / TTL duration sweep 输入显示单位，保存仍为 ms。
  - timeline ruler / gap tooltip / block duration 文本使用 timeline unit。
- `src/experimentStorage.ts`
  - 旧实验加载时默认按 ms。
  - 保存 / 加载 global、timeline、channel、task unit metadata。
- `src/App.css`
  - 新增单位 dropdown 的布局样式。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有，增加可选 UI metadata：
  - `state.timeUnit`
  - `state.timelineTimeUnit`
  - `channel.timeUnit`
  - `module.timeUnit`
- 这些字段只影响 UI 显示 / 输入单位。
- `startMs`、`durationMs`、`gapAfterPrevious`、duration sweep 的 start / end / step 仍然存 canonical ms。
- 旧实验没有这些字段时，默认按 `ms` 加载。

### UI 交互有没有变化

- 有。
- toolbar 中新增全局 `Time unit`。
- timeline / channel selector 附近新增 `Timeline unit`。
- channel menu 每个 channel 可选择：
  - Use global
  - s
  - ms
  - us
- task properties panel 可选择：
  - Use channel
  - s
  - ms
  - us
- 切换单位只改变显示数字和输入单位，不移动 block，不改变宽度，不改变吸附 / overlap / gap / lock 逻辑。

### ARTIQ code generator 有没有变化

- 没有。
- generator 继续读取 canonical ms 值并生成 `delay(... * ms)`。
- timeline unit / channel unit / task unit 不影响导出的 Python timing。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做浏览器快速验证：
  - 页面显示全局 `Time unit` 和 `Timeline unit`。
  - 选择一个 DDS task 后，properties panel 显示 task-level `Time unit`。
  - 将 task unit 从 ms 切到 us 后：
    - `Duration 5 ms` 显示为 `Duration 5000 us`。
    - task block 的 left / width 样式没有变化。

### 之后还要注意什么

- 目前 package card 上的 duration 摘要仍以 ms 显示，因为 saved package 不是 timeline task property 编辑面板。
- 如果后续要让 package library 也按全局单位显示，可以单独加 display-only 转换。
- `mus` 会在 helper 中 normalize 为 `us`，UI 暂只显示 `us`。

## 2026-06-17 11:31 HKT

### 功能变更

- sweep measurement 现在同时记录：
  - 每个 scan point 的 averaged measurement datasets。
  - 每个 scan point 内每次 repetition 的 raw measurement datasets。
- averaged datasets 保持原来的默认 plot 用途：
  - `measurement.<counter_channel>.counts`
  - `measurement.<counter_channel>.count_rate`
- raw repetition datasets 新增为 flat layout：
  - `measurement.<counter_channel>.raw_counts_flat`
  - `measurement.<counter_channel>.raw_count_rate_flat`
- flat raw dataset 的索引语义为：
  - `raw_index = scan_index * repetition_num_per_point + repetition_index`

### 动机

- 之前 sweep 模式只保存每个 scan point 的 repetition 平均值，会丢失每次 repetition 的原始计数。
- raw repetition 数据对后续分析、检查 outlier、估计噪声和复现实验结果很重要。
- 默认 plot 仍然使用 averaged datasets，避免 applet 直接画二维 raw 数据。

### 涉及文件

- `src/pythonGenerator.ts`
  - sweep dataset 初始化新增 raw flat datasets。
  - sweep measurement metadata 新增：
    - `metadata.repetition_num_per_point`
    - `metadata.raw_counts_shape`
    - `metadata.raw_counts_layout`
    - `metadata.average_method`
  - deferred sweep readout 中，每次 `fetch_count()` 后写入 raw flat dataset。
  - 每个 scan point 结束后，继续计算 mean over repetitions 并写入 averaged datasets。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有修改 sequence task / plot package 保存结构。
- 只改变 generated ARTIQ Python 中的 dataset 输出结构。

### UI 交互有没有变化

- 没有。
- Plot panel 的默认 y dataset 仍然只显示 averaged counts / count_rate。
- raw datasets 暂不作为默认 plot 选项暴露。

### ARTIQ code generator 有没有变化

- 有。
- sweep 模式下 measurement dataset 初始化从空数组 append 平均值，改为：
  - averaged datasets 使用固定长度 `[0] * self.scan_points` / `[0.0] * self.scan_points`。
  - raw flat datasets 使用长度 `self.scan_points * self.repetition_num_per_point`。
- deferred readout 顺序保持：
  - Phase A：先 schedule 所有 scan / repetition timing events 和 counter gates。
  - Phase B/C：再按相同 scan / repetition / channel 顺序 `fetch_count()`，写 raw，累加，最后写 averaged。
- fast timing phase 仍然不包含 `fetch_count()`、`append_to_dataset()`、`mutate_dataset()` 或 `print()`。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做临时 generator 输出验证：
  - DDS frequency sweep，scan points = 3。
  - repetition_num_per_point = 3。
  - 一个 `ttl8_counter` measurement gate。
  - 生成代码包含 averaged datasets、raw flat datasets、shape/layout metadata。
  - readout 阶段包含 `raw_index = scan_index * self.repetition_num_per_point + repetition_index`。
  - 每次 fetch 后写入 `raw_counts_flat` 和 `raw_count_rate_flat`。
  - 每个 scan point 后写入 averaged `counts` 和 `count_rate`。
  - fast timing phase 检查没有 readout 或 dataset 写入。

### 之后还要注意什么

- 当前使用 flat raw datasets，而不是 nested list mutation；metadata 中记录了二维语义。
- 如果确认当前 ARTIQ 版本可靠支持 nested dataset mutation，可以后续增加 `raw_counts` / `raw_count_rate` nested 输出选项。

## 2026-06-17 11:19 HKT

### 功能变更

- 修正 no-sweep measurement dataset 语义。
- 无 sweep fixed repetition 实验不再生成 fake sweep metadata。
- 无 sweep measurement 现在使用 `shot_index` 表示重复实验的存储顺序。
- sweep 实验仍然使用 `scan_x` 和 `scan_parameter / scan_unit / scan_channel / scan_start / scan_end / scan_step / scan_points`。
- Plot dataset x 轴选项现在会根据是否存在真实 sweep 自动切换：
  - 有 sweep：`scan_x`
  - 无 sweep：`shot_index`

### 动机

- no-sweep 实验只是同一 sequence 重复执行，shot/repetition 顺序只是测量结果数组的索引，不是被扫描的实验参数。
- 之前把 no-sweep 写成 `scan_parameter = "shot_index"` 会误导实验记录，让它看起来像做了一个 shot_index sweep。
- 这次明确区分：
  - sweep metadata 只属于真实参数扫描。
  - measurement metadata 仍然保留，因为它描述的是测量通道和计数方式。

### 涉及文件

- `src/pythonGenerator.ts`
  - no-sweep dataset setup 移除 `scan_parameter`、`scan_unit`、`scan_channel`、`scan_start`、`scan_end`、`scan_step`、`scan_points`。
  - no-sweep x 轴 dataset 改为 `shot_index`。
  - no-sweep infinite mode append 的 x 轴也改为 `shot_index`。
  - sweep 分支显式使用 `scan_x`。
- `src/plotDatasets.ts`
  - `getAvailablePlotDatasets()` 增加 `hasSweep` 参数。
  - 根据 `hasSweep` 返回 `scan_x` 或 `shot_index`。
- `src/App.tsx`
  - Plot panel 根据当前 sequence 是否有启用 sweep，传入正确的 `hasSweep`。
- `Development_log.md`
  - 新增本次中文修正记录。

### 数据结构有没有变化

- 没有修改 task / sequence 保存结构。
- generator 输出的 no-sweep x dataset 从 `scan_x` 改为 `shot_index`。

### UI 交互有没有变化

- Plot panel 的 x dataset 选项会随实验模式变化：
  - 启用 sweep 时显示 `scan_x`。
  - 没有 sweep 时显示 `shot_index`。

### ARTIQ code generator 有没有变化

- 有。
- no-sweep fixed repetition 不再生成任何 sweep-style `scan_*` metadata。
- no-sweep 仍然生成：
  - `shot_index`
  - `measurement.<counter_channel>.counts`
  - `measurement.<counter_channel>.count_rate`
  - measurement metadata，包括 `metadata.x_axis = "shot_index"` 和 `metadata.sweep_enabled = False`。
- `fetch_count()` 后的 `mutate_dataset()` 写入逻辑保持不变。
- deferred readout 两阶段结构保持不变。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做临时 generator 输出验证：
  - no-sweep fixed loop count = 3。
  - 一个 `ttl8_counter` measurement gate，duration = 10 ms。
  - 生成代码中包含 `shot_index` 和 measurement datasets。
  - 生成代码中不包含 `scan_x`、`scan_parameter`、`scan_unit`、`scan_channel`、`scan_start`、`scan_end`、`scan_step`、`scan_points`。
  - plot helper 验证：
    - no-sweep x = `shot_index`
    - sweep x = `scan_x`

### 之后还要注意什么

- 旧 plot 如果保存了 no-sweep 的 `scan_x`，重新打开后会变成 invalid，需要用户重新选择 `shot_index`。
- 如果之后支持 index-less plot，可以考虑在 no-sweep 模式允许不显式指定 x dataset。

## 2026-06-17 11:08 HKT

### 功能变更

- 修复无 sweep 实验中 TTL counter / EdgeCounter 测量结果没有写入 dataset 的问题。
- 无 sweep 且有测量任务时，现在会在 host-side `setup_datasets()` 中初始化：
  - `scan_x = [0, 1, ..., loop_count - 1]`
  - `measurement.<counter_channel>.counts`
  - `measurement.<counter_channel>.count_rate`
  - 每个测量通道的 metadata datasets。
- 无 sweep 的 kernel readout 阶段现在会在 `fetch_count()` 后使用 `mutate_dataset()` 写入对应 shot index。
- plot dataset 选项改为使用统一的 `scan_x` 作为 x 轴，并使用 `measurement.<counter_channel>.counts/count_rate` 作为 y 轴。

### 动机

- 之前无 sweep 时虽然会 schedule `gate_rising()` 并延后 `fetch_count()`，但读出的计数只存在局部变量里，没有进入 ARTIQ dataset。
- 这样 dashboard、applet 和 archived result file 都看不到测量结果。
- 新逻辑保证即使没有任何扫描参数，重复实验的每一次 shot 也会有可记录、可画图、可归档的 measurement dataset。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增无 sweep fixed repetition 的测量 dataset 初始化。
  - 新增无 sweep fixed repetition 的 `mutate_dataset()` 写入逻辑。
  - 新增 infinite mode 的 streaming measurement dataset 初始化和 append fallback。
  - 保留 deferred readout：`fetch_count()` 和 dataset 写入仍然在 fast timing phase 之后。
  - sweep 路径的 measurement dataset 命名同步改为 channel-based。
- `src/plotDatasets.ts`
  - 新增 `measurementDatasetBase()` helper。
  - plot y dataset 选项改为 `measurement.<counter_channel>.counts/count_rate`。
  - plot x dataset 默认改为 `scan_x`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有修改 sequence task 的保存结构。
- generator 输出的 dataset 命名有变化：
  - 现在 measurement dataset 以 counter channel 为基础，例如 `measurement.ttl8_counter.counts`。

### UI 交互有没有变化

- Plot 面板中的可选 dataset 名称会更新：
  - x 轴使用 `scan_x`。
  - y 轴使用 `measurement.<counter_channel>.counts/count_rate`。
- 其它 timeline / task 编辑交互没有变化。

### ARTIQ code generator 有没有变化

- 有。
- 无 sweep fixed repetition：
  - host-side 初始化固定长度 dataset。
  - kernel 中每个 shot deferred `fetch_count()` 后写入 `mutate_dataset()`。
  - `count_rate` 使用测量 gate duration 的秒数常量计算。
- 无 sweep infinite mode：
  - 初始化空数组 dataset。
  - 每轮 readout 后 append 当前 shot index 和测量值。
- metadata 会记录：
  - channel
  - gate duration ms
  - x_axis = `shot_index`
  - sweep_enabled = `False`
  - count_type
  - label
- fast timing phase 仍然不包含 `fetch_count()`、`append_to_dataset()`、`mutate_dataset()` 或 `print()`。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做临时 generator 输出验证：
  - fixed loop count = 3。
  - 一个 `ttl8_counter` measurement gate，duration = 10 ms。
  - 生成代码包含 `scan_x`、`measurement.ttl8_counter.counts`、`measurement.ttl8_counter.count_rate` 和 metadata 初始化。
  - `photon_counts = self.ttl8_counter.fetch_count()` 后会写入 `mutate_dataset("measurement.ttl8_counter.counts", shot, photon_counts)`。
  - fast timing phase 检查没有 readout 或 dataset 写入。

### 之后还要注意什么

- 旧 plot 如果保存的是旧格式 dataset 名称，例如 `measurement.photon_counts.counts`，重新打开后可能会显示为 invalid，需要用户按新的 channel-based dataset 重新选择一次。
- 如果之后想按用户自定义 measurement label 生成 dataset path，需要同时处理重名和旧实验兼容。

## 2026-06-16 19:07 HKT

### 功能变更

- 修改 ARTIQ Python generator 的 measurement readout 结构。
- `fetch_count()` 不再生成在 fast timing sequence / timing loop 中。
- 普通 fixed repetition 生成结构改为：
  - Phase A：先 schedule 所有 shots 的 TTL/DDS/gate timing events。
  - Phase B/C：timing 全部排完后，再按 shot 顺序 `fetch_count()` 并 append datasets。
- Sweep 生成结构改为：
  - Phase A：先 schedule 所有 scan point / repetition 的 timing events。
  - Phase B/C：timing 全部排完后，再按 scan point / repetition 顺序 `fetch_count()`，累加 average，并 append datasets。
- `run_kernel()` 开头新增 `delay(self.start_slack_ms * ms)`，其中 `self.start_slack_ms = 1.0`。
- deferred measurement results 数量超过 100 时，生成 host-side warning：
  - 提醒 readout 被推迟到 fast timing sequence 之后，RTIO input FIFO 可能 overflow。

### 动机

- 在 1 us 量级的 shot gap / task gap 下，如果在 timed RTIO sequence 中间执行 `fetch_count()` 或 dataset append，CPU readout 时间可能导致后续 RTIO event underflow。
- 新结构先提交完整 timing，再 readout，可以避免 readout 插入 fast timing path。

### 涉及文件

- `src/pythonGenerator.ts`
  - 移除 timing body 中的 measurement readout。
  - 新增 deferred fixed readout helper。
  - 新增 deferred sweep readout helper。
  - 普通和 sweep `run_kernel()` 都加入 start slack。
  - 加入 deferred readout 数量 warning。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- fast timing phase 中只生成 timing/gate 相关 RTIO 命令。
- `fetch_count()`、`append_to_dataset()` 和 warning `print()` 不在 fast timing phase 中。
- EdgeCounter gate 仍在 timing phase 中 schedule。
- EdgeCounter `fetch_count()` 延后到所有 timing schedule 完成后。
- 暂未实现 DMA。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做临时 generator 输出验证：
  - 101 shots，每 shot 一个 `ttl8_counter.gate_rising(...)`。
  - 生成代码中 Phase A 只包含 gate timing。
  - Phase B/C 中才出现 `ttl8_counter.fetch_count()` 和 `append_to_dataset(...)`。
  - 自动 warning 出现：
    - `Warning: deferring 101 measurement readouts...`
  - 检查结果：
    - `FAST_TIMING_HAS_READOUT_OR_DATASET=false`

### 之后还要注意什么

- 如果 measurement windows 数量很大，deferred readout 会增加 EdgeCounter/FIFO 缓冲压力；后续可能需要 DMA 或分段 readout 策略。
- 无限循环模式没有“所有 shots”终点，目前仍按每轮 timing 后 readout 的结构生成，但 readout 不在 timing body 内。

## 2026-06-16 17:09 HKT

### 功能变更

- 删除 Code drawer 中的 `Recommended applet commands` UI 区块。
- 删除 Code drawer 中 applet command 的复制按钮和空状态提示。
- Python code preview 和 Signal manifest 改为上下可拖拽调整比例的两个窗格。
- Signal manifest 窗格最小高度约为一行标题，只保留 `Signal manifest` 标题可见。
- 新增中间 resize handle，用于上下拖拽调整 Python preview 和 manifest 的高度比例。

### 动机

- applet 现在已经由导出的 Python 自动启动，Code 页面不再需要显示手动复制 command 的两块 UI。
- Python code 和 Signal manifest 都可能很长，需要用户按需要调整上下可视区域。

### 涉及文件

- `src/App.tsx`
  - 移除 `generateAppletCommands` import。
  - 移除 `appletCommands` state 派生值和 `copyAppletCommands()`。
  - Code drawer JSX 删除 recommended applet commands 区块。
  - 新增 `codePaneRatio` 状态和 resize pointer handler。
  - Python preview / Signal manifest 改为 `code-preview-stack` 上下布局。
- `src/App.css`
  - Code drawer 改为 header + resizable content stack。
  - 新增 `.code-preview-stack` 和 `.drawer-resize-handle`。
  - 移除 applet panel 相关样式。
  - Signal manifest 改为内部滚动窗格，支持压缩到标题行高度。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- Code drawer 只显示 Python preview 和 Signal manifest。
- 用户可以拖拽中间横条调整两者高度比例。
- Signal manifest 可以被压缩到只显示标题行。

### ARTIQ code generator 有没有变化

- 没有。
- plot applet 自动启动逻辑保持不变。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 备注：
  - 当前环境没有可用的 in-app browser 控制工具，本次以 TypeScript 和 production build 验证为准。

### 之后还要注意什么

- 如果之后重新加入手动 applet command 展示，应放在独立 debug UI 中，不要重新占用 Code drawer 的主预览区域。

## 2026-06-16 16:53 HKT

### 功能变更

- 修复 duration sweep 生成代码中的动态 gap preservation。
- sweep generator 不再用静态 `startMs` / 静态 `moduleEnd` 来安排 duration sweep 后面的同 channel task。
- sweep 路径现在按 channel lane 生成 schedule：
  - 不同 channel lane 用 `with parallel`。
  - 同一 channel lane 内按时间排序，用 `gapAfterPrevious` 串联 task。
  - duration sweep 的 task 使用当前 scan point 的动态 duration。
  - 下游 task 在动态 end 之后再 delay 固定 gap。
- DDS duration sweep 和 TTL output duration sweep 共享同一套动态 schedule 逻辑。
- generator 中移除了 duration sweep 的静态 overlap 拦截，避免因为静态 preview overlap 错误阻止合法的动态 downstream shift。
- lock position 仍只作为 UI 防误触功能，不参与生成代码中的动态 schedule。

### 动机

- duration sweep 会改变 task 每个 scan point 的结束时间。
- 下游 task 应该跟随动态 end，并保持配置好的 gap。
- 旧 generator 只改变 swept task 自己的 delay 长度，但后续 task 仍按静态 timeline cluster 生成，不能保证 gap 恒定。

### 涉及文件

- `src/pythonGenerator.ts`
  - 重写 sweep 路径的 `renderSequenceBodyForSweep(...)`。
  - 同 channel 内改为按 `gapAfterPrevious` 串联。
  - 删除静态 duration sweep overlap validation。
  - multi-sweep 变量名增加 module id，避免同名 task 的 sweep 变量冲突。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。
- timeline preview、drag、snap、gap tooltip、lock UI 都没有修改。

### ARTIQ code generator 有没有变化

- 有。
- 只修改 sweep 生成路径的 schedule 逻辑。
- 固定 duration 的普通生成路径保持不变。
- DDS/TTL duration sweep 下游 task 会跟随动态 end。
- TTL counter gate/fetch、plot、package、dataset append 逻辑保持原有结构。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 已做临时生成器输出验证：
  - TTL output duration sweep：`start=1 ms`，duration values `[1,2,3] ms`，下游 locked TTL task gap `0.5 ms`。
    - 生成结构包含 `delay(1.0 * ms)`、`delay(scan_value_ttl_duration * ms)`、再 `delay(0.5 * ms)`，说明下游 task 跟随动态 end。
  - DDS duration sweep：生成结构包含 `delay(scan_value_duration * ms)` 后继续输出固定 downstream gaps，说明多 downstream task 通过 gap 串联传播。
  - previous gap：lane 首个/前置 delay 保留在 swept task 之前，duration sweep 不会反向移动 swept task start。
  - locked downstream：验证样例中 downstream task 为 locked，生成代码仍按动态 gap 串联，不使用 lock 固定绝对时间。

### 之后还要注意什么

- 当前 sweep schedule 以 channel lane 为单位并行生成；如果未来支持更复杂的跨 channel 依赖，需要显式的数据模型表达跨 channel dependency。
- 如果之后新增其它 task 类型的 duration sweep，应接入同一个 lane/gap schedule，不要回到静态 cluster 逻辑。

## 2026-06-16 16:41 HKT

### 功能变更

- 修复 TTL output duration sweep 的 Start / End / Points / Step 自动计算交互。
- TTL output duration sweep 现在完全复用和 DDS sweep 相同的 `computedSweep(...)` helper。
- 修改规则：
  - 编辑 `End` 时，自动根据 `Start / End / Points` 重新计算 `Step`。
  - 编辑 `Step` 时，自动根据 `Start / Step / Points` 重新计算 `End`。
  - 编辑 `Points` 时，根据最近编辑的是 `End` 还是 `Step` 来更新另一个依赖字段。
  - `points = 1` 时仍按现有 DDS 规则处理：`step = 0`，`end = start`。
- 放宽浮点比较 tolerance，避免正常小数计算误差触发 inconsistent。
- 旧 saved package 中不完整的 TTL duration sweep config 会用同一套 normalize/default 逻辑补齐。

### 动机

- 之前 TTL output duration sweep 在用户输入合法 `End` 后，可能立即显示：
  - `Start, step, points, and end are inconsistent.`
- 这不是用户应该手动维护四个字段一致的 UI。
- sweep editor 应该像 DDS 一样自动推导依赖字段。

### 涉及文件

- `src/App.tsx`
  - 更新 `computedSweep(...)` 中 End / Step / Points 的推导逻辑。
  - TTL output duration sweep 和 DDS sweep 继续共享同一个 helper。
  - 浮点比较 tolerance 从 `1e-9` 放宽到 `1e-6`。
- `src/packageStorage.ts`
  - 为 TTL output package 的 `ttlDurationSweep` 增加 normalize/default 逻辑。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- 继续使用已有的 `ttlDurationSweep?: SweepConfig`。

### UI 交互有没有变化

- 有。
- TTL output duration sweep 中：
  - 输入 `End` 会自动更新 `Step`。
  - 输入 `Step` 会自动更新 `End`。
  - 正常输入合法 End/Step 不再出现 inconsistent 错误。

### ARTIQ code generator 有没有变化

- 没有改变核心生成逻辑。
- generator 仍然读取最终 sweep config 生成 TTL duration scan value。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动确认：
  - TTL output duration sweep：`Start = 1`、`Points = 4`、输入 `End = 1.2` 后，`Step` 自动变为约 `0.066667`。
  - TTL output duration sweep：`Start = 1`、`Points = 4`、输入 `Step = 0.1` 后，`End` 自动变为 `1.3`。
  - TTL duration sweep 和 DDS frequency sweep points 一致时可生成代码。
  - points 不一致时才显示 mismatch 错误。

### 之后还要注意什么

- 如果之后继续改 sweep UI，应尽量保持 DDS 和 TTL duration 共用同一个推导 helper，避免交互分叉。

## 2026-06-16 16:32 HKT

### 功能变更

- 生成的 ARTIQ Python 现在可以自动启动 enabled plot 对应的 ARTIQ applet。
- 保留原有 UI 中的 recommended applet command 显示和复制功能。
- 新增共享 command spec helper，让 UI 显示 command 和 Python auto-launch 使用同一套 plot 过滤/去重逻辑。
- 生成 Python 中如果存在 enabled 且 valid 的 plot，会：
  - `import subprocess`
  - 生成 host-side `launch_applets(self)` 方法
  - 在 host-side `run(self)` 中先初始化 dataset，再调用 `self.launch_applets()`，最后进入 `self.run_kernel()`
- `subprocess.Popen(...)` 只出现在 host-side helper 中，不会进入 `@kernel`。
- applet 启动失败时会打印 warning，但不会中断实验运行。

### 动机

- 之前 plot 创建后只能显示手动复制的 applet command。
- 用户提交/运行实验时还需要手动打开 plot applet，流程不够自动。
- 现在 plot config 可以直接进入导出的 Python 实验文件，实验运行时自动打开 applet 窗口并实时接收 broadcast dataset 更新。

### 涉及文件

- `src/plotDatasets.ts`
  - 新增 `AppletCommandSpec`。
  - 新增 `getAppletCommandSpecs(...)`。
  - `generateAppletCommands(...)` 改为复用 command spec helper。
- `src/pythonGenerator.ts`
  - 新增 applet launch code generator。
  - 普通实验和 sweep 实验都会根据 enabled valid plots 生成 `launch_applets()`。
  - 仅在需要启动 applet 时导入 `subprocess`。
  - host-side `run()` 中调用 `launch_applets()`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 继续使用现有 `PlotPackage`。

### UI 交互有没有变化

- 没有。
- Create Plot / Edit / Enable / Disable / Delete 逻辑保持不变。
- Recommended applet commands 仍然保留，用于调试或手动启动。

### ARTIQ code generator 有没有变化

- 有。
- enabled valid plots 会生成 host-side applet auto-launch 代码。
- `subprocess.Popen(command, shell=False)` 不阻塞实验。
- applet launch 失败会打印 warning 并继续运行实验。
- `@kernel run_kernel()` 中不包含 subprocess 或 applet launch 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 当前 applet args 沿用已有 command 格式：`artiq_applet plot_xy <Y_DATASET> --x <X_DATASET>`。
- 如果之后需要 applet title，需要先确认当前 ARTIQ `plot_xy` applet 支持的 title 参数，再统一更新 command spec helper。

## 2026-06-16 16:27 HKT

### 功能变更

- 给 TTL output task 新增 duration sweep。
- TTL output duration 使用和 DDS duration sweep 相同的 `SweepConfig`：
  - `start`
  - `end`
  - `step`
  - `points`
  - `enabled`
  - `invalid`
  - `error`
  - `lastEditedFields`
- TTL output properties panel 中，`Duration ms` 现在有 `Sweep: ON/OFF`。
- TTL duration sweep 使用和 DDS sweep 相同的 Start / End / Points / Step 自动推导 UI。
- TTL duration sweep 参与统一 points validation。
- TTL duration sweep 可以和 DDS frequency/amplitude/phase/duration 同时扫描，前提是所有 enabled sweeps 的 points 一致。
- Python generator 中 TTL output duration sweep 会生成动态 duration 变量，并用于：
  - `self.ttlX.on()`
  - `delay(<ttl_duration_scan_value> * ms)`
  - `self.ttlX.off()`

### 动机

- TTL output pulse duration 也经常需要作为扫描变量。
- 之前只有 DDS duration 可以 sweep，TTL output duration 只能固定。
- 现在 TTL duration sweep 和 DDS sweep 走同一套 scan index / points 检查 / generator 路径，后续扩展更一致。

### 涉及文件

- `src/types.ts`
  - `SequenceModule` 新增 `ttlDurationSweep?: SweepConfig`。
  - `SavedModulePackageParams` 新增 `ttlDurationSweep?: SweepConfig`。
- `src/App.tsx`
  - TTL output draft 默认带 disabled duration sweep。
  - 新增 TTL output duration sweep UI。
  - 抽出通用 sweep fields 渲染逻辑，让 DDS 和 TTL duration 复用 Start / End / Points / Step 输入。
  - duration 编辑时保留 TTL duration sweep 配置。
  - sweep validation 纳入 TTL output duration。
- `src/experimentStorage.ts`
  - 加载旧 TTL output task 时自动补 disabled `ttlDurationSweep`。
- `src/packageStorage.ts`
  - 保存 TTL output package 时写入 `ttlDurationSweep`。
  - 加载旧 TTL output package 时自动补 disabled `ttlDurationSweep`。
- `src/pythonGenerator.ts`
  - enabled sweep 列表纳入 TTL output duration。
  - TTL output duration sweep 参与 points validation。
  - TTL output duration sweep 生成动态 scan value，并用于 TTL pulse delay。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- TTL output task 新增：
  - `ttlDurationSweep?: SweepConfig`
- 旧数据没有该字段时自动按 fixed duration 处理。

### UI 交互有没有变化

- 有。
- TTL output 的 `Duration ms` 不再只是普通输入框。
- 现在显示为独立 parameter row，并带 `Sweep: ON/OFF`。
- Sweep ON 时显示 Start / End / Points / Step。
- Sweep OFF 时保持固定 duration 输入。

### ARTIQ code generator 有没有变化

- 有。
- 固定 TTL output duration 保持原来的生成逻辑。
- TTL duration sweep 时，每个 scan point 生成当前 duration value，并用于 `delay(... * ms)`。
- 没有修改 TTL counter gate/fetch、DDS attenuation、DDS phase mode、timeline drag/snap/gap/lock 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 目前函数名 `findEnabledDdsSweeps` 历史上来自 DDS sweep，但现在返回的是 sequence 中所有 enabled sweeps，包括 TTL output duration。之后如果做整理，可以改名为 `findEnabledSweeps`。
- duration sweep 的动态 gap-preserving timeline expansion 仍未实现，TTL 和 DDS duration sweep 当前都沿用现有 absolute timeline 生成策略。

## 2026-06-16 16:18 HKT

### 功能变更

- 将 phase sweep UI 中的 phase mode 选项显示改为大写：
  - `ABSOLUTE`
  - `TRACKING`
  - `CONTINUOUS`

### 动机

- phase mode 是 ARTIQ/硬件模式选项，大写显示更清晰，也更接近生成代码中的常量命名。

### 涉及文件

- `src/App.tsx`
  - 修改 phase mode `<option>` 的显示文案。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- 内部保存值仍然是 `absolute / tracking / continuous`。

### UI 交互有没有变化

- 有。
- 只改变 phase mode 下拉选项的显示大小写。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果之后要把其它 enum 选项也统一大写显示，应只改 UI 文案，不改变内部保存值。

## 2026-06-16 16:15 HKT

### 功能变更

- DDS task 新增 `phaseMode` 字段。
- `phaseMode` 支持：
  - `absolute`
  - `tracking`
  - `continuous`
- 默认值为 `absolute`。
- 当 DDS phase sweep 打开时，phase sweep panel 会在 `Start / End / Points / Step` 前显示 `Phase mode` 选择框。
- phase sweep 的输入单位仍然是 degree。
- Python generator 中 phase sweep 仍先按 degree 计算，然后转换为 turns：
  - `phase_turns = phaseDeg / 360.0`
- phase sweep 生成的 DDS `set(...)` 会带上 `phase_mode=PHASE_MODE_...`。

### 动机

- ARTIQ DDS phase 设置不仅需要 phase 数值，也需要明确 phase mode。
- UI 中 phase 仍以 degree 输入，避免用户直接处理 turns。
- phaseMode 独立保存，避免之后把 degree 和 turns 或 phase mode 语义混在一起。

### 涉及文件

- `src/types.ts`
  - 新增 `PhaseMode` 类型。
  - `SequenceModule`、`SavedModulePackageParams`、`SignalManifestEntry` 新增 `phaseMode`。
- `src/App.tsx`
  - DDS 默认 task 和 draft task 新增 `phaseMode: "absolute"`。
  - phase sweep UI 中新增 `Phase mode` 下拉框。
  - 从 saved package 创建 draft 时恢复 `phaseMode`。
- `src/experimentStorage.ts`
  - 加载旧 experiment 时，如果没有 `phaseMode`，自动补 `"absolute"`。
- `src/packageStorage.ts`
  - 保存 DDS package 时写入 `phaseMode`。
  - 加载旧 package 时，如果没有 `phaseMode`，自动补 `"absolute"`。
- `src/pythonGenerator.ts`
  - phase sweep 生成代码中加入 degree 到 turns 的转换。
  - phase sweep DDS `set(...)` 增加 `phase_mode=PHASE_MODE_ABSOLUTE/TRACKING/CONTINUOUS`。
  - phase sweep 时自动导入 ARTIQ AD9910 phase mode 常量。
- `src/signalManifest.ts`
  - signal manifest 中记录 `phaseMode`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- DDS task 新增：
  - `phaseMode: "absolute" | "tracking" | "continuous"`
- package 和 manifest 中也记录 `phaseMode`。
- 旧数据缺少该字段时自动补默认值 `"absolute"`。

### UI 交互有没有变化

- 有。
- 只有打开 phase sweep 时，phase sweep panel 中会显示 `Phase mode` 下拉框。
- phase sweep 输入仍使用 degree。
- 其它 sweep 参数 UI 不变。

### ARTIQ code generator 有没有变化

- 有。
- phase sweep 会生成 `phase_mode` 参数。
- phase sweep 仍在 generator 中把 degree 转成 turns。
- 没有修改 attenuation、frequency sweep、amplitude sweep、TTL count/gate/fetch、delay 或 timeline 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 当前 fixed phase 仍沿用既有行为；本次主要接入 phase sweep 的 phase mode。
- 如果之后希望 fixed phase 也进入 `set(..., phase=...)`，需要单独设计，不要和本次 phase sweep 改动混在一起。

## 2026-06-16 16:08 HKT

### 功能变更

- 给 DDS task 新增 `attenuationDb` 参数。
- DDS properties panel 新增独立的 `Attenuation dB` 输入行。
- DDS task block 和 Saved packages 小卡片中会显示 `att ... dB`。
- 保存 package 时会保存 attenuation。
- 加载旧 experiment 或旧 package 时，如果没有 attenuation，会自动补默认值 `10 dB`。
- Python generator 会在 DDS 输出前生成：
  - `self.<dds_channel>.set_att(<attenuationDb> * dB)`

### 动机

- DDS 输出通常需要设置 attenuation。
- 之前 UI 和 generator 只有 frequency、amplitude、phase、duration，缺少 attenuation 会导致生成代码不完整。
- attenuation 是固定硬件/输出参数，本次不加入 sweep。

### 涉及文件

- `src/types.ts`
  - `SequenceModule` 新增 `attenuationDb?: number`。
  - `SavedModulePackageParams` 新增 `attenuationDb?: number`。
  - `SignalManifestEntry` 新增 `attenuationDb?: number`。
- `src/App.tsx`
  - DDS 默认 task 和 draft task 新增 `attenuationDb`。
  - DDS properties panel 新增 `Attenuation dB` 输入行。
  - package draft 创建时恢复 `attenuationDb`。
  - task block 和 saved package card 显示 attenuation。
- `src/experimentStorage.ts`
  - 旧 experiment 缺少 `attenuationDb` 时自动补 `10 dB`。
- `src/packageStorage.ts`
  - 保存 DDS package 时写入 `attenuationDb`。
  - 加载旧 package 时自动补 `10 dB`。
- `src/pythonGenerator.ts`
  - DDS `set(...)` 前新增 `set_att(... * dB)`。
- `src/signalManifest.ts`
  - manifest 中记录 `attenuationDb`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- DDS task 新增：
  - `attenuationDb: number`
- 为了兼容 TypeScript 和旧数据，类型中使用可选字段，加载时补默认值。

### UI 交互有没有变化

- 有。
- DDS properties panel 中新增独立的 `Attenuation dB` 输入框。
- 不提供 attenuation sweep 开关。

### ARTIQ code generator 有没有变化

- 有。
- DDS 输出前会生成 `set_att`。
- 没有改 TTL count、delay、gate、fetch_count、timeline 或 sweep 逻辑。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果之后要支持不同 DDS channel 的默认 attenuation，可以把 `defaultDdsAttenuationDb` 提到 channel/device config 中。
- 本次没有实现 attenuation sweep。

## 2026-06-16 15:51 HKT

### 功能变更

- 修改单参数 sweep 时生成的 Python 变量名。
- 之前单参数 sweep 使用通用变量：
  - `scan_value`
- 现在会带上被扫描的参数名：
  - `scan_value_duration`
  - `scan_value_frequency`
  - `scan_value_amplitude`
  - `scan_value_phase`
- `scan_x` append 也同步使用这个带参数名的变量。

### 动机

- 单参数 sweep 虽然只有一个扫描变量，但 `scan_value` 不够直观。
- 在生成的 Python 文件里直接看到 `scan_value_duration` 这种名字，更容易判断当前扫的是什么。

### 涉及文件

- `src/pythonGenerator.ts`
  - 更新 `sweepVariableName(...)`。
  - 更新 `generateSweepDatasetAppendCode(...)` 中单 sweep 的 `scan_x` 来源。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 只改变生成 Python 的变量命名。
- 单参数 sweep 的物理逻辑、dataset metadata 和 `scan_x` 含义保持不变。
- 多参数 sweep 的变量命名保持原有 task+parameter 形式。

### 测试记录

- 已通过：
  - `npm run build`

### 之后还要注意什么

- 如果之后支持用户自定义 sweep 名称，可以考虑让单 sweep 变量名也跟随用户命名，但需要保持 Python identifier 合法。

## 2026-06-16 15:11 HKT

### 功能变更

- 修复多参数 sweep 的 metadata 记录方式。
- 多参数 sweep 时，以下 dataset 不再写成单个 `"sweep_index"` / `"multiple"`：
  - `scan_parameter`
  - `scan_unit`
  - `scan_channel`
  - `scan_start`
  - `scan_end`
  - `scan_step`
  - `scan_points`
- 多参数 sweep 时，这些 metadata 会写成 list。
- list 中每个位置都与 `scan_parameter` 的同一位置对应。
- 例如：
  - `scan_parameter = ["DDS_signal_1_amplitude", "DDS_signal_1_phase", "DDS_signal_2_duration"]`
  - `scan_unit = ["", "deg", "ms"]`
  - `scan_channel = ["urukul0_ch0", "urukul0_ch0", "urukul1_ch0"]`
  - `scan_start / scan_end / scan_step / scan_points` 也按同样顺序记录。
- 单参数 sweep 继续保留原来的 scalar metadata 形式。

### 动机

- 之前多参数 sweep 用 `"sweep_index"`、空 unit、`"multiple"` 记录 metadata。
- 这样只能说明“有多个参数在扫”，但不能回看每个参数具体扫了什么。
- 改为 list 后，实验记录能完整保存每个 swept parameter 的名称、单位、通道和扫描范围。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 Python list 字符串生成 helper。
  - 新增 `sweepMetadataName(...)`，用于生成可读的 swept parameter 名称。
  - 更新 `generateSweepDatasetInitializationCode(...)` 的多 sweep metadata 输出。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有改变前端 state 数据结构。
- 改变的是生成 Python 里的 dataset metadata 表达方式。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有。
- 多参数 sweep 的 metadata dataset 现在输出 list。
- 多参数 sweep 的 `scan_x` 仍然使用 sweep index。
- 单参数 sweep 的生成行为保持不变。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 如果之后 UI 支持用户自定义 sweep display name，应让 `scan_parameter` 优先使用用户定义名称。
- 如果之后支持 nested/cartesian scan，需要重新设计 metadata 维度，目前 list 语义是 zip-style 同步 sweep。

## 2026-06-16 14:25 HKT

### 功能变更

- 支持 DDS task 中多个参数同时开启 sweep。
- 移除旧限制：
  - 不再显示 `Only one sweep is supported in the first version.`
  - 不再因为开启多个 sweep 就阻止用户继续编辑。
- 新增 multi-sweep points 一致性规则：
  - 同一个 DDS task 中多个 enabled sweep 必须有相同 `points`。
  - 整个 sequence 中所有 enabled sweep 也必须有相同 `points`，这样 Python generator 可以使用一个共享 `scan_index`。
- Python generator 现在按 zip 语义生成 sweep：
  - 不生成嵌套循环。
  - 不生成笛卡尔积扫描。
  - 第 `i` 个 duration、frequency、amplitude、phase 参数同步配对。
- 多 sweep 时，`scan_x` 默认写入 sweep index：
  - `0, 1, 2, ...`
- 单 sweep 时继续使用原来的 swept value 作为 `scan_x`。

### 动机

- 实验中经常需要多个物理参数同步变化，例如 duration 和 frequency 一起按同一个 scan index 前进。
- 这种需求不是二维/多维扫描，而是多个一维数组按 index 配对。
- 旧的 single-sweep 限制会阻止这种常见实验设计。

### 涉及文件

- `src/App.tsx`
  - 删除单 sweep 数量限制。
  - 新增 DDS task 内 multi-sweep points 一致性验证。
  - 新增 sequence-level enabled sweeps points 一致性验证。
  - applet 命令的 scan x 判断从“只有一个 sweep”改为“存在合法 sweep”。
- `src/pythonGenerator.ts`
  - `renderDdsSet(...)`、`renderTaskTiming(...)`、sweep sequence body 改为接收 `enabledSweeps[]`。
  - 新增 per-parameter sweep value 变量生成。
  - 多 sweep 时使用共享 `scan_index`，并按 index 同步推进所有参数。
  - 移除 generator 中的单 sweep 阻塞逻辑。
  - 导出前检查 individual sweep validity、task-level points、sequence-level points。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- 继续使用已有的 `SweepConfig`。
- 多 sweep 语义由同一个 task 中多个 parameter 的 `sweep.enabled=true` 表达。

### UI 交互有没有变化

- 有。
- 用户现在可以同时打开 duration、frequency、amplitude、phase 的 sweep。
- points 不一致时显示清晰错误，但不会自动改写其他参数的 points。
- 原来的 single-sweep warning 已移除。

### ARTIQ code generator 有没有变化

- 有。
- 单 sweep 仍使用一个 `scan_value`。
- 多 sweep 会为每个 swept parameter 生成自己的 scan value 变量，并用同一个 `scan_index` 推进。
- 多 sweep 的 `scan_x` 写入 `scan_index`，避免错误选择某一个参数作为唯一 x 轴。
- 如果 enabled sweeps 的 points 不一致，会阻止导出 Python。

### 测试记录

- 已通过：
  - `npm run build`
- build 内包含：
  - TypeScript 编译
  - Vite production build
- 需要手动测试：
  - 只打开 duration sweep，确认行为和之前一致。
  - 同时打开 duration/frequency sweep 且 points 相同，确认无错误并可导出。
  - 同时打开 duration/frequency/amplitude sweep 且 points 相同，确认生成代码只有一个 `for scan_index in range(...)`。
  - 将两个 sweep 的 points 改成不同值，确认 UI 报错且导出被阻止。
  - 多 sweep 时确认 `scan_x` 数据写入的是 index。

### 之后还要注意什么

- 之后如果要支持真正的二维/多维扫描，需要显式新增 scan mode，不要把当前 zip-style multi-sweep 偷偷变成 nested scan。
- 如果之后 plot panel 需要选择多 sweep 的 x 轴，可以在 UI 中增加 scan_x 来源选择；当前默认使用 sweep index。

## 2026-06-16 14:06 HKT

### 功能变更

- 将 DDS sweep 编辑器从 `mode` 下拉框改为 constraint-based 编辑。
- Sweep 打开后直接显示四个可编辑字段：
  - `Start`
  - `End`
  - `Points`
  - `Step`
- 删除 UI 中的 `End + Points` / `Step + Points` 模式选择。
- 编辑 `Points` 或 `Step` 时，保留 `Start + Points + Step` 并自动计算 `End`。
- 编辑 `End` 时，会根据最近编辑的是 `Step` 还是 `Points` 来推导另一个字段。
- 编辑 `Start` 时，会根据最近的约束组合推导 `End`、`Step` 或 `Points`。
- Sweep panel 内新增非阻塞错误提示，例如点数不是整数、step 方向不一致、四个约束互相矛盾等。
- ARTIQ Python 导出时，如果启用的 sweep 无效，会阻止生成并显示清晰错误。

### 动机

- 实验里 duration sweep 最常见的操作是直接设置 `Start / Points / Step`，然后让系统算出 `End`。
- 旧的 mode-based UI 需要用户先理解 `End + Points` 和 `Step + Points` 两种模式，交互不够直接。
- constraint-based UI 更接近实验参数编辑习惯，也为之后扩展 sweep 行为打基础。

### 涉及文件

- `src/types.ts`
  - 删除 `SweepMode`。
  - `SweepConfig` 改为保存 `start / end / step / points`，并新增可选的 `invalid / error / lastEditedFields`。
- `src/App.tsx`
  - 新增 constraint sweep 推导和校验 helper。
  - 移除 sweep mode 下拉 UI。
  - Sweep 编辑器改成两行两列：`Start | End`、`Points | Step`。
  - 新增 sweep panel 内错误提示。
- `src/App.css`
  - 新增 `.sweep-error` 样式。
- `src/experimentStorage.ts`
  - 保留旧 `mode` 字段读取，仅用于迁移旧保存文件。
  - 旧 `end_points / step_points` 保存数据会被规范化成新的 constraint sweep 结构。
- `src/pythonGenerator.ts`
  - 删除生成器内部对 `sweep.mode` 的依赖。
  - 新增导出前的 sweep constraint 兜底校验。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- 新的 `SweepConfig` 不再需要 `mode`。
- 新增 `lastEditedFields` 用于记录最近编辑的 sweep 字段，从而推断哪个字段应该被系统自动计算。
- 新增 `invalid` 和 `error` 用于在 UI 和导出前表达当前 sweep 是否有效。
- 旧保存数据仍可读取，迁移时会忽略旧 `mode` 并重新计算 `step/end`。

### UI 交互有没有变化

- 有。
- Sweep 打开后不再选择模式。
- 用户可以直接编辑 `Start / End / Points / Step`。
- 系统会根据最近编辑的字段自动更新被推导字段。
- 无效 sweep 会在参数 panel 内显示提示，不会导致页面崩溃。

### ARTIQ code generator 有没有变化

- 有，但只改 sweep 数据读取和错误拦截。
- 没有改变无 sweep 时的 Python 生成路径。
- 没有新增新的 ARTIQ sweep 功能。
- 如果启用的 sweep 标记为 invalid，或四个约束互相矛盾，生成器会拒绝导出。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动测试：
  - 打开 DDS duration sweep，确认没有 mode 下拉框。
  - 输入 `Start=1, Points=5, Step=0.5`，确认 `End` 自动变为 `3`。
  - 编辑 `End`，确认系统按最近编辑字段推导 `Step` 或 `Points`。
  - 输入无法整除的 `End / Start / Step` 组合，确认 panel 内显示错误且导出被拦截。

### 之后还要注意什么

- 之后如果实现 sweep 对 timeline gap 的动态影响，应继续以 `duration + gapAfterPrevious` 为生成逻辑，不要让 `lockPosition` 变成物理约束。
- 如果未来支持多 sweep，需要把当前“只允许一个 sweep”的校验升级为多维 scan 设计。

## 2026-06-16 11:55 HKT

### 功能变更

- 修复 Module properties panel 变高时把底部 cards 往下推的问题。
- 将 editor 主体改为稳定两列布局：
  - 左列 `left-main-column` 包含 timeline 和 bottom cards。
  - 右列只包含 Module properties panel。
- bottom cards 现在属于左列，位置只跟 timeline 相关，不受右侧 properties panel 高度影响。
- Module properties panel 设置为 sticky，并使用内部滚动。
- 保留 DDS 参数布局：Duration、Frequency、Amplitude、Phase 仍各自是 full-width row/card，并带独立 Sweep toggle。

### 动机

- 选中 DDS task 或展开 sweep controls 时，右侧属性面板会变高。
- 之前 bottom cards 是 editor grid 后面的独立 section，因此会被右侧面板高度推下去。
- 现在 bottom cards 固定在 timeline 下方，右侧内容只在自己的 panel 内滚动。

### 涉及文件

- `src/App.tsx`
  - 将 `bottom-area` 移入左侧主列。
  - 新增 `left-main-column` 包裹 timeline 和 bottom cards。
  - Module properties panel 仍作为右侧 sibling。
- `src/App.css`
  - 更新 `.editor-grid` 为左列 + 360px 右侧属性列。
  - 新增 `.left-main-column` flex column 布局。
  - `.property-panel` 设置 `position: sticky`、`max-height` 和 `overflow: auto`。
  - `.bottom-area` 去掉外部 margin，并保持三列 cards 布局。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。

### UI 交互有没有变化

- 有。
- 选中 task 或展开 DDS sweep controls 时，bottom cards 不再下移。
- Module properties panel 内容过高时在 panel 内部滚动。
- 创建 module、保存 package、plot panel 功能保持不变。

### ARTIQ code generator 有没有变化

- 没有。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动测试：
  - 未选择 task 时，bottom cards 在 timeline 下方。
  - 选择 DDS task 后，bottom cards 不下移。
  - 展开 DDS sweep controls 后，右侧 panel 内部滚动，bottom cards 不下移。
  - 小高度窗口下，右侧 properties panel 仍可滚动使用。

### 之后还要注意什么

- 之后如果新增 bottom card，应继续放在左侧 `bottom-area` 内，不要放回 editor grid 外层。

## 2026-06-15 18:08 HKT

### 功能变更

- 将 sweep 生成代码中的 `averages_per_point` 命名改为 `repetition_num_per_point`。
- 将生成 Python 中的 loop index 从 `average_index` 改为 `repetition_index`。
- metadata dataset 也同步改为 `repetition_num_per_point`。

### 动机

- 这个数值来自 UI 中的 repetition，因此命名应该直接表达“每个 scan point 重复多少次”。
- 修正用户原先提到的拼写，使用正确英文 `repetition`。

### 涉及文件

- `src/pythonGenerator.ts`
  - 更新 sweep 模式下的 Python attribute、dataset name、loop variable。
- `Development_log.md`
  - 新增本次中文开发记录。
  - 同步修正上一条 sweep generator 记录中的旧变量名。

### 数据结构有没有变化

- 没有。
- 只是生成 Python 代码中的命名变化。

### UI 交互有没有变化

- 没有。

### ARTIQ code generator 有没有变化

- 有命名变化。
- sweep 逻辑不变，仍然按 scan point 做 repetition 后求平均。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`

### 之后还要注意什么

- 后续文档和 UI 文案如果提到这个值，统一使用 `repetition_num_per_point`。

## 2026-06-15 17:15 HKT

### 功能变更

- ARTIQ Python code generator 新增 DDS one-dimensional sweep 支持。
- 支持 sweep 参数：
  - frequency
  - amplitude
  - phase
  - duration
- 第一版只允许整个 sequence 中启用一个 sweep。
- 如果没有启用 sweep，generator 继续走原有静态生成路径。
- 如果启用多个 sweep，Generate Python / Copy / Download 会被阻止，并显示清晰错误：
  - `Cannot generate ARTIQ Python: Only one sweep is supported in the first version.`
- 支持两种 sweep mode：
  - `end_points`
  - `step_points`
- sweep 代码生成新增：
  - `scan_points`
  - `repetition_num_per_point`
  - `scan_start`
  - `scan_end`
  - `scan_step`
  - `scan_value`
- 旧 repetition count 在 sweep 模式下作为 `repetition_num_per_point`。
- sweep 模式下生成嵌套 loop：
  - 外层按 scan point 遍历。
  - 内层按 repetition_num_per_point 重复同一 sequence。
- measurement counts 会按 scan point 做 average。
- count rate 使用 averaged counts 除以 measurement gate duration。
- sweep 模式下生成 metadata datasets：
  - `scan_parameter`
  - `scan_unit`
  - `scan_channel`
  - `scan_start`
  - `scan_end`
  - `scan_step`
  - `scan_points`
  - `repetition_num_per_point`
- sweep 模式下生成 `scan_x` dataset，作为 applet 默认 x-axis。
- plot applet command 在 sweep 模式下使用 `--x scan_x`。

### 动机

- 让之前已经保存到 sequence data 的 DDS sweep 配置真正进入 ARTIQ Python 代码生成。
- 保持第一版 sweep 简单可靠：只支持一个 sweep，避免多个 sweep 组合语义不清。
- 将 repetition 转换成 repetition_num_per_point，符合实验扫描时每个 scan point 多次平均的常见用法。

### 涉及文件

- `src/pythonGenerator.ts`
  - 新增 DDS sweep detection 和 generation validation。
  - 新增 `getArtiqGenerationError(...)`。
  - 新增 sweep 专用 Python 生成路径。
  - 新增 sweep dataset 初始化、metadata 初始化和 averaged append 逻辑。
  - frequency sweep 使用 `scan_value * MHz`。
  - amplitude sweep 使用 `amplitude=scan_value`。
  - phase sweep 使用 `phase_turns = scan_value / 360.0`。
  - duration sweep 使用 `delay(scan_value * ms)`。
  - duration sweep 会检查同 channel overlap，如果某个 scan point 会重叠则阻止生成。
- `src/plotDatasets.ts`
  - `generateAppletCommands(...)` 新增 sweep x-axis 选项。
  - sweep enabled 时 applet command 使用 `scan_x`。
- `src/App.tsx`
  - Generate Python / Copy / Download 前检查 generator validation error。
  - generator validation error 会显示在 properties panel 的现有错误区域。
  - applet command 根据合法 sweep 状态切换 x-axis。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增数据结构。
- 继续使用上一轮新增的 `ddsParameters.<parameter>.sweep`。
- generator 现在会读取这些 sweep config。

### UI 交互有没有变化

- 有轻微变化。
- 如果 sweep 配置不符合 generator 限制，点击 Generate Python 不会打开 code drawer，而是显示错误。
- Copy / Download Python 同样会被 generator validation error 阻止。
- Recommended applet commands 在合法 sweep 模式下自动使用 `scan_x` 作为 x-axis。

### ARTIQ code generator 有没有变化

- 有。
- 合法 one-dimensional DDS sweep 会生成 scan loop 和 averaged measurement dataset append。
- 无 sweep 时保持原静态生成路径。
- 没有实现 two-dimensional sweep。
- 没有实现 multiple simultaneous sweeps。
- 没有实现 duration sweep 的 dynamic gap-preserving timeline expansion。
- duration sweep 暂时保留现有 stored timeline start positions，并阻止同 channel overlap。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 额外用临时 CommonJS 编译检查了 frequency sweep 样例生成字符串，确认包含：
  - `scan_x`
  - `repetition_num_per_point`
  - sweep metadata datasets
  - `scan_value * MHz`
  - averaged counts / count_rate append
- 需要手动测试：
  - DDS frequency sweep: 确认生成 `scan_value * MHz`。
  - DDS amplitude sweep: 确认生成 `amplitude=scan_value`。
  - DDS phase sweep: 确认生成 `phase_turns = scan_value / 360.0`。
  - DDS duration sweep: 确认 swept task 使用 `delay(scan_value * ms)`。
  - 同时打开两个 sweep，确认 Generate Python 被阻止。
  - duration sweep 设置到同 channel overlap，确认 Generate Python 被阻止。
  - 开启 plot 后，确认 applet command 使用 `--x scan_x`。

### 之后还要注意什么

- 未来如果要支持 duration sweep 下的 dynamic gap-preserving timing，需要让 generator 使用 preserved gaps 推导每个 scan point 的动态开始时间。
- 未来如果要支持多个 sweep，需要先定义 scan order、dataset shape 和 applet 展示策略。
- 如果要完全匹配 UI 中的 plot package，可以进一步让 sweep generator 只生成 enabled valid plots 需要的 Y datasets；当前 sweep 模式会为 measurement blocks 生成 counts/count_rate。

## 2026-06-15 16:59 HKT

### 功能变更

- 为 DDS output task 的参数新增 sweep UI 和数据模型支持。
- 支持 sweep 的 DDS 参数：
  - frequency
  - amplitude
  - phase
  - duration
- 每个参数默认 sweep OFF。
- sweep OFF 时显示普通 single-value input。
- sweep ON 时显示 sweep form，并隐藏/禁用对应 single-value 编辑。
- 第一版支持两种 sweep mode：
  - `End + Points`
  - `Step + Points`
- `End + Points`：
  - editable: Start, End, Points
  - read-only computed: Step
  - formula: `Step = (End - Start) / (Points - 1)`
- `Step + Points`：
  - editable: Start, Step, Points
  - read-only computed: End
  - formula: `End = Start + Step * (Points - 1)`
- `points = 1` 时，Step 显示 0，End 等于 Start。
- 增加非阻塞 sweep validation message：
  - points 必须是整数且 >= 1。
  - amplitude sweep values 必须在 0 到 1。
  - frequency sweep values 必须为正数。
  - duration sweep values 必须为正数。
  - phase sweep values 允许任意有效数字。
  - 第一版整个 sequence 只允许一个 sweep enabled，否则显示：
    `Only one sweep is supported in the first version.`

### 动机

- 为之后生成 duration/frequency/amplitude/phase sweep 的 ARTIQ 实验代码做 UI 和数据准备。
- 先把 sweep 参数作为 sequence data 保存下来，不提前改 Python generator，降低实现风险。
- duration sweep 未来会影响 timing model；当前步骤只做数据和 UI，不改变 timeline geometry。

### 涉及文件

- `src/types.ts`
  - 新增 `SweepMode`、`SweepConfig`、`DdsParameter`、`DdsSweepParameters`、`DdsParameterKey`。
  - `SequenceModule` 新增可选 `ddsParameters`。
- `src/experimentStorage.ts`
  - 新增 DDS 参数 normalization / migration helper。
  - 旧保存实验如果只有 `frequencyMHz`、`amplitude`、`phaseDeg`、`durationMs`，加载时会自动补 `ddsParameters`，并且 sweep 默认 OFF。
- `src/App.tsx`
  - 新增 DDS sweep helper、validation helper 和 UI renderer。
  - DDS properties panel 增加 Sweep ON/OFF 控制。
  - Frequency / Amplitude / Phase 支持 sweep editor。
  - Duration 在 timing area 中增加 sweep toggle；duration sweep ON 时禁用普通 duration input。
  - sweep 配置更新只改变 UI state / sequence data，不改变 timeline geometry。
- `src/App.css`
  - 新增 sweep toggle、sweep card、sweep grid、readonly input 和 sweep message 样式。
- `src/packageStorage.ts`
  - `Save as package` 读取新 `ddsParameters` 的静态 value，但不保存 sweep config。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 有。
- `SequenceModule` 新增：
  - `ddsParameters.frequency`
  - `ddsParameters.amplitude`
  - `ddsParameters.phase`
  - `ddsParameters.duration`
- 每个 parameter 包含：
  - `value`
  - `unit`
  - `sweep.enabled`
  - `sweep.mode`
  - `sweep.start`
  - `sweep.end`
  - `sweep.step`
  - `sweep.points`
- 为兼容现有 generator 和旧数据，仍保留：
  - `frequencyMHz`
  - `amplitude`
  - `phaseDeg`
  - `durationMs`

### UI 交互有没有变化

- 有。
- DDS task properties panel 中每个 DDS 参数都有 Sweep ON/OFF 控制。
- sweep ON 后显示 Start / End / Step / Points 编辑区域。
- read-only computed 字段不可编辑。
- validation message 只提示，不阻止用户暂存 sweep 配置。
- locked task 的 timing 保护仍保持原逻辑。

### ARTIQ code generator 有没有变化

- 没有。
- 这一步没有生成 sweep loop。
- 这一步没有改变 dataset、applet command 或 kernel code。
- 当前 generator 仍然读取现有静态值和 timeline geometry。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动测试：
  - 选择 DDS task，确认 Frequency / Amplitude / Phase / Duration 默认 Sweep OFF。
  - 打开 Frequency sweep，确认出现 mode、Start、End/Step、Points、computed Step/End。
  - 切换 `End + Points` 和 `Step + Points`，确认 computed 字段变化正确。
  - 设置 points = 1，确认 Step = 0，End = Start。
  - 打开两个 sweep，确认显示 `Only one sweep is supported in the first version.`。
  - 输入 amplitude 超出 0 到 1，确认出现非阻塞 warning。
  - 保存并重新打开旧实验，确认旧 DDS 参数正常迁移且 sweep 默认 OFF。

### 之后还要注意什么

- 下一步如果实现 code generator sweep，需要明确使用 `ddsParameters`，而不是只读旧的 `frequencyMHz/amplitude/phaseDeg/durationMs`。
- duration sweep 会影响未来 dynamic timing；generator 仍然应该忽略 `locked`，并按 preserved gap model 推导后续 task timing。
- 如果之后 package 系统要保存 sweep package，需要明确 package 是否保存 sweep config；当前 package 仍主要保存静态物理参数。

## 2026-06-15 13:13 HKT

### 功能变更

- 修复 Module properties panel 中 timing 数字输入框逐字提交的问题。
- `Start time ms`、`End time ms`、`Duration ms`、`Gap after previous ms` 现在使用本地 draft text。
- 用户输入过程中只更新 input draft，不立即修改 task model。
- 只有在 blur 或按 Enter 时才 parse 并提交数值。
- blur 时如果输入非法，会回退到当前已提交值。
- Enter 时如果输入非法，会保留 draft 并显示错误，方便继续修改。
- 允许输入过程中的中间字符串，例如空字符串、`10.`、`0.`，不会在第一位数字时触发 placement validation。
- locked task 的 timing 输入框继续保持 disabled。

### 动机

- 避免用户输入多位数字时，第一位数字被立即提交并触发 overlap validation。
- 让用户可以自然输入 `10`、`12.5` 这类 timing 值。
- 保持现有 gap-preserving timeline 语义，只修复 UI 编辑状态问题。

### 涉及文件

- `src/App.tsx`
  - 新增 `TimingField`、`TimingDrafts`。
  - 新增 `timingDrafts` 和 `timingDraftError` state。
  - 新增 timing field value/text helper。
  - 新增 `commitTimingDraft(...)` 和 `timingInputProps(...)`。
  - 四个 timing input 改为 blur/Enter commit，不再 `onChange` 直接更新 task。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有。
- `SequenceModule` 仍然保存 absolute `startMs`、`durationMs` 和 `gapAfterPrevious`。
- draft input text 只是 React UI state，不进入保存实验数据。

### UI 交互有没有变化

- 有。
- timing 数字输入框现在可以完整输入多位数字后再提交。
- 提交时仍沿用原有语义：
  - `Start time` 移动 task 并保持 duration。
  - `End time` 移动 task 并保持 duration。
  - `Duration` resize task 并保持 start。
  - `Gap after previous` 按同 channel previous task 重新定位。
- invalid value 会显示现有样式的错误提示。

### ARTIQ code generator 有没有变化

- 没有。
- 这是 UI editing-state 修复，不改变 Python generator。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动测试：
  - 创建两个同 channel TTL pulse。
  - 选择后一个 block。
  - 点击 `Start time ms` 输入 `10`，确认第一位 `1` 不会立刻移动 block 或触发 overlap rejection。
  - blur 或按 Enter 后确认合法值会提交并移动 block。
  - 对 `End time ms`、`Duration ms`、`Gap after previous ms` 做同样测试。
  - 输入非法值或最终 overlap，确认错误只在 commit 后出现。

### 之后还要注意什么

- 如果之后加入更多会影响 timeline placement 的数值字段，也应该复用 draft-then-commit 模式。
- 物理参数类输入目前仍保持即时更新；如果之后也出现同类 UX 问题，可以单独改为 draft commit。

## 2026-06-15 12:10 HKT

### 功能变更

- 在 gap-preserving timeline model 上补完整 `Lock position` 编辑器行为。
- locked task 在 UI editor 中保持 absolute `startMs`、`durationMs` 和 end time，不会被前序 task 自动推走。
- locked task 的 `gapAfterPrevious` 改为派生值：根据当前 previous task end 重新计算。
- locked task 的 timing 字段保持可见但禁用：
  - `Start time`
  - `End time`
  - `Duration`
  - `Gap after previous`
- locked task 仍然可以被选中、删除，并且仍允许编辑 name、DDS 参数、TTL 参数、dataset name 等非 timing 参数。
- locked task 在 timeline block 内显示小锁标记。
- 如果前序 task 变长撞到 locked task：
  - locked task 不会移动。
  - UI 显示 `Locked collision` warning。
  - 涉及 collision 的 task block 会显示红色 collision 样式。
- 如果一次编辑造成普通未锁定 task 之间 overlap，仍然会阻止该编辑。
- 保持 properties panel timing layout：
  - Row 1: `Start time` | `End time`
  - Row 2: `Duration` | `Gap after previous`
- 提高 empty-gap hover tooltip 的显示层级，避免被 task block 遮住。

### 动机

- `Lock position` 只应该是 UI/editor protection，用来防止误拖动和误改 timing。
- locked task 不应该为了保持 `gapAfterPrevious` 而在编辑器里自动移动。
- locked task 发生 collision 时应该明确提示用户，而不是静默移动或静默夹断 timing。
- 为未来 duration sweep 保持语义清晰：lock 不会成为 ARTIQ 物理 timing constraint。

### 涉及文件

- `src/App.tsx`
  - 新增 locked collision 判断 helper。
  - 新增 `updateModuleLockState(...)`，切换 lock 时会重新计算当前 channel timing。
  - 更新 module update 流程，区分 blocked overlap 和 allowed locked collision warning。
  - 更新 timeline block class，给 locked/collision task 显示对应 UI 状态。
  - locked task 的派生 `gapAfterPrevious` 允许显示负值，用来表达 overlap。
- `src/App.css`
  - 新增 timeline block 小锁 badge 样式。
  - 新增 collision block 红色描边样式。
  - 确认 gap tooltip 使用高 `z-index` 和 `pointer-events: none`。
- `Development_log.md`
  - 新增本次中文开发记录。

### 数据结构有没有变化

- 没有新增字段。
- 继续使用现有 `SequenceModule.locked` 和 `SequenceModule.gapAfterPrevious`。
- locked task 的 `gapAfterPrevious` 语义是 editor-derived value，不是用户可编辑约束。

### UI 交互有没有变化

- 有。
- locked task timing 输入框全部 disabled。
- locked task 可以继续选择、删除、编辑非 timing 参数。
- locked task block 显示小锁。
- locked collision 会显示 warning 和红色 block 样式。
- empty-gap tooltip 会显示在 task block 上方。

### ARTIQ code generator 有没有变化

- 没有。
- `locked` 不导出为 ARTIQ command。
- 当前 generator 仍然只使用最终静态计算后的 `startMs` 和 `durationMs`。
- 未来 duration sweep generator 仍然应该忽略 `locked`，并使用 duration + preserved gaps 的 timing model。

### 测试记录

- 已通过：
  - `./node_modules/.bin/tsc --noEmit`
  - `npm run build`
- 需要手动测试：
  - A: start 0 ms, duration 1 ms；B: start 2.8 ms, duration 1 ms。
  - Lock B 后把 A duration 改成 2 ms，确认 B 仍然 start 2.8/end 3.8，gap 变为 0.8。
  - Lock B 后删除 A，确认 B 仍然 start 2.8/end 3.8，gap 变为 2.8。
  - Lock B 后尝试拖动或编辑 timing 字段，确认不可改。
  - Lock B 后编辑 name/frequency/amplitude，确认仍可改。
  - 让 A 增长到 overlap B，确认 B 不移动，并出现 locked collision warning 和红色碰撞样式。
  - hover empty gap，确认 tooltip 在 task block 上方且不阻挡拖拽/选择。

### 之后还要注意什么

- 如果之后实现 duration sweep，code generator 不能把 `locked` 当作固定 absolute start。
- 如果之后加入更完整 validation panel，可以把 locked collision 汇总为 editor warning，但不要影响 ARTIQ 物理语义。

## 2026-06-15 11:56 HKT

### 功能变更

- 实现 unlocked task blocks 的 gap-preserving timeline behavior。
- `gapAfterPrevious` 成为普通未锁定 task 的保存 timing constraint。
- 新增/归一化每个 task 的 `gapAfterPrevious` 字段。
- 旧保存实验加载时会按 channel 分组、按 start time 排序，并从 absolute start/duration 计算 `gapAfterPrevious`。
- 编辑 `Start time`：
  - 移动整个 task。
  - 保持 duration 不变。
  - 更新当前 task 的 `gapAfterPrevious`。
  - 同 channel 后续未锁定 task 会跟随移动，并保持自己的 `gapAfterPrevious` 不变。
- 编辑 `End time`：
  - 移动整个 task。
  - 保持 duration 不变。
  - 更新当前 task 的 `gapAfterPrevious`。
  - 同 channel 后续未锁定 task 会跟随移动。
- 编辑 `Duration`：
  - resize 当前 task。
  - 当前 task start 保持不变。
  - 同 channel 后续未锁定 task 会跟随移动，并保持 gap。
- 编辑 `Gap after previous`：
  - 直接更新当前 task 的 `gapAfterPrevious`。
  - 保持 duration 不变。
  - 同 channel 后续未锁定 task 会跟随移动。
- 拖拽 task：
  - drop 时按最终 visual start 转换成 `gapAfterPrevious`。
  - 行为等价于编辑 `Start time`。
- 删除 task：
  - 删除后 immediate next task 会尽可能保持视觉 absolute start。
  - 通过重新计算 next task 相对新 previous task 的 `gapAfterPrevious` 实现。
- 不允许负 gap。
- 不允许通过 Start/End/Gap 编辑穿过当前 next neighbor。
- 不创建 fake gap task blocks。

### 动机

- 真实实验中，同 channel 相邻 task 之间的 gap 往往比 absolute start/end 更重要。
- 为之后 duration sweep 做准备：当前 task duration 变化后，下游 task 应该以固定 gap 跟随 previous dynamic end。
- 保持 generator 继续使用最终计算后的 absolute `startMs` 和 `durationMs`，避免一次性改动 code generation 语义。

### 涉及文件

- `src/types.ts`
  - `SequenceModule` 新增 `gapAfterPrevious: number`。
- `src/experimentStorage.ts`
  - 加载/归一化旧实验时，为缺少 `gapAfterPrevious` 的 task 自动计算 gap。
  - 对 tiny negative floating point gap 使用 `1e-9` 级别容差并 clamp 到 0。
- `src/App.tsx`
  - 新增 channel timing recalculation helpers。
  - 新增 Start/End/Gap/Duration 的 gap-preserving update helpers。
  - 更新 task creation，使新 task 根据 absolute start 计算初始 `gapAfterPrevious`。
  - 更新 drag drop，使其按最终 visual start 更新 gap 并 reflow channel。
  - 更新 delete 逻辑，使 immediate next task 尽量保持视觉 start。
  - Properties panel 保持 `Start time | End time`、`Duration | Gap after previous` 布局。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `SequenceModule` 新增 `gapAfterPrevious`。
- 旧数据兼容：
  - first task on channel：`gapAfterPrevious = start`
  - later task：`gapAfterPrevious = start - previous.end`
- `SequenceState.modules` 仍然保存 absolute `startMs` 和 `durationMs`，用于 timeline layout 和当前 Python generation。

### UI 交互变化

- Start/End/GAP/Duration edits 会按 gap-preserving model 更新同 channel 后续 task。
- Dragging task 会按 gap-preserving model reflow 同 channel 后续 task。
- 删除 task 后，下一个 task 会尽可能保持原来的视觉 absolute start。
- Hidden channels 上的 task 不会被删除；只是不可见。
- 其他 channel 的 tasks 不会被本 channel edits 修改。

### ARTIQ code generator 有没有变化

- 没有变化。
- Python generator 仍然读取最终计算好的 absolute `startMs` 和 `durationMs`。
- `gapAfterPrevious` 暂时不进入 Python generator。
- `lockPosition` 没有被导出为物理 timing command。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 使用独立 helper 算例验证：
  - A: start 0 duration 1；B: start 3 duration 2；C: start 8 duration 1。
  - B start 改为 4 后：B duration = 2，B end = 6，B gap = 3，C gap = 3，C start = 9。
  - B end 改为 6 后：B start = 4，B duration = 2，C start = 9。
  - B duration 从 2 改为 3 后：B start 保持 3，B end = 6，C start = 9。
  - B gap 改为 1 后：B start = 2，duration 不变，C 跟随并保持 gap。
  - 删除 B 后：C 视觉 start 保持 8，C gap 重新计算为 7。

### 后续 TODO

- 后续实现 duration sweep 时，应让 generator 使用 preserved gaps 和 dynamic previous end 推导每 shot 的 timing。
- 后续可进一步拆分 timing model helper 到独立模块，便于测试和 generator 共用。

## 2026-06-15 11:20 HKT

### 功能变更

- 修复 task/module properties panel 的 timing 字段布局。
- 字段顺序从：
  - `Start time ms | Gap after previous ms`
  - `Duration ms | End time ms`
- 调整为：
  - `Start time ms | End time ms`
  - `Duration ms | Gap after previous ms`
- `End time ms` 仍然是 disabled/read-only。
- `Gap after previous ms` 仍然可编辑。
- 修复 empty gap hover tooltip 被 task block 视觉遮挡的问题。
- 将 visible tooltip 从低 z-index 的 `.gap-region` 内移到 lane 顶层渲染。
- 将 `.gap-tooltip` 的 `z-index` 提升到 `9999`，并保持 `pointer-events: none`。

### 动机

- Timing fields 的视觉排列需要更符合用户预期：Start 和 End 放在同一行，Duration 和 Gap 放在同一行。
- Gap tooltip 是读数辅助信息，应该始终显示在 task blocks 上方，不应该被附近 block 盖住。

### 涉及文件

- `src/App.tsx`
  - 调整 properties panel 中 timing fields 的 JSX 顺序。
  - 将 `.gap-tooltip` 渲染位置移到 lane 内 task blocks 后方的高层 overlay。
- `src/App.css`
  - 将 `.gap-tooltip` 的 `z-index` 改为 `9999`。
  - 保持 `.gap-tooltip` 的 `pointer-events: none`。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。
- 不修改 `SequenceState.modules`。
- 不新增 gap task。

### UI 交互变化

- Properties panel timing layout 现在显示为：
  - `Start time ms | End time ms`
  - `Duration ms | Gap after previous ms`
- Gap tooltip 会显示在 task blocks 上方。
- Tooltip 不会阻止 task selection、dragging、snapping。

### ARTIQ code generator 有没有变化

- 没有变化。
- 没有修改 timing calculation logic。
- 没有修改 Python generation。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 代码检查确认 `.gap-tooltip` 使用 `z-index: 9999`，并且 tooltip 不再嵌套在 `.gap-region` 内。

### 后续 TODO

- 如果未来 tooltip 仍受更外层 stacking context 影响，可进一步改成 portal 到 app root 或 document body。

## 2026-06-15 11:12 HKT

### 功能变更

- 在 timeline 中新增 empty gap hover tooltip。
- 对每个 visible channel，按 start time 排序当前 channel 上的 task blocks。
- 只在两个相邻 task block 之间存在空白时生成透明 hover region。
- gap 定义为：
  - `previousTask.end < nextTask.start`
  - `gapDuration = nextTask.start - previousTask.end`
- hover 空白 gap 超过约 100ms 后显示 tooltip：
  - `Gap: <duration> ms`
- 鼠标离开 gap / lane 时立即隐藏 tooltip。
- 鼠标在 100ms 前离开 gap 时不会显示 tooltip。
- 直接 hover task block 不会显示 gap tooltip。

### 动机

- 用户在时间轴上查看 sequence 时，可以快速知道同一 channel 上两个 task 之间的等待时间。
- 这是纯 UI 辅助，不需要用户手动创建 delay block。

### 涉及文件

- `src/App.tsx`
  - 新增 `GapRegion` 类型。
  - 新增 `formatTimeMs(...)`。
  - 新增 `visibleGapTooltipId` state。
  - 新增 `gapHoverTimerRef`。
  - 新增 `gapRegionsByChannel` derived data。
  - 新增 `startGapHover(...)` 和 `clearGapHover(...)`。
  - 在 visible lane 中渲染透明 gap overlay。
- `src/App.css`
  - 新增 `.gap-region` 和 `.gap-tooltip` 样式。
  - 给 `.module-block` 设置更高 z-index，确保 task block 交互不被 gap overlay 遮挡。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。
- 不新增 gap task。
- 不修改 `SequenceState.modules`。
- gap regions 只从当前 visible lanes 和 task blocks 动态派生。

### UI 交互变化

- hover 两个 task blocks 之间的空白区域约 100ms 后，会显示 gap duration。
- tooltip 轻量显示在 gap 区域上方。
- 隐藏 channel 后，该 channel 的 gap overlay 和 tooltip 不会渲染。
- 拖动 task 改变 gap 后，tooltip duration 会根据当前 task 位置重新派生。

### ARTIQ code generator 有没有变化

- 没有变化。
- gap tooltip 不导出到 ARTIQ code。
- 不影响 delay 推导和 Python generation。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 代码检查确认新增 `gapRegionsByChannel`、`startGapHover`、`clearGapHover`、`.gap-region` 和 `.gap-tooltip`。

### 后续 TODO

- 如果之后支持非 ms 时间单位，可让 `formatTimeMs(...)` 接入统一 time unit formatter。

## 2026-06-15 11:07 HKT

### 功能变更

- 更新 task/module properties panel 的 timing 编辑方式。
- 保留内部绝对时间模型：task 仍然存储 `startMs` 和 `durationMs`。
- 新增 `Gap after previous ms` 字段。
- `Gap after previous ms` 表示：
  - 当前 task start time 减去同 channel 上 previous task 的 end time。
  - 如果没有 previous task，则表示当前 task start time 减去 0。
- Timing fields 显示顺序调整为：
  - `Start time ms`
  - `Gap after previous ms`
  - `Duration ms`
  - `End time ms`
- `End time ms` 继续只读，并使用 disabled/read-only 显示。
- 编辑 gap 时会转换成新的绝对 `startMs`，并保持 `durationMs` 不变。
- gap 不允许为负数。
- 如果 gap 太大导致当前 task 会越过/重叠 next task，会自动 clamp 到最大合法 gap。

### 动机

- 实验编辑时，用户通常更关心“这个 task 距离同 channel 前一个 task 结束后等多久”，而不是只看绝对 start time。
- 保留绝对 `startMs` / `durationMs` 可以避免影响 timeline、dragging、snapping 和 ARTIQ code generation。

### 涉及文件

- `src/App.tsx`
  - 新增 `sameChannelNeighbors(...)`。
  - 新增 `gapAfterPreviousMs(...)`。
  - 新增 `startMsFromGapAfterPrevious(...)`。
  - 新增 `updatePanelGapAfterPrevious(...)`。
  - 更新 properties panel timing fields 的显示顺序和 label。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。
- `SequenceModule.startMs` 和 `SequenceModule.durationMs` 仍然是唯一的 timing source of truth。
- 没有新增持久化字段。

### UI 交互变化

- 选中 task 后，properties panel 会显示 `Gap after previous ms`。
- 拖动 task 后，gap 字段会根据新的 absolute start 自动重新计算。
- 编辑 gap 只影响当前 task 的 `startMs`。
- 编辑 gap 不影响当前 task 的 `durationMs`。
- 编辑 gap 不影响其他 channel 上的 tasks。

### ARTIQ code generator 有没有变化

- 没有变化。
- Python generator 仍然使用 absolute `startMs` 和 `durationMs`。
- 如果用户通过 gap 改变了 start time，生成代码只会自然反映新的 absolute timing。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 使用等价 helper 逻辑验证：
  - Task A: start 0, duration 5；Task B: start 10, duration 3 时，B gap = 5。
  - 将 B gap 从 5 改成 2 时，B start = 7，duration 仍为 3，end = 10。
  - First task start 4, duration 2 时，gap = 4。
  - gap = 0 时允许 task 与 previous task touching。
  - gap 过大时会 clamp 到 next task 前，避免重叠或 reordering。

### 后续 TODO

- 如果未来允许 task reordering，可以再设计 explicit reorder 操作；当前 gap editing 不允许穿过 next task。

## 2026-06-15 10:58 HKT

### 功能变更

- 在 `Select channels` / channel visibility panel 中新增一键切换按钮。
- 如果当前所有 channel 都可见，按钮显示 `Deselect all`。
- 如果当前只有部分或没有 channel 可见，按钮显示 `Select all`。
- 点击 `Select all` 会把当前 `availableChannels` 中的全部 channel id 写入 `visibleChannelIds`。
- 点击 `Deselect all` 会把 `visibleChannelIds` 设为空数组。
- 单个 channel checkbox 仍保持原有行为。
- 手动勾选/取消 channel 后，按钮 label 会根据当前状态自动同步。

### 动机

- 真实设备通道数量变多后，逐个勾选 channel 不方便。
- 一键选择/隐藏全部 channel 可以让用户更快切换全局视图和局部视图。

### 涉及文件

- `src/App.tsx`
  - 新增 `areAllChannelsSelected` derived state。
  - 新增 `toggleAllChannels()` handler。
  - 在 channel menu 顶部新增 `Select all` / `Deselect all` 按钮。
- `src/App.css`
  - 新增 `.channel-menu-actions` 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。
- 只更新 `SequenceState.visibleChannelIds`。
- 不修改 `SequenceState.modules`。

### UI 交互变化

- Channel selector 下拉面板顶部新增一键选择/取消全部按钮。
- 隐藏 channel 不会删除该 channel 上已有 task。
- 重新选择 channel 后，隐藏 task 会重新显示。

### ARTIQ code generator 有没有变化

- 没有变化。
- 本次只影响 UI channel visibility。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 代码检查确认新增 `areAllChannelsSelected`、`toggleAllChannels` 和 `.channel-menu-actions`。

### 后续 TODO

- 如果未来 channel groups 支持折叠，可考虑增加 group-level select all / deselect all。

## 2026-06-11 19:02 HKT

### 功能变更

- 更新 saved experiment picker UI。
- 将 `Open saved experiment` 从原生 `<select>` 替换为自定义 dropdown。
- 每个 saved experiment row 现在显示：
  - experiment name
  - saved / updated timestamp
  - 右侧小号 `×` delete button
- 点击 row 仍然会打开对应 saved experiment。
- 点击 `×` 会先弹出确认：
  - `Delete saved experiment "<experiment name>"? This cannot be undone.`
- 删除按钮使用 `event.stopPropagation()`，不会同时触发 row open/load。
- 删除后会立即刷新 dropdown list。
- 删除当前 selected/open saved experiment 时，会清空 selected saved experiment id，并把当前 editor 重置为新的 blank experiment。
- 删除非当前 saved experiment 时，当前 editor state 保持不变。

### 动机

- 原生 `<option>` 不能可靠包含可点击 delete button。
- 用户需要在 saved experiment list 中直接删除单个保存项，而不是手动清 localStorage。
- 删除行为应只影响 app 内部 saved experiment registry，不影响导出的 Python 文件或文件系统。

### 涉及文件

- `src/experimentStorage.ts`
  - 新增 `deleteSavedExperimentRecord(recordId, existingRecords)`。
  - 删除只更新 `artiq-sequence-builder-saved-experiments` localStorage registry。
- `src/App.tsx`
  - 新增 `selectedSavedExperimentId` state。
  - 新增 `isSavedExperimentMenuOpen` state。
  - 新增 `deleteSavedExperiment(...)`。
  - 新增 `resetActiveExperimentToBlank()`。
  - 将 saved experiment native select 替换为 custom dropdown list。
- `src/App.css`
  - 新增 saved experiment picker、dropdown rows、empty state、delete button 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `SavedExperimentRecord` 结构没有变化。
- `SequenceState`、`SequenceModule`、`PlotPackage` 没有变化。
- 新增的 selected/open id 只是 React UI state，不写入 saved experiment record。

### UI 交互变化

- Closed picker 会显示当前选择/打开的 saved experiment。
- 没有选择时显示 `Select saved experiment`。
- Dropdown 中每行右侧有 `×` 删除按钮。
- 没有 saved experiments 时显示 `No saved experiments.`
- 删除前需要 confirm。

### ARTIQ code generator 有没有变化

- 没有变化。
- 没有修改 Python generator。
- 没有修改 channel definitions。
- 没有修改 TTL counter / TTL input timing logic。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 检查 `Open saved experiment` 区域已不再使用原生 `<select><option>`。

### 后续 TODO

- 如后续需要更完整的数据管理，可增加 export/import saved experiment JSON。

## 2026-06-11 17:55 HKT

### 功能变更

- 修复 TTL counter measurement task 的 Python code generation 时序。
- 将 counter measurement 拆成两个阶段：
  - Timing phase：只在 timing block / `with parallel` / `with sequential` 内生成 `gate_rising(...)`、`gate_falling(...)` 或 `gate_both(...)`。
  - Readout phase：在整个 timing cluster 结束后统一生成 `fetch_count()`。
- 如果同一个 timing cluster 里有多个 counter measurement task，会先生成所有 gate timing，再在 cluster 后生成所有 `fetch_count()`。
- Dataset updates 仍然保持在 `fetch_count()` 之后。

### 动机

- `fetch_count()` 是结果读出操作，不应该放在 `with parallel` 或 timing branch 里。
- 避免 ARTIQ 时间语义错误：parallel block 应只表达实验硬件 timing，不混入 counter readout。
- 保证后续 dataset append 使用的 count 变量已经在 readout phase 中定义。

### 涉及文件

- `src/pythonGenerator.ts`
  - 将 `renderTask(...)` 调整为 timing-only renderer。
  - 新增 counter readout 渲染逻辑。
  - `renderSequenceBody(...)` 在每个 task cluster 的 timing block 结束后输出 readout。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。

### UI 交互变化

- 没有变化。

### ARTIQ code generator 有没有变化

- 有变化。
- TTL counter task 不再把 `fetch_count()` 放进 `with parallel` / `with sequential` branch。
- `fetch_count()` 会出现在 timing block 之后、dataset append 之前。
- Dataset initialization、dataset append、applet command recommendation 没有改变。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 运行 generator 示例验证：
  - `self.ttl8_counter.gate_rising(...)` 位于 `with parallel` 的 sequential branch 内。
  - `pmt_counts = self.ttl8_counter.fetch_count()` 位于 `with parallel` block 之后。
  - `self.append_to_dataset(...)` 位于 `fetch_count()` 之后。

### 后续 TODO

- 如果后续支持更复杂的 measurement grouping，需要继续保持 timing phase 和 readout phase 分离。

## 2026-06-11 17:32 HKT

### 功能变更

- 根据真实 `device_db.py` 更新 channel system。
- 可见用户通道现在分为四组：
  - DDS output channels：`urukul0_ch0` 到 `urukul1_ch3`
  - TTL output channels：`ttl0` 到 `ttl7`、`ttl12` 到 `ttl15`
  - TTL input channels：`ttl8` 到 `ttl11`
  - TTL counter channels：`ttl8_counter` 到 `ttl11_counter`
- 不再把 `timing` / virtual lane 暴露为普通 sequence channel。
- 没有暴露内部 helper devices，例如 `ttl_urukul*_io_update`、`ttl_urukul*_sw*`、`spi_*`、`eeprom_*`、`urukul*_cpld`、`ttl_zotino0_*`、`led*`、`zotino0`。
- Task compatibility 更新：
  - DDS signal 只能使用 DDS output channel。
  - TTL pulse/output 只能使用 TTL output channel。
  - TTL measurement/counting 只能使用 TTL counter channel。
  - TTL input channels 保留在 channel registry 中，但当前 counting task 不使用它们。
- 默认/sample measurement task 从 `ttl8` 改为 `ttl8_counter`。
- 旧 localStorage experiment 中如果有 measurement module 使用 `ttl8` 到 `ttl11`，加载时会自动迁移到对应的 `ttl*_counter`。

### 动机

- 让 UI channel model 和真实 ARTIQ `device_db.py` 对齐。
- 避免把普通 TTL input `ttl8` 和 EdgeCounter `ttl8_counter` 混在一起。
- 防止用户在 sequence 中选择内部 helper devices。
- 让 Python generator 输出真实设备类型对应的代码。

### 涉及文件

- `src/defaultChannels.ts`
  - 更新真实可见 channel registry。
  - 更新默认可见 channel。
- `src/types.ts`
  - `ChannelType` 新增/使用 `ttl_counter`，移除 `virtual`。
- `src/App.tsx`
  - 更新 channel groups。
  - 更新 task compatibility rules。
  - 更新 measurement 默认 channel 和按钮文案。
  - Channel 下拉只显示当前 task type 合法的真实 channel。
- `src/experimentStorage.ts`
  - 加载旧实验时迁移 measurement module 的 `ttl8` 到 `ttl11` 为对应 `ttl*_counter`。
  - 加载旧实验时过滤/修正无效 channel，避免内部或已删除 channel 进入当前 sequence。
  - 自动把 module 正在使用的 channel 加入 visible lanes。
- `src/pythonGenerator.ts`
  - TTL output task 继续生成 `self.ttlX.on()` / `delay(...)` / `self.ttlX.off()`。
  - TTL measurement/counting task 改为 EdgeCounter 代码：
    - `self.ttl8_counter.gate_rising(duration * ms)`
    - `count_variable = self.ttl8_counter.fetch_count()`
  - 不再生成旧 TTLInOut counting 代码：
    - `gate_end_mu = self.ttl8.gate_rising(...)`
    - `self.ttl8.count(gate_end_mu)`
  - `build()` 只为实际使用的 user devices 加 `setattr_device(...)`。
  - 如果使用 `urukul0_ch*`，自动加入 `urukul0_cpld`。
  - 如果使用 `urukul1_ch*`，自动加入 `urukul1_cpld`。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `ChannelType` 从 `dds | ttl_input | ttl_output | virtual` 改为 `dds | ttl_output | ttl_input | ttl_counter`。
- `SequenceModule.channel` 仍然是 string，但合法值集合更新为真实 visible channel ids。
- 旧保存数据会在加载时迁移，不直接把 `ttl8` 和 `ttl8_counter` 合并。

### UI 交互变化

- `Select channels` 菜单显示四个真实 channel groups。
- `TTL Counter Measure` task 的 channel 下拉只显示 `ttl*_counter`。
- TTL input channels 仍可在 channel selector 中显示/隐藏，但当前没有 task 会创建到 TTL input channel。
- 默认 sample sequence 的 PMT gate 位于 `ttl8_counter`。

### ARTIQ code generator 有没有变化

- 有变化。
- Measurement/counting task 改为 EdgeCounter API。
- `build()` 只添加实际使用的 user devices，并按 DDS 使用情况自动添加对应 Urukul CPLD。
- 没有为未使用设备生成 `setattr_device(...)`。
- 没有为内部 helper devices 生成普通 user channel 代码。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 运行 generator 示例验证：
  - 使用 `urukul1_ch2` 时生成 `self.setattr_device("urukul1_cpld")`。
  - 使用 `ttl12` TTL output 时生成 `self.ttl12.on()` / `self.ttl12.off()`。
  - 使用 `ttl8_counter` measurement 时生成 `self.ttl8_counter.gate_rising(...)` 和 `self.ttl8_counter.fetch_count()`。
  - 未生成 `gate_end_mu` 或旧的 `self.ttl8.count(gate_end_mu)`。

### 后续 TODO

- 之后如果新增 trigger/timestamp task，再把 `ttl8` 到 `ttl11` TTL input channels 接入对应 task type。
- 如果后续启用 `zotino0`，应新增独立 analog output task，而不是混入 TTL/DDS channel groups。

## 2026-06-10 18:31 HKT

### 功能变更

- 修复删除 `Validate` 和 `Auto-align measurements` 后 toolbar 布局过窄的问题。
- 将 toolbar grid 从旧的删除前列数更新为当前实际控件数量对应的 12 列布局。
- 给 `Generate Python` 按钮设置明确的最小宽度和 full-width 样式，确保 icon 和文字始终在按钮内部显示。
- 调整窄屏 responsive 规则，让 `Generate Python` 在窄布局下跨两列，避免被压缩到文字重叠。

### 动机

- 删除旧按钮后，toolbar 仍保留旧的 grid column 假设，导致绿色 `Generate Python` 按钮被压窄。
- 用户需要看到一个完整、正常宽度的主操作按钮，而不是文字和相邻 icon button 重叠。

### 涉及文件

- `src/App.css`
  - 更新 `.toolbar` 的 `grid-template-columns`。
  - 新增 `.toolbar > .icon-text.primary` 的宽度和最小宽度约束。
  - 更新 `@media (max-width: 1240px)` 下 Generate button 的跨列规则。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。

### UI 交互变化

- `Generate Python` 现在是正常宽度按钮，包含 icon 和文字。
- toolbar icon buttons 仍保持原行为。
- download button 和 code-view button 行为没有变化。

### ARTIQ code generator 有没有变化

- 没有变化。

### 测试记录

- 检查 JSX，确认 `Generate Python` 文本仍在 button element 内。
- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。

### 后续 TODO

- 如果之后继续增删 toolbar 控件，应同步检查 `.toolbar` grid columns，避免再次留下旧布局假设。

## 2026-06-10 15:55 HKT

### 功能变更

- 完全移除 `Validate` 功能。
- 删除 toolbar 中的 `Validate` 按钮。
- 删除底部/侧边区域中的 `Validation` / warnings panel。
- 删除 `lastValidation` state 和所有相关状态更新。
- 删除 `validateSequence(...)`、`ValidationWarning` 类型以及不再使用的 validation helper。
- 保留 same-channel overlap 检查 helper，因为它仍然用于 task block 创建、拖动和 resize 时阻止同 channel 重叠。

### 动机

- 当前 UI 希望减少普通用户不需要直接理解的检查入口。
- 同 channel overlap 等关键限制已经在编辑交互中即时阻止，不需要额外的 Validate 面板暴露给用户。
- 简化界面和状态流，避免 validation warnings 与实际编辑行为产生重复概念。

### 涉及文件

- `src/App.tsx`
  - 删除 `validateSequence` import。
  - 删除 `lastValidation` state。
  - 删除 `warnings` derived state。
  - 删除 `Validate` 按钮。
  - 删除 `Validation` panel JSX。
  - 删除 tab 切换、新建、清空、打开实验等流程中的 `setLastValidation(...)`。
- `src/validation.ts`
  - 删除 `validateSequence(...)`。
  - 删除不再使用的 class name / channel warning validation helpers。
  - 删除未使用的 `hasSameChannelOverlap(...)`。
  - 保留 `findSameChannelOverlap(...)`。
- `src/types.ts`
  - 删除 `ValidationWarning` 类型。
- `src/App.css`
  - 删除 `.validation-panel`、`.validation-item`、`.valid` 等专用样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 删除 `ValidationWarning` 类型。
- `SequenceState`、`SequenceModule`、`PlotPackage` 没有变化。

### UI 交互变化

- 用户不再看到 `Validate` 按钮。
- 用户不再看到 `Validation` / warnings panel。
- 不再有点击 warning 定位 module 的交互。
- 拖动时的 snapping / magnetic alignment 行为保持不变。
- Sequence editing 行为保持不变。
- 同 channel overlap 仍会在创建、移动、调整 duration 时被阻止。

### ARTIQ code generator 有没有变化

- 没有功能变化。
- 本次没有改变 Python code generation 逻辑。
- 只是移除和 validation UI/state 相关的引用。

### 测试记录

- 运行 `rg -n "Validate|Validation|validation-panel|validation-item|validateSequence|ValidationWarning|lastValidation|warnings|No warnings|click.*warning" src`，源码中无残留引用。
- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。

### 后续 TODO

- 如果之后需要重新加入检查能力，建议做成更具体的实时 inline 提示，而不是恢复全局 `Validate` 面板。

## 2026-06-10 15:46 HKT

### 功能变更

- 完全移除 `Auto-align measurements` 功能。
- 删除 toolbar / control panel 中的 `Auto-align measurements` 按钮。
- 删除 Module properties panel 中 measurement block 的 `Auto-align` checkbox。
- 删除 `autoAlign` 相关 handler 和 UI 更新逻辑。
- 删除 `SequenceModule` 和 `SavedModulePackageParams` 中的 `autoAlign` 字段。
- 保存 module package 时不再保存 `autoAlign`。
- 从 saved package 创建 draft module 时不再恢复 `autoAlign`。

### 动机

- `Auto-align measurements` 的语义不够明确，容易和拖动时的 snapping / magnetic alignment 混淆。
- 当前 sequence builder 更适合保留明确、可预测的手动时间轴编辑和拖动吸附行为。
- 简化 measurement module 数据结构，减少之后 code generator 和 package 系统扩展时的无关状态。

### 涉及文件

- `src/App.tsx`
  - 删除 `Wand2` icon import。
  - 删除 initial measurement module 和 draft measurement module 中的 `autoAlign` 默认值。
  - 删除 `autoAlign()` handler。
  - 删除 properties panel 中的 `Auto-align` checkbox。
  - 删除 module palette 中的 `Auto-align measurements` 按钮。
  - 从 saved package draft restore 中删除 `autoAlign`。
- `src/types.ts`
  - 删除 `SequenceModule.autoAlign`。
  - 删除 `SavedModulePackageParams.autoAlign`。
- `src/packageStorage.ts`
  - 保存 measurement package 时不再写入 `autoAlign`。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 删除 `SequenceModule.autoAlign`。
- 删除 `SavedModulePackageParams.autoAlign`。
- 旧 localStorage 中如果已有 `autoAlign` 字段，当前代码会忽略它，不再读取或写入。

### UI 交互变化

- 用户不再看到 `Auto-align measurements` 按钮。
- 用户不再看到 measurement module 的 `Auto-align` checkbox。
- 拖动 task block 时的 snapping / magnetic alignment 行为保持不变。
- `Validate` 功能保持不变。

### ARTIQ code generator 有没有变化

- 没有变化。
- 本次只移除 auto-align UI 和状态。
- Python code generator、plot dataset generator、applet command recommendation 都不受影响。

### 测试记录

- 运行 `rg -n "autoAlign|Auto-align|auto-align|Wand2|Auto-align measurements" src`，源码中无残留引用。
- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。

### 后续 TODO

- 如果之后需要自动排布功能，应作为新的、语义明确的 timeline layout tool 重新设计，而不是恢复旧的 `autoAlign` flag。

## 2026-06-10 15:33 HKT

### 功能变更

- 实现 plotting feature Step 4：根据 enabled 且 valid 的 `selectedPlots` 生成推荐 ARTIQ applet commands。
- 新增 `generateAppletCommands(selectedPlots, availableDatasets)` helper。
- 每个 enabled valid plot 生成一条推荐命令：
  - `${artiq_applet}plot_xy <Y_DATASET> --x <X_DATASET>`
- 完全相同的 command 会去重。
- Disabled plot 不生成 command。
- Invalid plot 不生成 command。
- 在 code drawer 中新增独立的 `Recommended applet commands` 区块。
- 新增 copy applet commands 按钮。
- 没有 enabled valid plot 时显示提示：
  - `No applet commands generated. Enable a valid plot to generate commands.`

### 动机

- 用户需要从当前 plot packages 快速获得 ARTIQ dashboard / shell 可用的 plot command。
- Applet command 是运行/仪表盘层面的建议命令，不应该混进 ARTIQ Python experiment file。
- 本步骤只提供推荐文本，为之后是否支持 `ccb.issue` 保留空间。

### 涉及文件

- `src/plotDatasets.ts`
  - 新增 `generateAppletCommands(...)`。
  - 复用 `isPlotValid(...)`，保证 applet commands 和 Plot panel valid 状态一致。
- `src/App.tsx`
  - 新增 `appletCommands` derived state。
  - 新增 `copyAppletCommands()`。
  - 在 code drawer 中新增 `Recommended applet commands` 输出区块。
- `src/App.css`
  - 新增 applet panel、说明文字、copy 区域和 command preview 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `PlotPackage` 结构没有变化。
- `selectedPlots` state 没有变化。
- `SequenceState` 和 `SequenceModule` 没有变化。
- Applet commands 是从当前 `selectedPlots` 和 available plot datasets 动态派生出来的 transient UI output，不做持久化。

### UI 交互变化

- Code drawer 中新增 `Recommended applet commands`。
- 该区域明确说明这些 commands 不是 Python experiment file 的一部分。
- Plot 新增、编辑、启用、禁用、删除、或变成 invalid 后，applet commands 会自动更新。
- 有 commands 时可以点击 copy 按钮复制全部 commands。

### ARTIQ code generator 有没有变化

- Python experiment code generator 没有新增 applet 相关代码。
- 没有生成 `ccb.issue`。
- 没有新增 `self.setattr_device("ccb")`。
- 没有生成 `setup_applets()`。
- 没有把 shell commands 写进 Python experiment file。
- Kernel logic 没有修改。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 运行 helper 示例验证：
  - enabled valid plot 会生成 `${artiq_applet}plot_xy ... --x ...`。
  - 完全相同的 x/y command 只生成一次。
  - 不同 y dataset 会生成不同 command。
  - disabled plot 不生成 command。
  - invalid plot 不生成 command。

### 后续 TODO

- 后续如果需要自动在 ARTIQ dashboard 创建 applet，再单独评估是否生成 `ccb.issue` 或其他 dashboard 集成方式。
- 如果未来 plot package 支持更多 plot type，需要扩展 `generateAppletCommands(...)` 的 command formatter。

## 2026-06-10 15:26 HKT

### 功能变更

- 实现 plotting feature Step 3：ARTIQ Python code generator 会根据 enabled 且 valid 的 `selectedPlots` 生成 dataset 相关代码。
- 只收集 enabled plot 的 `x` 和 `y` dataset。
- 只保留仍然存在于当前 TTL input counting blocks 中的 valid dataset。
- 对 required datasets 做去重，避免同一个 dataset 重复初始化或重复 append。
- 新增 host-side `setup_datasets()`，在 kernel loop 前初始化 required datasets。
- measurement task block 现在只负责生成 count 变量，不再直接按 module 自身 `datasetName` 生成旧的 dataset append。
- 在每个 shot 结束后，根据 required datasets 生成 `append_to_dataset`：
  - `measurement.shot` append 当前 `shot` index。
  - `measurement.<data_name>.counts` append 对应 counting block 的 count 变量。
  - `measurement.<data_name>.count_rate` 根据 counting duration ms 转换成秒后计算 rate，再 append。

### 动机

- Plot package 应该成为 dataset 生成需求的来源，避免 generator 为没有被 plot 使用的数据集生成无用代码。
- Disabled plot 和 invalid plot 不应该影响 ARTIQ Python 输出。
- Dataset initialization 不应放在 `@kernel` 方法里，因此新增 host-side wrapper。

### 涉及文件

- `src/pythonGenerator.ts`
  - `generateArtiqPython(state, selectedPlots)` 新增 `selectedPlots` 参数。
  - 新增 `getRequiredDatasetsFromPlots(...)`。
  - 新增 `generateDatasetInitializationCode(...)`。
  - 新增 `generateDatasetAppendCode(...)`。
  - 新增 `getInputBlockForDataset(...)`。
  - 使用 Step 2 的 `sanitizeDatasetName` 保持 dataset path 匹配一致。
  - 将原本的 kernel `run()` 改为 `run_kernel()`，并新增 host-side `run()`。
- `src/App.tsx`
  - code preview 调用改为 `generateArtiqPython(state, selectedPlots)`。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `PlotPackage` 结构没有变化。
- `selectedPlots` state 没有变化。
- `SequenceState` 和 `SequenceModule` 没有变化。
- Generator 新增的 required datasets 是从 `selectedPlots` 和当前 sequence modules 动态派生出来的 transient codegen state。

### UI 交互变化

- UI 外观没有变化。
- 生成 Python code preview 时，会即时反映 enabled / disabled / invalid plot 状态。
- Disabled plot 仍显示在 UI 中，但不会进入 Python code generation。
- Invalid plot 仍显示在 UI 中，但不会进入 Python code generation。

### ARTIQ code generator 有没有变化

- 有变化。
- 现在只有 enabled 且 valid 的 selected plots 会触发 dataset code generation。
- 有 required datasets 时，生成：
  - `setup_datasets()`
  - `self.set_dataset(..., [], broadcast=True, archive=True)`
  - 每个 shot 结束后的 required `self.append_to_dataset(...)`
- 没有 enabled valid plots 时，不生成任何 plot-related `set_dataset` 或 `append_to_dataset`。
- 本步骤仍然不生成 applet commands。
- 本步骤仍然不生成 `ccb.issue`。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 运行 generator 示例验证：
  - enabled valid plots 会生成 `measurement.shot`、`measurement.photon_counts.counts`、`measurement.photon_counts.count_rate`。
  - duplicate `measurement.shot` 只 append 一次。
  - disabled plot 不生成代码。
  - invalid plot 不生成代码。
  - 没有 selected plots 时，不生成 `set_dataset`、`append_to_dataset`、`setup_datasets`。

### 后续 TODO

- Step 4 再生成 applet commands。
- Step 4 再决定是否生成 `ccb.issue`。
- 后续需要在真实 ARTIQ 环境确认 kernel 内 `append_to_dataset` 是否符合实验室当前 ARTIQ 版本和数据写入规范；如有限制，可进一步改成 host-side buffer / mutate_dataset 流程。

## 2026-06-10 15:17 HKT

### 功能变更

- 实现 plotting feature Step 2：Plot panel 的 X/Y dataset options 改为从当前 sequence 的 TTL input counting blocks 动态生成。
- 新增默认 dataset prefix：`measurement`。
- X dataset 固定包含 `measurement.shot`。
- Y dataset 会根据 `measure` 类型 task block 的 `datasetName` 自动生成：
  - `measurement.<data_name>.counts`
  - `measurement.<data_name>.count_rate`
- 新增 dataset name sanitization，避免空格和不安全字符直接进入 dataset path。
- 如果当前 sequence 没有 TTL input counting block，`New plot` 会禁用，并提示用户先添加 TTL input counting block。
- 如果已有 plot 引用了已经不存在的 dataset，plot card 会继续显示，并标记为 `Invalid dataset`，不会被自动删除。

### 动机

- Plot package 应该只依赖当前 sequence 里真实存在的 counting 数据源，而不是硬编码 placeholder dataset。
- 让后续 dataset generation、append_to_dataset、applet commands 可以基于同一套 plot package 数据继续扩展。
- 保持 UI plot state 和 ARTIQ code generator 分离，本步骤只更新前端 dataset option logic。

### 涉及文件

- `src/plotDatasets.ts`
  - 新增 `sanitizeDatasetName(name)`。
  - 新增 `getAvailablePlotDatasets(inputCountingBlocks, prefix)`。
  - 新增 `isPlotValid(plot, availableDatasets)`。
- `src/App.tsx`
  - 移除 Plot panel 中的 hardcoded X/Y dataset options。
  - 使用当前 `state.modules` 动态计算 plot dataset options。
  - `New plot` 在没有 counting dataset 时禁用。
  - plot form 和 edit form 都使用动态 dataset options。
  - plot card 增加 invalid dataset 状态显示。
- `src/App.css`
  - 新增 Plot panel 禁用按钮、提示信息、invalid plot card 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `PlotPackage` 结构没有变化。
- `selectedPlots` state 没有变化。
- `SequenceState` 和 `SequenceModule` 没有变化。
- 新增的 dataset options 是从当前 sequence modules 派生出来的 transient UI state，不做持久化。

### UI 交互变化

- `New plot` 不再总是可用。
- 没有 TTL input counting block 时，用户会看到提示：
  - `Add a TTL input counting block before creating count plots.`
- 添加、删除、重命名 TTL input counting block 后，Plot panel 的 X/Y dataset options 会跟随当前 sequence 自动更新。
- 已存在 plot 如果引用失效 dataset，会保留 card，并显示 `Invalid dataset`。

### ARTIQ code generator 有没有变化

- 没有变化。
- 本步骤不生成 dataset initialization code。
- 本步骤不生成 `append_to_dataset`。
- 本步骤不生成 applet commands。
- `src/pythonGenerator.ts` 没有修改。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 由于当前环境没有可调用的 in-app browser 控制工具，本次未执行自动浏览器点击测试。
- 需要手动测试：
  - 删除所有 TTL input counting blocks，确认 `New plot` disabled，并显示提示。
  - 添加一个 `Measure TTL Input` counting block，设置 `datasetName = photon_counts`，确认 Y options 出现 `measurement.photon_counts.counts` 和 `measurement.photon_counts.count_rate`。
  - 修改 counting block 的 `datasetName`，确认 edit plot form 中的 options 更新。
  - 删除或重命名 counting block 后，确认已有 plot card 不消失，并显示 `Invalid dataset`。
  - 点击 `Generate Python`，确认 Python preview 没有因为 plot UI 改变。

### 后续 TODO

- 后续 Step 再把 `selectedPlots` 接入 dataset initialization。
- 后续 Step 再生成 `append_to_dataset`。
- 后续 Step 再生成 applet commands。
- 之后可以考虑 plot packages 的持久化和跨实验复用。

## 2026-06-10 15:04 HKT

### 功能变更

- 新增 Step 1 plotting UI。
- 新增 `selectedPlots` 前端状态，用于保存当前页面选择的 plot packages。
- 新增 Plot panel：
  - `New plot`
  - `Confirm plot`
  - Edit plot
  - Enable / Disable plot
  - Delete plot
- 使用 placeholder dataset options：
  - X: `measurement.shot`
  - Y: `measurement.photon_counts.counts`
  - Y: `measurement.photon_counts.count_rate`
  - Y: `measurement.pmt_counts.counts`
  - Y: `measurement.pmt_counts.count_rate`

### 动机

- 为后续 dataset 生成和 applet 命令生成做前端状态准备。
- 先让用户能在 UI 中声明想要的 plot package，但不影响当前 ARTIQ Python code generation。
- 保持 plot package 和 sequence modules 分离，避免 plot 配置污染 timeline task 数据。

### 涉及文件

- `src/types.ts`
  - 新增 `PlotPackage` 类型。
- `src/App.tsx`
  - 新增 `selectedPlots` 和 `plotDraft` state。
  - 新增 plot 默认值和增删改启用/禁用逻辑。
  - 新增 Plot panel UI。
- `src/App.css`
  - 新增 Plot panel、plot form、plot card 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 新增 `PlotPackage`：
  - `id`
  - `name`
  - `type: "plot_xy"`
  - `x`
  - `y`
  - `group`
  - `enabled`
- `SequenceState` 和 `SequenceModule` 没有变化。
- plot packages 当前只保存在普通 React state 中，尚未持久化。

### UI 交互变化

- 底部新增 `Plots` 面板。
- 点击 `New plot` 打开 plot form。
- 点击 `Confirm plot` 将 draft plot 加入 `selectedPlots`。
- 已确认 plot 会显示为 card。
- card 支持 Edit、Enable/Disable、Delete。
- disabled plot card 会保留显示，并降低透明度。

### ARTIQ code generator 有没有变化

- 没有变化。
- 本步骤不生成 dataset。
- 本步骤不生成 applet command。
- `src/pythonGenerator.ts` 没有修改，Python preview 保持不变。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 需要手动测试：
  - 点击 `New plot`，确认出现 form。
  - 修改 name、x、y、group 后点击 `Confirm plot`，确认 card 出现。
  - 点击 Edit，确认重新打开 form 并可保存修改。
  - 点击 Disable / Enable，确认状态切换且 card 仍显示。
  - 点击 Delete，确认 plot card 被移除。
  - 点击 `Generate Python`，确认 Python preview 没有因为 plot UI 改变。

### 后续 TODO

- Step 2 再把 plot package 接入 dataset generation。
- Step 3 再生成 applet commands。
- 后续可考虑 plot packages 的持久化和跨实验复用。

## 2026-06-10 14:00 HKT

### 功能变更

- 删除右侧 timeline 上悬浮的 `Code` 抽屉按钮。
- 保留顶部 toolbar 中的 code preview 图标按钮。
- 保留 `Generate Python` 后自动打开 code drawer 的行为。

### 动机

- 右侧悬浮 `Code` 按钮遮挡 timeline 视图，影响查看和操作 task blocks。
- 顶部已经有代码预览入口，不需要重复的悬浮入口。

### 涉及文件

- `src/App.tsx`
  - 删除 floating drawer tab button。
  - 删除不再使用的 `ChevronRight` icon import。
- `src/App.css`
  - 删除 `.drawer-tab` 相关样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有变化。

### UI 交互变化

- 页面右侧不再显示悬浮 `Code` 按钮。
- 用户仍可通过顶部 code preview 图标打开/关闭 code drawer。
- 点击 `Generate Python` 仍会自动打开 code drawer。

### ARTIQ code generator 有没有变化

- 没有变化。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 搜索确认 `drawer-tab`、`ChevronRight` 和浮动 `Code` 按钮代码已移除。

### 后续 TODO

- 如果后续需要更明显的 code drawer 入口，可以只优化顶部 toolbar 按钮，不再使用遮挡 timeline 的悬浮按钮。

## 2026-06-10 13:47 HKT

### 功能变更

- 实现 timeline task block 的 long-press dragging。
- 普通点击 task block 只负责选中并打开属性面板，不会移动 block。
- 按住约 200 ms 后才进入拖动模式。
- 长按等待期间允许小幅 pointer jitter，超过阈值会取消拖动，避免误移动。
- 拖动中使用临时 preview 位置，让 block 平滑跟随 pointer。
- snapping 不再贴每个 grid line，只贴有意义的时间点：
  - `0 ms`
  - 其他 finalized modules 的 `startMs`
  - 其他 finalized modules 的 `endMs`
- snapping threshold 使用当前 timeline scale 动态计算：
  - `Math.min(0.2, 8 / pixelsPerMs)`

### 动机

- 防止用户只是想点击选择 module 时意外移动 task block。
- 让 sequence 对齐更贴近实验逻辑，而不是被普通网格线干扰。
- 保持 finalized `SequenceState.modules` 作为真实 timeline 数据；拖动过程中的 preview 不直接写入 sequence。

### 涉及文件

- `src/App.tsx`
  - 将原来的 HTML5 drag/drop 改为 pointer-based long-press drag。
  - 新增 `dragPreview`、`pendingDragRef`、`isDraggingRef`。
  - 新增 meaningful snap helper：`snapToMeaningfulTimingPoint`。
  - 拖动结束时复用 same-channel overlap validation。
  - locked modules 不进入拖动模式。
- `src/App.css`
  - 增加 dragging 状态样式。
  - 给 task block 增加 `touch-action: none` 和 drag cursor。
- `Development_log.md`
  - 追加本次开发记录。

### 交互逻辑变化

- `pointerdown` 后启动 200 ms long-press timer。
- 200 ms 内释放：视为普通点击，只选择 module。
- 200 ms 内移动超过 jitter：取消拖动，避免误触。
- 进入拖动后：
  - module duration 保持不变。
  - preview startMs 随 pointer 平滑变化。
  - 只在接近 meaningful timing point 时吸附。
  - 松手后才尝试提交到 finalized modules。

### snapping helper 变化

- 新 helper：`snapToMeaningfulTimingPoint(rawStartMs, movingModule, modules, pixelsPerMs)`。
- snap points 来源：
  - `0`
  - 其他 finalized module 的 start/end。
- 不包含：
  - 当前 active module 自己的 start/end。
  - draft modules。
  - saved packages。
  - 普通 grid lines。
- 多个 snap points 都在 threshold 内时，选择距离最近的点。

### overlap validation 有没有复用

- 复用了现有 `withLegalTiming` 和 `findSameChannelOverlap` 逻辑。
- 拖动松手时如果会造成 same-channel overlap，不会写入 finalized modules。
- cross-channel overlap 仍然允许。
- locked modules 仍然作为 overlap blocker。

### ARTIQ code generator 有没有变化

- 没有变化。
- 拖动和 snapping 只是 UI 编辑行为。
- `src/pythonGenerator.ts` 仍然只读取 finalized `SequenceState.modules`。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 需要手动测试：
  - 单击 task block，确认只选中，不移动。
  - 按住不足 200 ms 释放，确认不移动。
  - 按住约 200 ms 后拖动，确认 block 平滑移动。
  - 拖动接近 0 ms，确认可吸附。
  - 拖动接近其他 module 的 start/end，确认可吸附。
  - 确认不会吸附到普通 grid lines。
  - locked module 可点击但不能拖动。
  - 拖到 same-channel overlap 位置后松手，确认不会提交。

### 后续 TODO

- 增加可视化 snap indicator。
- 增加 undo/redo。
- 后续可加入更高级的 edge-to-edge snapping。
- 后续可考虑更精细的 drag conflict highlight。

## 2026-06-10 13:38 HKT

### 功能变更

- 新增同一 channel 上 task module 的 overlap validation。
- 使用半开区间 `[start, end)` 判断重叠：
  - `startA < endB && startB < endA`
- 同一 channel 的重叠会被阻止。
- 不同 channel 的时间重叠仍然允许，用于表示并行实验操作。
- 在属性面板中增加 overlap 错误提示，例如 `Overlaps with Cooling beam on urukul0_ch0.`。

### 动机

- 防止同一个硬件 channel 上出现不可能或不安全的时间冲突。
- 避免 invalid timeline data 进入 finalized `SequenceState.modules`。
- 让 ARTIQ code generator 继续只处理已经通过 UI/data validation 的 sequence。

### 涉及文件

- `src/validation.ts`
  - 新增 `findSameChannelOverlap(candidateModule, existingModules, ignoreModuleId?)`。
  - 新增 `hasSameChannelOverlap(candidateModule, existingModules, ignoreModuleId?)`。
- `src/App.tsx`
  - 创建 draft module 时检查同 channel overlap。
  - 编辑 existing module 的 channel、startMs、durationMs 时检查 overlap。
  - 拖拽 drop 时复用相同检查，非法移动不会写入 modules。
  - auto-align 复用 overlap 检查，不能自动对齐到冲突位置。
  - 新增属性面板错误消息状态。
- `src/App.css`
  - 新增属性面板错误消息样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- 没有新增或修改持久化数据结构。
- `SequenceState.modules` 仍然是 finalized timeline task blocks 的唯一真实来源。

### 新增 validation/helper

- `findSameChannelOverlap`
  - 只检查相同 channel。
  - 编辑已有 module 时会忽略自身 id。
  - 使用半开区间逻辑，允许相邻不重叠。
  - 返回第一个冲突 module，便于 UI 显示冲突对象。
- `hasSameChannelOverlap`
  - 返回 boolean，供后续需要简单判断的场景复用。

### 拖拽/resize 行为变化

- 当前项目已有拖拽移动，没有 resize。
- 拖拽到同 channel 冲突位置时，更新会被拒绝，module 保持原位置。
- locked module 仍然不可拖动，并且也会作为其他 module 的 overlap blocker。

### ARTIQ code generator 有没有变化

- 没有变化。
- overlap validation 是 UI/data validation，不进入 `src/pythonGenerator.ts`。
- generator 继续只读取 finalized `SequenceState.modules`。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 需要手动测试：
  - 在同一 channel 创建 0-5 ms 和 5-10 ms，确认允许。
  - 在同一 channel 创建 0-5 ms 和 4-10 ms，确认 Create 被阻止。
  - 在不同 channel 创建相同时间段，确认允许。
  - 修改 startMs 或 durationMs 造成同 channel 重叠，确认修改被拒绝并显示错误。
  - 修改 channel 到已有冲突 channel，确认修改被拒绝。
  - 拖拽到同 channel 冲突位置，确认不会写入新位置。
  - saved package 只打开 draft，overlap 检查发生在点击 Create 时。

### 后续 TODO

- long-press dragging 后续再处理。
- snapping optimization 后续再处理。
- overlap 错误可以后续增强为更细的 inline field hint 或 timeline conflict highlight。

## 2026-06-10 13:31 HKT

### 功能变更

- 新增 task module 的 `Fix / Lock position` 功能。
- 属性面板中新增 lock toggle：
  - `Lock position`
  - `Locked position`
- locked module 会保持 channel、start time、duration 固定，避免误拖动或误改时间位置。
- locked module 仍然允许编辑 name、frequency、amplitude、phase、edge、dataset、autoAlign 等非放置类参数。

### 动机

- 防止已经配置好的 task block 被误拖动。
- 防止误修改 channel、startMs、durationMs 这类 timeline placement 信息。
- 保留物理参数继续可编辑，避免锁定后整个模块完全不可调整。

### 涉及文件

- `src/types.ts`
  - 在 `SequenceModule` 中新增 `locked: boolean`。
- `src/experimentStorage.ts`
  - 加载旧实验和旧 open tabs 时，为缺失 `locked` 的 module 自动补 `false`。
- `src/App.tsx`
  - 新建 module / draft module 默认 `locked = false`。
  - 属性面板新增 lock toggle。
  - locked 时禁用 channel、startMs、durationMs 字段。
  - locked module 禁止 timeline 拖拽和 drop 更新。
  - auto-align 会跳过 locked measurement module。
- `src/App.css`
  - 新增 locked module 和 lock toggle 样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `SequenceModule` 新增：
  - `locked: boolean`
- 新 module 默认值：
  - `locked = false`
- 旧保存数据兼容：
  - 如果旧 module 没有 `locked`，加载时视为 `false`。

### Save as package 有没有调整

- `Save as package` 不保存 `locked`。
- saved package 仍然只保存可复用物理/任务参数，例如 name、type、duration、frequency、amplitude、phase、edge、dataset、autoAlign。
- 从 package 创建 draft module 时仍默认 `locked = false`。

### ARTIQ code generator 有没有变化

- 没有变化。
- `locked` 只作为 UI 编辑限制，不影响 ARTIQ timing 生成。
- `src/pythonGenerator.ts` 仍然只读取 finalized `SequenceState.modules` 的 channel、timing 和物理参数。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 需要手动测试：
  - 新建 module，确认默认 unlocked。
  - 选中 module 后点击 `Lock position`，确认 channel/start/duration 字段禁用。
  - locked module 不能拖动到其他位置或其他 channel。
  - locked module 仍可修改 name、frequency、amplitude、phase、edge、dataset、autoAlign。
  - 点击 `Locked position` 解锁后，timing/channel 字段恢复可编辑。
  - 保存 package 后确认 package 数据不包含 locked。
  - 从 package 创建 draft，确认默认 unlocked。
  - 生成 ARTIQ Python，确认行为与锁定前一致。

### 后续 TODO

- long-press dragging 后续再处理。
- snapping 优化后续再处理。
- overlap validation 的交互提示后续再增强。

## 2026-06-10 13:22 HKT

### 功能变更

- 实现 `Save as package` 功能：可以把当前属性面板中的 existing module 或 draft module 保存成可复用 package。
- 新增 `Saved packages` 区域：在底部显示已保存的 package 列表。
- 点击 saved package 会打开一个新的 draft module，并预填 package 中保存的物理参数；不会直接创建 timeline block。
- 每个 package 支持删除；删除 package 不会影响已经创建到 timeline 上的 module。
- package 名称默认来自 module name；如果重名，会自动追加数字后缀，例如 `Cooling beam 2`，避免静默覆盖。

### 动机

- 允许常用 DDS、TTL output、measurement 参数组合跨实验复用。
- 让 package 成为未来 laser/channel/device database 的前置种子。
- 保持 sequence modules 仍然是当前实验 timeline 的唯一真实来源，package 只是可复用模板。

### 涉及文件

- `src/types.ts`
  - 新增 `SavedModulePackage` 和 `SavedModulePackageParams` 类型。
- `src/packageStorage.ts`
  - 新增 saved package 的 localStorage 读写逻辑。
  - 新增从 module/draft module 生成 package 的逻辑。
  - 新增删除 package 的逻辑。
- `src/App.tsx`
  - 启用 `Save as package` 按钮。
  - 新增 `savedPackages` UI state。
  - 新增从 package 打开 draft module 的流程。
  - 新增底部 `Saved packages` 列表。
- `src/App.css`
  - 新增 package 区域、package card、删除按钮样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构变化

- `SequenceState` 和 `SequenceModule` 没有改变。
- 新增 `SavedModulePackage`，用于描述可复用参数模板。
- package 保存：
  - `id`
  - `name`
  - `type`
  - `durationMs`
  - `params`
  - `metadata.createdAt`
  - `metadata.updatedAt`
- package 不保存：
  - `channel`
  - `startMs`
  - `endMs`
  - module id
  - selected state
  - timeline position

### 存储变化

- 新增 localStorage key：`artiq_sequence_builder_saved_packages`。
- saved packages 独立于 saved experiments 和 open tabs。
- saved packages 不存入任何单个实验的 `modules` 列表。

### UI 交互变化

- 属性面板中的 `Save as package` 现在可点击。
- 底部新增 `Saved packages` 区域。
- package card 显示 package name、module type、duration，以及 DDS/measurement 的关键参数摘要。
- 点击 package card 打开 draft module。
- 点击 package card 右侧 `X` 删除 package。

### ARTIQ code generator 有没有变化

- 没有变化。
- `src/pythonGenerator.ts` 仍然只读取 finalized `SequenceState.modules`。
- draft modules 和 saved packages 都不会进入 ARTIQ Python，除非用户点击 `Create` 把 draft 变成真实 timeline module。

### 测试记录

- 运行 `./node_modules/.bin/tsc --noEmit` 通过。
- 运行 `npm run build` 通过。
- 需要手动测试：
  - 对 existing module 点击 `Save as package`，确认 package 出现在底部。
  - 对 draft module 点击 `Save as package`，确认 package 出现在底部，但 timeline 不新增 block。
  - 刷新页面后确认 package 仍存在。
  - 点击 package，确认只打开 draft，不直接创建 block。
  - 点击 draft 的 `Create`，确认只创建一个 timeline module。
  - 删除 package，确认 timeline 上已有 module 不受影响。

### 后续 TODO

- 增加 package 编辑功能。
- 增加 package import/export。
- 支持 package 分组、搜索、标签。
- 未来把 saved packages 升级为正式 laser/channel/device database 的一部分。

## 2026-06-10 13:11 HKT

### Feature changed

- Changed module creation to a draft-based workflow.
- Clicking `DDS Signal`, `Measure TTL Input`, or `TTL Output Pulse` now opens a draft module in the Module properties panel.
- A draft module is not added to `SequenceState.modules`, does not render on the timeline, and is not visible to ARTIQ code generation until `Create` is clicked.
- The Module properties panel now has two modes:
  - Creating a draft module.
  - Editing an existing timeline module.
- The panel `X` button now closes the panel or discards a draft; it no longer deletes existing modules.
- Existing modules now use a separate `Delete` button.
- Added a disabled `Save as package` placeholder in the properties panel for future package support.

### Motivation

- Prevent accidental task block creation when the user is only choosing a module type.
- Prevent accidental deletion caused by using `X` as a destructive action.
- Make module creation safer by requiring the user to confirm channel, timing, and physical parameters before a task reaches the sequence timeline.

### Files modified

- `src/App.tsx`
  - Added draft module state.
  - Changed add-module buttons to create draft modules instead of finalized modules.
  - Added `Create`, `Delete`, close, and placeholder `Save as package` actions in the properties panel.
  - Preserved existing editing behavior for finalized modules.
- `src/App.css`
  - Added styles for properties panel actions, destructive delete, and disabled package placeholder.
- `Development_log.md`
  - Added this entry.

### Data model changes

- No persistent data model change.
- `SequenceState.modules` remains the single source of truth for finalized timeline task blocks.
- Draft modules are temporary React UI state only and are not saved into experiments, localStorage, signal manifest, or generated ARTIQ Python.

### UI interaction changes

- Add buttons no longer create visible timeline blocks immediately.
- Draft module fields appear in the Module properties panel.
- `Create` adds exactly one finalized module if timing/channel validation passes.
- `X` closes the panel or discards a draft.
- `Delete` is shown only for existing modules.
- `Save as package` is visible but disabled as a future feature placeholder.

### ARTIQ code generator changes

- No changes to `src/pythonGenerator.ts`.
- The generator continues to read only finalized `SequenceState.modules`.
- Draft modules are intentionally invisible to Python generation.

### Testing notes

- Ran `./node_modules/.bin/tsc --noEmit`.
- Manual checks to perform:
  - Click each add-module button and confirm no timeline block appears until `Create`.
  - Click `X` while creating a draft and confirm no module is created.
  - Click `X` while editing an existing module and confirm the timeline block remains.
  - Click `Create` and confirm exactly one block appears.
  - Click `Delete` and confirm only the selected existing block is removed.
  - Generate Python before clicking `Create` and confirm the draft is absent.

### Future TODO

- Implement `Save as package` / Saved packages library later.
- Package records should store reusable physical parameters only, such as name, type, duration, frequency, amplitude, phase, and other physical defaults.
- Package records should not store channel, start time, end time, module id, or locked/fixed state.
- Clicking a package in the future should open a draft module with those parameters filled in.

## 2026-06-10 12:49 HKT

### 新增了什么功能

- 增加页内实验 tabs：同一个浏览器页面内可以同时打开多个实验，每个 tab 对应一个独立 `SequenceState`。
- 增加已保存实验库：`Save experiment` 会把当前实验保存到本地保存列表，而不是只覆盖一个当前实验。
- 增加 `Open saved experiment` 下拉框：可以选择已保存实验，并将其作为新的页内 tab 打开。
- 增加 open tabs 自动持久化：刷新页面后会恢复上次打开的页内实验 tabs。
- 增加 signal manifest 自动生成：从当前 sequence modules 中自动提取本次用到的 DDS signal 信息，包括 DDS channel、物理命名、start/end/duration、frequency、amplitude、phase、laser preset。
- 在代码抽屉中增加 `Signal manifest` 预览。

### 为什么要加这个功能

- 用户需要在同一个浏览器窗口内并行编辑多个实验，而不是依赖浏览器自身的多个 tab。
- 用户需要从保存过的实验中选择并重新打开，方便比较、复制和迭代不同 sequence。
- Signal manifest 可以作为本次 sequence 使用到的 DDS 输出摘要，后续便于连接 laser/channel/device 配置系统，也便于检查生成代码前的实验信号定义。
- 明确架构边界，避免 UI、配置数据库、代码生成器和 manifest 混在一起，方便后续拓展。

### 涉及哪些文件

- `src/types.ts`
  - 新增 `ExperimentTab`、`SavedExperimentRecord`、`SignalManifest`、`SignalManifestEntry` 类型。
- `src/experimentStorage.ts`
  - 新增实验保存/读取逻辑。
  - 管理 saved experiments 和 open tabs 的 localStorage key。
- `src/signalManifest.ts`
  - 新增 `generateSignalManifest(state)`，从 sequence modules 自动生成 signal manifest。
- `src/App.tsx`
  - 将单一 `SequenceState` 改成多个 `ExperimentTab`。
  - 增加页内 tab bar。
  - 增加打开已保存实验的下拉框。
  - 调用 `generateSignalManifest` 并在 code drawer 中显示。
- `src/App.css`
  - 增加页内 tab、保存/打开实验工具行、manifest preview 的样式。
- `Development_log.md`
  - 追加本次开发记录。

### 数据结构有没有变化

- `SequenceState` 和 `SequenceModule` 没有改变含义，仍然只描述 sequence。
- 新增 UI 工作区层数据结构：
  - `ExperimentTab = { id, state }`
  - `SavedExperimentRecord = { id, savedAt, state }`
- 新增输出/摘要层数据结构：
  - `SignalManifest`
  - `SignalManifestEntry`
- 新增 localStorage keys：
  - `artiq-sequence-builder-saved-experiments`
  - `artiq-sequence-builder-open-tabs`
- 保留 legacy key `artiq-sequence-builder-current-experiment` 用于兼容之前保存过的单实验。

### UI 交互有没有变化

- 页面主区域顶部新增页内实验 tab bar。
- `New experiment` 现在会创建一个新的页内 tab，而不是覆盖当前实验。
- `Save experiment` 会保存当前 active tab 对应的实验到保存库。
- `Open saved experiment` 下拉框会把已保存实验打开成新的页内 tab。
- Code drawer 新增 `Signal manifest` 预览区域。

### ARTIQ code generator 有没有变化

- `src/pythonGenerator.ts` 没有变化。
- ARTIQ code generator 仍然只负责把当前 active tab 的 `SequenceState` 翻译成 Python。
- Signal manifest 由独立的 `src/signalManifest.ts` 生成，不进入 ARTIQ code generator。

### 之后还要注意什么

- 继续保持架构边界：
  - UI 只编辑 sequence。
  - Database/config 只存 laser、channel、设备和默认参数。
  - Code generator 只把 sequence 翻译成 ARTIQ Python。
  - Signal manifest 只从 modules 自动生成，用于记录本次 sequence 的 signal 使用情况。
- 当前保存仍基于浏览器 localStorage，不适合长期版本管理；之后可增加导入/导出实验包。
- 页内 tab 关闭目前没有未保存提醒，之后需要加入 dirty-state 或确认机制。

## 2026-06-10 12:40 HKT

### 新增了什么功能

- 增加 `New experiment` 功能：创建一个干净的新实验，重置 file name、experiment name、循环参数和时间轴 tasks。
- 增加 `Clear timeline` 功能：清空当前实验里的所有 task blocks，但保留当前文件名、实验名、循环设置和 channel 显示选择。
- 增加 `Save experiment` 功能：把当前实验状态保存到浏览器本地存储，刷新页面后自动恢复最近保存的实验。
- 增加页面上的保存状态提示，例如 `Not saved`、`Saved 12:40`、`Unsaved changes`。

### 为什么要加这个功能

- 用户需要在编辑复杂 ARTIQ sequence 时快速开始新实验，而不是手动删除每个 block。
- 用户需要能清空当前时间轴，用同一套实验设置重新设计 sequence。
- 用户需要保存当前网页里的实验状态，避免刷新页面或关闭浏览器后丢失编辑进度。

### 涉及哪些文件

- `src/App.tsx`
  - 新增创建新实验、清空时间轴、保存实验和自动读取本地保存实验的逻辑。
  - 在顶部 toolbar 增加对应图标按钮。
  - 增加保存状态文本。
- `src/App.css`
  - 调整 toolbar grid 布局以容纳新增按钮。
  - 增加保存状态区域样式。
- `Development_log.md`
  - 新增开发日志文件，用于记录之后每次代码改动。

### 数据结构有没有变化

- 没有改变 `SequenceState` 或 `SequenceModule` 的 TypeScript 类型。
- 新增了浏览器本地保存 key：`artiq-sequence-builder-current-experiment`。
- 保存内容是当前 `SequenceState` 的 JSON 序列化结果。

### UI 交互有没有变化

- 顶部 toolbar 新增三个图标按钮：
  - `New experiment`
  - `Clear timeline`
  - `Save experiment`
- 页面在 channel selector 上方新增保存状态提示。
- 刷新页面时会尝试读取最近一次保存的实验。

### ARTIQ code generator 有没有变化

- 没有变化。
- 本次只改变 sequence builder 的实验状态管理，不改变 Python 代码生成逻辑。

### 之后还要注意什么

- 当前保存功能只保存到当前浏览器的 localStorage，不会生成可迁移的实验项目文件。
- 后续如果需要跨电脑或版本管理，应增加 `Export experiment JSON` / `Import experiment JSON`。
- `Clear timeline` 和 `New experiment` 目前没有二次确认，之后如果误点风险变高，可以加确认弹窗或 undo。
### Counter fetch batch = 1 简化

- `Fetch batch` 的有效范围统一改为 `1-100`，默认值与输入框最小值均为 `1`；`0` 不再表示 Auto。
- 当 `Fetch batch = 1` 时，Counter 代码改为每个 shot 完成后立即 `fetch_count()` 并写入 dataset，不再生成 `sequence_batch_size`、batch 三阶段循环或 raw buffer。
- 无 sweep 且 repetition 为 `1` 时进一步展开为单次直线代码，不生成任何 shot/batch 循环。
- Sweep + Counter 同样采用逐 shot 读取；多 repetition sweep 仍保留 raw counts 和每个 scan point 的平均值。
- `Fetch batch > 1` 时继续使用原有的分批排程、顺序读取和最终 dataset 发布机制。

### Counter 总 shot 数不超过 Fetch batch 时简化

- Generator 会先在生成阶段计算总 shot 数：无 sweep 为 `repetition`，有 sweep 为 `scan_points × repetition_num_per_point`。
- 当 `total_shot <= fetchBatchSize` 时，只生成一次“排程全部 shots → 按原顺序读取全部结果”的两阶段代码。
- 该路径不生成 `self.sequence_batch_size`、`batch_start`、`batch_end`、扁平 `logical_index`、counter raw buffer 或 batch boundary。
- Sweep + repetition 的读取阶段保持 `(scan_index, repetition_index)` 结构，直接写入 `raw_counts` 并计算每个 scan point 的平均值。
- 只有 `total_shot > fetchBatchSize` 时才保留标准分批模板；相等边界明确使用简单路径。
- 删除 generated Python 中每次运行都会打印的 fetch batch `Warning`；分批属于用户主动设置的正常运行方式，代码仍在每批读取后调用 `core.break_realtime()` 恢复 RTIO scheduling slack。
### README：Sweep raw data 绘图限制

- 记录当前 Sweep + repetition 的 `raw_counts` 为二维 `(scan_points, repetition_num_per_point)` Dataset。
- 当前 Plot panel 只接受一维 x/y Dataset，因此尚不能直接绘制跨所有 scan points 的逐 shot 原始计数曲线。
- 仅记录未来可增加 `raw_shot_index` 与扁平 `raw_counts_flat` 的方向，本次不修改 Dataset 或 Plot 生成逻辑。
