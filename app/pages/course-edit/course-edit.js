const { COURSE_COLORS } = require('../../utils/config');
const store = require('../../utils/store');
const S = require('../../utils/schedule');

const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];
const WEEK_TYPES = [
    { key: 'all', name: '每周' },
    { key: 'odd', name: '仅单周' },
    { key: 'even', name: '仅双周' },
];

function emptyForm() {
    const day = S.dayOfWeek(new Date());
    return {
        title: '',
        teacher: '',
        location: '',
        day_of_week: day,
        period_no: 0,
        start_time: '08:00',
        end_time: '08:45',
        week_type: 'all',
        color: 'blue',
        note: '',
        remind: true,
        lead_minutes: 15,
    };
}

Page({
    data: {
        authState: 'checking',
        loading: true,
        saving: false,
        errorText: '',
        isEdit: false,
        courseId: null,
        form: emptyForm(),
        dayNames: S.DAY_NAMES,
        dayIndex: 0,
        periods: [],
        periodNames: [],
        periodIndex: 0,
        weekTypes: WEEK_TYPES,
        colors: COURSE_COLORS,
        leadOptions: LEAD_OPTIONS,
        leadLabels: LEAD_OPTIONS.map(value => value === 0 ? '上课时提醒' : '提前 ' + value + ' 分钟'),
        leadIndex: 3,
        deletedCount: 0,
    },

    onLoad(options) {
        this.courseId = options && options.id ? options.id : null;
        // 网格录入页点空格子时会带上 day / period，用来预填星期与上课时间
        this.presetDay = options && options.day ? Number(options.day) : 0;
        this.presetPeriod = options && options.period ? Number(options.period) : 0;
        wx.setNavigationBarTitle({ title: this.courseId ? '编辑课程' : '添加课程' });
        this.setData({ isEdit: Boolean(this.courseId) });
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
        const [periodsResult, deletedResult] = await Promise.all([
            store.listPeriods(),
            store.listDeletedCourses(role),
        ]);
        if (periodsResult.error) {
            this.setData({ loading: false, errorText: periodsResult.error.message || '加载作息失败' });
            return;
        }
        const periods = periodsResult.data || [];
        // 第 0 项是「自定义时间」，手动改过时间后就停在这一项
        const periodNames = ['自定义时间'].concat(
            periods.map(item => item.label + '  ' + item.start_time + '–' + item.end_time),
        );
        let form = emptyForm();
        if (this.courseId) {
            const coursesResult = await store.listCourses(role);
            if (coursesResult.error) {
                this.setData({ loading: false, errorText: coursesResult.error.message || '加载课程失败' });
                return;
            }
            const found = (coursesResult.data || []).find(item => String(item.id) === String(this.courseId));
            if (!found) {
                this.setData({ loading: false, errorText: '这条课程不存在或已被删除' });
                return;
            }
            form = Object.assign(emptyForm(), found);
        } else {
            if (this.presetDay >= 1 && this.presetDay <= 7) form.day_of_week = this.presetDay;
            if (this.presetPeriod > 0) {
                const slot = periods.find(item => Number(item.sort_no) === this.presetPeriod);
                if (slot) {
                    form.period_no = slot.sort_no;
                    form.start_time = slot.start_time;
                    form.end_time = slot.end_time;
                }
            }
        }
        const leadIndex = Math.max(0, LEAD_OPTIONS.indexOf(Number(form.lead_minutes)));
        const colors = COURSE_COLORS.map(item => Object.assign({}, item, { selected: item.key === form.color }));
        const weekTypes = WEEK_TYPES.map(item => Object.assign({}, item, { selected: item.key === form.week_type }));
        const foundIndex = periods.findIndex(item => Number(item.sort_no) === Number(form.period_no));
        this.setData({
            loading: false,
            errorText: '',
            form: form,
            dayIndex: Number(form.day_of_week) - 1,
            periods: periods,
            periodNames: periodNames,
            periodIndex: Number(form.period_no) > 0 && foundIndex >= 0 ? foundIndex + 1 : 0,
            colors: colors,
            weekTypes: weekTypes,
            leadIndex: leadIndex,
            deletedCount: (deletedResult.data || []).length,
        });
    },

    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;
        const form = Object.assign({}, this.data.form);
        form[field] = event.detail.value;
        // 手动改过时间后就不再按旧节次定位，否则课表会把课程放回原来的节次行
        const patch = { form: form, errorText: '' };
        if ((field === 'start_time' || field === 'end_time') && this.data.periodIndex !== 0) {
            form.period_no = 0;
            patch.periodIndex = 0;
        }
        this.setData(patch);
    },

    onTimeBlur(event) {
        const field = event.currentTarget.dataset.field;
        if (field !== 'start_time' && field !== 'end_time') return;
        const normalized = S.normalizeTime(event.detail.value);
        if (!normalized) return;
        const form = Object.assign({}, this.data.form);
        form[field] = normalized;
        this.setData({ form: form });
    },

    onDayChange(event) {
        const index = Number(event.detail.value) || 0;
        const form = Object.assign({}, this.data.form, { day_of_week: index + 1 });
        this.setData({ dayIndex: index, form: form });
    },

    onPeriodChange(event) {
        const index = Number(event.detail.value) || 0;
        if (index === 0) {
            const form = Object.assign({}, this.data.form, { period_no: 0 });
            this.setData({ periodIndex: 0, form: form, errorText: '' });
            return;
        }
        const period = this.data.periods[index - 1];
        if (!period) return;
        const form = Object.assign({}, this.data.form, {
            period_no: period.sort_no,
            start_time: period.start_time,
            end_time: period.end_time,
        });
        this.setData({ periodIndex: index, form: form, errorText: '' });
    },

    onWeekType(event) {
        const key = event.currentTarget.dataset.key;
        const weekTypes = this.data.weekTypes.map(item => Object.assign({}, item, { selected: item.key === key }));
        this.setData({ weekTypes: weekTypes, form: Object.assign({}, this.data.form, { week_type: key }) });
    },

    onColor(event) {
        const key = event.currentTarget.dataset.key;
        const colors = this.data.colors.map(item => Object.assign({}, item, { selected: item.key === key }));
        this.setData({ colors: colors, form: Object.assign({}, this.data.form, { color: key }) });
    },

    onRemindChange(event) {
        this.setData({ form: Object.assign({}, this.data.form, { remind: event.detail.value }) });
    },

    onLeadChange(event) {
        const index = Number(event.detail.value) || 0;
        this.setData({
            leadIndex: index,
            form: Object.assign({}, this.data.form, { lead_minutes: LEAD_OPTIONS[index] }),
        });
    },

    validate(form) {
        if (!String(form.title || '').trim()) return '请填写课程名称';
        if (!S.isValidTime(form.start_time)) return '开始时间请写成 HH:MM，例如 08:00';
        if (!S.isValidTime(form.end_time)) return '结束时间请写成 HH:MM，例如 08:45';
        if (S.timeToMinutes(form.end_time) <= S.timeToMinutes(form.start_time)) return '结束时间要晚于开始时间';
        return '';
    },

    // 校验失败必须让用户看见：按钮上方红字 + toast + 回到页面顶部，避免「点了没反应」
    showError(message) {
        this.setData({ errorText: message });
        wx.showToast({ title: message, icon: 'none', duration: 2500 });
        wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    },

    async save() {
        if (this.data.saving) return;
        const raw = this.data.form;
        const form = Object.assign({}, raw, {
            title: String(raw.title || '').trim(),
            start_time: S.normalizeTime(raw.start_time) || String(raw.start_time || '').trim(),
            end_time: S.normalizeTime(raw.end_time) || String(raw.end_time || '').trim(),
        });
        const message = this.validate(form);
        if (message) {
            this.showError(message);
            return;
        }
        this.setData({ form: form, saving: true, errorText: '' });
        let result;
        try {
            result = this.courseId
                ? await store.updateCourse(this.courseId, form)
                : await store.createCourse(form);
        } catch (error) {
            result = { error: { message: (error && error.message) || '保存失败，请重试' } };
        }
        this.setData({ saving: false });
        if (result.error) {
            this.showError(result.error.message || '保存失败，请重试');
            return;
        }
        wx.showToast({ title: '已保存到云端', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 700);
    },

    async remove() {
        if (!this.courseId || this.data.saving) return;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '删除这节课？',
                content: '删除后会进入「已删除的课程」，可以随时恢复，不用重新录入。',
                confirmText: '删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        this.setData({ saving: true });
        const result = await store.removeCourse(this.courseId);
        this.setData({ saving: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
            return;
        }
        wx.showToast({ title: '已移入已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 700);
    },

    goRecycle() {
        wx.navigateTo({ url: '/pages/recycle/recycle' });
    },

    goPeriods() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    goBack() {
        wx.navigateBack();
    },

    onRetry() {
        this.restore();
    },
});
