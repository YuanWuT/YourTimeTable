"use strict";Object.defineProperty(exports, "__esModule", {value: true}); function _nullishCoalesce(lhs, rhsFn) { if (lhs != null) { return lhs; } else { return rhsFn(); } } function _optionalChain(ops) { let lastAccessLHS = undefined; let value = ops[0]; let i = 1; while (i < ops.length) { const op = ops[i]; const fn = ops[i + 1]; i += 2; if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) { return undefined; } if (op === 'access' || op === 'optionalAccess') { lastAccessLHS = value; value = fn(value); } else if (op === 'call' || op === 'optionalCall') { value = fn((...args) => value.call(lastAccessLHS, ...args)); lastAccessLHS = undefined; } } return value; } var _class; var _class2;




var _chunkYTD42NT4cjs = require('./chunk-YTD42NT4.cjs');

// src/modules/wechat-virtual/shared.ts
var FORBIDDEN_BODY_KEYS = /* @__PURE__ */ new Set([
  "applicationid",
  "openid",
  "authorizeraccesstoken",
  "offerid",
  "appkey",
  "sessionkey",
  "signature",
  "paysig",
  "token",
  "uid",
  "userid",
  "owneruserid",
  "enterpriseid",
  "principaltype",
  "authorizerappid",
  // user_ip：代币资源域 4 个接口官方必填，由服务端从入站请求（XFF/X-Real-Ip/RemoteAddr）
  // 注入；客户端提交即可伪造用户 IP，服务端会直接拒。这里同步拦，报错更早也更清楚。
  "userip"
]);
var REAUTH_REASON_CODES = /* @__PURE__ */ new Set([
  "18373",
  "geniebaaswechatauthrequired",
  "wechat_auth_required",
  "auth_required",
  "missing_required_scopes"
]);
function createWechatVirtualRequestInvoker(endpoint, fetch) {
  return {
    async post(path, body) {
      let response;
      try {
        response = await fetch(`${endpoint}${path}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
      } catch (error) {
        return fail({
          kind: "network",
          status: 0,
          message: `Network error: ${_nullishCoalesce(_optionalChain([error, 'optionalAccess', _ => _.message]), () => ( "unknown"))}`,
          cause: error
        });
      }
      const payload = await readPayload(response);
      if (!response.ok) {
        return fail(normalizeCloudError(response.status, payload));
      }
      const envelope = unwrapPayloadEnvelope(payload);
      if (envelope.error !== null) {
        return fail(normalizeCloudError(response.status, envelope.error, payload));
      }
      return ok(_nullishCoalesce(envelope.data, () => ( null)));
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, createWechatVirtualRequestInvoker, "createWechatVirtualRequestInvoker");
function buildWechatXpayPayload(params) {
  return buildWechatVirtualPayload({
    ...params,
    requiredKeyFormat: "snake_case"
  });
}
_chunkYTD42NT4cjs.__name.call(void 0, buildWechatXpayPayload, "buildWechatXpayPayload");
function buildWechatVirtualPayload(params) {
  if (!isWechatVirtualEnv(params.env)) {
    return invalidWechatVirtualRequestResult("wechatVirtual: env \u5FC5\u987B\u4E3A 0 \u6216 1\u3002", {
      field: "env",
      value: params.env
    });
  }
  const payload = {
    env: params.env
  };
  const occupiedNormalizedKeys = /* @__PURE__ */ new Set([
    "env"
  ]);
  const requiredKeyFormat = _nullishCoalesce(params.requiredKeyFormat, () => ( "as-is"));
  if (params.required) {
    for (const [rawKey, value] of Object.entries(params.required)) {
      if (value === void 0) {
        continue;
      }
      const trimmedKey = rawKey.trim();
      if (!trimmedKey) {
        return invalidWechatVirtualRequestResult("wechatVirtual: \u8BF7\u6C42\u5B57\u6BB5\u540D\u4E0D\u80FD\u4E3A\u7A7A\u3002", {
          key: rawKey
        });
      }
      const key = formatWechatVirtualRequiredKey(trimmedKey, requiredKeyFormat);
      const normalized = normalizeVirtualPaymentKey(key);
      if (occupiedNormalizedKeys.has(normalized)) {
        return invalidWechatVirtualRequestResult(`wechatVirtual: \u8BF7\u6C42\u5B57\u6BB5 ${key} \u4E0E\u5176\u4ED6\u5B57\u6BB5\u51B2\u7A81\u3002`);
      }
      payload[key] = value;
      occupiedNormalizedKeys.add(normalized);
    }
  }
  const body = params.body;
  if (body === void 0) {
    return ok(payload);
  }
  if (!Array.isArray(body)) {
    return invalidWechatVirtualRequestResult("wechatVirtual: body \u5FC5\u987B\u662F\u5B57\u6BB5\u6570\u7EC4\u3002", {
      body
    });
  }
  for (const [index, field] of body.entries()) {
    if (!isRecord(field)) {
      return invalidWechatVirtualRequestResult(`wechatVirtual: body[${index}] \u5FC5\u987B\u662F { key, value }\u3002`, {
        field
      });
    }
    const rawKey = field.key;
    if (typeof rawKey !== "string" || rawKey.trim() === "") {
      return invalidWechatVirtualRequestResult(`wechatVirtual: body[${index}].key \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        key: rawKey
      });
    }
    const key = rawKey.trim();
    const normalizedKey = normalizeVirtualPaymentKey(key);
    if (FORBIDDEN_BODY_KEYS.has(normalizedKey)) {
      return invalidWechatVirtualRequestResult(`wechatVirtual: \u5B57\u6BB5 ${key} \u4E0D\u5141\u8BB8\u7531\u5BA2\u6237\u7AEF\u63D0\u4EA4\u3002`);
    }
    if (occupiedNormalizedKeys.has(normalizedKey)) {
      return invalidWechatVirtualRequestResult(`wechatVirtual: \u5B57\u6BB5 ${key} \u4E0E\u5DF2\u58F0\u660E\u5B57\u6BB5\u91CD\u590D\u6216\u51B2\u7A81\u3002`);
    }
    if (!isJsonSerializable(field.value)) {
      return invalidWechatVirtualRequestResult(`wechatVirtual: \u5B57\u6BB5 ${key} \u7684 value \u5FC5\u987B\u662F\u53EF JSON \u5E8F\u5217\u5316\u7684\u503C\u3002`, {
        value: field.value
      });
    }
    payload[formatWechatVirtualRequiredKey(key, requiredKeyFormat)] = field.value;
    occupiedNormalizedKeys.add(normalizedKey);
  }
  return ok(payload);
}
_chunkYTD42NT4cjs.__name.call(void 0, buildWechatVirtualPayload, "buildWechatVirtualPayload");
function invalidWechatVirtualRequestResult(message, cause) {
  return fail({
    kind: "invalid-request",
    status: 0,
    message,
    cause
  });
}
_chunkYTD42NT4cjs.__name.call(void 0, invalidWechatVirtualRequestResult, "invalidWechatVirtualRequestResult");
function isWechatVirtualEnv(value) {
  return value === 0 || value === 1;
}
_chunkYTD42NT4cjs.__name.call(void 0, isWechatVirtualEnv, "isWechatVirtualEnv");
function resolveWechatVirtualPermission(error) {
  if (error.kind !== "permission-denied") {
    return null;
  }
  const detail = extractPermissionDetail(error.cause);
  return {
    category: detail.requiresReauthorization ? "reauthorization-required" : "permission-denied",
    reasonCode: detail.reasonCode,
    missingScopeIds: detail.missingScopeIds
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, resolveWechatVirtualPermission, "resolveWechatVirtualPermission");
function isWechatVirtualReauthorizationRequired(error) {
  return _optionalChain([resolveWechatVirtualPermission, 'call', _2 => _2(error), 'optionalAccess', _3 => _3.category]) === "reauthorization-required";
}
_chunkYTD42NT4cjs.__name.call(void 0, isWechatVirtualReauthorizationRequired, "isWechatVirtualReauthorizationRequired");
function ok(data) {
  return {
    data,
    error: null
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, ok, "ok");
function fail(error) {
  return {
    data: null,
    error
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, fail, "fail");
function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
_chunkYTD42NT4cjs.__name.call(void 0, hasOwn, "hasOwn");
function unwrapPayloadEnvelope(payload) {
  if (!isRecord(payload) || !hasOwn(payload, "error")) {
    return {
      data: payload,
      error: null
    };
  }
  if (hasOwn(payload, "data")) {
    return {
      data: payload.data,
      error: _nullishCoalesce(payload.error, () => ( null))
    };
  }
  if (payload.error === null || payload.error === void 0) {
    return {
      data: payload,
      error: null
    };
  }
  return {
    data: null,
    error: payload.error
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, unwrapPayloadEnvelope, "unwrapPayloadEnvelope");
async function readPayload(response) {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}
_chunkYTD42NT4cjs.__name.call(void 0, readPayload, "readPayload");
function normalizeCloudError(status, source, cause) {
  const code = extractErrorCode(source);
  const message = extractErrorMessage(source, status);
  return {
    kind: inferErrorKind(status, code),
    status,
    code,
    message,
    cause: _nullishCoalesce(cause, () => ( source))
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeCloudError, "normalizeCloudError");
function inferErrorKind(status, code) {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "permission-denied";
  if (status === 404) return "not-found";
  if (status === 400 || status === 422) return "invalid-request";
  if (status === 429) return "rate-limited";
  if (status === 501) return "unimplemented";
  if (status >= 500) return "backend-unavailable";
  if (!code) return "unknown";
  const normalized = code.toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "invalid_grant" || normalized === "unauthenticated") return "unauthenticated";
  if (normalized === "permission_denied" || normalized === "forbidden") return "permission-denied";
  if (normalized === "not_found") return "not-found";
  if (normalized.includes("invalid")) return "invalid-request";
  if (normalized.includes("rate") || normalized.includes("limit")) return "rate-limited";
  if (normalized.includes("unimplemented") || normalized.includes("not_implemented")) return "unimplemented";
  if (normalized.includes("credit") || normalized.includes("quota")) return "credits-exhausted";
  if (normalized.includes("network")) return "network";
  return "unknown";
}
_chunkYTD42NT4cjs.__name.call(void 0, inferErrorKind, "inferErrorKind");
function extractErrorCode(source) {
  if (typeof source === "string") {
    return source;
  }
  if (!isRecord(source)) {
    return void 0;
  }
  const candidates = [
    source.code,
    source.error,
    source.error_code,
    source.errCode,
    source.statusCode
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate) {
      return candidate;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return String(candidate);
    }
  }
  return void 0;
}
_chunkYTD42NT4cjs.__name.call(void 0, extractErrorCode, "extractErrorCode");
function extractErrorMessage(source, status) {
  if (typeof source === "string" && source) {
    return source;
  }
  if (isRecord(source)) {
    const candidates = [
      source.message,
      source.error_description,
      source.errorMessage,
      source.errMsg,
      source.error_msg,
      source.error
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate) {
        return candidate;
      }
    }
  }
  return `Request failed with status ${status}.`;
}
_chunkYTD42NT4cjs.__name.call(void 0, extractErrorMessage, "extractErrorMessage");
function formatWechatVirtualRequiredKey(key, keyFormat) {
  if (keyFormat === "snake_case") {
    return toWechatXpaySnakeCaseKey(key);
  }
  return key;
}
_chunkYTD42NT4cjs.__name.call(void 0, formatWechatVirtualRequiredKey, "formatWechatVirtualRequiredKey");
function toWechatXpaySnakeCaseKey(key) {
  return key.replace(/([A-Z]+)([A-Z][a-z0-9])/g, "$1_$2").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s\-]+/g, "_").toLowerCase();
}
_chunkYTD42NT4cjs.__name.call(void 0, toWechatXpaySnakeCaseKey, "toWechatXpaySnakeCaseKey");
function normalizeVirtualPaymentKey(key) {
  const lower = key.toLowerCase().trim();
  return lower.replace(/[_\-]/g, "");
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeVirtualPaymentKey, "normalizeVirtualPaymentKey");
function isJsonSerializable(value) {
  return isJsonSerializableInternal(value, /* @__PURE__ */ new Set());
}
_chunkYTD42NT4cjs.__name.call(void 0, isJsonSerializable, "isJsonSerializable");
function isJsonSerializableInternal(value, visited) {
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      return false;
    case "object":
      if (visited.has(value)) {
        return false;
      }
      visited.add(value);
      if (Array.isArray(value)) {
        const result2 = value.every((item) => isJsonSerializableInternal(item, visited));
        visited.delete(value);
        return result2;
      }
      if (!isPlainObject(value)) {
        visited.delete(value);
        return false;
      }
      const entries = Object.entries(value);
      const result = entries.every(([, itemValue]) => isJsonSerializableInternal(itemValue, visited));
      visited.delete(value);
      return result;
    default:
      return false;
  }
}
_chunkYTD42NT4cjs.__name.call(void 0, isJsonSerializableInternal, "isJsonSerializableInternal");
function isPlainObject(value) {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
_chunkYTD42NT4cjs.__name.call(void 0, isPlainObject, "isPlainObject");
function extractPermissionDetail(source) {
  const record = isRecord(source) ? source : void 0;
  const details = record && isRecord(record.details) ? record.details : void 0;
  const reasonCode = _nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(_nullishCoalesce(pickCode(_optionalChain([details, 'optionalAccess', _4 => _4.code])), () => ( pickCode(_optionalChain([details, 'optionalAccess', _5 => _5.errorCode])))), () => ( pickCode(_optionalChain([details, 'optionalAccess', _6 => _6.bizCode])))), () => ( pickCode(_optionalChain([details, 'optionalAccess', _7 => _7.reason])))), () => ( pickCode(_optionalChain([record, 'optionalAccess', _8 => _8.code])))), () => ( pickCode(_optionalChain([record, 'optionalAccess', _9 => _9.error_code])))), () => ( pickCode(_optionalChain([record, 'optionalAccess', _10 => _10.errorCode])))), () => ( pickCode(_optionalChain([record, 'optionalAccess', _11 => _11.bizCode])))), () => ( pickCode(_optionalChain([record, 'optionalAccess', _12 => _12.reason]))));
  const missingScopeIds = _nullishCoalesce(_nullishCoalesce(pickScopeIDs(_optionalChain([details, 'optionalAccess', _13 => _13.missingScopeIds])), () => ( pickScopeIDs(_optionalChain([record, 'optionalAccess', _14 => _14.missingScopeIds])))), () => ( []));
  const normalizedReason = normalizeReasonCode(reasonCode);
  const requiresReauthorization = missingScopeIds.includes(157) || REAUTH_REASON_CODES.has(normalizedReason);
  return {
    reasonCode,
    missingScopeIds,
    requiresReauthorization
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, extractPermissionDetail, "extractPermissionDetail");
function normalizeReasonCode(code) {
  if (!code) {
    return "";
  }
  return code.trim().toLowerCase().replace(/[\s-]+/g, "_");
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeReasonCode, "normalizeReasonCode");
function pickCode(value) {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return void 0;
}
_chunkYTD42NT4cjs.__name.call(void 0, pickCode, "pickCode");
function pickScopeIDs(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const ids = value.map((item) => {
    if (typeof item === "number" && Number.isInteger(item)) {
      return item;
    }
    if (typeof item === "string" && /^\d+$/.test(item.trim())) {
      return Number(item.trim());
    }
    return void 0;
  }).filter((item) => item !== void 0);
  return ids;
}
_chunkYTD42NT4cjs.__name.call(void 0, pickScopeIDs, "pickScopeIDs");
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
_chunkYTD42NT4cjs.__name.call(void 0, isRecord, "isRecord");

