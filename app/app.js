const { cloud } = require('./utils/cloud');

App({
    globalData: {
        appName: '你的课程表',
        settings: null,
        courses: [],
        periods: [],
    },

    onLaunch() {
        // 会话恢复由各页面 onShow 通过 ensureSession() 完成。
        // 不使用本地存储伪造登录态：跨设备数据一律以云端会话为准。
    },

    // 会话只缓存 10 分钟：token 过期后会自动重新取，不会永久拿着失效会话。
    // 页面遇到登录态异常时也可以传 true 强制刷新一次。
    ensureSession(force) {
        const stale = Date.now() - (this.sessionAt || 0) > 10 * 60 * 1000;
        if (force || stale || !this.sessionPromise) {
            const pending = Promise.resolve().then(() => cloud.auth.getSession());
            // 取会话异常时返回与业务层一致的 { data, error }，页面会落到登录面板而不是白屏；
            // 同时清掉缓存，用户点「重新登录」能立刻重试。
            this.sessionPromise = pending.catch((error) => {
                this.sessionPromise = null;
                this.sessionAt = 0;
                return { data: null, error: { message: (error && error.message) || '登录状态获取失败，请重试' } };
            });
            this.sessionAt = Date.now();
        }
        return this.sessionPromise;
    },

    // 退出登录 / 切换账号时把内存里的课表一起清掉，避免新账号先看到旧账号数据
    resetSession() {
        this.sessionPromise = null;
        this.sessionAt = 0;
        this.globalData.settings = null;
        this.globalData.courses = [];
        this.globalData.periods = [];
    },
});
