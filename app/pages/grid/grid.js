const { ROLES } = require('../../utils/config');
const store = require('../../utils/store');
const S = require('../../utils/schedule');

Page({
    data: {
        authState: 'checking',
        loading: true,
        errorText: '',
        roleName: '学生',
        columns: [],
        timeRail: [],
        courseCount: 0,
        deletedCount: 0,
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
        const role = settingsResult.data.role;
        const results = await Promise.all([
            store.listPeriods(),
            store.listCourses(role),
            store.listDeletedCourses(role),
        ]);
        const problem = results.find(item => item && item.error);
        if (problem) {
            this.setData({ loading: false, errorText: problem.error.message || '加载课表失败' });
            return;
        }
        const periods = results[0].data || [];
        const courses = results[1].data || [];
        const today = new Date();
        // 录入网格展示所有周次的课程，不做单双周过滤
        const grid = S.buildWeekColumns(courses, periods, S.mondayOf(today), 'all', S.formatDate(today));
        const roleInfo = ROLES.find(item => item.key === role) || ROLES[0];
        this.setData({
            loading: false,
            errorText: '',
            roleName: roleInfo.name,
            columns: grid.columns,
            timeRail: grid.slots,
            courseCount: courses.length,
            deletedCount: (results[2].data || []).length,
        });
    },

    findCell(day, period) {
        const column = (this.data.columns || []).find(item => Number(item.day) === day);
        if (!column) return null;
        return (column.cells || []).find(item => Number(item.periodNo) === period) || null;
    },

    onCellTap(event) {
        const day = Number(event.currentTarget.dataset.day);
        const period = Number(event.currentTarget.dataset.period);
        const cell = this.findCell(day, period);
        if (!cell) return;
        const list = cell.courses || [];
        if (list.length === 0) {
            wx.navigateTo({ url: '/pages/course-edit/course-edit?day=' + day + '&period=' + period });
            return;
        }
        if (list.length === 1) {
            this.showCourseActions(list[0]);
            return;
        }
        wx.showActionSheet({
            itemList: list.slice(0, 6).map(c => c.title + ' · ' + c.timeText),
            success: (res) => {
                const picked = list[res.tapIndex];
                if (picked) this.showCourseActions(picked);
            },
            fail: () => {},
        });
    },

    showCourseActions(course) {
        wx.showActionSheet({
            itemList: ['编辑这节课', '删除这节课'],
            success: (res) => {
                if (res.tapIndex === 0) {
                    wx.navigateTo({ url: '/pages/course-edit/course-edit?id=' + course.id });
                } else if (res.tapIndex === 1) {
                    this.confirmRemove(course);
                }
            },
            fail: () => {},
        });
    },

    async confirmRemove(course) {
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '删除「' + course.title + '」？',
                content: '会移到「已删除的课程」，随时可以恢复。',
                confirmText: '删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        const result = await store.removeCourse(course.id);
        if (result.error) {
            wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已移入已删除', icon: 'success' });
        await this.load();
    },

    onAddFree() {
        wx.navigateTo({ url: '/pages/course-edit/course-edit' });
    },

    goRecycle() {
        wx.navigateTo({ url: '/pages/recycle/recycle' });
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    onRetry() {
        this.restore();
    },

    onDemo() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    noop() {},
});