// src/modules/wechat-virtual/advertising-funds.ts
var ADVERTISING_FUNDS_PATHS = Object.freeze({
  queryTransferAccount: "/.cloud/wechat-virtual-advertising-funds/v1/transfer-accounts/query",
  bindTransferAccount: "/.cloud/wechat-virtual-advertising-funds/v1/transfer-accounts/bind",
  createFundsBill: "/.cloud/wechat-virtual-advertising-funds/v1/funds-bills/create",
  queryAdvertisingFunds: "/.cloud/wechat-virtual-advertising-funds/v1/advertising-funds/query",
  queryFundsBill: "/.cloud/wechat-virtual-advertising-funds/v1/funds-bills/query",
  queryRecoverBill: "/.cloud/wechat-virtual-advertising-funds/v1/recover-bills/query",
  downloadAdvertisingFundsOrder: "/.cloud/wechat-virtual-advertising-funds/v1/orders/download"
});
var WechatVirtualAdvertisingFundsAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualAdvertisingFundsAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  queryTransferAccount(input) {
    const payload = buildWechatXpayPayload({
      env: input.env
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.queryTransferAccount, payload.data);
  }
  bindTransferAccount(input) {
    const transferAccountUid = normalizeRequiredText(input.transferAccountUid, "transferAccountUid", "bindTransferAccount");
    if (!transferAccountUid.ok) {
      return Promise.resolve(transferAccountUid.error);
    }
    const transferAccountOrgName = normalizeOptionalText(input.transferAccountOrgName, "transferAccountOrgName", "bindTransferAccount");
    if (!transferAccountOrgName.ok) {
      return Promise.resolve(transferAccountOrgName.error);
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        transferAccountUid: transferAccountUid.value,
        transferAccountOrgName: transferAccountOrgName.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.bindTransferAccount, payload.data);
  }
  createFundsBill(input) {
    const transferAccountUid = normalizeRequiredText(input.transferAccountUid, "transferAccountUid", "createFundsBill");
    if (!transferAccountUid.ok) {
      return Promise.resolve(transferAccountUid.error);
    }
    if (input.transferAmount !== void 0 && (typeof input.transferAmount !== "number" || !Number.isFinite(input.transferAmount))) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualAdvertisingFunds.createFundsBill: transferAmount \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57\u3002", {
        field: "transferAmount",
        value: input.transferAmount
      }));
    }
    const transferAccountName = normalizeOptionalText(input.transferAccountName, "transferAccountName", "createFundsBill");
    if (!transferAccountName.ok) return Promise.resolve(transferAccountName.error);
    const transferAccountAgencyId = normalizeOptionalText(input.transferAccountAgencyId, "transferAccountAgencyId", "createFundsBill");
    if (!transferAccountAgencyId.ok) return Promise.resolve(transferAccountAgencyId.error);
    const requestId = normalizeOptionalText(input.requestId, "requestId", "createFundsBill");
    if (!requestId.ok) return Promise.resolve(requestId.error);
    const settleBegin = normalizeOptionalText(input.settleBegin, "settleBegin", "createFundsBill");
    if (!settleBegin.ok) return Promise.resolve(settleBegin.error);
    const settleEnd = normalizeOptionalText(input.settleEnd, "settleEnd", "createFundsBill");
    if (!settleEnd.ok) return Promise.resolve(settleEnd.error);
    const authorizeAdvertise = normalizeOptionalText(input.authorizeAdvertise, "authorizeAdvertise", "createFundsBill");
    if (!authorizeAdvertise.ok) return Promise.resolve(authorizeAdvertise.error);
    const fundType = normalizeOptionalText(input.fundType, "fundType", "createFundsBill");
    if (!fundType.ok) return Promise.resolve(fundType.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        transferAccountUid: transferAccountUid.value,
        transferAmount: input.transferAmount,
        transferAccountName: transferAccountName.value,
        transferAccountAgencyId: transferAccountAgencyId.value,
        requestId: requestId.value,
        settleBegin: settleBegin.value,
        settleEnd: settleEnd.value,
        authorizeAdvertise: authorizeAdvertise.value,
        fundType: fundType.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.createFundsBill, payload.data);
  }
  queryAdvertisingFunds(input) {
    const page = normalizeOptionalPositiveInteger(input.page, "page", "queryAdvertisingFunds");
    if (!page.ok) return Promise.resolve(page.error);
    const pageSize = normalizeOptionalPositiveInteger(input.pageSize, "pageSize", "queryAdvertisingFunds");
    if (!pageSize.ok) return Promise.resolve(pageSize.error);
    const filter = normalizeQueryAdvertisingFundsFilter(input.filter);
    if (!filter.ok) return Promise.resolve(filter.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        page: page.value,
        pageSize: pageSize.value,
        filter: filter.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.queryAdvertisingFunds, payload.data);
  }
  queryFundsBill(input) {
    const page = normalizeOptionalPositiveInteger(input.page, "page", "queryFundsBill");
    if (!page.ok) return Promise.resolve(page.error);
    const pageSize = normalizeOptionalPositiveInteger(input.pageSize, "pageSize", "queryFundsBill");
    if (!pageSize.ok) return Promise.resolve(pageSize.error);
    const filter = normalizeQueryFundsBillFilter({
      billId: input.billId,
      requestId: input.requestId,
      operTimeBegin: input.operTimeBegin,
      operTimeEnd: input.operTimeEnd,
      ..._nullishCoalesce(input.filter, () => ( {}))
    });
    if (!filter.ok) return Promise.resolve(filter.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        page: page.value,
        pageSize: pageSize.value,
        filter: filter.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.queryFundsBill, payload.data);
  }
  queryRecoverBill(input) {
    const page = normalizeOptionalPositiveInteger(input.page, "page", "queryRecoverBill");
    if (!page.ok) return Promise.resolve(page.error);
    const pageSize = normalizeOptionalPositiveInteger(input.pageSize, "pageSize", "queryRecoverBill");
    if (!pageSize.ok) return Promise.resolve(pageSize.error);
    const filter = normalizeQueryRecoverBillFilter({
      billId: input.billId,
      recoverTimeBegin: input.recoverTimeBegin,
      recoverTimeEnd: input.recoverTimeEnd,
      ..._nullishCoalesce(input.filter, () => ( {}))
    });
    if (!filter.ok) return Promise.resolve(filter.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        page: page.value,
        pageSize: pageSize.value,
        filter: filter.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.queryRecoverBill, payload.data);
  }
  downloadAdvertisingFundsOrder(input) {
    const fundId = normalizeRequiredText(input.fundId, "fundId", "downloadAdvertisingFundsOrder");
    if (!fundId.ok) {
      return Promise.resolve(fundId.error);
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        fundId: fundId.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(ADVERTISING_FUNDS_PATHS.downloadAdvertisingFundsOrder, payload.data);
  }
};
function normalizeRequiredText(value, field, methodName) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualAdvertisingFunds.${methodName}: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText, "normalizeRequiredText");
function normalizeOptionalText(value, field, methodName) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  return normalizeRequiredText(value, field, methodName);
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalText, "normalizeOptionalText");
function normalizeOptionalPositiveInteger(value, field, methodName) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualAdvertisingFunds.${methodName}: ${field} \u5FC5\u987B\u662F\u5927\u4E8E 0 \u7684\u6574\u6570\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalPositiveInteger, "normalizeOptionalPositiveInteger");
function normalizeQueryAdvertisingFundsFilter(value) {
  if (!value) {
    return {
      ok: true,
      value: void 0
    };
  }
  const settleBegin = normalizeOptionalText(value.settleBegin, "settleBegin", "queryAdvertisingFunds");
  if (!settleBegin.ok) return settleBegin;
  const settleEnd = normalizeOptionalText(value.settleEnd, "settleEnd", "queryAdvertisingFunds");
  if (!settleEnd.ok) return settleEnd;
  const fundType = normalizeOptionalText(value.fundType, "fundType", "queryAdvertisingFunds");
  if (!fundType.ok) return fundType;
  return {
    ok: true,
    value: {
      settle_begin: settleBegin.value,
      settle_end: settleEnd.value,
      fund_type: fundType.value
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeQueryAdvertisingFundsFilter, "normalizeQueryAdvertisingFundsFilter");
function normalizeQueryFundsBillFilter(value) {
  const billId = normalizeOptionalText(value.billId, "billId", "queryFundsBill");
  if (!billId.ok) return billId;
  const requestId = normalizeOptionalText(value.requestId, "requestId", "queryFundsBill");
  if (!requestId.ok) return requestId;
  const operTimeBegin = normalizeOptionalText(value.operTimeBegin, "operTimeBegin", "queryFundsBill");
  if (!operTimeBegin.ok) return operTimeBegin;
  const operTimeEnd = normalizeOptionalText(value.operTimeEnd, "operTimeEnd", "queryFundsBill");
  if (!operTimeEnd.ok) return operTimeEnd;
  if (!billId.value && !requestId.value && !operTimeBegin.value && !operTimeEnd.value) {
    return {
      ok: true,
      value: void 0
    };
  }
  return {
    ok: true,
    value: {
      bill_id: billId.value,
      request_id: requestId.value,
      oper_time_begin: operTimeBegin.value,
      oper_time_end: operTimeEnd.value
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeQueryFundsBillFilter, "normalizeQueryFundsBillFilter");
function normalizeQueryRecoverBillFilter(value) {
  const billId = normalizeOptionalText(value.billId, "billId", "queryRecoverBill");
  if (!billId.ok) return billId;
  const recoverTimeBegin = normalizeOptionalText(value.recoverTimeBegin, "recoverTimeBegin", "queryRecoverBill");
  if (!recoverTimeBegin.ok) return recoverTimeBegin;
  const recoverTimeEnd = normalizeOptionalText(value.recoverTimeEnd, "recoverTimeEnd", "queryRecoverBill");
  if (!recoverTimeEnd.ok) return recoverTimeEnd;
  if (!billId.value && !recoverTimeBegin.value && !recoverTimeEnd.value) {
    return {
      ok: true,
      value: void 0
    };
  }
  return {
    ok: true,
    value: {
      bill_id: billId.value,
      recover_time_begin: recoverTimeBegin.value,
      recover_time_end: recoverTimeEnd.value
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeQueryRecoverBillFilter, "normalizeQueryRecoverBillFilter");

// src/modules/wechat-virtual/complaints.ts
var COMPLAINTS_PATHS = Object.freeze({
  query: "/.cloud/wechat-virtual-complaints/v1/complaints/query",
  getDetail: "/.cloud/wechat-virtual-complaints/v1/complaints/detail",
  queryNegotiations: "/.cloud/wechat-virtual-complaints/v1/complaints/negotiations/query",
  uploadFile: "/.cloud/wechat-virtual-complaints/v1/files/upload",
  getUploadFileSign: "/.cloud/wechat-virtual-complaints/v1/files/upload-sign",
  respond: "/.cloud/wechat-virtual-complaints/v1/complaints/respond",
  complete: "/.cloud/wechat-virtual-complaints/v1/complaints/complete"
});
var WechatVirtualComplaintsAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualComplaintsAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  query(input) {
    const beginDate = normalizeOptionalText2(input.beginDate, "beginDate");
    if (!beginDate.ok) return Promise.resolve(beginDate.error);
    const endDate = normalizeOptionalText2(input.endDate, "endDate");
    if (!endDate.ok) return Promise.resolve(endDate.error);
    const offset = normalizeOptionalInteger(input.offset, "offset");
    if (!offset.ok) return Promise.resolve(offset.error);
    const limit = normalizeOptionalInteger(input.limit, "limit");
    if (!limit.ok) return Promise.resolve(limit.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        beginDate: beginDate.value,
        endDate: endDate.value,
        offset: offset.value,
        limit: limit.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(COMPLAINTS_PATHS.query, payload.data);
  }
  getDetail(input) {
    return this.postWithComplaintID(COMPLAINTS_PATHS.getDetail, input, "getDetail");
  }
  queryNegotiations(input) {
    const offset = normalizeOptionalInteger(input.offset, "offset");
    if (!offset.ok) return Promise.resolve(offset.error);
    const limit = normalizeOptionalInteger(input.limit, "limit");
    if (!limit.ok) return Promise.resolve(limit.error);
    return this.postWithComplaintID(COMPLAINTS_PATHS.queryNegotiations, input, "queryNegotiations", {
      offset: offset.value,
      limit: limit.value
    });
  }
  uploadFile(input) {
    const base64Img = normalizeOptionalText2(input.base64Img, "base64Img");
    if (!base64Img.ok) return Promise.resolve(base64Img.error);
    const imgUrl = normalizeOptionalText2(input.imgUrl, "imgUrl");
    if (!imgUrl.ok) return Promise.resolve(imgUrl.error);
    if (!base64Img.value && !imgUrl.value) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualComplaints.uploadFile: base64Img \u4E0E imgUrl \u81F3\u5C11\u4F20\u4E00\u4E2A\u3002"));
    }
    const fileName = normalizeRequiredText2(input.fileName, "fileName");
    if (!fileName.ok) return Promise.resolve(fileName.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        base64Img: base64Img.value,
        imgUrl: imgUrl.value,
        fileName: fileName.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(COMPLAINTS_PATHS.uploadFile, payload.data);
  }
  getUploadFileSign(input) {
    const wxpayUrl = normalizeRequiredText2(input.wxpayUrl, "wxpayUrl");
    if (!wxpayUrl.ok) return Promise.resolve(wxpayUrl.error);
    const complaintId = normalizeOptionalText2(input.complaintId, "complaintId");
    if (!complaintId.ok) return Promise.resolve(complaintId.error);
    if (input.convertCos !== void 0 && typeof input.convertCos !== "boolean") {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualComplaints.getUploadFileSign: convertCos \u5FC5\u987B\u662F\u5E03\u5C14\u503C\u3002", {
        field: "convertCos",
        value: input.convertCos
      }));
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        wxpayUrl: wxpayUrl.value,
        convertCos: input.convertCos,
        complaintId: complaintId.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(COMPLAINTS_PATHS.getUploadFileSign, payload.data);
  }
  respond(input) {
    const complaintId = normalizeRequiredText2(input.complaintId, "complaintId");
    if (!complaintId.ok) return Promise.resolve(complaintId.error);
    const responseContent = normalizeRequiredText2(input.responseContent, "responseContent");
    if (!responseContent.ok) return Promise.resolve(responseContent.error);
    const responseImages = normalizeOptionalStringArray(input.responseImages, "responseImages");
    if (!responseImages.ok) return Promise.resolve(responseImages.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        complaintId: complaintId.value,
        responseContent: responseContent.value,
        responseImages: responseImages.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(COMPLAINTS_PATHS.respond, payload.data);
  }
  complete(input) {
    return this.postWithComplaintID(COMPLAINTS_PATHS.complete, input, "complete");
  }
  postWithComplaintID(path, input, methodName, extraRequired = {}) {
    const complaintId = normalizeRequiredText2(input.complaintId, "complaintId");
    if (!complaintId.ok) {
      return Promise.resolve(complaintId.error);
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        complaintId: complaintId.value,
        ...extraRequired
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(path, payload.data);
  }
};
function normalizeRequiredText2(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualComplaints: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText2, "normalizeRequiredText");
function normalizeOptionalText2(value, field) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  return normalizeRequiredText2(value, field);
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalText2, "normalizeOptionalText");
function normalizeOptionalInteger(value, field) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualComplaints: ${field} \u5FC5\u987B\u662F\u5927\u4E8E\u7B49\u4E8E 0 \u7684\u6574\u6570\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalInteger, "normalizeOptionalInteger");
function normalizeOptionalStringArray(value, field) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (!Array.isArray(value)) {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualComplaints: ${field} \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u6570\u7EC4\u3002`, {
        field,
        value
      })
    };
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      return {
        ok: false,
        error: invalidWechatVirtualRequestResult(`wechatVirtualComplaints: ${field} \u7684\u5143\u7D20\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
          field,
          value
        })
      };
    }
    normalized.push(item.trim());
  }
  return {
    ok: true,
    value: normalized
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalStringArray, "normalizeOptionalStringArray");

