# WorkBuddy Cloud SDK

通过 WorkBuddy 云服务的 `publicConfig` 访问 Auth、Database、Storage 和 LLM。

## WorkBuddy 账号登录（Web）

个人版 WorkBuddy 账号登录，两个调用点：按钮上发起、启动时处理回调。

```js
const cloud = createWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    oauthRelayBaseUrl: publicConfig.oauthRelayBaseUrl,
});

// 1) 用户点登录：SDK 只返回地址，由应用在**当前标签页**跳转。
const back = new URL(location.href);
back.pathname = '/';
// 保留业务参数和 hash，避免旧的 OAuth 参数与本次登录冲突。
for (const key of ['code', 'state', 'provider']) back.searchParams.delete(key);
const { data, error } = await cloud.auth.signInWithOAuth({
    provider: 'workbuddy',
    redirectTo: back.toString(),
});
if (data) location.assign(data.url);

// 2) 应用启动时无条件调用一次，且必须在登录守卫之前。
const cb = await cloud.auth.handleWorkBuddyCallback();
if (cb.data) {
    // 兑换成功，清掉 OAuth 参数但保留业务参数（如 sharecode）。
    const url = new URL(location.href);
    for (const k of ['code', 'state', 'provider']) url.searchParams.delete(k);
    history.replaceState(null, '', url);
}
```

`handleWorkBuddyCallback()` 返回 `{ data: null, error: null }` 表示这不是一次回调
（普通页面访问），不是失败。`cb.error` 要展示给用户并留在登录页，**不要**伪造会话。

几条硬约束：

- PKCE 证明存在当前标签页的 `sessionStorage`，所以必须同标签页跳转；另开标签页
  或新窗口打开 `data.url` 会导致回调页读不到证明。
- `redirectTo` 必须是应用已登记的 https 地址，且是能真正打开的路径；静态托管下
  子路径常见 404，一般用站点根地址。
- 应用不需要（也不应该）自己拼 `/.cloud/auth/**`、生成 `state` 或接触服务商
  client secret —— PKCE 与换票都由 SDK 和服务端完成。
- 昵称头像在 `session.user.name` / `session.user.avatarUrl`，登录、`getUser()` 与
  续期后都保持；上游原始字段仍在 `user.raw` 里。

## 微信小程序

在小程序项目的 `package.json` 所在目录安装依赖：

```sh
npm install @tencent-ai/workbuddy-cloud-sdk@dev
```

然后在微信开发者工具中执行「工具 → 构建 npm」，确认生成
`miniprogram_npm/@tencent-ai/workbuddy-cloud-sdk/miniprogram.js`，再点击「编译」。
仅写入 `package.json` 不会安装依赖；升级 SDK 后也需要重新构建 npm。

```js
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
});
```

SDK 通过 `package.json#miniprogram` 提供微信专用的 CommonJS `.js` 产物，
其中已打包运行时依赖。现有 Web / Node 的根入口和 `/miniprogram` 子入口保持不变。
WorkBuddy H5 预览会注入 SDK，预览成功不能替代微信项目的安装、构建 npm 验证。

### WorkBuddy 账号登录（原生小程序，#136265）

本节接口是 SDK 与 Genie BaaS 的配套契约。
SDK 直接跳转官方小程序，登录按钮不再先请求 BaaS 创建授权。
使用 `createMiniProgramWorkBuddyCloud` 初始化时，增加 BaaS 公开配置中的复合 OAuth client_id：

```js
const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
});
```

`workBuddyOAuthClientId` 是 `{开平 client_id}_{Genie BaaS 子应用ID}` 的完整值，
由 BaaS 按环境及应用下发；应用原样传入，不从 `publishableKey` 解析或自行拼接。
缺少此项时仅 WorkBuddy 登录返回配置错误，其他认证方式和云服务仍可使用。
官方小程序入口由 SDK 内部维护，应用登录时只提供自己的返回页面。
SDK 在发起登录时读取 `wx.getAccountInfoSync().miniProgram.envVersion`，通过授权页 query
`envVersion` 传递客户当前运行的 `develop` / `trial` / `release` 版本，供官方小程序回跳使用。
这是授权页地址参数；去程微信跳转参数仍为 `envVersion: 'release'`。
联调时仅在测试项目将去程版本覆盖为官方已提供的 `develop` 或 `trial`。

```js
// 登录按钮的点击处理；成功表示已跳转，还没有建立应用会话。
const started = await cloud.auth.signInWithWorkBuddyMiniProgram({
    redirectPath: 'pages/index/index',
});
if (started.error && started.error.code !== 'cancelled') {
    wx.showToast({ title: started.error.message, icon: 'none' });
}
```

```js
// app.js，与各页面共用同一个 cloud 实例。
App({
    onShow(options) {
        // 页面登录守卫应等待这个 Promise，避免换票完成前又显示登录页。
        this.authReady = cloud.auth.handleWorkBuddyMiniProgramCallback(options);
        this.authReady.then(({ error }) => {
            if (error) wx.showToast({ title: error.message, icon: 'none' });
        });
    },
});

// 页面 onShow 内：
await getApp().authReady;
const { data: session } = await cloud.auth.getSession();
// 用 session 渲染登录状态；数据库、存储等请求会自动携带会话。
```

