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
        const target = (this.data.items || []).find(item => String(item.id) === String(id));
        this.setData({ busy: true });
        // 课程被删后可能又重新导入了同一节；直接恢复会留下两条一模一样的课。
        // 网格显示层会去重，用户看不到，但云端会越积越多。
        if (target) {
            const settingsResult = await store.syncSettings();
            const role = settingsResult.error ? null : settingsResult.data.role;
            const existingResult = role ? await store.listCourses(role) : { data: [], error: null };
            const duplicate = (existingResult.data || []).some(course => S.isSameCourseSlot(course, target));
            if (duplicate) {
                this.setData({ busy: false });
                const force = await new Promise((resolve) => {
                    wx.showModal({
                        title: '课表里已有同一节课',
                        content: '「' + target.title + '」在当前身份的课表里已经存在，继续恢复会出现重复。确定仍要恢复吗？',
                        confirmText: '仍然恢复',
                        cancelText: '先不恢复',
                        success: res => resolve(Boolean(res.confirm)),
                        fail: () => resolve(false),
                    });
                });
                if (!force) return;
                this.setData({ busy: true });
            }
        }
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
