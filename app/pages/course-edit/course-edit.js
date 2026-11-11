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
    },

    onLoad(options) {
        this.courseId = options && options.id ? options.id : null;
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
        const periodsResult = await store.listPeriods();
        if (periodsResult.error) {
            this.setData({ loading: false, errorText: periodsResult.error.message || '加载作息失败' });
            return;
        }
        const periods = periodsResult.data || [];
        const periodNames = periods.map(item => item.label + '  ' + item.start_time + '–' + item.end_time);
        let form = emptyForm();
        if (this.courseId) {
            const coursesResult = await store.listCourses();
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
        }
        const leadIndex = Math.max(0, LEAD_OPTIONS.indexOf(Number(form.lead_minutes)));
        const colors = COURSE_COLORS.map(item => Object.assign({}, item, { selected: item.key === form.color }));
        const weekTypes = WEEK_TYPES.map(item => Object.assign({}, item, { selected: item.key === form.week_type }));
        const periodIndex = Math.max(0, periods.findIndex(item => Number(item.sort_no) === Number(form.period_no)));
        this.setData({
            loading: false,
            errorText: '',
            form: form,
            dayIndex: Number(form.day_of_week) - 1,
            periods: periods,
            periodNames: periodNames,
            periodIndex: periodIndex,
            colors: colors,
            weekTypes: weekTypes,
            leadIndex: leadIndex,
        });
    },

    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;
        const form = Object.assign({}, this.data.form);
        form[field] = event.detail.value;
        this.setData({ form: form, errorText: '' });
    },

    onDayChange(event) {
        const index = Number(event.detail.value) || 0;
        const form = Object.assign({}, this.data.form, { day_of_week: index + 1 });
        this.setData({ dayIndex: index, form: form });
    },

    onPeriodChange(event) {
        const index = Number(event.detail.value) || 0;
        const period = this.data.periods[index];
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

    async save() {
        if (this.data.saving) return;
        const form = Object.assign({}, this.data.form, { title: String(this.data.form.title || '').trim() });
        const message = this.validate(form);
        if (message) {
            this.setData({ errorText: message });
            return;
        }
        this.setData({ saving: true, errorText: '' });
        const result = this.courseId
            ? await store.updateCourse(this.courseId, form)
            : await store.createCourse(form);
        this.setData({ saving: false });
        if (result.error) {
            this.setData({ errorText: result.error.message || '保存失败，请重试' });
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
                content: '删除后云端记录也会移除，此操作不可撤销。',
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
        wx.showToast({ title: '已删除', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 700);
    },

    goBack() {
        wx.navigateBack();
    },

    onRetry() {
        this.restore();
    },
});