// src/modules/wechat-virtual/goods.ts
var GOODS_PATHS = Object.freeze({
  startUpload: "/.cloud/wechat-virtual-goods/v1/goods/upload",
  queryUploadTask: "/.cloud/wechat-virtual-goods/v1/goods/upload-tasks/query",
  startPublish: "/.cloud/wechat-virtual-goods/v1/goods/publish",
  queryPublishTask: "/.cloud/wechat-virtual-goods/v1/goods/publish-tasks/query"
});
var WechatVirtualGoodsAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualGoodsAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  startUpload(input) {
    const id = normalizeRequiredText3(input.id, "id");
    if (!id.ok) return Promise.resolve(id.error);
    const name = normalizeRequiredText3(input.name, "name");
    if (!name.ok) return Promise.resolve(name.error);
    const hasItemUrl = typeof input.itemUrl === "string" && input.itemUrl.trim() !== "";
    const hasImageBase64 = typeof input.imageBase64 === "string" && input.imageBase64.trim() !== "";
    if (hasItemUrl === hasImageBase64) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualGoods.startUpload: itemUrl \u4E0E imageBase64 \u5FC5\u987B\u4E14\u53EA\u80FD\u4F20\u4E00\u4E2A\u3002"));
    }
    const itemUrl = hasItemUrl ? normalizeRequiredText3(input.itemUrl, "itemUrl") : {
      ok: true,
      value: void 0
    };
    if (!itemUrl.ok) return Promise.resolve(itemUrl.error);
    const imageBase64 = hasImageBase64 ? normalizeRequiredText3(input.imageBase64, "imageBase64") : {
      ok: true,
      value: void 0
    };
    if (!imageBase64.ok) return Promise.resolve(imageBase64.error);
    if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price < 0) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualGoods.startUpload: price \u5FC5\u987B\u662F\u5927\u4E8E\u7B49\u4E8E 0 \u7684\u6570\u5B57\u3002", {
        field: "price",
        value: input.price
      }));
    }
    const remark = normalizeRequiredText3(input.remark, "remark");
    if (!remark.ok) return Promise.resolve(remark.error);
    const payload = buildWechatVirtualPayload({
      env: input.env,
      required: {
        id: id.value,
        name: name.value,
        price: input.price,
        itemUrl: itemUrl.value,
        imageBase64: imageBase64.value,
        remark: remark.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(GOODS_PATHS.startUpload, payload.data);
  }
  queryUploadTask(input) {
    return this.postWithEnvOnly(GOODS_PATHS.queryUploadTask, input.env);
  }
  startPublish(input) {
    const id = normalizeRequiredText3(input.id, "id");
    if (!id.ok) return Promise.resolve(id.error);
    const payload = buildWechatVirtualPayload({
      env: input.env,
      required: {
        id: id.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(GOODS_PATHS.startPublish, payload.data);
  }
  queryPublishTask(input) {
    return this.postWithEnvOnly(GOODS_PATHS.queryPublishTask, input.env);
  }
  postWithEnvOnly(path, env) {
    const payload = buildWechatXpayPayload({
      env
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(path, payload.data);
  }
};
function normalizeRequiredText3(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualGoods: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText3, "normalizeRequiredText");

// src/modules/wechat-virtual/merchant-finance.ts
var MERCHANT_FINANCE_PATHS = Object.freeze({
  queryBalance: "/.cloud/wechat-virtual-merchant-finance/v1/balance/query",
  createWithdrawal: "/.cloud/wechat-virtual-merchant-finance/v1/withdrawals/create",
  queryWithdrawal: "/.cloud/wechat-virtual-merchant-finance/v1/withdrawals/query",
  createOrderDownload: "/.cloud/wechat-virtual-merchant-finance/v1/order-downloads/create",
  queryOrderDownload: "/.cloud/wechat-virtual-merchant-finance/v1/order-downloads/query",
  downloadBill: "/.cloud/wechat-virtual-merchant-finance/v1/bills/download",
  downloadIOSSettlementBill: "/.cloud/wechat-virtual-merchant-finance/v1/ios-settlement-bills/download"
});
var WechatVirtualMerchantFinanceAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualMerchantFinanceAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  queryBalance(input) {
    const payload = buildWechatXpayPayload({
      env: input.env
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.queryBalance, payload.data);
  }
  createWithdrawal(input) {
    const withdrawNo = normalizeRequiredText4(input.withdrawNo, "withdrawNo");
    if (!withdrawNo.ok) return Promise.resolve(withdrawNo.error);
    if (input.withdrawAmount !== void 0 && (typeof input.withdrawAmount !== "number" || !Number.isFinite(input.withdrawAmount) || input.withdrawAmount <= 0)) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualMerchantFinance.createWithdrawal: withdrawAmount \u5FC5\u987B\u662F\u5927\u4E8E 0 \u7684\u6570\u5B57\u3002", {
        field: "withdrawAmount",
        value: input.withdrawAmount
      }));
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        withdrawNo: withdrawNo.value,
        withdrawAmount: input.withdrawAmount
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.createWithdrawal, payload.data);
  }
  queryWithdrawal(input) {
    const withdrawNo = normalizeRequiredText4(input.withdrawNo, "withdrawNo");
    if (!withdrawNo.ok) return Promise.resolve(withdrawNo.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        withdrawNo: withdrawNo.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.queryWithdrawal, payload.data);
  }
  createOrderDownload(input) {
    const beginDs = normalizeRequiredText4(input.beginDs, "beginDs");
    if (!beginDs.ok) return Promise.resolve(beginDs.error);
    const endDs = normalizeRequiredText4(input.endDs, "endDs");
    if (!endDs.ok) return Promise.resolve(endDs.error);
    const orderType = normalizeOptionalText3(input.orderType, "orderType");
    if (!orderType.ok) return Promise.resolve(orderType.error);
    const orderInfo = normalizeOptionalText3(input.orderInfo, "orderInfo");
    if (!orderInfo.ok) return Promise.resolve(orderInfo.error);
    const refundStatus = normalizeOptionalText3(input.refundStatus, "refundStatus");
    if (!refundStatus.ok) return Promise.resolve(refundStatus.error);
    const payChannel = normalizeOptionalText3(input.payChannel, "payChannel");
    if (!payChannel.ok) return Promise.resolve(payChannel.error);
    if (input.isProvided !== void 0 && typeof input.isProvided !== "boolean" && typeof input.isProvided !== "number") {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualMerchantFinance.createOrderDownload: isProvided \u5FC5\u987B\u662F\u5E03\u5C14\u503C\u6216\u6570\u5B57\u3002", {
        field: "isProvided",
        value: input.isProvided
      }));
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        beginDs: beginDs.value,
        endDs: endDs.value,
        orderType: orderType.value,
        orderInfo: orderInfo.value,
        isProvided: input.isProvided,
        refundStatus: refundStatus.value,
        payChannel: payChannel.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.createOrderDownload, payload.data);
  }
  queryOrderDownload(input) {
    const taskId = normalizeRequiredText4(input.taskId, "taskId");
    if (!taskId.ok) return Promise.resolve(taskId.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        taskId: taskId.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.queryOrderDownload, payload.data);
  }
  downloadBill(input) {
    const beginDs = normalizeRequiredText4(input.beginDs, "beginDs");
    if (!beginDs.ok) return Promise.resolve(beginDs.error);
    const endDs = normalizeRequiredText4(input.endDs, "endDs");
    if (!endDs.ok) return Promise.resolve(endDs.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        beginDs: beginDs.value,
        endDs: endDs.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.downloadBill, payload.data);
  }
  downloadIOSSettlementBill(input) {
    const startMonth = normalizeRequiredText4(input.startMonth, "startMonth");
    if (!startMonth.ok) return Promise.resolve(startMonth.error);
    const endMonth = normalizeRequiredText4(input.endMonth, "endMonth");
    if (!endMonth.ok) return Promise.resolve(endMonth.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        startMonth: startMonth.value,
        endMonth: endMonth.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_FINANCE_PATHS.downloadIOSSettlementBill, payload.data);
  }
};
function normalizeRequiredText4(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualMerchantFinance: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText4, "normalizeRequiredText");
function normalizeOptionalText3(value, field) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualMerchantFinance: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalText3, "normalizeOptionalText");