`handleWorkBuddyMiniProgramCallback` 接收完整的 `App.onShow` 参数，读取
`referrerInfo.appId` 和 `referrerInfo.extraData`。普通启动、手动返回未携带结果、
已处理的重复回调返回 `{ data: null, error: null }`；授权成功返回会话。
SDK 不接管应用生命周期，不把普通返回当作取消。

- 成功回传：`extraData: { code, state, redirect_uri }`，其中 `redirect_uri` 是签发授权码时使用的完整 `wbmp://{appId}/{path}` 回调地址。
- 失败可由官方小程序在页面内展示，不要求回传；手动返回无结果时不建立新会话，
  应用可以恢复已有会话或由用户再次点击登录，不自动重新拉起授权。
- SDK 兼容可选错误回传 `{ state, error: 'access_denied', error_description? }`，
  收到 `error` 时不换票；用户取消微信跳转弹窗返回 `error.code: 'cancelled'`。
- SDK 使用 `wx.getRandomValues(32)` 生成随机 state，并存入按应用隔离的 wx storage，
  本地等待有效期为 10 分钟；客户端重建后仍可接回。
- SDK 校验来源 AppID、state 和有效期，兑换前消费本地 state，重复回调最多兑换一次。
  兑换失败后需重新发起登录。

### 原生登录流程与接口分工

```text
客户小程序 SDK
    │ 生成并保存 state，直接 wx.navigateToMiniProgram
    │ appId = wx907c65e5e107ddcf，envVersion = release
    │ path = subpackages/secondary/oauth-authorize/index
    │        ?client_id={复合ID}&redirect_uri={客户小程序路由}&state={state}&envVersion={客户运行版本}
    ▼
WorkBuddy 官方小程序【冠宇团队】
    │ 检查 WB 登录，调用 /workbuddyopen/v1/authorize/status、code、consent
    ▼
开平 → Genie BaaS 应用信息接口【rackey 侧】
    │ 入参不变，按子应用查可信绑定的微信 AppID，用 AppID + 返回路由生成 wbmp://{appId}/{path}
    │ 返回 mpLink，开平将其作为签发授权码的 redirect_uri
    ▼
开平签发 code → 官方小程序返回客户小程序
    │ 官方小程序解析 wbmp 协议的 AppID 和 path，直接跳回
    │ extraData = { code, state, redirect_uri }
    ▼
客户小程序 SDK
    │ 校验来源和 state，将 redirect_uri 原值放入 BaaS 的 shortlink 字段
    │ POST /.cloud/auth/v1/login-workbuddy-miniprogram { code, state, shortlink }
    ▼
Genie BaaS 后端
    │ POST /openapi/v2/token，使用签码时相同的 redirect_uri 和复合 client_id
    │ 复用用户映射，签发本应用会话
    ▼
SDK 保存会话，后续云请求自动携带身份
```

SDK 跳转的 `client_id`、`redirect_uri`、`state` 分别进行 URL 编码。`redirectPath` 可带业务查询参数，
传给官方小程序时是客户小程序路由；开平签码和 BaaS 换票使用的是 BaaS 应用信息接口
返回的 `mpLink`（`wbmp://{appId}/{path}`）。SDK 从官方小程序回传中读取 `redirect_uri`，
连同业务查询参数原样提交 BaaS 换票，不解析、重新编码或拼接该地址。
官方授权页的 query 参数名为 `client_id`。

### SDK ↔ BaaS 配套契约

BaaS 的 `publicConfig` 提供 `workBuddyOAuthClientId`，SDK 初始化时原样接收。
此配置只用于发起授权；服务端仍根据应用凭据及已登记绑定校验归属。

SDK 只调用 `POST /.cloud/auth/v1/login-workbuddy-miniprogram`，body 为
`{ "code": "...", "state": "...", "shortlink": "..." }`。请求沿用 `publicConfig.endpoint` 和
`x-wb-webapp-access-key`，不携带应用现有会话，也不携带 `code_verifier`。
为兼容已部署的 BaaS，body 字段保留 `shortlink`，其值取自 `extraData.redirect_uri`。

开平查询 BaaS 应用信息时转交返回路由，由 rackey 侧接口根据应用绑定生成 `mpLink`，
其中 AppID 来自可信绑定。官方小程序将该地址放入 `redirect_uri`，与 code、state 一并回传；
BaaS 检查应用登录开关和绑定后，使用回传的原始地址与复合 `client_id` 换票，
由开平校验其与签码时一致。

响应沿用现有格式：`{ access_token, refresh_token, expires_in, sub, name?, avatar_url? }`。
SDK 复用已有会话存储、续期和登录事件。开平 token、client secret 留在服务端。

发布顺序：BaaS 配置下发、应用信息查询和换票能力就绪后，发布 SDK 与配套 Skill，
重建体验版并完成真机授权往返验证。本地 mock 与候选包构建只验收 SDK 实现。
