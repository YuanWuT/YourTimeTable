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

    ensureSession() {
        if (!this.sessionPromise) {
            this.sessionPromise = cloud.auth.getSession();
        }
        return this.sessionPromise;
    },

    resetSession() {
        this.sessionPromise = null;
    },
});
