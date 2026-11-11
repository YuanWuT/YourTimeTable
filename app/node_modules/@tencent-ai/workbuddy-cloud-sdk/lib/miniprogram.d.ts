import { B as CloudResult, x as CloudError, a as CloudAuthStorage, ag as WorkBuddyCloudClient } from './client-Cm8AjYu_.js';
export { ak as WorkBuddyMiniProgramCallbackOptions, al as WorkBuddyMiniProgramSignInOptions } from './client-Cm8AjYu_.js';

/**
 * 微信小程序宿主 API 的最小占位类型（WIP，非官方 @types/miniprogram）。
 *
 * ⚠️ 占位说明：这里只声明本适配层实际用到的字段/方法，不是完整的小程序
 * 宿主类型。等接入方（专家版本以外、小白版本的发布沙盒）实际跑通真机
 * 联调后，应该换成官方 `miniprogram-api-typings` 或联调中发现的真实字段
 * 补齐，而不是长期依赖这份手写占位。
 */
/** `wx.request` 成功回调收到的响应形状（按官方文档字段命名）。 */
interface WxRequestSuccessResult {
    data: string | ArrayBuffer | Record<string, unknown>;
    statusCode: number;
    header: Record<string, string>;
}
/** `wx.request` 失败回调收到的错误形状。 */
interface WxRequestFailResult {
    errMsg: string;
}
/** 分块传输时 `onChunkReceived` 收到的单个 chunk。 */
interface WxChunkReceivedResult {
    data: ArrayBuffer;
}
/**
 * `onHeadersReceived` 收到的响应头事件形状。
 *
 * ⚠️ 占位说明：微信官方文档只保证这个事件带 `header`，不带 `statusCode`——
 * 分块响应的真实状态码只能等 `success`/`fail` 在流结束时才能拿到（见
 * `fetch.ts` 顶部注释），这里提前拿到的只是 header，用于避免首个 chunk
 * resolve 时 headers 硬编码成 `{}`。
 */
interface WxHeadersReceivedResult {
    header: Record<string, string>;
}
interface WxRequestTask {
    abort(): void;
    onChunkReceived(callback: (result: WxChunkReceivedResult) => void): void;
    offChunkReceived?(callback: (result: WxChunkReceivedResult) => void): void;
    onHeadersReceived?(callback: (result: WxHeadersReceivedResult) => void): void;
}
interface WxRequestVirtualPaymentSuccessResult {
    errMsg: string;
    [key: string]: unknown;
}
interface WxRequestVirtualPaymentFailResult {
    errMsg: string;
    errCode?: number | string;
    [key: string]: unknown;
}
type WxRequestVirtualPaymentCompleteResult = WxRequestVirtualPaymentSuccessResult | WxRequestVirtualPaymentFailResult;
type WxRequestVirtualPaymentEnv = 0 | 1;
/** 官方 `mode` 合法值：道具直购 / 代币充值。 */
type WxRequestVirtualPaymentMode = 'short_series_goods' | 'short_series_coin';
/**
 * `wx.requestVirtualPayment` 的入参（按官方文档字段命名）。
 *
 * 官方只接受 4 个支付参数，且**全部必填**：`signData`（必须以 JSON 字符串传递）、
 * `paySig`、`signature`、`mode`。`offerId` / `buyQuantity` / `currencyType` /
 * `productId` / `goodsPrice` / `outTradeNo` / `attach` 都在 `signData` 里，
 * 不是顶层字段；顶层多传会被忽略，写成顶层字段则一定报 `-15001 参数错误`。
 */
interface WxRequestVirtualPaymentOptions {
    /** 服务端下发的 signData 原文（JSON 字符串，不能被客户端改写）。 */
    signData: string;
    paySig: string;
    signature: string;
    mode: WxRequestVirtualPaymentMode;
    success?(result: WxRequestVirtualPaymentSuccessResult): void;
    fail?(result: WxRequestVirtualPaymentFailResult): void;
    complete?(result: WxRequestVirtualPaymentCompleteResult): void;
}
interface WxRequestOptions {
    url: string;
    method?: string;
    header?: Record<string, string>;
    data?: string | ArrayBuffer | Record<string, unknown>;
    /**
     * TODO(占位)：官方字段名是 `enableChunked`，2023 年后基础库才支持，
     * 具体最低基础库版本号未核实，接入时需要在目标基础库版本上验证。
     */
    enableChunked?: boolean;
    responseType?: 'text' | 'arraybuffer';
    success?(result: WxRequestSuccessResult): void;
    fail?(result: WxRequestFailResult): void;
    complete?(): void;
}
/** 本适配层依赖的 `wx` 全局对象最小子集。 */
interface MiniProgramWxLike {
    request(options: WxRequestOptions): WxRequestTask;
    requestVirtualPayment?(options: WxRequestVirtualPaymentOptions): void;
    getAccountInfoSync?(): {
        miniProgram: {
            appId: string;
            envVersion: 'develop' | 'trial' | 'release';
        };
    };
    getRandomValues?(options: {
        length: number;
        success?(result: {
            randomValues: ArrayBuffer;
        }): void;
        fail?(result: {
            errMsg: string;
        }): void;
    }): void;
    navigateToMiniProgram?(options: {
        appId: string;
        path?: string;
        envVersion?: 'develop' | 'trial' | 'release';
        extraData?: Record<string, unknown>;
        success?(): void;
        fail?(result: {
            errMsg: string;
        }): void;
    }): void;
    getStorageSync(key: string): unknown;
    setStorageSync(key: string, value: unknown): void;
    removeStorageSync(key: string): void;
}

