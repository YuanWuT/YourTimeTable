import { C as CloudModuleName, a as CloudAuthStorage } from './client-Cm8AjYu_.cjs';
export { A as AuthModule, b as AuthModuleOptions, c as AuthStateChangeCallback, d as AuthStateChangeEvent, e as ChatCompletion, f as ChatCompletionAssistantMessage, g as ChatCompletionChoice, h as ChatCompletionChunk, i as ChatCompletionChunkChoice, j as ChatCompletionChunkDelta, k as ChatCompletionChunkToolCall, l as ChatCompletionContentPart, m as ChatCompletionCreateParams, n as ChatCompletionCreateParamsStreaming, o as ChatCompletionMessage, p as ChatCompletionRequestMessage, q as ChatCompletionResponseFormat, r as ChatCompletionRole, s as ChatCompletionTool, t as ChatCompletionToolCall, u as ChatCompletionToolChoice, v as CloudAuthEvent, w as CloudAuthStateCallback, x as CloudError, y as CloudErrorKind, z as CloudOAuthProvider, B as CloudResult, D as CloudRuntimeConfig, E as CloudSession, F as CloudStorageCursorFolder, G as CloudStorageCursorListOptions, H as CloudStorageCursorObject, I as CloudStorageError, J as CloudStorageFile, K as CloudStorageFileBody, L as CloudStorageFileOptions, M as CloudStorageListOptions, N as CloudStorageListResult, O as CloudStorageMetadata, P as CloudStorageObjectInfo, Q as CloudStoragePathError, R as CloudStorageResult, S as CloudUser, T as CompletionUsage, U as DEFAULT_SIGNED_URL_TTL_SECONDS, V as LlmModule, W as MAX_SIGNED_URL_TTL_SECONDS, X as OAuthCredentials, Y as OAuthRedirect, Z as OAuthSignInOptions, _ as OAuthStartResult, $ as OtpChallenge, a0 as OtpCredentials, a1 as OtpSignInChallenge, a2 as OtpVerifyCredentials, a3 as PasswordCredentials, a4 as PasswordResetChallenge, a5 as PasswordResetUpdate, a6 as PhonePasswordCredentials, a7 as PublicLLMModel, a8 as PublicModelCapabilities, a9 as PublicModelModalities, aa as PublicModelPricing, ab as PublicModelReasoning, ac as RUNTIME_STORAGE_BUCKET, ad as ResetPasswordWithOldCredentials, ae as SignUpCredentials, af as VerifyOtpParams, ag as WorkBuddyCloudClient, ah as WorkBuddyCloudConfigError, ai as WorkBuddyCloudOptions, aj as WorkBuddyDatabaseModule, ak as WorkBuddyMiniProgramCallbackOptions, al as WorkBuddyMiniProgramSignInOptions, am as WorkBuddyStorageBucket, an as WorkBuddyStorageDownload, ao as WorkBuddyStorageModule, ap as createWorkBuddyCloud, aq as getModelCapability, ar as getModelDisplayName, as as shouldClearCredentials } from './client-Cm8AjYu_.cjs';

/**
 * CloudOpenAIError — OpenAI-style error for the LLM module (#89098).
 *
 * Shape follows the OpenAI error object:
 *   { error: { message, type, param?, code? } }
 * Plus Genie BaaS extensions: status?, requestId?, retryAfterMs?.
 *
 * Uses the formal package's existing error philosophy: a single typed error
 * class for LLM operations (consistent with how `CloudError` serves the other
 * three modules), while remaining OpenAI-compatible for ergonomic consumption.
 */
interface OpenAIErrorObject {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
}
interface CloudOpenAIErrorInit {
    /** HTTP response status code (undefined for in-stream errors). */
    status?: number;
    /** Server X-Request-Id header. */
    requestId?: string;
    /** Parsed Retry-After header in milliseconds. */
    retryAfterMs?: number;
    /** Underlying cause (e.g. original TypeError from fetch). */
    cause?: unknown;
}
/**
 * Error thrown by all LLM module operations.
 *
 * Both non-2xx HTTP responses and in-stream `event: error` events produce
 * this error. The `error` field always follows the OpenAI error object shape.
 */
declare class CloudOpenAIError extends Error {
    readonly error: OpenAIErrorObject;
    readonly status?: number;
    readonly requestId?: string;
    readonly retryAfterMs?: number;
    constructor(error: OpenAIErrorObject | string, init?: CloudOpenAIErrorInit);
}

/**
 * 数据面路径前缀（骨架，#89098）
 *
 * 取值来自设计文档 §5.0 / §6.0 的路径白名单，与 skill 的 “How an App Talks to It”
 * 表格一致。**写死为常量表，不做通用拼接** —— 网关侧同样是常量映射，两边必须对齐。
 */