// src/modules/wechat-virtual/merchant-risk.ts
var MERCHANT_RISK_PATHS = Object.freeze({
  queryPunishmentReasons: "/.cloud/wechat-virtual-merchant-risk/v1/punishment-reasons/query"
});
var WechatVirtualMerchantRiskAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualMerchantRiskAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  queryPunishmentReasons(input) {
    const payload = buildWechatXpayPayload({
      env: input.env
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(MERCHANT_RISK_PATHS.queryPunishmentReasons, payload.data);
  }
};

// src/modules/wechat-virtual/payment.ts
var PAYMENT_PATHS = Object.freeze({
  sign: "/.cloud/wechat-virtual-payment/v1/payment/sign",
  queryOrder: "/.cloud/wechat-virtual-payment/v1/orders/query",
  createRefund: "/.cloud/wechat-virtual-payment/v1/refunds/create",
  queryRefund: "/.cloud/wechat-virtual-payment/v1/refunds/query",
  notifyProvideGoods: "/.cloud/wechat-virtual-payment/v1/orders/notify-provide-goods"
});
var WechatVirtualPaymentAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualPaymentAPI");
  }
  
  
  constructor(invoker, wx) {
    this.invoker = invoker;
    this.wx = wx;
  }
  sign(input) {
    const code = normalizeRequiredText5(input.code, "code");
    if (!code.ok) return Promise.resolve(code.error);
    const productId = normalizeRequiredText5(input.productId, "productId");
    if (!productId.ok) return Promise.resolve(productId.error);
    const outTradeNo = normalizeRequiredText5(input.outTradeNo, "outTradeNo");
    if (!outTradeNo.ok) return Promise.resolve(outTradeNo.error);
    const goodsPrice = normalizePositiveInteger(input.goodsPrice, "goodsPrice");
    if (!goodsPrice.ok) return Promise.resolve(goodsPrice.error);
    const buyQuantity = normalizePositiveInteger(input.buyQuantity, "buyQuantity");
    if (!buyQuantity.ok) return Promise.resolve(buyQuantity.error);
    let attach;
    if (input.attach !== void 0) {
      if (typeof input.attach !== "string") {
        return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualPayment.sign: attach \u5FC5\u987B\u662F\u5B57\u7B26\u4E32\u3002", {
          field: "attach",
          value: input.attach
        }));
      }
      attach = input.attach.trim();
    }
    const payload = buildWechatVirtualPayload({
      env: input.env,
      required: {
        code: code.value,
        productId: productId.value,
        goodsPrice: goodsPrice.value,
        buyQuantity: buyQuantity.value,
        outTradeNo: outTradeNo.value,
        attach
      }
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(PAYMENT_PATHS.sign, payload.data);
  }
  queryOrder(input) {
    const payload = buildOrderReferencePayload({
      env: input.env,
      orderId: input.orderId,
      wxOrderId: input.wxOrderId,
      body: input.body,
      methodName: "queryOrder",
      extraRequired: {}
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(PAYMENT_PATHS.queryOrder, payload.data);
  }
  createRefund(input) {
    const refundOrderId = normalizeOptionalText4(input.refundOrderId, "refundOrderId");
    if (!refundOrderId.ok) return Promise.resolve(refundOrderId.error);
    const refundReason = normalizeOptionalBoundedInteger(input.refundReason, "refundReason", 0, 5);
    if (!refundReason.ok) return Promise.resolve(refundReason.error);
    const reqFrom = normalizeOptionalBoundedInteger(input.reqFrom, "reqFrom", 1, 3);
    if (!reqFrom.ok) return Promise.resolve(reqFrom.error);
    if (input.leftFee !== void 0 && !isFiniteNumber(input.leftFee)) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualPayment.createRefund: leftFee \u5FC5\u987B\u4E3A\u6709\u9650\u6570\u5B57\u3002", {
        field: "leftFee",
        value: input.leftFee
      }));
    }
    if (input.refundFee !== void 0 && !isFiniteNumber(input.refundFee)) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualPayment.createRefund: refundFee \u5FC5\u987B\u4E3A\u6709\u9650\u6570\u5B57\u3002", {
        field: "refundFee",
        value: input.refundFee
      }));
    }
    const payload = buildOrderReferencePayload({
      env: input.env,
      orderId: input.orderId,
      wxOrderId: input.wxOrderId,
      body: input.body,
      methodName: "createRefund",
      extraRequired: {
        refundOrderId: refundOrderId.value,
        leftFee: input.leftFee,
        refundFee: input.refundFee,
        bizMeta: input.bizMeta,
        refundReason: refundReason.value,
        reqFrom: reqFrom.value
      }
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(PAYMENT_PATHS.createRefund, payload.data);
  }
  queryRefund(input) {
    const refundOrderId = normalizeOptionalText4(input.refundOrderId, "refundOrderId");
    if (!refundOrderId.ok) return Promise.resolve(refundOrderId.error);
    const identifiers = normalizeOrderIdentifiers({
      orderId: input.orderId,
      wxOrderId: input.wxOrderId,
      methodName: "queryRefund"
    });
    if (!identifiers.ok) {
      return Promise.resolve(identifiers.error);
    }
    if (!identifiers.value.orderId && !identifiers.value.wxOrderId) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualPayment.queryRefund: orderId \u6216 wxOrderId \u5FC5\u4F20\uFF08refundOrderId \u4E0D\u80FD\u5355\u72EC\u4F5C\u4E3A\u67E5\u8BE2\u952E\uFF09\u3002"));
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        ...identifiers.value,
        refundOrderId: refundOrderId.value
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(PAYMENT_PATHS.queryRefund, payload.data);
  }
  notifyProvideGoods(input) {
    const payload = buildOrderReferencePayload({
      env: input.env,
      orderId: input.orderId,
      wxOrderId: input.wxOrderId,
      body: input.body,
      methodName: "notifyProvideGoods",
      extraRequired: {}
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(PAYMENT_PATHS.notifyProvideGoods, payload.data);
  }
  requestVirtualPayment(input) {
    if (!isWechatVirtualEnv(input.env)) {
      return Promise.reject(new Error("wechatVirtualPayment.requestVirtualPayment: env \u5FC5\u987B\u4E3A 0 \u6216 1\u3002"));
    }
    for (const field of [
      "signData",
      "paySig",
      "signature"
    ]) {
      const value = input[field];
      if (typeof value !== "string" || value.trim() === "") {
        return Promise.reject(new Error(`wechatVirtualPayment.requestVirtualPayment: ${field} \u4E0D\u80FD\u4E3A\u7A7A\uFF08\u8BF7\u76F4\u63A5\u900F\u4F20 sign \u7684\u8FD4\u56DE\u4F53\uFF09\u3002`));
      }
    }
    const mode = _nullishCoalesce(input.mode, () => ( DEFAULT_VIRTUAL_PAYMENT_MODE));
    if (!WECHAT_VIRTUAL_PAYMENT_MODES.has(mode)) {
      return Promise.reject(new Error(`wechatVirtualPayment.requestVirtualPayment: mode \u5FC5\u987B\u4E3A ${[
        ...WECHAT_VIRTUAL_PAYMENT_MODES
      ].join(" \u6216 ")}\u3002`));
    }
    const requestVirtualPayment = this.wx.requestVirtualPayment;
    if (typeof requestVirtualPayment !== "function") {
      return Promise.reject(new Error("wechatVirtualPayment.requestVirtualPayment: \u5F53\u524D wx \u8FD0\u884C\u65F6\u4E0D\u652F\u6301 wx.requestVirtualPayment\u3002"));
    }
    return new Promise((resolve, reject) => {
      requestVirtualPayment.call(this.wx, {
        signData: input.signData,
        paySig: input.paySig,
        signature: input.signature,
        mode,
        success: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (result) => {
          invokeUserCallback(input.success, result);
          resolve(result);
        }, "success"),
        fail: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (result) => {
          invokeUserCallback(input.fail, result);
          reject(wrapVirtualPaymentFailure(result));
        }, "fail"),
        complete: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (result) => {
          invokeUserCallback(input.complete, result);
        }, "complete")
      });
    });
  }
};
var DEFAULT_VIRTUAL_PAYMENT_MODE = "short_series_goods";
var WECHAT_VIRTUAL_PAYMENT_MODES = /* @__PURE__ */ new Set([
  "short_series_goods",
  "short_series_coin"
]);
function buildOrderReferencePayload(params) {
  const identifiers = normalizeOrderIdentifiers({
    orderId: params.orderId,
    wxOrderId: params.wxOrderId,
    methodName: params.methodName
  });
  if (!identifiers.ok) {
    return identifiers.error;
  }
  if (!identifiers.value.orderId && !identifiers.value.wxOrderId) {
    return invalidWechatVirtualRequestResult(`wechatVirtualPayment.${params.methodName}: orderId \u4E0E wxOrderId \u81F3\u5C11\u4F20\u4E00\u4E2A\u3002`);
  }
  return buildWechatXpayPayload({
    env: params.env,
    required: {
      ...identifiers.value,
      ...params.extraRequired
    },
    body: params.body
  });
}
_chunkYTD42NT4cjs.__name.call(void 0, buildOrderReferencePayload, "buildOrderReferencePayload");
function normalizeOrderIdentifiers(params) {
  const orderId = normalizeOptionalText4(params.orderId, "orderId");
  if (!orderId.ok) {
    return {
      ok: false,
      error: orderId.error
    };
  }
  const wxOrderId = normalizeOptionalText4(params.wxOrderId, "wxOrderId");
  if (!wxOrderId.ok) {
    return {
      ok: false,
      error: wxOrderId.error
    };
  }
  return {
    ok: true,
    value: {
      orderId: orderId.value,
      wxOrderId: wxOrderId.value
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOrderIdentifiers, "normalizeOrderIdentifiers");
function normalizeRequiredText5(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualPayment: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText5, "normalizeRequiredText");
function normalizeOptionalText4(value, field) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualPayment: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalText4, "normalizeOptionalText");
function normalizePositiveInteger(value, field) {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualPayment.sign: ${field} \u5FC5\u987B\u662F\u6B63\u6574\u6570\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizePositiveInteger, "normalizePositiveInteger");
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
_chunkYTD42NT4cjs.__name.call(void 0, isFiniteNumber, "isFiniteNumber");
function normalizeOptionalBoundedInteger(value, field, min, max) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualPayment: ${field} \u5FC5\u987B\u662F ${min}~${max} \u7684\u6574\u6570\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalBoundedInteger, "normalizeOptionalBoundedInteger");
function invokeUserCallback(callback, value) {
  if (!callback) {
    return;
  }
  try {
    callback(value);
  } catch (e2) {
  }
}
_chunkYTD42NT4cjs.__name.call(void 0, invokeUserCallback, "invokeUserCallback");
function wrapVirtualPaymentFailure(result) {
  const error = new Error(`wx.requestVirtualPayment failed: ${result.errMsg}`);
  error.cause = result;
  return error;
}
_chunkYTD42NT4cjs.__name.call(void 0, wrapVirtualPaymentFailure, "wrapVirtualPaymentFailure");

