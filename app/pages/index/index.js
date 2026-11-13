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

const EMPTY_DAY_TABS = S.DAY_NAMES.map((name, index) => ({ index: index, name: name, count: 0 }));

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
        dayTabs: EMPTY_DAY_TABS,
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
        batchMode: false,
        selectedIds: [],
        selectedCount: 0,
        batchBusy: false,
    },

    onLoad() {
        const now = new Date();
        this.settings = null;
        this.courses = [];
        this.periods = [];
        this.selectedIds = [];
        this.rawColumns = [];
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
        // 先同步身份，再按该身份拉取课程：不同身份各有一份独立课表
        const settingsResult = await store.syncSettings();
        if (settingsResult.error) {
            this.setData({ loading: false, errorText: settingsResult.error.message || '数据加载失败，请检查网络' });
            return;
        }
        const role = settingsResult.data.role;
        const results = await Promise.all([
            store.listPeriods(),
            store.listCourses(role),
        ]);
        const problem = results.find(item => item && item.error);
        if (problem) {
            this.setData({ loading: false, errorText: problem.error.message || '数据加载失败，请检查网络' });
            return;
        }
        this.settings = settingsResult.data;
        this.periods = results[0].data || [];
        this.courses = results[1].data || [];
        // 身份 / 数据刷新后清空勾选，避免选中了另一个身份的课程
        this.selectedIds = [];
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
            batchMode: false,
            selectedIds: [],
            selectedCount: 0,
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

    // 把勾选状态合并进网格数据，WXML 只做简单渲染
    withSelection(columns) {
        const chosen = {};
        (this.selectedIds || []).forEach(id => { chosen[String(id)] = true; });
        return (columns || []).map(col => Object.assign({}, col, {
            cells: (col.cells || []).map(cell => Object.assign({}, cell, {
                courses: (cell.courses || []).map(course => Object.assign({}, course, {
                    checked: Boolean(chosen[String(course.id)]),
                })),
            })),
        }));
    },

    // 当前视图真正渲染出来的课程 id（已按单双周过滤、已去重）。
    // 「全选」只能勾选这些课程，否则会把屏幕上没显示的课一起删掉。
    visibleCourseIds() {
        const ids = [];
        const seen = {};
        (this.rawColumns || []).forEach(col => (col.cells || []).forEach(cell =>
            (cell.courses || []).forEach(course => {
                const key = String(course.id);
                if (!seen[key]) {
                    seen[key] = true;
                    ids.push(key);
                }
            })
        ));
        return ids;
    },

    // 勾选 / 全选只刷新卡片状态，绝不重新计算滚动位置，避免「勾一节课就跳回今天」。
    refreshSelection() {
        this.setData({ weekColumns: this.withSelection(this.rawColumns) });
    },

    // 非批量模式的落点：本周停在今天，其它周从周一开始。
    normalScrollTarget(offset) {
        if (offset === 0) return 'day-col-' + (S.dayOfWeek(new Date()) - 1);
        return 'day-col-0';
    },

    // scroll-into-view 的值不变时框架不会再次滚动，先清空再赋值才能强制归位。
    scrollToId(target) {
        if (!target) return;
        if (this.data.scrollIntoId === target) {
            this.setData({ scrollIntoId: '' }, () => this.setData({ scrollIntoId: target }));
            return;
        }
        this.setData({ scrollIntoId: target });
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
        this.rawColumns = grid.columns;
        // 切换周次 / 单双周后，把不再显示的课程的勾选清掉，避免误删看不见的课
        const visible = {};
        this.visibleCourseIds().forEach(id => { visible[id] = true; });
        const pruned = (this.selectedIds || []).filter(id => visible[String(id)]);
        this.selectedIds = pruned;
        const role = ROLES.find(item => item.key === settings.role) || ROLES[0];
        const weekNo = S.weekNumber(monday, settings.term_start);
        const patch = {
            roleName: role.name,
            roleIcon: role.icon,
            roleDesc: role.desc,
            role: role.key,
            weekLabel: (weekNo > 0 ? '第 ' + weekNo + ' 周' : '未开学') + ' · ' + S.parityLabel(actualParity),
            dateRange: (monday.getMonth() + 1) + '月' + monday.getDate() + '日 – ' + (sunday.getMonth() + 1) + '月' + sunday.getDate() + '日',
            parityMode: mode,
            weekColumns: this.withSelection(grid.columns),
            timeRail: grid.slots,
            weekTotal: grid.total,
            courseCount: courses.length,
            selectedIds: pruned,
            selectedCount: pruned.length,
            dayTabs: grid.columns.map((col, index) => ({
                index: index,
                name: S.DAY_NAMES[index],
                count: col.count,
            })),
            monthTitle: this.data.monthYear + '年' + this.data.monthMonth + '月',
            monthCells: S.buildMonthCells(
                this.data.monthYear,
                this.data.monthMonth,
                courses,
                settings.term_start,
                todayKey,
            ),
            nextCourse: S.nextClass(courses, settings.term_start),
        };
        // 批量模式下完全不改写滚动目标：长按、勾选、全选都停留在用户当前看的那一列
        if (!this.data.batchMode) {
            const target = this.normalScrollTarget(offset);
            if (target !== this.data.scrollIntoId) patch.scrollIntoId = target;
        }
        this.setData(patch);
    },

    switchView(event) {
        const mode = event.currentTarget.dataset.mode;
        if (!mode || mode === this.data.viewMode) return;
        if (mode === 'month' && this.data.batchMode) this.exitBatchMode();
        this.setData({ viewMode: mode });
    },

    changeWeek(event) {
        const step = Number(event.currentTarget.dataset.step) || 0;
        const offset = (this.data.weekOffsetNum || 0) + step;
        const monday = S.addDays(S.mondayOf(new Date()), offset * 7);
        const parity = S.parityOf(monday, (this.settings || {}).term_start);
        this.setData({ weekOffsetNum: offset, parityMode: parity }, () => {
            this.recompute();
            this.scrollToId(this.data.batchMode ? 'day-col-0' : this.normalScrollTarget(offset));
        });
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
        }, () => {
            this.recompute();
            this.scrollToId(this.data.batchMode ? 'day-col-0' : this.normalScrollTarget(0));
        });
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

    // 批量模式下的星期快捷跳转：不用左右滑动就能到周一 / 周日
    jumpToDay(event) {
        const index = Number(event.currentTarget.dataset.index);
        if (!Number.isFinite(index) || index < 0 || index > 6) return;
        this.scrollToId('day-col-' + index);
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
        // 切换身份后必须重新拉取云端课程，否则课表不会跟着变
        await this.loadAll();
    },

    canManage() {
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可管理课程', icon: 'none' });
            return false;
        }
        return true;
    },

    toggleBatchMode() {
        if (!this.canManage()) return;
        if (this.visibleCourseIds().length === 0) {
            wx.showToast({ title: '当前视图没有课程可以勾选', icon: 'none' });
            return;
        }
        this.selectedIds = [];
        this.setData({ batchMode: true, selectedIds: [], selectedCount: 0 }, () => {
            this.recompute();
            // 批量模式从周一开始，避免「今天周五」把周一顶到屏幕外
            this.scrollToId('day-col-0');
        });
    },

    exitBatchMode() {
        this.selectedIds = [];
        this.setData({ batchMode: false, selectedIds: [], selectedCount: 0 }, () => {
            this.recompute();
            this.scrollToId(this.normalScrollTarget(this.data.weekOffsetNum || 0));
        });
    },

    toggleSelectAt(id) {
        const key = String(id);
        const list = (this.selectedIds || []).slice();
        const index = list.indexOf(key);
        if (index >= 0) list.splice(index, 1);
        else list.push(key);
        this.selectedIds = list;
        this.setData({ selectedIds: list, selectedCount: list.length }, () => this.refreshSelection());
    },

    onCourseLongPress(event) {
        if (!this.canManage()) return;
        const id = event.currentTarget.dataset.id;
        if (!this.data.batchMode) {
            const day = Number(event.currentTarget.dataset.day) || 0;
            const target = day >= 1 && day <= 7 ? 'day-col-' + (day - 1) : 'day-col-0';
            this.selectedIds = [];
            this.setData({ batchMode: true, selectedIds: [], selectedCount: 0 }, () => {
                this.recompute();
                // 长按哪一天就停在哪一天，不再被拉回今天
                this.scrollToId(target);
                this.toggleSelectAt(id);
            });
            return;
        }
        this.toggleSelectAt(id);
    },

    selectAllBatch() {
        const visible = this.visibleCourseIds();
        if (visible.length === 0) {
            wx.showToast({ title: '当前视图没有课程可以勾选', icon: 'none' });
            return;
        }
        const chosen = this.selectedIds || [];
        const allSelected = visible.every(id => chosen.indexOf(id) >= 0);
        this.selectedIds = allSelected ? [] : visible.slice();
        this.setData({
            selectedIds: this.selectedIds,
            selectedCount: this.selectedIds.length,
        }, () => this.refreshSelection());
    },

    async confirmBatchRemove() {
        const ids = (this.selectedIds || []).slice();
        if (ids.length === 0 || this.data.batchBusy) return;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '删除选中的 ' + ids.length + ' 节课？',
                content: '会移到「已删除的课程」，随时可以恢复，不用重新录入。',
                confirmText: '删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        this.setData({ batchBusy: true });
        let result;
        try {
            result = await store.removeCourses(ids);
        } catch (error) {
            result = { error: { message: (error && error.message) || '删除失败，请重试' } };
        }
        this.setData({ batchBusy: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
            return;
        }
        const removed = typeof result.data === 'number' ? result.data : ids.length;
        wx.showToast({
            title: removed < ids.length
                ? '已删除 ' + removed + ' 节，' + (ids.length - removed) + ' 节未找到'
                : '已删除 ' + removed + ' 节',
            icon: removed < ids.length ? 'none' : 'success',
        });
        this.selectedIds = [];
        this.setData({ batchMode: false, selectedIds: [], selectedCount: 0 });
        await this.loadAll();
    },

    onCourseTap(event) {
        if (this.data.batchMode) {
            this.toggleSelectAt(event.currentTarget.dataset.id);
            return;
        }
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可编辑课程', icon: 'none' });
            return;
        }
        const id = event.currentTarget.dataset.id;
        wx.navigateTo({ url: '/pages/course-edit/course-edit?id=' + id });
    },

    onCellTap(event) {
        if (this.data.batchMode) return;
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可添加课程', icon: 'none' });
            return;
        }
        const day = Number(event.currentTarget.dataset.day);
        const period = Number(event.currentTarget.dataset.period);
        wx.navigateTo({ url: '/pages/course-edit/course-edit?day=' + day + '&period=' + period });
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
