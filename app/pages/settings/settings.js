const store = require('../../utils/store');
const reminder = require('../../utils/reminder');
const S = require('../../utils/schedule');

const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];
const PERIOD_COUNT_OPTIONS = [4, 5, 6, 7, 8, 10, 12];

Page({
    data: {
        authState: 'checking',
        loading: true,
        saving: false,
        errorText: '',
        termStart: '',
        periods: [],
        remindEnabled: true,
        leadIndex: 3,
        leadLabels: LEAD_OPTIONS.map(value => value === 0 ? '上课时提醒' : '提前 ' + value + ' 分钟'),
        templatesReady: false,
        subscribeStatus: '未开启',
        courseCount: 0,
        calendarBusy: false,
        periodCountOptions: PERIOD_COUNT_OPTIONS,
        periodCountLabels: PERIOD_COUNT_OPTIONS.map(n => n + ' 节'),
        periodCountIndex: 3,
    },

    onLoad(options) {
        // 从「我的」页点作息节次统计进来时，直接定位到作息节次卡片
        this.focusPeriods = Boolean(options && options.focus === 'periods');
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
        const settings = settingsResult.data;
        const results = await Promise.all([
            store.listPeriods(),
            store.listCourses(settings.role),
        ]);
        const problem = results.find(item => item && item.error);
        if (problem) {
            this.setData({ loading: false, errorText: problem.error.message || '加载设置失败' });
            return;
        }
        const periods = results[0].data || [];
        const courses = results[1].data || [];
        this.settings = settings;
        this.courses = courses;
        let subscribeStatus = '未开启';
        try {
            const state = settings.subscribe_state ? JSON.parse(settings.subscribe_state) : null;
            if (state && state.accepted && state.accepted.length > 0) subscribeStatus = '已授权（' + state.accepted.length + ' 个模板）';
            else if (state) subscribeStatus = '曾授权，可重新开启';
        } catch (error) {
            subscribeStatus = '未开启';
        }
        this.setData({
            loading: false,
            errorText: '',
            termStart: settings.term_start,
            periods: periods.map(item => Object.assign({}, item)),
            remindEnabled: settings.remind_enabled,
            leadIndex: Math.max(0, LEAD_OPTIONS.indexOf(Number(settings.default_lead))),
            templatesReady: reminder.templatesReady(),
            subscribeStatus: subscribeStatus,
            courseCount: courses.length,
            periodCountIndex: Math.max(0, PERIOD_COUNT_OPTIONS.indexOf(periods.length)),
        });
        if (this.focusPeriods) {
            this.focusPeriods = false;
            setTimeout(() => {
                if (typeof wx.pageScrollTo === 'function') {
                    wx.pageScrollTo({ selector: '#periods-card', duration: 300 });
                }
            }, 120);
        }
    },

    async saveSettings(patch) {
        const result = await store.saveSettings(patch);
        if (result.error) {
            this.setData({ errorText: result.error.message || '保存失败' });
            return false;
        }
        this.settings = result.data;
        getApp().globalData.settings = result.data;
        return true;
    },

    async onTermStartChange(event) {
        this.setData({ termStart: event.detail.value, errorText: '' });
        await this.saveSettings({ term_start: event.detail.value });
    },

    async onRemindChange(event) {
        this.setData({ remindEnabled: event.detail.value, errorText: '' });
        await this.saveSettings({ remind_enabled: event.detail.value });
    },

    async onLeadChange(event) {
        const index = Number(event.detail.value) || 0;
        this.setData({ leadIndex: index, errorText: '' });
        await this.saveSettings({ default_lead: LEAD_OPTIONS[index] });
    },

    onPeriodInput(event) {
        const index = Number(event.currentTarget.dataset.index);
        const field = event.currentTarget.dataset.field;
        const periods = this.data.periods.slice();
        if (!periods[index] || !field) return;
        periods[index] = Object.assign({}, periods[index]);
        periods[index][field] = event.detail.value;
        this.setData({ periods: periods, errorText: '' });
    },

    addPeriod() {
        const periods = this.data.periods.slice();
        if (periods.length >= 16) {
            wx.showToast({ title: '最多 16 个节次', icon: 'none' });
            return;
        }
        const last = periods[periods.length - 1];
        const lastEnd = last ? S.timeToMinutes(last.end_time) : -1;
        const startMinutes = lastEnd < 0 ? 480 : lastEnd + 10;
        periods.push({
            id: null,
            sort_no: periods.length + 1,
            label: '第 ' + (periods.length + 1) + ' 节',
            start_time: toTime(startMinutes),
            end_time: toTime(startMinutes + 45),
        });
        this.setData({ periods: periods });
    },

    // 删除 / 快捷设节数都即时写云端，避免用户以为「没生效」
    async persistPeriods(next, successText) {
        const message = this.validatePeriods(next);
        if (message) {
            wx.showToast({ title: message, icon: 'none' });
            return;
        }
        this.setData({ periods: next, saving: true, errorText: '' });
        const result = await store.replacePeriods(next);
        this.setData({ saving: false });
        if (result.error) {
            this.setData({ errorText: result.error.message || '保存作息失败' });
            return;
        }
        const saved = (result.data || []).map(item => Object.assign({}, item));
        this.setData({
            periods: saved,
            periodCountIndex: Math.max(0, PERIOD_COUNT_OPTIONS.indexOf(saved.length)),
        });
        wx.showToast({ title: successText, icon: 'success' });
    },

    async removePeriod(event) {
        const index = Number(event.currentTarget.dataset.index);
        const periods = this.data.periods.slice();
        if (periods.length <= 1) {
            wx.showToast({ title: '至少保留一个节次', icon: 'none' });
            return;
        }
        periods.splice(index, 1);
        await this.persistPeriods(
            periods.map((item, i) => Object.assign({}, item, { sort_no: i + 1 })),
            '已删除该节次',
        );
    },

    async onQuickCountChange(event) {
        const index = Number(event.detail.value) || 0;
        const target = PERIOD_COUNT_OPTIONS[index];
        if (!target) return;
        const periods = this.data.periods.slice();
        if (target > periods.length) {
            while (periods.length < target) {
                const last = periods[periods.length - 1];
                const lastEnd = last ? S.timeToMinutes(last.end_time) : -1;
                const startMinutes = lastEnd < 0 ? 480 : lastEnd + 10;
                periods.push({
                    id: null,
                    sort_no: periods.length + 1,
                    label: '第 ' + (periods.length + 1) + ' 节',
                    start_time: toTime(startMinutes),
                    end_time: toTime(startMinutes + 45),
                });
            }
        } else {
            periods.splice(target);
        }
        await this.persistPeriods(
            periods.map((item, i) => Object.assign({}, item, { sort_no: i + 1 })),
            '已设为 ' + target + ' 节',
        );
    },

    validatePeriods(periods) {
        for (let i = 0; i < periods.length; i += 1) {
            const item = periods[i];
            if (!String(item.label || '').trim()) return '第 ' + (i + 1) + ' 行的节次名称不能为空';
            if (!S.isValidTime(item.start_time) || !S.isValidTime(item.end_time)) {
                return '第 ' + (i + 1) + ' 行的时间请写成 HH:MM';
            }
            if (S.timeToMinutes(item.end_time) <= S.timeToMinutes(item.start_time)) {
                return '第 ' + (i + 1) + ' 行的结束时间要晚于开始时间';
            }
        }
        return '';
    },

    async savePeriods() {
        if (this.data.saving) return;
        const message = this.validatePeriods(this.data.periods);
        if (message) {
            this.setData({ errorText: message });
            return;
        }
        this.setData({ saving: true, errorText: '' });
        const result = await store.replacePeriods(this.data.periods);
        this.setData({ saving: false });
        if (result.error) {
            this.setData({ errorText: result.error.message || '保存作息失败' });
            return;
        }
        this.setData({ periods: result.data.map(item => Object.assign({}, item)) });
        wx.showToast({ title: '作息时间已保存', icon: 'success' });
    },

    async resetPeriods() {
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '恢复默认作息？',
                content: '会用 10 节默认时间替换当前设置，课程不会删除。',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        const list = S.DEFAULT_PERIODS.map((item, index) => Object.assign({}, item, { id: null, sort_no: index + 1 }));
        this.setData({ periods: list }, () => this.savePeriods());
    },

    async requestSubscribe() {
        const result = await reminder.requestSubscribe();
        if (result.error) {
            wx.showModal({
                title: '微信通知还需一步配置',
                content: result.error.message + '\n\n小程序端已完成订阅授权入口；正式推送需要服务端在上课前调用订阅消息发送接口。',
                showCancel: false,
                confirmText: '我知道了',
            });
            return;
        }
        await this.saveSettings({ subscribe_state: JSON.stringify({ accepted: result.data.accepted, at: Date.now() }) });
        this.setData({ subscribeStatus: '已授权（' + result.data.accepted.length + ' 个模板）' });
        wx.showToast({ title: result.data.allAccepted ? '订阅消息已开启' : '部分模板未授权', icon: 'none' });
    },

    async syncCalendar() {
        if (this.data.calendarBusy) return;
        this.setData({ calendarBusy: true });
        const result = await reminder.syncCalendar(this.courses, this.data.termStart, LEAD_OPTIONS[this.data.leadIndex]);
        this.setData({ calendarBusy: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '同步失败', icon: 'none' });
            return;
        }
        const info = result.data;
        const message = info.failed > 0
            ? '已写入 ' + info.added + ' 条，' + info.failed + ' 条未获授权'
            : '已写入 ' + info.added + ' 条日历提醒';
        wx.showToast({ title: message, icon: 'none' });
    },

    onRetry() {
        this.restore();
    },

    goBack() {
        wx.navigateBack();
    },
});

function toTime(minutes) {
    const total = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
}