// src/modules/wechat-virtual/subscriptions.ts
var SUBSCRIPTIONS_PATHS = Object.freeze({
  queryContract: "/.cloud/wechat-virtual-subscriptions/v1/contracts/query",
  sendPrePaymentNotice: "/.cloud/wechat-virtual-subscriptions/v1/pre-payments/send",
  submitPaymentOrder: "/.cloud/wechat-virtual-subscriptions/v1/payment-orders/submit",
  cancelContract: "/.cloud/wechat-virtual-subscriptions/v1/contracts/cancel"
});
var WechatVirtualSubscriptionsAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualSubscriptionsAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  queryContract(input) {
    return this.postWithContractReference(SUBSCRIPTIONS_PATHS.queryContract, input, "queryContract");
  }
  sendPrePaymentNotice(input) {
    if (input.deductPrice !== void 0 && (typeof input.deductPrice !== "number" || !Number.isFinite(input.deductPrice))) {
      return Promise.resolve(invalidWechatVirtualRequestResult("wechatVirtualSubscriptions.sendPrePaymentNotice: deductPrice \u5FC5\u987B\u662F\u6709\u9650\u6570\u5B57\u3002", {
        field: "deductPrice",
        value: input.deductPrice
      }));
    }
    return this.postWithContractReference(SUBSCRIPTIONS_PATHS.sendPrePaymentNotice, input, "sendPrePaymentNotice", {
      deductPrice: input.deductPrice
    });
  }
  submitPaymentOrder(input) {
    const productId = normalizeRequiredText6(input.productId, "productId", "submitPaymentOrder");
    if (!productId.ok) return Promise.resolve(productId.error);
    const orderId = normalizeRequiredText6(input.orderId, "orderId", "submitPaymentOrder");
    if (!orderId.ok) return Promise.resolve(orderId.error);
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        productId: productId.value,
        orderId: orderId.value,
        buyQuantity: input.buyQuantity,
        currencyType: input.currencyType,
        deductPrice: input.deductPrice,
        attach: input.attach
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(SUBSCRIPTIONS_PATHS.submitPaymentOrder, payload.data);
  }
  cancelContract(input) {
    const terminationReason = normalizeOptionalText5(input.terminationReason, "terminationReason", "cancelContract");
    if (!terminationReason.ok) {
      return Promise.resolve(terminationReason.error);
    }
    return this.postWithContractReference(SUBSCRIPTIONS_PATHS.cancelContract, input, "cancelContract", {
      terminationReason: terminationReason.value
    });
  }
  postWithContractReference(path, input, methodName, extraRequired = {}) {
    const outContractCode = normalizeRequiredText6(input.outContractCode, "outContractCode", methodName);
    if (!outContractCode.ok) {
      return Promise.resolve(outContractCode.error);
    }
    const productId = normalizeOptionalText5(input.productId, "productId", methodName);
    if (!productId.ok) {
      return Promise.resolve(productId.error);
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      required: {
        outContractCode: outContractCode.value,
        productId: productId.value,
        ...extraRequired
      },
      body: input.body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(path, payload.data);
  }
};
function normalizeRequiredText6(value, field, methodName) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualSubscriptions.${methodName}: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText6, "normalizeRequiredText");
function normalizeOptionalText5(value, field, methodName) {
  if (value === void 0 || value === null) {
    return {
      ok: true,
      value: void 0
    };
  }
  return normalizeRequiredText6(value, field, methodName);
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeOptionalText5, "normalizeOptionalText");

