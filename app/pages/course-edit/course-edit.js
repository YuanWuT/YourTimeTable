const { COURSE_COLORS, NOTE_MAX_LENGTH } = require('../../utils/config');
const store = require('../../utils/store');
const S = require('../../utils/schedule');

const LEAD_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];
const WEEK_TYPES = [
    { key: 'all', name: '每周' },
    { key: 'odd', name: '仅单周' },
    { key: 'even', name: '仅双周' },
];

// 时间按「小时 / 分钟」两列选择，不再要求用户手工输入冒号。
const HOURS = [];
const MINUTES = [];
for (let h = 0; h < 24; h += 1) HOURS.push(S.pad2(h));
for (let m = 0; m < 60; m += 1) MINUTES.push(S.pad2(m));
const TIME_RANGE = [HOURS, MINUTES];

function timeParts(value) {
    const normalized = S.normalizeTime(value) || '08:00';
    const pieces = normalized.split(':');
    return [Number(pieces[0]), Number(pieces[1])];
}

// 表单时间变化后同步 picker 的选中位置与展示文本（WXML 里不做复杂运算）。
function timeState(form) {
    const start = timeParts(form.start_time);
    const end = timeParts(form.end_time);
    return {
        startParts: start,
        endParts: end,
        startHour: HOURS[start[0]],
        startMinute: MINUTES[start[1]],
        endHour: HOURS[end[0]],
        endMinute: MINUTES[end[1]],
        noteLength: String(form.note || '').length,
    };
}

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
        noteMax: NOTE_MAX_LENGTH,
        noteLength: 0,
        hours: HOURS,
        minutes: MINUTES,
        timeRange: TIME_RANGE,
        startParts: [8, 0],
        endParts: [8, 45],
        startHour: '08',
        startMinute: '00',
        endHour: '08',
        endMinute: '45',
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
        // 历史数据里可能有更长的备注，编辑时也统一收到上限，避免课表格子被撑乱。
        form.note = String(form.note || '').slice(0, NOTE_MAX_LENGTH);
        const colors = COURSE_COLORS.map(item => Object.assign({}, item, { selected: item.key === form.color }));
        const weekTypes = WEEK_TYPES.map(item => Object.assign({}, item, { selected: item.key === form.week_type }));
        const foundIndex = periods.findIndex(item => Number(item.sort_no) === Number(form.period_no));
        this.setData(Object.assign({
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
        }, timeState(form)));
    },

    onFieldInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;
        const rawValue = event.detail.value;
        const value = field === 'note' ? String(rawValue || '').slice(0, NOTE_MAX_LENGTH) : rawValue;
        const form = Object.assign({}, this.data.form);
        form[field] = value;
        const patch = { form: form, errorText: '' };
        if (field === 'note') patch.noteLength = String(value).length;
        // 手动改过时间后就不再按旧节次定位，否则课表会把课程放回原来的节次行
        if ((field === 'start_time' || field === 'end_time') && this.data.periodIndex !== 0) {
            form.period_no = 0;
            patch.periodIndex = 0;
        }
        this.setData(patch);
    },

    // 滚动小时 / 分钟列时同步 picker 的选中位置，两列互相独立。
    onTimeColumnChange(event) {
        const which = event.currentTarget.dataset.which;
        const column = Number(event.detail.column);
        const value = Number(event.detail.value);
        const key = which === 'end' ? 'endParts' : 'startParts';
        const parts = (this.data[key] || [0, 0]).slice();
        parts[column] = value;
        const patch = {};
        patch[key] = parts;
        this.setData(patch);
    },

    // 选完时 / 分自动拼成 HH:MM，用户全程不用输入冒号。
    onTimeChange(event) {
        const field = event.currentTarget.dataset.field;
        if (field !== 'start_time' && field !== 'end_time') return;
        const picked = event.detail.value || [0, 0];
        const hour = Math.min(23, Math.max(0, Number(picked[0]) || 0));
        const minute = Math.min(59, Math.max(0, Number(picked[1]) || 0));
        const form = Object.assign({}, this.data.form, { period_no: 0 });
        form[field] = S.pad2(hour) + ':' + S.pad2(minute);
        this.setData(Object.assign({
            form: form,
            periodIndex: 0,
            errorText: '',
        }, timeState(form)));
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
            this.setData(Object.assign({ periodIndex: 0, form: form, errorText: '' }, timeState(form)));
            return;
        }
        const period = this.data.periods[index - 1];
        if (!period) return;
        const form = Object.assign({}, this.data.form, {
            period_no: period.sort_no,
            start_time: period.start_time,
            end_time: period.end_time,
        });
        this.setData(Object.assign({ periodIndex: index, form: form, errorText: '' }, timeState(form)));
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
        if (!S.isValidTime(form.start_time)) return '开始时间无效，请重新按小时、分钟选择';
        if (!S.isValidTime(form.end_time)) return '结束时间无效，请重新按小时、分钟选择';
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
            note: String(raw.note || '').slice(0, NOTE_MAX_LENGTH),
            start_time: S.normalizeTime(raw.start_time) || String(raw.start_time || '').trim(),
            end_time: S.normalizeTime(raw.end_time) || String(raw.end_time || '').trim(),
        });
        const message = this.validate(form);
        if (message) {
            this.showError(message);
            return;
        }
        // 与作息节次只差几分钟的零碎时间（08:40 / 10:29）会擦到相邻节次，
        // 保存前收敛到该节次的标准时间，避免同一时段被算成两节课。
        const finalForm = S.snapCourseToPeriods(form, this.data.periods);
        const aligned = finalForm.start_time !== form.start_time || finalForm.end_time !== form.end_time;
        // 录入侧限制：同一天、周次会相遇、时间有交集的课程不允许再排一节。
        const existing = await store.listCourses();
        if (existing.error) {
            this.showError(existing.error.message || '无法核对已有课程，请稍后重试');
            return;
        }
        const existingList = existing.data || [];
        const original = this.courseId
            ? existingList.find(item => String(item.id) === String(this.courseId))
            : null;
        // 只改标题 / 地点 / 备注时不检查；时间确实变了才检查「新造成的」重叠。
        // 历史数据里本来就有重叠的课程，编辑时不应被拦到保存不了。
        const timeChanged = !original
            || original.day_of_week !== finalForm.day_of_week
            || original.week_type !== finalForm.week_type
            || original.start_time !== finalForm.start_time
            || original.end_time !== finalForm.end_time;
        let conflicts = timeChanged ? S.findConflicts(finalForm, existingList, this.courseId) : [];
        if (original) {
            conflicts = conflicts.filter(course => !S.coursesConflict(original, course));
        }
        if (conflicts.length > 0) {
            this.showError('与' + S.conflictLabel(conflicts[0]) + '时间重叠，请调整上课时间或先删除原课程');
            return;
        }
        this.setData({ form: finalForm, saving: true, errorText: '' });
        let result;
        try {
            result = this.courseId
                ? await store.updateCourse(this.courseId, finalForm)
                : await store.createCourse(finalForm);
        } catch (error) {
            result = { error: { message: (error && error.message) || '保存失败，请重试' } };
        }
        this.setData({ saving: false });
        if (result.error) {
            this.showError(result.error.message || '保存失败，请重试');
            return;
        }
        wx.showToast({ title: aligned ? '已保存，时间已按作息对齐' : '已保存', icon: 'success' });
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