/** 所有数据面路径的公共前缀。 */
declare const CLOUD_PATH_PREFIX = "/.cloud";
/**
 * 模块 → 数据面路径前缀。
 *
 * 网关剥掉 `/.cloud/{模块}` 后还原为 TCB 原路径（auth→`/auth/**`、
 * database→`/v1/rdb/rest/**`、storage→`/v1/storages/**`），该映射是服务端职责，
 * SDK 不感知，也不要在这里镜像。
 */
declare const CLOUD_MODULE_PATHS: Readonly<Record<CloudModuleName, string>>;

/**
 * 会话持久化（#89098）
 *
 * ---------------------------------------------------------------------------
 * localStorage 是**唯一真源**，内存里不留副本
 * ---------------------------------------------------------------------------
 *
 * 每次取 session 都重读 localStorage，承担一次同步读的开销，换「绝不读到脏值」。
 *
 * 为什么不能缓存在内存里：凭据存 localStorage，那么「另一个标签页登出了」
 * 或「另一个标签页刚把刷新句柄轮换了」这类事件，只有重读才能发现。任何长期
 * 驻留的内存副本都会变脏，而变脏的后果不是「多一次 401」——我方句柄一旦轮换
 * 旧的立即失效，拿着脏句柄去续期会把会话彻底弄坏（见 session-manager.ts）。
 *
 * 两家 BaaS SDK 都是这个结论：CloudBase 的 LocalCredentials 注释直接写了
 * 「storage 为凭证的唯一可信来源」；supabase 的 GoTrueClient 每次
 * `__loadSession` 都重读 storage。
 */

/** 内存实现，供测试与无 localStorage 的运行时使用。 */
declare function createMemoryStorage(): CloudAuthStorage;

/**
 * 单一 I/O 出口（骨架，#89098）
 *
 * 四个模块**共用这一个 fetch**。publishableKey 注入、自签 session 注入、超时策略
 * 都只在这里实现一次 —— 任何模块自己拼 fetch 都是架构错误：
 * 会长出多套鉴权发送方式，而 §5.2 对此有唯一规定。
 *
 * 契约来源：`services/cmd/agentserver/docs/genie-baas/genie-baas-phase1-design.md` §5.2 / §6.0
 */

/**
 * publishableKey 的请求头形态。
 *
 * §5.2 规定服务端同时接受两种发送方式：`clientId` 位置（TCB 语义，body/query）
 * 与本头部。SDK 统一走头部 —— 它对 GET/POST 一致，不需要按方法改写 body。
 *
 * 头名用 genie-baas 自己的品牌（`x-wb-webapp-access-key`）而非 TCB 的
 * `x-cloudbase-access-key`：genie-baas 在服务端做了凭据换签，浏览器端根本
 * 不直接对话 CloudBase，暴露 cloudbase 品牌名没有意义、也泄漏底层实现。
 * 服务端 gateway 认这个新头（见 dataplane_proxy.go 的 accessKeyHeader）。
 */
declare const PUBLISHABLE_KEY_HEADER = "x-wb-webapp-access-key";
/**
 * 已登录终端用户的自签 session token 提供者。
 *
 * 返回 undefined 表示未登录 —— 此时按匿名身份转发（§6.1），**不是错误**。
 * 用函数而非固定值：登录/登出/刷新后无需重建 client，database、storage
 * 自动带上最新身份。
 *
 * ---------------------------------------------------------------------------
 * 为什么是异步（这一点不是可选的）
 *
 * 因为「取 token」这个动作**可能要先发一次网络请求** —— token 已过期或临近
 * 过期时必须先续期再发业务请求。同步签名下做不到这件事：
 *
 *  - 同步 XHR 发续期请求：浏览器已废弃，且阻塞主线程。
 *  - 只靠后台定时器续期、provider 同步读缓存：**会漏**。后台标签页的
 *    setInterval 被节流到分钟级，笔记本休眠唤醒后 token 早已过期。
 *    定时器只能算优化，请求前检查才是正确性底线。
 *  - 返回过期 token、靠 401 重试：见 AuthModule 里关于句柄轮换的说明 ——
 *    我方句柄一旦轮换旧的立即失效，N 个并发 401 各自去刷会把会话弄坏。
 *
 * 改异步对 vendor 完全无感：它只知道自己拿到一个返回 Promise 的 fetch
 * （`src/vendor/postgrest/PostgrestBuilder.ts` 里是 `await _fetch(...)`）。
 * ---------------------------------------------------------------------------
 */
type SessionTokenProvider = () => Promise<string | undefined>;
/** 恒定匿名的 provider，供 auth 模块自身使用（见 createCloudFetch 的死锁说明）。 */
declare const anonymousTokenProvider: SessionTokenProvider;

export { CLOUD_MODULE_PATHS, CLOUD_PATH_PREFIX, CloudAuthStorage, CloudModuleName, CloudOpenAIError, type CloudOpenAIErrorInit, type OpenAIErrorObject, PUBLISHABLE_KEY_HEADER, type SessionTokenProvider, anonymousTokenProvider, createMemoryStorage };
