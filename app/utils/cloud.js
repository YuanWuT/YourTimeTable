// 全局唯一的云服务客户端。所有页面 / 工具都复用这个实例。
const { createMiniProgramWorkBuddyCloud } = require('@tencent-ai/workbuddy-cloud-sdk/miniprogram');
const { createDiagnosticWx } = require('./workbuddy-cloud-diagnostics');
const { publicConfig } = require('./config');

// H5 预览环境对 wx 的实现可能不完整：getAccountInfoSync 缺失或返回空对象时
// 不能让诊断适配器在初始化阶段抛错，导致整个小程序白屏。
const nativeWx = typeof wx === 'object' && wx !== null ? wx : {};

// 显式绑定诊断适配器会转发的方法，避免部分运行时把 wx 的 API 挂在不可枚举属性上。
const delegates = {};
[
    'request',
    'getStorageSync',
    'setStorageSync',
    'removeStorageSync',
    'getRandomValues',
    'navigateToMiniProgram',
].forEach((key) => {
    if (typeof nativeWx[key] === 'function') delegates[key] = nativeWx[key].bind(nativeWx);
});

const safeWx = Object.assign({}, nativeWx, delegates, {
    getAccountInfoSync() {
        try {
            const info = typeof nativeWx.getAccountInfoSync === 'function'
                ? nativeWx.getAccountInfoSync()
                : null;
            if (info && info.miniProgram) return info;
        } catch (e) {
            // 预览环境不支持时返回空 appid，诊断日志仍可正常工作
        }
        return { miniProgram: { appId: '', envVersion: 'develop' } };
    },
});

const cloud = createMiniProgramWorkBuddyCloud({
    endpoint: publicConfig.endpoint,
    publishableKey: publicConfig.publishableKey,
    workBuddyOAuthClientId: publicConfig.workBuddyOAuthClientId,
    wx: createDiagnosticWx(safeWx),
});

module.exports = { cloud };
