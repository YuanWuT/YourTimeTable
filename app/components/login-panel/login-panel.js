const { cloud } = require('../../utils/cloud');

Component({
    properties: {
        title: { type: String, value: '登录后查看我的课程表' },
    },

    data: {
        loggingIn: false,
        errorText: '',
    },

    methods: {
        onWechatLogin() {
            if (this.data.loggingIn) return;
            this.setData({ loggingIn: true, errorText: '' });

            if (typeof wx.login !== 'function') {
                this.setData({
                    loggingIn: false,
                    errorText: '当前是网页预览环境，无法完成微信登录。请在微信里打开体验版或正式版后登录。',
                });
                return;
            }

            wx.login({
                success: async (result) => {
                    const code = result && result.code;
                    if (!code) {
                        this.setData({ loggingIn: false, errorText: '微信登录凭证获取失败，请重试' });
                        return;
                    }
                    let appid = '';
                    try {
                        const info = typeof wx.getAccountInfoSync === 'function' ? wx.getAccountInfoSync() : null;
                        appid = info && info.miniProgram ? info.miniProgram.appId : '';
                    } catch (error) {
                        appid = '';
                    }
                    if (!appid) {
                        this.setData({
                            loggingIn: false,
                            errorText: '当前环境没有可用的小程序 AppID，请在微信客户端内打开体验版或正式版登录。',
                        });
                        return;
                    }
                    try {
                        const signIn = await cloud.auth.signInWithWechat(code, appid);
                        if (signIn.error || !signIn.data) {
                            this.setData({
                                loggingIn: false,
                                errorText: (signIn.error && signIn.error.message) || '微信登录失败，请确认已开启微信登录后重试',
                            });
                            return;
                        }
                        getApp().resetSession();
                        this.setData({ loggingIn: false, errorText: '' });
                        this.triggerEvent('signedin', { user: signIn.data.user || null });
                    } catch (error) {
                        console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
                            stage: 'wechat-login-handler',
                            message: error && error.message ? error.message : '微信登录失败，请重试',
                        }));
                        this.setData({ loggingIn: false, errorText: '微信登录失败，请稍后重试' });
                    }
                },
                fail: (error) => {
                    console.error('[WorkBuddy Cloud] login failed', JSON.stringify({
                        stage: 'wx.login',
                        message: (error && error.errMsg) || 'wx.login failed',
                    }));
                    this.setData({
                        loggingIn: false,
                        errorText: '无法调起微信登录，请在微信客户端内打开后重试',
                    });
                },
            });
        },

        onDemo() {
            this.triggerEvent('demo');
        },
    },
});
