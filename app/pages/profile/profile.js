const { cloud } = require('../../utils/cloud');
const { ROLES } = require('../../utils/config');
const store = require('../../utils/store');

Page({
    data: {
        authState: 'checking',
        loading: true,
        errorText: '',
        displayName: '微信用户',
        initial: '微',
        avatarUrl: '',
        role: 'student',
        roleName: '学生',
        roleIcon: '🎒',
        roleDesc: '管理我自己的课表',
        roleOptions: [],
        showRolePicker: false,
        courseCount: 0,
        periodCount: 0,
        importCount: 0,
        signOutBusy: false,
    },

    onShow() {
        this.restore();
    },

    async restore() {
        this.setData({ authState: 'checking', loading: true });
        const result = await getApp().ensureSession();
        if (result.error || !result.data) {
            getApp().resetSession();
            this.setData({ authState: 'signed-out', loading: false });
            return;
        }
        const user = (result.data && result.data.user) || {};
        const name = user.name || '微信用户';
        this.setData({
            authState: 'signed-in',
            displayName: name,
            initial: String(name).charAt(0) || '微',
            avatarUrl: user.avatarUrl || '',
        });
        await this.load();
    },

    async load() {
        this.setData({ loading: true, errorText: '' });
        const results = await Promise.all([
            store.ensureSettings(),
            store.listCourses(),
            store.listPeriods(),
            store.listImports(),
        ]);
        const problem = results.find(item => item && item.error);
        if (problem) {
            this.setData({ loading: false, errorText: problem.error.message || '加载失败' });
            return;
        }
        const settings = results[0].data;
        const role = ROLES.find(item => item.key === settings.role) || ROLES[0];
        this.settings = settings;
        this.setData({
            loading: false,
            errorText: '',
            role: role.key,
            roleName: role.name,
            roleIcon: role.icon,
            roleDesc: role.desc,
            courseCount: (results[1].data || []).length,
            periodCount: (results[2].data || []).length,
            importCount: (results[3].data || []).length,
        });
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    onDemo() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    openRolePicker() {
        const options = ROLES.map(item => Object.assign({}, item, { selected: item.key === this.data.role }));
        this.setData({ showRolePicker: true, roleOptions: options });
    },

    closeRolePicker() {
        this.setData({ showRolePicker: false });
    },

    async pickRole(event) {
        const key = event.currentTarget.dataset.key;
        this.setData({ showRolePicker: false });
        if (!key || key === this.data.role) return;
        const result = await store.saveSettings({ role: key });
        if (result.error) {
            wx.showToast({ title: result.error.message || '切换失败', icon: 'none' });
            return;
        }
        const role = ROLES.find(item => item.key === key) || ROLES[0];
        this.settings = result.data;
        getApp().globalData.settings = result.data;
        this.setData({ role: role.key, roleName: role.name, roleIcon: role.icon, roleDesc: role.desc });
        wx.showToast({ title: '已切换为' + role.name, icon: 'success' });
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    goImport() {
        wx.switchTab({ url: '/pages/import/import' });
    },

    async signOut() {
        if (this.data.signOutBusy) return;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '退出登录？',
                content: '课表已保存在云端，退出后用同一个微信登录仍可查看。',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        this.setData({ signOutBusy: true });
        const result = await cloud.auth.signOut();
        this.setData({ signOutBusy: false });
        if (result && result.error) {
            wx.showToast({ title: result.error.message || '退出失败', icon: 'none' });
            return;
        }
        getApp().resetSession();
        this.restore();
    },

    onRetry() {
        this.restore();
    },

    noop() {},
});
