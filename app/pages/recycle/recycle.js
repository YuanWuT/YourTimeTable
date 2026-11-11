const store = require('../../utils/store');
const S = require('../../utils/schedule');

Page({
    data: {
        authState: 'checking',
        loading: true,
        errorText: '',
        items: [],
        busy: false,
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
        this.setData({ authState: 'signed-in' });
        await this.load();
    },

    async load() {
        this.setData({ loading: true, errorText: '' });
        const settingsResult = await store.syncSettings();
        if (settingsResult.error) {
            this.setData({ loading: false, errorText: settingsResult.error.message || '加载设置失败' });
            return;
        }
        const result = await store.listDeletedCourses(settingsResult.data.role);
        if (result.error) {
            this.setData({ loading: false, errorText: result.error.message || '加载失败' });
            return;
        }
        this.setData({
            loading: false,
            errorText: '',
            items: S.styledCourses(result.data || []),
        });
    },

    async restoreOne(event) {
        if (this.data.busy) return;
        const id = event.currentTarget.dataset.id;
        this.setData({ busy: true });
        const result = await store.restoreCourse(id);
        this.setData({ busy: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '恢复失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已恢复到课表', icon: 'success' });
        await this.load();
    },

    async purgeOne(event) {
        if (this.data.busy) return;
        const id = event.currentTarget.dataset.id;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '彻底删除？',
                content: '彻底删除后无法再恢复，需要重新录入。',
                confirmText: '彻底删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        this.setData({ busy: true });
        const result = await store.purgeCourse(id);
        this.setData({ busy: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已彻底删除', icon: 'success' });
        await this.load();
    },

    goSchedule() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    goBack() {
        wx.navigateBack();
    },

    onRetry() {
        this.restore();
    },

    onDemo() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    noop() {},
});
