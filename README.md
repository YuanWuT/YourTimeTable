# 你的课程表 · 跨设备同步说明（调试阶段）

当前目标只有一条：**这台电脑改完 `git push`，另一台电脑 `git clone` / `git pull` 后直接接着开发。**

正式上线才需要处理真实小程序 AppID、微信扫码绑定体验版、订阅消息模板等。调试阶段这些一律不用动。

## 一、两台电脑 clone 到同一个路径（重要）

仓库里的 `.wbapp_4PAcxfFnvI1BM8NLK5FI9m.genie` 应用卡带一个本机绝对路径：

```
localDir: D:\repository\Yourtimetable\app
```

**两台电脑都 clone 到同一路径**，这个文件就永远不会有冲突：

```powershell
git clone https://github.com/YuanWuT/YourTimeTable.git D:\repository\Yourtimetable
```

如果家里电脑必须用别的路径，clone 后把应用卡里的 `localDir` 改成实际路径，并让这个文件的本地改动不再参与同步（避免两台互相覆盖）：

```powershell
git update-index --skip-worktree .wbapp_4PAcxfFnvI1BM8NLK5FI9m.genie
```

## 二、日常两个动作

**办公室收工前**（在 `D:\repository\Yourtimetable` 目录下）：

```powershell
git add -A
git commit -m "说明这次改了什么"
git push
```

**家里开机后**：

```powershell
git pull
```

第一次用上面的 `git clone` 命令。之后用 WorkBuddy 打开 `D:\repository\Yourtimetable`，让 AI 先读 `.workbuddy/memory/` 里最新一天的文件，就能接着上次的上下文干活 —— 进度记忆是跟着代码一起入库的。

## 三、开箱即用，不需要装额外工具

- `app/node_modules`（SDK 源码）和 `app/miniprogram_npm`（小程序可加载的构建产物）都已入库，另一台 clone 后**不需要** `npm install`，也不需要微信开发者工具点「构建 npm」。
- 如果用微信开发者工具打开，导入的是 **`app` 子目录**（不是仓库根目录），因为 `project.config.json` 在 `app/` 里。
- 调试期 `project.config.json` 用的是 `touristappid`，WorkBuddy 的应用预览面板可直接看效果；官方 IDE 会拒绝 touristappid 工程，换成真实 AppID 后再用 IDE 做真机调试。

## 四、调试期的边界

**不用管**

- 真实小程序 AppID、微信扫码绑定体验版、订阅消息模板 ID。
- `app/utils/config.js` 里的 `publishableKey` / OAuth clientId —— 继续指向云应用 `wbapp_4PAcxfFnvI1BM8NLK5FI9m`，保持不变。

**要注意**

- 云数据库是 WorkBuddy 账号级资源，两台电脑用**同一个 WorkBuddy 账号**登录，才能看到同一份课表数据。
- 只同步这个仓库目录。不要把用户主目录下的 `~/.workbuddy`（会话数据库、登录态、设备 ID、绝对路径）丢进网盘做双向同步，两台同时写会分叉损坏。
- 若将来升级云 SDK，把 `app/node_modules/@tencent-ai/workbuddy-cloud-sdk/miniprogram_dist/miniprogram.js` 重新复制到 `app/miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js` 并提交。

## 五、正式上线前待办（现在不用做）

申请订阅消息模板并填 `SUBSCRIBE_TEMPLATE_IDS`、配置服务端定时推送、确认 `https://mp-api.app.workbuddy.host` 在 request 合法域名、绑定真实小程序 AppID 与微信、填写用户隐私保护指引。

## 六、云服务与应用身份（2026-11-12 核对，跨设备必读）

- 云服务已激活并复用，`applicationId` = `wbapp_4PAcxfFnvI1BM8NLK5FI9m`，状态 `billingStatus=normal` / `provisionStatus=assigned`。
- `app/utils/config.js` 的 `endpoint` / `publishableKey` / `workBuddyOAuthClientId` 与 `workbuddy_cloud_service` 返回的 `publicConfig` 逐项一致，**不要换成其他应用 ID**：换了会连到另一个空环境，已有课表读不到。
- 代码已接入 4 个模块：`cloud.auth`（微信登录 / 会话）、`cloud.database`（4 张用户隔离表）、`cloud.storage`（导入原始文件）、`cloud.llm`（拍照识别，优先 `glm-5.3-flash`）。`utils/cloud.js` 用 `/miniprogram` 子入口 + 诊断适配器，全局只初始化一次客户端。
- **预览/发布一律以仓库根目录的原应用卡为准**（`localDir` 指向 `app`）。跨设备新会话可能自动生成一张新卡；新卡的 applicationId 与代码配置不一致，云端登录与已有课表会取不到数据。将来发布时，调用发布工具必须显式传 `appId=wbapp_4PAcxfFnvI1BM8NLK5FI9m`，否则云登录的 Origin 校验会失败。
- 验证结果：4 张表 RLS 全开（16 条策略）；真实数据 app_settings 3 / courses 59 / periods 25 / imports 2；隔离写入一条验证记录后读回成功并已清理；3 个终端用户；模型目录含启用的 `glm-5.3-flash`（支持图像）；云存储 `users` / `shared` 目录就绪。
- 边界：H5 预览无法完成真实 `wx.login` 与 WorkBuddy 原生授权，也不能代替真机读写验证。登录后的读写、拍照识别、文件上传需在微信体验版/正式版实测。

