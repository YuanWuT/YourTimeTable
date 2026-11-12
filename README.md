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
