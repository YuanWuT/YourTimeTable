const { ROLES } = require('../../utils/config');
const store = require('../../utils/store');
const S = require('../../utils/schedule');

function findOffsetForParity(currentOffset, wanted, termStart) {
    const todayMonday = S.mondayOf(new Date());
    for (let distance = 0; distance <= 3; distance += 1) {
        const candidates = distance === 0 ? [currentOffset] : [currentOffset - distance, currentOffset + distance];
        for (let i = 0; i < candidates.length; i += 1) {
            const monday = S.addDays(todayMonday, candidates[i] * 7);
            if (S.parityOf(monday, termStart) === wanted) return candidates[i];
        }
    }
    return currentOffset;
}

Page({
    data: {
        authState: 'checking',
        demoMode: false,
        loading: true,
        errorText: '',
        sessionUser: null,
        role: 'student',
        roleName: '学生',
        roleIcon: '🎒',
        roleDesc: '管理我自己的课表',
        viewMode: 'week',
        parityMode: 'odd',
        weekOffsetNum: 0,
        weekLabel: '',
        dateRange: '',
        weekTotal: 0,
        courseCount: 0,
        weekColumns: [],
        timeRail: [],
        scrollIntoId: '',
        monthYear: 2026,
        monthMonth: 1,
        monthTitle: '',
        monthHeads: S.MONTH_HEADS,
        monthCells: [],
        nextCourse: null,
        showDaySheet: false,
        selectedDayLabel: '',
        selectedDayCourses: [],
        showRolePicker: false,
        roleOptions: [],
    },

    onLoad() {
        const now = new Date();
        this.settings = null;
        this.courses = [];
        this.periods = [];
        this.setData({ monthYear: now.getFullYear(), monthMonth: now.getMonth() + 1 });
    },

    onShow() {
        this.restore();
    },

    onPullDownRefresh() {
        Promise.resolve(this.data.authState === 'signed-in' ? this.loadAll() : this.restore())
            .then(() => wx.stopPullDownRefresh())
            .catch(() => wx.stopPullDownRefresh());
    },

    async restore() {
        if (this.data.demoMode) {
            this.recompute();
            return;
        }
        this.setData({ authState: 'checking', loading: true });
        const result = await getApp().ensureSession();
        if (result.error || !result.data) {
            getApp().resetSession();
            this.courses = [];
            this.setData({
                authState: 'signed-out',
                sessionUser: null,
                loading: false,
                errorText: '',
                weekColumns: [],
                monthCells: [],
                nextCourse: null,
            });
            return;
        }
        this.setData({ authState: 'signed-in', sessionUser: result.data.user || null });
        await this.loadAll();
    },

    async loadAll() {
        this.setData({ loading: true, errorText: '' });
        const results = await Promise.all([
            store.ensureSettings(),
            store.listPeriods(),
            store.listCourses(),
        ]);
        const problem = results.find(item => item && item.error);
        if (problem) {
            this.setData({ loading: false, errorText: problem.error.message || '数据加载失败，请检查网络' });
            return;
        }
        this.settings = results[0].data;
        this.periods = results[1].data || [];
        this.courses = results[2].data || [];
        getApp().globalData.settings = this.settings;
        getApp().globalData.periods = this.periods;
        getApp().globalData.courses = this.courses;
        const settings = this.settings;
        const todayParity = S.parityOf(new Date(), settings.term_start);
        this.setData({
            loading: false,
            errorText: '',
            role: settings.role,
            weekOffsetNum: 0,
            parityMode: todayParity,
        }, () => this.recompute());
    },

    useDemo() {
        this.settings = {
            role: 'student',
            term_start: S.defaultTermStart(),
            remind_enabled: true,
            default_lead: 15,
        };
        this.periods = S.normalizePeriods([]);
        this.courses = S.DEMO_COURSES.slice();
        const parity = S.parityOf(new Date(), this.settings.term_start);
        this.setData({
            demoMode: true,
            authState: 'signed-out',
            loading: false,
            errorText: '',
            role: 'student',
            weekOffsetNum: 0,
            parityMode: parity,
        }, () => this.recompute());
    },

    showLogin() {
        this.setData({ demoMode: false }, () => this.restore());
    },

    onSignedIn() {
        getApp().resetSession();
        this.setData({ demoMode: false }, () => this.restore());
    },

    recompute() {
        const settings = this.settings || {
            role: 'student',
            term_start: S.defaultTermStart(),
            remind_enabled: true,
            default_lead: 15,
        };
        const courses = this.courses || [];
        const periods = this.periods || [];
        const today = new Date();
        const todayKey = S.formatDate(today);
        const offset = this.data.weekOffsetNum || 0;
        const monday = S.addDays(S.mondayOf(today), offset * 7);
        const actualParity = S.parityOf(monday, settings.term_start);
        const mode = this.data.parityMode || actualParity;
        const sunday = S.addDays(monday, 6);
        const grid = S.buildWeekColumns(courses, periods, monday, mode, todayKey);
        const role = ROLES.find(item => item.key === settings.role) || ROLES[0];
        const monthCells = S.buildMonthCells(
            this.data.monthYear,
            this.data.monthMonth,
            courses,
            settings.term_start,
            todayKey,
            mode,
        );
        this.setData({
            roleName: role.name,
            roleIcon: role.icon,
            roleDesc: role.desc,
            role: role.key,
            weekLabel: '第 ' + S.weekNumber(monday, settings.term_start) + ' 周 · ' + S.parityLabel(actualParity),
            dateRange: (monday.getMonth() + 1) + '月' + monday.getDate() + '日 – ' + (sunday.getMonth() + 1) + '月' + sunday.getDate() + '日',
            parityMode: mode,
            weekColumns: grid.columns,
            timeRail: grid.slots,
            weekTotal: grid.total,
            courseCount: courses.length,
            scrollIntoId: offset === 0 ? 'day-col-' + (S.dayOfWeek(today) - 1) : '',
            monthTitle: this.data.monthYear + '年' + this.data.monthMonth + '月',
            monthCells: monthCells,
            nextCourse: S.nextClass(courses, settings.term_start),
        });
    },

    switchView(event) {
        const mode = event.currentTarget.dataset.mode;
        if (!mode || mode === this.data.viewMode) return;
        this.setData({ viewMode: mode });
    },

    changeWeek(event) {
        const step = Number(event.currentTarget.dataset.step) || 0;
        const offset = (this.data.weekOffsetNum || 0) + step;
        const monday = S.addDays(S.mondayOf(new Date()), offset * 7);
        const parity = S.parityOf(monday, (this.settings || {}).term_start);
        this.setData({ weekOffsetNum: offset, parityMode: parity }, () => this.recompute());
    },

    chooseParity(event) {
        const mode = event.currentTarget.dataset.mode;
        if (!mode) return;
        if (mode === 'all') {
            this.setData({ parityMode: 'all' }, () => this.recompute());
            return;
        }
        const offset = findOffsetForParity(
            this.data.weekOffsetNum || 0,
            mode,
            (this.settings || {}).term_start,
        );
        this.setData({ weekOffsetNum: offset, parityMode: mode }, () => this.recompute());
    },

    goToday() {
        const now = new Date();
        this.setData({
            weekOffsetNum: 0,
            parityMode: S.parityOf(now, (this.settings || {}).term_start),
            monthYear: now.getFullYear(),
            monthMonth: now.getMonth() + 1,
        }, () => this.recompute());
    },

    changeMonth(event) {
        const step = Number(event.currentTarget.dataset.step) || 0;
        let year = this.data.monthYear;
        let month = this.data.monthMonth + step;
        if (month < 1) {
            month = 12;
            year -= 1;
        } else if (month > 12) {
            month = 1;
            year += 1;
        }
        this.setData({ monthYear: year, monthMonth: month }, () => this.recompute());
    },

    onDayTap(event) {
        const key = event.currentTarget.dataset.key;
        const cell = (this.data.monthCells || []).find(item => item.key === key);
        if (!cell) return;
        const date = S.parseDate(key);
        const label = (date.getMonth() + 1) + '月' + date.getDate() + '日 · ' + S.DAY_NAMES[S.dayOfWeek(date) - 1];
        this.setData({
            showDaySheet: true,
            selectedDayLabel: label,
            selectedDayCourses: cell.courses || [],
        });
    },

    closeDaySheet() {
        this.setData({ showDaySheet: false });
    },

    openRolePicker() {
        if (this.data.demoMode) {
            wx.showToast({ title: '登录后即可切换身份', icon: 'none' });
            return;
        }
        const options = ROLES.map(item => Object.assign({}, item, { selected: item.key === this.data.role }));
        this.setData({ showRolePicker: true, roleOptions: options });
    },

    closeRolePicker() {
        this.setData({ showRolePicker: false });
    },

    async pickRole(event) {
        const key = event.currentTarget.dataset.key;
        if (!key) return;
        this.setData({ showRolePicker: false });
        if (key === this.data.role) return;
        const result = await store.saveSettings({ role: key });
        if (result.error) {
            wx.showToast({ title: result.error.message || '切换失败', icon: 'none' });
            return;
        }
        this.settings = Object.assign({}, this.settings, result.data);
        getApp().globalData.settings = this.settings;
        wx.showToast({ title: '已切换身份', icon: 'success' });
        this.recompute();
    },

    onCourseTap(event) {
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可编辑课程', icon: 'none' });
            return;
        }
        const id = event.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/course-edit/course-edit?id=' + id });
    },

    onAdd() {
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可添加课程', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/course-edit/course-edit' });
    },

    onRetry() {
        this.restore();
    },

    noop() {},
});