// src/modules/wechat-virtual/tokens.ts
var TOKENS_PATHS = Object.freeze({
  queryBalance: "/.cloud/wechat-virtual-tokens/v1/tokens/balance/query",
  pay: "/.cloud/wechat-virtual-tokens/v1/tokens/pay",
  createRefund: "/.cloud/wechat-virtual-tokens/v1/tokens/refunds/create",
  present: "/.cloud/wechat-virtual-tokens/v1/tokens/present"
});
var WechatVirtualTokensAPI = class {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "WechatVirtualTokensAPI");
  }
  
  constructor(invoker) {
    this.invoker = invoker;
  }
  queryBalance(input) {
    return this.postWithCode(TOKENS_PATHS.queryBalance, input, void 0);
  }
  pay(input) {
    return this.postWithCode(TOKENS_PATHS.pay, input, input.body);
  }
  createRefund(input) {
    return this.postWithCode(TOKENS_PATHS.createRefund, input, input.body);
  }
  present(input) {
    return this.postWithoutCode(TOKENS_PATHS.present, input, input.body);
  }
  postWithCode(path, input, body, extraRequired = {}) {
    const code = normalizeRequiredText7(input.code, "code");
    if (!code.ok) {
      return Promise.resolve(code.error);
    }
    const payload = buildWechatXpayPayload({
      env: input.env,
      // user_ip 由服务端从入站请求注入（客户端禁止提交），这里只发 code 与业务字段。
      required: {
        code: code.value,
        ...extraRequired
      },
      body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(path, payload.data);
  }
  /**
   * 不带 `code` 的代币调用（目前只有 `present`）。
   *
   * 官方 `present_currency` 没有用户态上下文，服务端也不要求 `code`；这里保持同一
   * 契约，避免调用方被迫传一个会被服务端丢掉的 `wx.login` code。
   */
  postWithoutCode(path, input, body) {
    const payload = buildWechatXpayPayload({
      env: input.env,
      body
    });
    if (payload.error) {
      return Promise.resolve({
        data: null,
        error: payload.error
      });
    }
    return this.invoker.post(path, payload.data);
  }
};
function normalizeRequiredText7(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    return {
      ok: false,
      error: invalidWechatVirtualRequestResult(`wechatVirtualTokens: ${field} \u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32\u3002`, {
        field,
        value
      })
    };
  }
  return {
    ok: true,
    value: value.trim()
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, normalizeRequiredText7, "normalizeRequiredText");

// src/modules/wechat-virtual/index.ts
function createMiniProgramWechatVirtualModules(params) {
  const invoker = createWechatVirtualRequestInvoker(params.endpoint, params.fetch);
  return {
    wechatVirtualPayment: new WechatVirtualPaymentAPI(invoker, params.wx),
    wechatVirtualGoods: new WechatVirtualGoodsAPI(invoker),
    wechatVirtualTokens: new WechatVirtualTokensAPI(invoker),
    wechatVirtualMerchantFinance: new WechatVirtualMerchantFinanceAPI(invoker),
    wechatVirtualComplaints: new WechatVirtualComplaintsAPI(invoker),
    wechatVirtualAdvertisingFunds: new WechatVirtualAdvertisingFundsAPI(invoker),
    wechatVirtualSubscriptions: new WechatVirtualSubscriptionsAPI(invoker),
    wechatVirtualMerchantRisk: new WechatVirtualMerchantRiskAPI(invoker)
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramWechatVirtualModules, "createMiniProgramWechatVirtualModules");

// src/platform/miniprogram/polyfills.ts
var MiniProgramHeaders = (_class = class MiniProgramHeaders2 {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "MiniProgramHeaders");
  }
  __init() {this.map = /* @__PURE__ */ new Map()}
  constructor(init) {;_class.prototype.__init.call(this);
    if (!init) return;
    if (init instanceof MiniProgramHeaders2) {
      for (const [key, value] of init.map) this.map.set(key, value);
      return;
    }
    if (Array.isArray(init)) {
      for (const [key, value] of init) this.set(key, value);
      return;
    }
    if (init instanceof Headers) {
      init.forEach((value, key) => this.set(key, value));
      return;
    }
    for (const [key, value] of Object.entries(init)) this.set(key, String(value));
  }
  normalize(name) {
    return name.toLowerCase();
  }
  set(name, value) {
    this.map.set(this.normalize(name), value);
  }
  get(name) {
    return _nullishCoalesce(this.map.get(this.normalize(name)), () => ( null));
  }
  has(name) {
    return this.map.has(this.normalize(name));
  }
  append(name, value) {
    const key = this.normalize(name);
    const existing = this.map.get(key);
    this.map.set(key, existing ? `${existing}, ${value}` : value);
  }
  delete(name) {
    this.map.delete(this.normalize(name));
  }
  forEach(callback) {
    this.map.forEach((value, key) => callback(value, key));
  }
  entries() {
    return this.map.entries();
  }
  /** 转成 `wx.request` 需要的 plain object header。 */
  toPlainObject() {
    return Object.fromEntries(this.map);
  }
}, _class);
var DEFAULT_MAX_BUFFERED_BYTES = 4 * 1024 * 1024;
var MiniProgramReadableStream = (_class2 = class MiniProgramReadableStream2 {
  static {
    _chunkYTD42NT4cjs.__name.call(void 0, this, "MiniProgramReadableStream");
  }
  __init2() {this.queue = []}
  __init3() {this.queuedBytes = 0}
  
  __init4() {this.closed = false}
  __init5() {this.error = null}
  __init6() {this.pendingResolve = null}
  __init7() {this.pendingReject = null}
  __init8() {this.cancelled = false}
  constructor(options) {;_class2.prototype.__init2.call(this);_class2.prototype.__init3.call(this);_class2.prototype.__init4.call(this);_class2.prototype.__init5.call(this);_class2.prototype.__init6.call(this);_class2.prototype.__init7.call(this);_class2.prototype.__init8.call(this);
    this.maxBufferedBytes = _nullishCoalesce(_optionalChain([options, 'optionalAccess', _15 => _15.maxBufferedBytes]), () => ( DEFAULT_MAX_BUFFERED_BYTES));
  }
  /** 供 fetch 适配层喂数据用，不是公开 API。超过字节上限时自动 abort。 */
  push(chunk) {
    if (this.cancelled || this.closed || this.error) return;
    if (this.queuedBytes + chunk.byteLength > this.maxBufferedBytes) {
      this.abort(new Error(`MiniProgramReadableStream: buffered bytes exceeded limit (${this.maxBufferedBytes}), aborting stream`));
      return;
    }
    this.queuedBytes += chunk.byteLength;
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve({
        done: false,
        value: chunk
      });
    } else {
      this.queue.push(chunk);
    }
  }
  /** 供 fetch 适配层在请求正常结束时调用，不是公开 API。 */
  close() {
    if (this.closed || this.error) return;
    this.closed = true;
    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingReject = null;
      resolve({
        done: true
      });
    }
  }
  /**
   * 供 fetch 适配层在检测到「流已经开始但实际是错误响应/请求异常终止」
   * 时调用，不是公开 API。跟 `close()` 的区别：`close()` 是正常 EOF，
   * `abort()` 让当前挂起的 `read()` 与后续所有 `read()` 都 reject，
   * 避免调用方把截断的错误响应体误判为一段正常收完的 SSE 内容。
   */
  abort(err) {
    if (this.closed || this.error) return;
    this.error = err;
    this.closed = true;
    this.queue.length = 0;
    this.queuedBytes = 0;
    if (this.pendingReject) {
      const reject = this.pendingReject;
      this.pendingResolve = null;
      this.pendingReject = null;
      reject(err);
    }
  }
  getReader() {
    return {
      read: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => {
        if (this.cancelled) {
          return Promise.resolve({
            done: true
          });
        }
        if (this.queue.length > 0) {
          const value = this.queue.shift();
          if (value) this.queuedBytes -= value.byteLength;
          return Promise.resolve({
            done: false,
            value
          });
        }
        if (this.error) {
          return Promise.reject(this.error);
        }
        if (this.closed) {
          return Promise.resolve({
            done: true
          });
        }
        return new Promise((resolve, reject) => {
          this.pendingResolve = resolve;
          this.pendingReject = reject;
        });
      }, "read"),
      cancel: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => {
        this.cancelled = true;
        this.queue.length = 0;
        this.queuedBytes = 0;
        return Promise.resolve();
      }, "cancel"),
      releaseLock: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => {
      }, "releaseLock")
    };
  }
}, _class2);
function isStreamingSupported() {
  return typeof globalThis.ReadableStream !== "undefined";
}
_chunkYTD42NT4cjs.__name.call(void 0, isStreamingSupported, "isStreamingSupported");
function ensureMiniProgramPolyfills() {
  const g = globalThis;
  if (typeof g.Headers === "undefined") {
    g.Headers = MiniProgramHeaders;
  }
  if (typeof g.ReadableStream === "undefined") {
    g.ReadableStream = MiniProgramReadableStream;
  }
}
_chunkYTD42NT4cjs.__name.call(void 0, ensureMiniProgramPolyfills, "ensureMiniProgramPolyfills");