## 七、课表显示与时间录入约定（2026-11-12 第三轮改版）

- **备注字数上限 20**：常量 `NOTE_MAX_LENGTH` 在 `app/utils/config.js`，四条路径统一使用 —— 编辑页 `maxlength` + 夹断、保存时夹断、`store.courseToRow` 写云端、`importer.normalizeCourse` 解析 Excel/拍照结果。改上限只改这一处。
- **展示字段**由 `schedule.styleCourse` 统一生成：`teacherText` / `noteText`（完整但已限长）、`chipExtraText`（老师 + 备注压成一行，用于窄格子）、`chipTimeText`（时间 + 单双周合并）。首页下一节课卡片、周视图、grid 页、当天课程抽屉、回收站都读这些字段，新增展示位置不要自己拼字符串。
- 窄格子固定 4 行（标题 / 时间+周次 / 地点 / 老师+备注），CSS 单行省略；加字段前先合并现有行，否则 136rpx 格子会溢出。
- **时间录入**改为 `multiSelector` 双列（24 小时 × 60 分钟），选中后由 `course-edit.js` 拼成 `HH:MM`，用户不再输入冒号。`timeState(form)` 负责同步 picker 位置与展示文本；选节次自动带入时间、手动改时间解除节次绑定这两条旧规则保持不变。
- 底部按钮文案为「保存」，成功提示为「已保存」。

## 八、家长多孩子 / 老师多班级（2026-11-16）

### 云数据库已做过一次性变更（两台电脑共用，不要重复执行）

同一个 `applicationId` 下只需一份 schema，另一台电脑 `git pull` 后直接可用：

- `app_settings` 新增 `children` / `classes` / `active_scope`（text，默认 `'[]'` / `'[]'` / `''`），以 JSON 字符串存孩子 / 班级配置。
- `courses` 新增 `scope_key`（text，默认 `''`），标记课程属于哪个孩子 / 班级；学生恒为 `''`。
- 唯一索引 `courses_active_no_duplicate_idx` 重建为 `(owner_id, role, scope_key, day_of_week, period_no, start_time, end_time, title, week_type) WHERE deleted = false`。**必须包含 `scope_key`**，否则不同班级同一时间上同一门课会被唯一约束拒绝。
- 新列对旧代码向后兼容：旧版本不写 `scope_key` 时走默认值 `''`。

### 代码入口与规则

- `app/utils/scopes.js`（纯函数）：配置解析 / 序列化、当前归属解析、旧数据认领、课程过滤 `belongsTo`、展示字段 `decorate`、切换选项 `optionsOf`（老师额外有 `all` = 全部班级）。
- `app/utils/store.js`：`listCourses` 自动按当前归属过滤（所有页面因此无需逐个传参）；`createCourse` / `createCoursesBatch` 写入 `scope_key`；`removeCoursesByScope` 在删除孩子 / 班级时把名下课程软删除进回收站；回收站 `listDeletedCourses` 保持按角色全局可见。
- `app/pages/scopes/scopes`：管理页（新增 / 编辑 / 删除，最多 20 个），已注册进 `app.json`。入口在课表页顶部胶囊底部弹层、「我的」页菜单、编辑页与录入页。
- **家长**：可添加多个孩子，备注名称 / 班级 / 学校 / 备注，切换孩子只看该孩子的课表；没有「全部孩子」选项。
- **老师**：可添加多个班级（班级名称 / 年级 / 任教科目 / 备注），可单班查看，也可选「全部班级」合并显示；合并视图里课程卡片与详情标出班级。
- **学生**：不显示任何归属控件，读写行为完全不变。
- **老数据兼容**：升级前录入的课程 `scope_key=''`，统一算在第一个孩子 / 班级名下，课表不会消失；删除第一个归属时这类老课程会一并移入回收站，避免「跳」到另一个孩子名下。
- 去重逻辑：`schedule.dedupeCourses` 现在同时比较 `scope_key`，不同班级的同名同时间课程会并列显示，不再被当成重复录入。

### 验证记录

本地静态校验（JS 语法 / JSON / WXML 标签与事件 / WXSS 花括号）+ 模拟微信运行时（归属切换、过滤、写入、导入、管理页）共 101 项全部通过；云端 DDL 与含 `scope_key` 的唯一索引已用真实数据库实测（插入两条同名同时间但不同归属的课程成功，测试记录已清理）。H5 预览仍无法完成真实 `wx.login` 与原生授权，登录后的多归属读写需在微信体验版 / 正式版实测。