type WechatVirtualEnv = 0 | 1;
interface WechatVirtualBusinessBodyField {
    key: string;
    value: unknown;
}
type WechatVirtualBusinessBody = readonly WechatVirtualBusinessBodyField[];
type WechatVirtualPayload = Record<string, unknown>;
type WechatVirtualResponse = object | null;
interface WechatVirtualRequestInvoker {
    post<TResponse extends WechatVirtualResponse>(path: string, body: WechatVirtualPayload): Promise<CloudResult<TResponse>>;
}
type WechatVirtualPermissionCategory = 'permission-denied' | 'reauthorization-required';
interface WechatVirtualPermissionResolution {
    category: WechatVirtualPermissionCategory;
    reasonCode?: string;
    missingScopeIds: number[];
}
declare function resolveWechatVirtualPermission(error: CloudError): WechatVirtualPermissionResolution | null;
declare function isWechatVirtualReauthorizationRequired(error: CloudError): boolean;

interface WechatVirtualAdvertisingFundsQueryTransferAccountRequest {
    env: WechatVirtualEnv;
}
interface WechatVirtualAdvertisingFundsBindTransferAccountRequest {
    env: WechatVirtualEnv;
    transferAccountUid: string;
    transferAccountOrgName?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualAdvertisingFundsCreateFundsBillRequest {
    env: WechatVirtualEnv;
    transferAccountUid: string;
    transferAmount?: number;
    transferAccountName?: string;
    transferAccountAgencyId?: string;
    requestId?: string;
    settleBegin?: string;
    settleEnd?: string;
    authorizeAdvertise?: string;
    fundType?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualAdvertisingFundsQueryAdvertisingFundsFilter {
    settleBegin?: string;
    settleEnd?: string;
    fundType?: string;
}
interface WechatVirtualAdvertisingFundsQueryAdvertisingFundsRequest {
    env: WechatVirtualEnv;
    page?: number;
    pageSize?: number;
    filter?: WechatVirtualAdvertisingFundsQueryAdvertisingFundsFilter;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualAdvertisingFundsQueryFundsBillFilter {
    operTimeBegin?: string;
    operTimeEnd?: string;
    billId?: string;
    requestId?: string;
}
interface WechatVirtualAdvertisingFundsQueryFundsBillRequest {
    env: WechatVirtualEnv;
    page?: number;
    pageSize?: number;
    billId?: string;
    requestId?: string;
    operTimeBegin?: string;
    operTimeEnd?: string;
    filter?: WechatVirtualAdvertisingFundsQueryFundsBillFilter;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualAdvertisingFundsQueryRecoverBillFilter {
    recoverTimeBegin?: string;
    recoverTimeEnd?: string;
    billId?: string;
}
interface WechatVirtualAdvertisingFundsQueryRecoverBillRequest {
    env: WechatVirtualEnv;
    page?: number;
    pageSize?: number;
    billId?: string;
    recoverTimeBegin?: string;
    recoverTimeEnd?: string;
    filter?: WechatVirtualAdvertisingFundsQueryRecoverBillFilter;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualAdvertisingFundsDownloadOrderRequest {
    env: WechatVirtualEnv;
    fundId: string;
    body?: WechatVirtualBusinessBody;
}
declare class WechatVirtualAdvertisingFundsAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    queryTransferAccount(input: WechatVirtualAdvertisingFundsQueryTransferAccountRequest): Promise<CloudResult<WechatVirtualResponse>>;
    bindTransferAccount(input: WechatVirtualAdvertisingFundsBindTransferAccountRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createFundsBill(input: WechatVirtualAdvertisingFundsCreateFundsBillRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryAdvertisingFunds(input: WechatVirtualAdvertisingFundsQueryAdvertisingFundsRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryFundsBill(input: WechatVirtualAdvertisingFundsQueryFundsBillRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryRecoverBill(input: WechatVirtualAdvertisingFundsQueryRecoverBillRequest): Promise<CloudResult<WechatVirtualResponse>>;
    downloadAdvertisingFundsOrder(input: WechatVirtualAdvertisingFundsDownloadOrderRequest): Promise<CloudResult<WechatVirtualResponse>>;
}

interface WechatVirtualComplaintsQueryRequest {
    env: WechatVirtualEnv;
    beginDate?: string;
    endDate?: string;
    offset?: number;
    limit?: number;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsGetDetailRequest {
    env: WechatVirtualEnv;
    complaintId: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsQueryNegotiationsRequest {
    env: WechatVirtualEnv;
    complaintId: string;
    offset?: number;
    limit?: number;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsUploadFileRequest {
    env: WechatVirtualEnv;
    base64Img?: string;
    imgUrl?: string;
    fileName: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsGetUploadFileSignRequest {
    env: WechatVirtualEnv;
    wxpayUrl: string;
    convertCos?: boolean;
    complaintId?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsRespondRequest {
    env: WechatVirtualEnv;
    complaintId: string;
    responseContent: string;
    responseImages?: string[];
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualComplaintsCompleteRequest {
    env: WechatVirtualEnv;
    complaintId: string;
    body?: WechatVirtualBusinessBody;
}
declare class WechatVirtualComplaintsAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    query(input: WechatVirtualComplaintsQueryRequest): Promise<CloudResult<WechatVirtualResponse>>;
    getDetail(input: WechatVirtualComplaintsGetDetailRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryNegotiations(input: WechatVirtualComplaintsQueryNegotiationsRequest): Promise<CloudResult<WechatVirtualResponse>>;
    uploadFile(input: WechatVirtualComplaintsUploadFileRequest): Promise<CloudResult<WechatVirtualResponse>>;
    getUploadFileSign(input: WechatVirtualComplaintsGetUploadFileSignRequest): Promise<CloudResult<WechatVirtualResponse>>;
    respond(input: WechatVirtualComplaintsRespondRequest): Promise<CloudResult<WechatVirtualResponse>>;
    complete(input: WechatVirtualComplaintsCompleteRequest): Promise<CloudResult<WechatVirtualResponse>>;
    private postWithComplaintID;
}

interface WechatVirtualGoodsStartUploadRequest {
    env: WechatVirtualEnv;
    id: string;
    name: string;
    price: number;
    /**
     * 道具图片，**二选一**（与 `imageBase64` 互斥，且必须有一个）：
     * - `itemUrl`：外部已可被微信下载的图片地址。必须是公网直链、微信能下载到
     *   （海外图床/webp 等会被判「图片下载失败」）
     * - `imageBase64`：图片字节的标准 base64。服务端校验后托管到平台公网 COS，
     *   以公网 URL 作为 `item_url`
     *
     * 两条路径都由服务端按**微信侧同一套要求**校验，不满足即 `18300`：
     * 格式 PNG/JPG、**恰好 200×200**、**小于 200KB**。
     * 微信是自己去下载 `item_url`，不要求图片先进微信域名。
     */
    itemUrl?: string;
    imageBase64?: string;
    /**
     * 道具描述。**官方必填**，缺省会被服务端拒（`18300`）。
     */
    remark: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualGoodsQueryUploadTaskRequest {
    env: WechatVirtualEnv;
}
interface WechatVirtualGoodsStartPublishRequest {
    env: WechatVirtualEnv;
    id: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualGoodsQueryPublishTaskRequest {
    env: WechatVirtualEnv;
}
declare class WechatVirtualGoodsAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    startUpload(input: WechatVirtualGoodsStartUploadRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryUploadTask(input: WechatVirtualGoodsQueryUploadTaskRequest): Promise<CloudResult<WechatVirtualResponse>>;
    startPublish(input: WechatVirtualGoodsStartPublishRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryPublishTask(input: WechatVirtualGoodsQueryPublishTaskRequest): Promise<CloudResult<WechatVirtualResponse>>;
    private postWithEnvOnly;
}

interface WechatVirtualMerchantFinanceQueryBalanceRequest {
    env: WechatVirtualEnv;
}
interface WechatVirtualMerchantFinanceCreateWithdrawalRequest {
    env: WechatVirtualEnv;
    withdrawNo: string;
    withdrawAmount?: number;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualMerchantFinanceQueryWithdrawalRequest {
    env: WechatVirtualEnv;
    withdrawNo: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualMerchantFinanceCreateOrderDownloadRequest {
    env: WechatVirtualEnv;
    beginDs: string;
    endDs: string;
    orderType?: string;
    orderInfo?: string;
    isProvided?: boolean | number;
    refundStatus?: string;
    payChannel?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualMerchantFinanceQueryOrderDownloadRequest {
    env: WechatVirtualEnv;
    taskId: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualMerchantFinanceDownloadBillRequest {
    env: WechatVirtualEnv;
    beginDs: string;
    endDs: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualMerchantFinanceDownloadIOSSettlementBillRequest {
    env: WechatVirtualEnv;
    startMonth: string;
    endMonth: string;
    body?: WechatVirtualBusinessBody;
}
declare class WechatVirtualMerchantFinanceAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    queryBalance(input: WechatVirtualMerchantFinanceQueryBalanceRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createWithdrawal(input: WechatVirtualMerchantFinanceCreateWithdrawalRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryWithdrawal(input: WechatVirtualMerchantFinanceQueryWithdrawalRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createOrderDownload(input: WechatVirtualMerchantFinanceCreateOrderDownloadRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryOrderDownload(input: WechatVirtualMerchantFinanceQueryOrderDownloadRequest): Promise<CloudResult<WechatVirtualResponse>>;
    downloadBill(input: WechatVirtualMerchantFinanceDownloadBillRequest): Promise<CloudResult<WechatVirtualResponse>>;
    downloadIOSSettlementBill(input: WechatVirtualMerchantFinanceDownloadIOSSettlementBillRequest): Promise<CloudResult<WechatVirtualResponse>>;
}

interface WechatVirtualMerchantRiskQueryPunishmentReasonsRequest {
    env: WechatVirtualEnv;
}
declare class WechatVirtualMerchantRiskAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    queryPunishmentReasons(input: WechatVirtualMerchantRiskQueryPunishmentReasonsRequest): Promise<CloudResult<WechatVirtualResponse>>;
}

interface WechatVirtualPaymentSignRequest {
    code: string;
    productId: string;
    goodsPrice: number;
    buyQuantity: number;
    outTradeNo: string;
    env: WechatVirtualEnv;
    attach?: string;
}
/**
 * `sign` 的返回体 = 服务端 `WechatVirtualPaymentSignOutput` 的真实形状。
 *
 * `signData` 是**服务端构造并签名过的 JSON 字符串**（paySig 就是对这段原文做的 HMAC），
 * 客户端必须原样透传给 `wx.requestVirtualPayment`，不能解析后重组。
 */
interface WechatVirtualPaymentSignResponse {
    signData: string;
    paySig: string;
    signature: string;
    offerId: string;
    env: WechatVirtualEnv;
}
/**
 * `requestVirtualPayment` 的入参：直接吃 `sign` 的返回体即可。
 *
 * `mode` 官方必填；这里按最常见的「道具直购」缺省，代币充值显式传
 * `short_series_coin`。其余字段全部来自 signData，不要额外补。
 */
interface WechatVirtualPaymentRequestPaymentOptions extends WechatVirtualPaymentSignResponse {
    mode?: WxRequestVirtualPaymentMode;
    success?(result: WxRequestVirtualPaymentSuccessResult): void;
    fail?(result: WxRequestVirtualPaymentFailResult): void;
    complete?(result: WxRequestVirtualPaymentCompleteResult): void;
}
interface WechatVirtualPaymentQueryOrderRequest {
    env: WechatVirtualEnv;
    orderId?: string;
    wxOrderId?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualPaymentCreateRefundRequest {
    env: WechatVirtualEnv;
    orderId?: string;
    wxOrderId?: string;
    refundOrderId?: string;
    /**
     * 订单剩余可退金额（分）。**留空即可**：服务端会先调 `/xpay/query_order`
     * 取 `order.left_fee` 注入，调用方自己算容易和微信侧不一致。
     */
    leftFee?: number;
    refundFee?: number;
    bizMeta?: unknown;
    /** 官方枚举 0~5。 */
    refundReason?: number;
    /** 官方枚举 1~3。 */
    reqFrom?: number;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualPaymentQueryRefundRequest {
    env: WechatVirtualEnv;
    /**
     * 退款单号。**不能单独作为查询键**：微信 `/xpay/query_order` 只认
     * `order_id` / `wx_order_id`，单传 `refund_order_id` 会被拒（实测
     * `268490002 order_id/wx_order_id字段为空`）。这里只作为附加字段透传。
     */
    refundOrderId?: string;
    /** 业务订单号；与 `wxOrderId` 至少传一个。 */
    orderId?: string;
    /** 微信订单号；与 `orderId` 至少传一个。 */
    wxOrderId?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualPaymentNotifyProvideGoodsRequest {
    env: WechatVirtualEnv;
    orderId?: string;
    wxOrderId?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualPaymentModule {
    sign(input: WechatVirtualPaymentSignRequest): Promise<CloudResult<WechatVirtualPaymentSignResponse>>;
    requestVirtualPayment(input: WechatVirtualPaymentRequestPaymentOptions): Promise<WxRequestVirtualPaymentSuccessResult>;
    queryOrder(input: WechatVirtualPaymentQueryOrderRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createRefund(input: WechatVirtualPaymentCreateRefundRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryRefund(input: WechatVirtualPaymentQueryRefundRequest): Promise<CloudResult<WechatVirtualResponse>>;
    notifyProvideGoods(input: WechatVirtualPaymentNotifyProvideGoodsRequest): Promise<CloudResult<WechatVirtualResponse>>;
}
declare class WechatVirtualPaymentAPI implements WechatVirtualPaymentModule {
    private readonly invoker;
    private readonly wx;
    constructor(invoker: WechatVirtualRequestInvoker, wx: MiniProgramWxLike);
    sign(input: WechatVirtualPaymentSignRequest): Promise<CloudResult<WechatVirtualPaymentSignResponse>>;
    queryOrder(input: WechatVirtualPaymentQueryOrderRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createRefund(input: WechatVirtualPaymentCreateRefundRequest): Promise<CloudResult<WechatVirtualResponse>>;
    queryRefund(input: WechatVirtualPaymentQueryRefundRequest): Promise<CloudResult<WechatVirtualResponse>>;
    notifyProvideGoods(input: WechatVirtualPaymentNotifyProvideGoodsRequest): Promise<CloudResult<WechatVirtualResponse>>;
    requestVirtualPayment(input: WechatVirtualPaymentRequestPaymentOptions): Promise<WxRequestVirtualPaymentSuccessResult>;
}

interface WechatVirtualSubscriptionsQueryContractRequest {
    env: WechatVirtualEnv;
    outContractCode: string;
    productId?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualSubscriptionsSendPrePaymentNoticeRequest {
    env: WechatVirtualEnv;
    outContractCode: string;
    productId?: string;
    deductPrice?: number;
    body?: WechatVirtualBusinessBody;
}
/**
 * 官方 submit_subscribe_pay_order 请求体：openid、offer_id、buy_quantity、currency_type、
 * product_id、deduct_price、order_id、attach、env。
 *
 * 其中 `openid` 与 `offer_id` 均由**服务端注入**（数据面拒绝客户端提交这两个字段），
 * 调用方不要传。本接口**不含** out_contract_code（那是签约相关接口的字段）。
 */
interface WechatVirtualSubscriptionsSubmitPaymentOrderRequest {
    env: WechatVirtualEnv;
    productId: string;
    orderId: string;
    buyQuantity?: number;
    currencyType?: string;
    deductPrice?: number;
    attach?: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualSubscriptionsCancelContractRequest {
    env: WechatVirtualEnv;
    outContractCode: string;
    productId?: string;
    terminationReason?: string;
    body?: WechatVirtualBusinessBody;
}
declare class WechatVirtualSubscriptionsAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    queryContract(input: WechatVirtualSubscriptionsQueryContractRequest): Promise<CloudResult<WechatVirtualResponse>>;
    sendPrePaymentNotice(input: WechatVirtualSubscriptionsSendPrePaymentNoticeRequest): Promise<CloudResult<WechatVirtualResponse>>;
    submitPaymentOrder(input: WechatVirtualSubscriptionsSubmitPaymentOrderRequest): Promise<CloudResult<WechatVirtualResponse>>;
    cancelContract(input: WechatVirtualSubscriptionsCancelContractRequest): Promise<CloudResult<WechatVirtualResponse>>;
    private postWithContractReference;
}

interface WechatVirtualTokensQueryBalanceRequest {
    env: WechatVirtualEnv;
    code: string;
}
interface WechatVirtualTokensPayRequest {
    env: WechatVirtualEnv;
    code: string;
    body?: WechatVirtualBusinessBody;
}
interface WechatVirtualTokensCreateRefundRequest {
    env: WechatVirtualEnv;
    code: string;
    body?: WechatVirtualBusinessBody;
}
/**
 * 代币赠送（官方 `present_currency`）。
 *
 * 与另外三个代币接口不同，它**不需要 `code`**：官方该接口是商家侧赠送动作，
 * 查询参数只有 `access_token`（没有用户态 `signature`、也没有 `pay_sig`），
 * 请求体也没有 `user_ip`。服务端对应地不对这个路径要求 `code`、不注入 `user_ip`。
 */
interface WechatVirtualTokensPresentRequest {
    env: WechatVirtualEnv;
    body?: WechatVirtualBusinessBody;
}
declare class WechatVirtualTokensAPI {
    private readonly invoker;
    constructor(invoker: WechatVirtualRequestInvoker);
    queryBalance(input: WechatVirtualTokensQueryBalanceRequest): Promise<CloudResult<WechatVirtualResponse>>;
    pay(input: WechatVirtualTokensPayRequest): Promise<CloudResult<WechatVirtualResponse>>;
    createRefund(input: WechatVirtualTokensCreateRefundRequest): Promise<CloudResult<WechatVirtualResponse>>;
    present(input: WechatVirtualTokensPresentRequest): Promise<CloudResult<WechatVirtualResponse>>;
    private postWithCode;
    /**
     * 不带 `code` 的代币调用（目前只有 `present`）。
     *
     * 官方 `present_currency` 没有用户态上下文，服务端也不要求 `code`；这里保持同一
     * 契约，避免调用方被迫传一个会被服务端丢掉的 `wx.login` code。
     */
    private postWithoutCode;
}

interface MiniProgramWechatVirtualModules {
    readonly wechatVirtualPayment: WechatVirtualPaymentAPI;
    readonly wechatVirtualGoods: WechatVirtualGoodsAPI;
    readonly wechatVirtualTokens: WechatVirtualTokensAPI;
    readonly wechatVirtualMerchantFinance: WechatVirtualMerchantFinanceAPI;
    readonly wechatVirtualComplaints: WechatVirtualComplaintsAPI;
    readonly wechatVirtualAdvertisingFunds: WechatVirtualAdvertisingFundsAPI;
    readonly wechatVirtualSubscriptions: WechatVirtualSubscriptionsAPI;
    readonly wechatVirtualMerchantRisk: WechatVirtualMerchantRiskAPI;
}

/**
 * 小程序 `fetch` 适配（对应核心 SDK `types.ts` 里
 * `WorkBuddyCloudOptions.fetch` 的注入口子）。
 *
 * 用 `wx.request` 实现四模块共用的单一出口（`src/http/fetch.ts`
 * `createCloudFetch` 包出来的那个 fetch）。区分两种模式：
 *
 *  - 普通请求：`wx.request` 一次性拿到完整响应体。
 *  - 流式请求（LLM chat streaming，识别标志是请求头
 *    `Accept: text/event-stream`，见 `modules/llm/chat.ts:122`）：
 *    `enableChunked: true` + `onChunkReceived`，把收到的 chunk 喂进
 *    `polyfills.ts` 里的占位 `ReadableStream`，这样下游
 *    `iterSSEEvents`（`modules/llm/sse.ts`）完全不用改。
 */

/**
 * 创建小程序版 fetch，可直接传给 `WorkBuddyCloudOptions.fetch`。
 *
 * @param wxInstance 默认取全局 `wx`；传参主要用于单测注入 mock。
 */
declare function createMiniProgramFetch(wxInstance?: MiniProgramWxLike): typeof globalThis.fetch;

/**
 * 小程序 `CloudAuthStorage` 适配（对应核心 SDK `types.ts` 的
 * "非浏览器运行时（Node、小程序）里没有 localStorage" 那条注释）。
 */

/**
 * 用 `wx.getStorageSync`/`setStorageSync`/`removeStorageSync` 实现 `CloudAuthStorage`。
 *
 * ⚠️ 占位说明：小程序同步存储 API 在容量超限或用户拒绝授权等场景可能抛异常，
 * 这里按"存储不可用时静默降级、不阻塞登录态读写"的策略吞掉异常并打印
 * warning——具体降级策略（是否应该报错给上层）留给接入方按真机表现调整，
 * 现在只是先跑通不炸。
 */
declare function createMiniProgramStorage(wxInstance?: MiniProgramWxLike): CloudAuthStorage;

/**
 * 小程序运行时缺失的 Web API 最小占位实现（WIP）。
 *
 * 背景：核心 SDK（`src/http/fetch.ts` 的 `createCloudFetch`）直接 `new Headers(...)`，
 * 不是通过注入口子拿到的 —— 这是核心 SDK 对"浏览器环境"的一处硬依赖，不是本
 * 适配层能绕开的。因此本模块在小程序里补一份全局 `Headers`；`ReadableStream`
 * 同理，`iterSSEEvents`（`modules/llm/sse.ts`）直接调 `body.getReader()`。
 *
 * ⚠️ 占位说明：以下两个类都只实现了 SDK 自己会用到的方法子集，不是 spec 完整
 * 实现（例如 `MiniProgramReadableStream` 不支持 tee/pipeTo，也不是真正的
 * 生产者暂停式 backpressure——只是按字节数设了一个缓冲上限，超限直接 abort
 * 整条流，把「内存持续膨胀」变成「明确报错」）。
 * 只在目标小程序基础库确实缺失对应全局对象时才会安装，且没有验证过真机基础库
 * 版本号 —— 接入时用 `wx.getSystemInfoSync` 之类的方式确认目标基础库是否已经
 * 自带这两个全局对象，自带的话应该跳过这份占位，直接用原生实现更可靠。
 */
/** 大小写不敏感的最小 Headers 占位实现。 */
declare class MiniProgramHeaders {
    private readonly map;
    constructor(init?: HeadersInit);
    private normalize;
    set(name: string, value: string): void;
    get(name: string): string | null;
    has(name: string): boolean;
    append(name: string, value: string): void;
    delete(name: string): void;
    forEach(callback: (value: string, key: string) => void): void;
    entries(): IterableIterator<[string, string]>;
    /** 转成 `wx.request` 需要的 plain object header。 */
    toPlainObject(): Record<string, string>;
}
/**
 * 极简 ReadableStream 占位：单读者、按到达顺序 push，不支持 tee/pipeTo。
 *
 * 只满足 `iterSSEEvents` 的调用面：`getReader().read()` / `.cancel()` / `.releaseLock()`。
 *
 * 背压：队列按字节数计数，超过 `maxBufferedBytes` 时整条流直接 `abort`——
 * 不是真正的生产者暂停式背压（占位实现做不到暂停 `wx.request` 的分块推送），
 * 但至少把「内存持续膨胀」变成「明确报错」，调用方能感知并重试/降级。
 */
declare class MiniProgramReadableStream {
    private readonly queue;
    private queuedBytes;
    private readonly maxBufferedBytes;
    private closed;
    private error;
    private pendingResolve;
    private pendingReject;
    private cancelled;
    constructor(options?: {
        maxBufferedBytes?: number;
    });
    /** 供 fetch 适配层喂数据用，不是公开 API。超过字节上限时自动 abort。 */
    push(chunk: Uint8Array): void;
    /** 供 fetch 适配层在请求正常结束时调用，不是公开 API。 */
    close(): void;
    /**
     * 供 fetch 适配层在检测到「流已经开始但实际是错误响应/请求异常终止」
     * 时调用，不是公开 API。跟 `close()` 的区别：`close()` 是正常 EOF，
     * `abort()` 让当前挂起的 `read()` 与后续所有 `read()` 都 reject，
     * 避免调用方把截断的错误响应体误判为一段正常收完的 SSE 内容。
     */
    abort(err: Error): void;
    getReader(): {
        read(): Promise<{
            done: boolean;
            value?: Uint8Array;
        }>;
        cancel(): Promise<void>;
        releaseLock(): void;
    };
}
/** 是否已经具备（原生或已安装占位）小程序流式响应所需的 `ReadableStream`。 */
declare function isStreamingSupported(): boolean;
/**
 * 按需安装 `Headers` / `ReadableStream` 占位实现到 `globalThis`。
 *
 * 幂等：已存在同名全局对象时跳过，不覆盖原生实现。
 * 必须在调用 `createWorkBuddyCloud(...)` 之前执行一次。
 */
declare function ensureMiniProgramPolyfills(): void;

/**
 * WorkBuddy Cloud SDK 小程序适配层公开入口。
 *
 * 推荐用法（应用侧）—— 一站式工厂，把 polyfill、wx fetch、wx storage 与根客户端
 * 按固定顺序原子装配：
 *
 * ```ts
 * import { createMiniProgramWorkBuddyCloud } from '@genie/workbuddy-cloud-sdk/miniprogram';
 *
 * const cloud = createMiniProgramWorkBuddyCloud({
 *     endpoint: 'https://app.workbuddy.link', // 小程序没有 location.origin，必须显式传
 *     publishableKey: 'wbpk_xxx',
 * });
 * ```
 *
 * 三个适配件（`ensureMiniProgramPolyfills` / `createMiniProgramFetch` /
 * `createMiniProgramStorage`）也继续单独导出，供确有精细控制需要的场景手动组合
 * （顺序约束见各文件顶部注释）；一般接入直接用上面的工厂。
 *
 * 见 `platform/miniprogram/fetch.ts`、`storage.ts`、`polyfills.ts` 顶部注释
 * 里标注的占位/待验证事项——这一层还没有真机联调过。
 */

/**
 * `createMiniProgramWorkBuddyCloud` 的入参。
 *
 * 只收 `publicConfig` 的公开配置 —— 刻意**不**透传根 `WorkBuddyCloudOptions`
 * 的 `fetch` / `storage` 注入口：那两个口子是给「非浏览器但也非小程序」的运行时
 * 组合用的；在小程序里放开它们，接入方就能绕过 wx 适配器塞进一个浏览器实现，
 * 错误要等到真机上才暴露。
 */
interface MiniProgramWorkBuddyCloudOptions {
    /**
     * 数据面基址，来自 `publicConfig.endpoint`。
     *
     * 小程序宿主没有 `location.origin`，根 SDK 的同源回落在这里不存在——省略
     * 会在初始化时直接抛 `WorkBuddyCloudConfigError`。保持可选只为与根
     * `WorkBuddyCloudOptions` 的类型面对齐，实际接入**永远要传**。
     */
    endpoint?: string;
    /**
     * 环境中心 OAuth Relay 基址，来自 `publicConfig.oauthRelayBaseUrl`。
     *
     * `signInWithWechat` 和 `signInWithWorkBuddyMiniProgram` 均不经过
     * Web Relay，所以这里可以不传。
     */
    oauthRelayBaseUrl?: string;
    /** 应用标识 key（`wbpk_` 前缀），来自 `publicConfig.publishableKey`。 */
    publishableKey: string;
    /** WorkBuddy OAuth 复合 client_id，来自 publicConfig，格式为 {开平 client_id}_{子应用ID}。 */
    workBuddyOAuthClientId?: string;
    /**
     * 宿主 `wx` 对象，缺省取全局 `wx`。
     *
     * 应用代码不需要传；留这个口子是为了单测注入 mock，以及宿主把 `wx` 挂在
     * 非全局位置时显式传入。fetch 与 storage 适配器**共用同一个实例**。
     */
    wx?: MiniProgramWxLike;
}
/**
 * 创建小程序版 WorkBuddy Cloud 客户端（小程序接入的推荐入口）。
 *
 * 装配顺序固定，任何一步都不能省：
 *
 *   1. `ensureMiniProgramPolyfills()` —— 根 SDK 的共享出口在请求期直接
 *      `new Headers()`，小程序基础库缺这个全局对象时必须先补上；
 *   2. `createMiniProgramFetch(wx)` + `createMiniProgramStorage(wx)` ——
 *      网络与凭据存储绑定同一个 wx 实例；
 *   3. `resolveRuntimeConfig(...) + new WorkBuddyCloudClient(...)` —— 复用根 SDK
 *      的配置校验与四模块装配；
 *   4. 追加微信虚拟支付八个资源域模块（固定白名单路径 + 仅小程序 `wx.requestVirtualPayment`
 *      包装），能力仅在本小程序入口暴露。
 *
 * 把这个顺序收进 SDK 是刻意的：三个适配件手动组合时，漏掉 polyfill 或调换顺序，
 * 得到的都是一个「构造能过、第一个请求才炸」的 client，真机上极难归因。
 *
 * 依赖方向说明：这里从 `../../client.js`（而非根 barrel `../../index.js`）直接装配
 * `WorkBuddyCloudClient`，并在小程序入口侧追加虚拟支付模块 —— 保证小程序出口对
 * 核心 SDK 的依赖严格单向（根入口永远不反向 import 本模块），`./miniprogram`
 * 的 ESM/CJS 出口也就不会与根入口形成运行时环。
 *
 * @throws 没有可用 wx 对象、或基础公开配置不合法（复用根 SDK 的
 * `WorkBuddyCloudConfigError`）时立即抛出。
 *
 * ⚠️ `cloud.storage` 的文件下载在小程序运行时**不可用**：本适配层的
 * `fetch` 不支持 `Response.blob()/arrayBuffer()`（小程序没有全局 `Blob`，
 * 详见 `fetch.ts` 里 `buildResponse` 的注释），调用会拿到一条明确报错的
 * rejected promise，而不是静默失败或返回错位的数据；`cloud.auth/database/llm`
 * 不受影响。
 */
interface MiniProgramWorkBuddyCloudClient<Database = unknown> extends WorkBuddyCloudClient<Database>, MiniProgramWechatVirtualModules {
}
declare function createMiniProgramWorkBuddyCloud<Database = unknown>(options: MiniProgramWorkBuddyCloudOptions): MiniProgramWorkBuddyCloudClient<Database>;

export { MiniProgramHeaders, MiniProgramReadableStream, type MiniProgramWechatVirtualModules, type MiniProgramWorkBuddyCloudClient, type MiniProgramWorkBuddyCloudOptions, type MiniProgramWxLike, type WechatVirtualAdvertisingFundsBindTransferAccountRequest, type WechatVirtualAdvertisingFundsCreateFundsBillRequest, type WechatVirtualAdvertisingFundsDownloadOrderRequest, type WechatVirtualAdvertisingFundsQueryAdvertisingFundsRequest, type WechatVirtualAdvertisingFundsQueryFundsBillRequest, type WechatVirtualAdvertisingFundsQueryRecoverBillRequest, type WechatVirtualAdvertisingFundsQueryTransferAccountRequest, type WechatVirtualBusinessBody, type WechatVirtualBusinessBodyField, type WechatVirtualComplaintsCompleteRequest, type WechatVirtualComplaintsGetDetailRequest, type WechatVirtualComplaintsGetUploadFileSignRequest, type WechatVirtualComplaintsQueryNegotiationsRequest, type WechatVirtualComplaintsQueryRequest, type WechatVirtualComplaintsRespondRequest, type WechatVirtualComplaintsUploadFileRequest, type WechatVirtualEnv, type WechatVirtualGoodsQueryPublishTaskRequest, type WechatVirtualGoodsQueryUploadTaskRequest, type WechatVirtualGoodsStartPublishRequest, type WechatVirtualGoodsStartUploadRequest, type WechatVirtualMerchantFinanceCreateOrderDownloadRequest, type WechatVirtualMerchantFinanceCreateWithdrawalRequest, type WechatVirtualMerchantFinanceDownloadBillRequest, type WechatVirtualMerchantFinanceDownloadIOSSettlementBillRequest, type WechatVirtualMerchantFinanceQueryBalanceRequest, type WechatVirtualMerchantFinanceQueryOrderDownloadRequest, type WechatVirtualMerchantFinanceQueryWithdrawalRequest, type WechatVirtualMerchantRiskQueryPunishmentReasonsRequest, type WechatVirtualPaymentCreateRefundRequest, type WechatVirtualPaymentNotifyProvideGoodsRequest, type WechatVirtualPaymentQueryOrderRequest, type WechatVirtualPaymentQueryRefundRequest, type WechatVirtualPaymentSignRequest, type WechatVirtualPaymentSignResponse, type WechatVirtualPermissionCategory, type WechatVirtualPermissionResolution, type WechatVirtualSubscriptionsCancelContractRequest, type WechatVirtualSubscriptionsQueryContractRequest, type WechatVirtualSubscriptionsSendPrePaymentNoticeRequest, type WechatVirtualSubscriptionsSubmitPaymentOrderRequest, type WechatVirtualTokensCreateRefundRequest, type WechatVirtualTokensPayRequest, type WechatVirtualTokensPresentRequest, type WechatVirtualTokensQueryBalanceRequest, type WxChunkReceivedResult, type WxRequestFailResult, type WxRequestOptions, type WxRequestSuccessResult, type WxRequestTask, type WxRequestVirtualPaymentEnv, type WxRequestVirtualPaymentFailResult, type WxRequestVirtualPaymentOptions, type WxRequestVirtualPaymentSuccessResult, createMiniProgramFetch, createMiniProgramStorage, createMiniProgramWorkBuddyCloud, ensureMiniProgramPolyfills, isStreamingSupported, isWechatVirtualReauthorizationRequired, resolveWechatVirtualPermission };