// src/platform/miniprogram/fetch.ts
function headersToPlainObject(headers) {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const out = {};
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return {
    ...headers
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, headersToPlainObject, "headersToPlainObject");
function isStreamingRequest(headers) {
  const accept = _nullishCoalesce(headers["Accept"], () => ( headers["accept"]));
  return accept === "text/event-stream";
}
_chunkYTD42NT4cjs.__name.call(void 0, isStreamingRequest, "isStreamingRequest");
function buildResponse(params) {
  const status = params.status;
  const ok2 = status >= 200 && status < 300;
  const bodyText = _nullishCoalesce(params.bodyText, () => ( ""));
  const unsupportedBinaryBody = /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (method) => () => Promise.reject(new Error(`createMiniProgramFetch: Response.${method}() \u4E0D\u53D7\u652F\u6301 \u2014\u2014 \u5C0F\u7A0B\u5E8F\u9002\u914D\u5C42\u7528\u6587\u672C\u65B9\u5F0F\u53D6\u54CD\u5E94\u4F53\uFF0C\u6CA1\u6709\u539F\u59CB\u4E8C\u8FDB\u5236\u6570\u636E\uFF0C\u4E5F\u6CA1\u6709\u5168\u5C40 Blob \u53EF\u7528\u3002\u4F9D\u8D56\u4E8C\u8FDB\u5236\u4E0B\u8F7D\u7684\u80FD\u529B\uFF08\u5982 Storage \u6587\u4EF6\u4E0B\u8F7D\uFF09\u5728\u5C0F\u7A0B\u5E8F\u8FD0\u884C\u65F6\u6682\u4E0D\u53EF\u7528\uFF0C\u9700\u8981\u5355\u72EC\u8BBE\u8BA1\u540E\u518D\u63A5\u5165\u3002`)), "unsupportedBinaryBody");
  const response = {
    status,
    statusText: _nullishCoalesce(params.statusText, () => ( "")),
    ok: ok2,
    // 全局 Headers 由 ensureMiniProgramPolyfills 保证存在（原生或占位实现）。
    headers: new Headers(params.headers),
    // 非流式路径 SDK 只消费 text()/json()，body 置 null（与原生对无体
    // 响应的语义一致）；流式必须保留 MiniProgramReadableStream，
    // 下游 iterSSEEvents 直接对它 getReader()。
    body: _nullishCoalesce(params.stream, () => ( null)),
    text: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => Promise.resolve(bodyText), "text"),
    // 解析失败要和原生 Response.json() 一致：返回 rejected promise
    // （SyntaxError），既不同步 throw，也不吞错。
    json: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => new Promise((resolve, reject) => {
      try {
        resolve(JSON.parse(bodyText));
      } catch (error) {
        reject(error);
      }
    }), "json"),
    blob: unsupportedBinaryBody("blob"),
    arrayBuffer: unsupportedBinaryBody("arrayBuffer")
  };
  return response;
}
_chunkYTD42NT4cjs.__name.call(void 0, buildResponse, "buildResponse");
function createMiniProgramFetch(wxInstance = globalThis.wx) {
  if (!wxInstance) {
    throw new Error("createMiniProgramFetch: \u672A\u627E\u5230\u5168\u5C40 wx \u5BF9\u8C61\uFF0C\u8BF7\u5728\u5C0F\u7A0B\u5E8F\u73AF\u5883\u8C03\u7528\uFF0C\u6216\u663E\u5F0F\u4F20\u5165 wxInstance\u3002");
  }
  ensureMiniProgramPolyfills();
  return /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, async function miniProgramFetch(input, init) {
    if (typeof input !== "string") {
      throw new Error("createMiniProgramFetch: \u6682\u4E0D\u652F\u6301\u975E\u5B57\u7B26\u4E32 input\uFF0C\u8BF7\u4F20 URL \u5B57\u7B26\u4E32\u3002");
    }
    const url = input;
    const method = (_nullishCoalesce(_optionalChain([init, 'optionalAccess', _16 => _16.method]), () => ( "GET"))).toUpperCase();
    const reqHeaders = headersToPlainObject(_optionalChain([init, 'optionalAccess', _17 => _17.headers]));
    const streaming = isStreamingRequest(reqHeaders);
    let requestBody;
    if (typeof _optionalChain([init, 'optionalAccess', _18 => _18.body]) === "string") {
      requestBody = init.body;
    } else if (_optionalChain([init, 'optionalAccess', _19 => _19.body]) !== void 0 && _optionalChain([init, 'optionalAccess', _20 => _20.body]) !== null) {
      throw new Error("createMiniProgramFetch: \u6682\u4E0D\u652F\u6301\u975E\u5B57\u7B26\u4E32 body\uFF08ArrayBuffer/FormData \u5F85\u8865\uFF09\u3002");
    }
    if (_optionalChain([init, 'optionalAccess', _21 => _21.signal, 'optionalAccess', _22 => _22.aborted])) {
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      throw err;
    }
    if (!streaming) {
      return new Promise((resolve, reject) => {
        const task = wxInstance.request({
          url,
          method,
          header: reqHeaders,
          data: requestBody,
          responseType: "text",
          success(result) {
            resolve(buildResponse({
              status: result.statusCode,
              headers: result.header,
              bodyText: typeof result.data === "string" ? result.data : JSON.stringify(result.data)
            }));
          },
          fail(result) {
            reject(new Error(`wx.request failed: ${result.errMsg}`));
          }
        });
        _optionalChain([init, 'optionalAccess', _23 => _23.signal, 'optionalAccess', _24 => _24.addEventListener, 'call', _25 => _25("abort", () => {
          task.abort();
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        }, {
          once: true
        })]);
      });
    }
    return new Promise((resolve, reject) => {
      const stream = new MiniProgramReadableStream();
      let resolved = false;
      let receivedHeaders = {};
      const options = {
        url,
        method,
        header: reqHeaders,
        data: requestBody,
        enableChunked: true,
        success(result) {
          const isSuccessStatus = result.statusCode >= 200 && result.statusCode < 300;
          if (!resolved) {
            resolved = true;
            resolve(buildResponse({
              status: result.statusCode,
              headers: result.header,
              stream
            }));
            stream.close();
            return;
          }
          if (isSuccessStatus) {
            stream.close();
          } else {
            stream.abort(new Error(`wx.request (chunked) resolved with non-2xx status ${result.statusCode}`));
          }
        },
        fail(result) {
          const err = new Error(`wx.request (chunked) failed: ${result.errMsg}`);
          if (!resolved) {
            resolved = true;
            reject(err);
            return;
          }
          stream.abort(err);
        }
      };
      const task = wxInstance.request(options);
      _optionalChain([task, 'access', _26 => _26.onHeadersReceived, 'optionalCall', _27 => _27((headerResult) => {
        receivedHeaders = _nullishCoalesce(headerResult.header, () => ( {}));
      })]);
      task.onChunkReceived((chunk) => {
        if (!resolved) {
          resolved = true;
          resolve(buildResponse({
            status: 200,
            headers: receivedHeaders,
            stream
          }));
        }
        stream.push(new Uint8Array(chunk.data));
      });
      _optionalChain([init, 'optionalAccess', _28 => _28.signal, 'optionalAccess', _29 => _29.addEventListener, 'call', _30 => _30("abort", () => {
        task.abort();
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        if (!resolved) {
          resolved = true;
          reject(err);
          return;
        }
        stream.abort(err);
      }, {
        once: true
      })]);
    });
  }, "miniProgramFetch");
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramFetch, "createMiniProgramFetch");