### 第四轮微调（2026-11-16）

- **常驻管理入口**：课表页顶部归属胶囊右侧加「＋ 管理孩子 / 管理班级」，点击直达管理页并自动弹出添加表单（`/pages/scopes/scopes?action=add`）；录入页「导入到…」卡片右上角也加了管理链接。家长与老师走同一套代码，行为一致。
- **切换弹层偶发不出现的 BUG**：`index.loadAll()` 原来无条件写 `showScopePicker: false`，与 `onShow` 异步刷新 / 用户点击存在时序竞争，弹层会一闪消失。现在只在身份真的变化时收起弹层；弹层选项列表改为 flex 滚动，底部「管理 X · 添加 / 编辑 / 删除」入口始终可见；一个归属都没有时不再显示无意义的「全部班级」空选项，点胶囊直接进添加表单。
- **孩子性别**：配置新增 `gender`（`boy` / `girl`，存于 `children` JSON 内，**不需要改数据库表**）；`scopes.iconOf` 按性别返回 👦 / 👧 / 🧒，课表页胶囊、切换弹层、管理页列表、「我的」页菜单同步显示。管理页表单可再点一次取消选择；老数据没有该字段时回退中性头像。
- **文案与样式**：空状态标题改为「还未添加孩子信息 / 还未添加班级信息」，全文不再出现「还没有孩子」类表述；管理页弹层用 flex 让「取消 / 保存」文字水平垂直居中，表单区滚动、按钮不再被底部裁切。

### 第五轮：时间联动、节次直改与不匹配提示（2026-11-16 下午）

- **开始时间联动结束时间**：`course-edit.js` 的 `withValidEnd()` 在改开始时间后检查结束时间，若不再晚于开始时间就联动为「开始 + 45 分钟」并提示「结束时间已自动调整」；手动选结束时间出现同样问题也联动。不再出现 09:00–08:45 这类无效区间。
- **课表页直接改节次时间**：周视图左侧时间轴每行可点（带 ✎ 标记），弹出开始 / 结束 multiSelector，保存后经 `store.replacePeriods` 即时写云端并刷新课表；有相邻节次重叠校验。节次是全局设置，会影响所有身份 / 班级的课表落位，弹层里已写明。
- **时间不匹配提示与落位修复**：`utils/schedule.js` 新增 `unmatchedCourses()`，课表页顶部对「开始时间不在任何节次区间内」的课程显示横幅（标出班级 / 课程名 / 时间），点击直达节次设置页；保存课程时也会弹窗请用户确认是否去增加 / 调整节次。`slotIndexFor()` 在 `period_no` 对应节次与实际开始时间相差超过 45 分钟时按实际时间落位，不再硬塞进旧节次格。
- 根因记录：五年级二班「测试数学」17:00–18:00、`period_no=0`，现有节次最晚 15:40，之前被挤进第 6 节格子，用户误以为「全部班级」视图漏显另一班的课。数据层 `belongsTo` 在 `isAll` 时放行全部课程，本身没有丢数据。家长 / 老师 / 学生同样适用这套提示与修复。

### 第六轮：节次滑动选时、角色文案与模板随作息（2026-11-17）

- **课表设置页节次时间改滑动选择**：作息节次的开始 / 结束时间从手动填「HH:MM」改为跟课程编辑一致的「小时 / 分钟」两列 multiSelector；选完自动拼时间，改开始时间后若结束不再晚于开始会联动为「开始 + 45 分钟」并提示。写云端前剥离仅供界面使用的 `startParts`/`endParts`，保存后重新装饰。
- **「我的」页文案按角色显示**：当前身份的介绍改为 `roleIntro` 字段，家长只提「多个孩子」、老师只提「多个班级」，互不串词；「关于」段去掉「在云端」，「课表自动恢复」改为「换手机后登录可查看课表」。
- **老师添加班级弹层文案**：管理页编辑弹层顶部说明按 `isParent` 区分——家长显示「选男孩 / 女孩后课表页会显示对应头像」，老师显示「班级名称用于切换课表，年级、科目和备注只用于区分」，不再出现性别字样（性别选项本来也仅家长可见）。
- **Excel 模板跟随当前作息**：`utils/template.js` 的 `buildTemplateRows(format, periods)` 用真实节次生成模板时间段——矩阵模板第一列为全部节次的「开始-结束」，一行一节课模板示例时间取前一/二节；没有节次时回退内置示例。下载时 `import.js` 传入 `this.periods`，弹窗表头按格式显示，录入页顶部说明同步。
- 校验：JS/JSON/WXML/WXSS 静态 + 模拟微信运行时 37 项全通过（开始改 19:00→结束联动 19:45、合法区间不联动、结束选早联动、列变化、模板时间段用当前节次且不含写死示例、xlsx 明文含 17:00–18:00）。
