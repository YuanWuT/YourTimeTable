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