// src/platform/miniprogram/storage.ts
function createMiniProgramStorage(wxInstance = globalThis.wx) {
  if (!wxInstance) {
    throw new Error("createMiniProgramStorage: \u672A\u627E\u5230\u5168\u5C40 wx \u5BF9\u8C61\uFF0C\u8BF7\u5728\u5C0F\u7A0B\u5E8F\u73AF\u5883\u8C03\u7528\uFF0C\u6216\u663E\u5F0F\u4F20\u5165 wxInstance\u3002");
  }
  return {
    getItem(key) {
      try {
        const value = wxInstance.getStorageSync(key);
        if (value === void 0 || value === null || value === "") {
          return null;
        }
        return typeof value === "string" ? value : JSON.stringify(value);
      } catch (err) {
        console.warn("[MiniProgramStorage] getItem failed", key, err);
        return null;
      }
    },
    setItem(key, value) {
      try {
        wxInstance.setStorageSync(key, value);
      } catch (err) {
        console.warn("[MiniProgramStorage] setItem failed", key, err);
      }
    },
    removeItem(key) {
      try {
        wxInstance.removeStorageSync(key);
      } catch (err) {
        console.warn("[MiniProgramStorage] removeItem failed", key, err);
      }
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramStorage, "createMiniProgramStorage");

// src/platform/miniprogram/workbuddy-state.ts
async function createMiniProgramState(wx) {
  const randomValues = await new Promise((resolve, reject) => {
    if (!wx.getRandomValues) {
      reject(new Error("workbuddy sign-in requires wx.getRandomValues"));
      return;
    }
    wx.getRandomValues({
      length: 32,
      success: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (result) => resolve(result.randomValues), "success"),
      fail: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (result) => reject(new Error(result.errMsg)), "fail")
    });
  });
  return base64UrlEncode(new Uint8Array(randomValues));
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramState, "createMiniProgramState");
var BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
function base64UrlEncode(bytes) {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const value = bytes[i] << 16 | (_nullishCoalesce(bytes[i + 1], () => ( 0))) << 8 | (_nullishCoalesce(bytes[i + 2], () => ( 0)));
    output += BASE64URL[value >>> 18 & 63] + BASE64URL[value >>> 12 & 63];
    if (i + 1 < bytes.length) output += BASE64URL[value >>> 6 & 63];
    if (i + 2 < bytes.length) output += BASE64URL[value & 63];
  }
  return output;
}
_chunkYTD42NT4cjs.__name.call(void 0, base64UrlEncode, "base64UrlEncode");

// src/platform/miniprogram/workbuddy-auth.ts
function createMiniProgramWorkBuddyPlatform(wx, applicationId) {
  return {
    applicationId,
    getEnvVersion: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => _optionalChain([wx, 'access', _31 => _31.getAccountInfoSync, 'optionalCall', _32 => _32(), 'access', _33 => _33.miniProgram, 'access', _34 => _34.envVersion]), "getEnvVersion"),
    createState: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => createMiniProgramState(wx), "createState"),
    navigate(options) {
      return new Promise((resolve) => {
        if (!wx.navigateToMiniProgram) {
          resolve({
            data: null,
            error: {
              kind: "unimplemented",
              status: 0,
              message: "wx.navigateToMiniProgram is unavailable"
            }
          });
          return;
        }
        wx.navigateToMiniProgram({
          appId: options.appId,
          path: options.path,
          envVersion: options.envVersion,
          extraData: options.extraData,
          success: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, () => resolve({
            data: null,
            error: null
          }), "success"),
          fail: /* @__PURE__ */ _chunkYTD42NT4cjs.__name.call(void 0, (cause) => resolve({
            data: null,
            error: {
              kind: "invalid-request",
              status: 0,
              code: /cancel/i.test(cause.errMsg) ? "cancelled" : "navigation_failed",
              message: cause.errMsg,
              cause
            }
          }), "fail")
        });
      });
    }
  };
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramWorkBuddyPlatform, "createMiniProgramWorkBuddyPlatform");

// src/platform/miniprogram/index.ts
function createMiniProgramWorkBuddyCloud(options) {
  const wxInstance = _nullishCoalesce(options.wx, () => ( globalThis.wx));
  if (!wxInstance) {
    throw new Error("createMiniProgramWorkBuddyCloud: \u672A\u627E\u5230\u5168\u5C40 wx \u5BF9\u8C61\uFF0C\u8BF7\u5728\u5C0F\u7A0B\u5E8F\u73AF\u5883\u8C03\u7528\uFF0C\u6216\u663E\u5F0F\u4F20\u5165 options.wx\u3002");
  }
  ensureMiniProgramPolyfills();
  const runtimeConfig = _chunkYTD42NT4cjs.resolveRuntimeConfig.call(void 0, {
    endpoint: options.endpoint,
    oauthRelayBaseUrl: options.oauthRelayBaseUrl,
    publishableKey: options.publishableKey,
    fetch: createMiniProgramFetch(wxInstance)
  });
  const cloud = new (0, _chunkYTD42NT4cjs.WorkBuddyCloudClient)(runtimeConfig, {
    storage: createMiniProgramStorage(wxInstance),
    workBuddyMiniProgram: createMiniProgramWorkBuddyPlatform(wxInstance, options.workBuddyOAuthClientId)
  });
  const wechatVirtualModules = createMiniProgramWechatVirtualModules({
    endpoint: runtimeConfig.endpoint,
    fetch: _chunkYTD42NT4cjs.createCloudFetch.call(void 0, runtimeConfig, () => cloud.auth.getAccessToken()),
    wx: wxInstance
  });
  return Object.assign(cloud, wechatVirtualModules);
}
_chunkYTD42NT4cjs.__name.call(void 0, createMiniProgramWorkBuddyCloud, "createMiniProgramWorkBuddyCloud");










exports.MiniProgramHeaders = MiniProgramHeaders; exports.MiniProgramReadableStream = MiniProgramReadableStream; exports.createMiniProgramFetch = createMiniProgramFetch; exports.createMiniProgramStorage = createMiniProgramStorage; exports.createMiniProgramWorkBuddyCloud = createMiniProgramWorkBuddyCloud; exports.ensureMiniProgramPolyfills = ensureMiniProgramPolyfills; exports.isStreamingSupported = isStreamingSupported; exports.isWechatVirtualReauthorizationRequired = isWechatVirtualReauthorizationRequired; exports.resolveWechatVirtualPermission = resolveWechatVirtualPermission;
