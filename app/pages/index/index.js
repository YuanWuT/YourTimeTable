const { ROLES } = require('../../utils/config');
const store = require('../../utils/store');
const scopes = require('../../utils/scopes');
const S = require('../../utils/schedule');

// 课表页直接改节次时间用的两列选择器数据
const PERIOD_HOURS = [];
const PERIOD_MINUTES = [];
for (let h = 0; h < 24; h += 1) PERIOD_HOURS.push(S.pad2(h));
for (let m = 0; m < 60; m += 1) PERIOD_MINUTES.push(S.pad2(m));
const PERIOD_TIME_RANGE = [PERIOD_HOURS, PERIOD_MINUTES];

function timePartsOf(value) {
    const normalized = S.normalizeTime(value) || '08:00';
    const pieces = normalized.split(':');
    return [Number(pieces[0]), Number(pieces[1])];
}

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
        scopeChipVisible: false,
        scopeChipText: '',
        scopeChipIcon: '',
        scopeTitle: '',
        scopeHint: '',
        scopeManageLabel: '',
        scopeEmpty: false,
        showScopeTag: false,
        showScopePicker: false,
        scopeOptions: [],
        batchMode: false,
        selectedIds: [],
        selectedCount: 0,
        batchBusy: false,
        showCourseDetail: false,
        detailCourse: null,
        detailBusy: false,
        // 时间落在所有节次之外的课程：顶部醒目提示去增加 / 调整节次
        unmatchedCount: 0,
        unmatchedText: '',
        // 课表页直接改节次时间
        showPeriodEditor: false,
        periodEditIndex: -1,
        periodEditSort: 0,
        periodEditLabel: '',
        periodStartParts: [8, 0],
        periodEndParts: [8, 45],
        periodStartText: '08:00',
        periodEndText: '08:45',
        periodTimeRange: PERIOD_TIME_RANGE,
        periodSaving: false,
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
        // 下拉刷新只更新数据，不把用户正在看的那一列拉回今天
        Promise.resolve(this.data.authState === 'signed-in' ? this.loadAll({ keepScroll: true }) : this.restore())
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
                unmatchedCount: 0,
                unmatchedText: '',
                showPeriodEditor: false,
            });
            return;
        }
        this.setData({ authState: 'signed-in', sessionUser: result.data.user || null });
        await this.loadAll();
    },

    async loadAll(options) {
        const keepScroll = Boolean(options && options.keepScroll);
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
        // 课程按当前孩子 / 班级过滤后，补一个可读的归属名，供「全部班级」视图展示
        const scope = scopes.scopeOf(settingsResult.data);
        this.courses = scopes.decorate(results[1].data || [], settingsResult.data);
        // 课程时间超出所有节次时会被塞进最近的格子，用户容易误以为「另一班的课没显示」；
        // 顶部给一条醒目提示，家长 / 老师 / 学生同样适用。
        const unmatched = S.unmatchedCourses(this.courses, this.periods);
        // 身份 / 数据刷新后清空勾选，避免选中了另一个身份的课程
        this.selectedIds = [];
        getApp().globalData.settings = this.settings;
        getApp().globalData.periods = this.periods;
        getApp().globalData.courses = this.courses;
        const settings = this.settings;
        const patch = {
            loading: false,
            errorText: '',
            role: settings.role,
            scopeChipVisible: scope.needsScope,
            scopeChipText: scope.empty ? scope.kind.addLabel : scope.label,
            scopeChipIcon: scope.empty ? '＋' : scope.icon,
            scopeTitle: scope.kind ? scope.kind.switchTitle : '',
            scopeHint: scope.empty ? scope.kind.emptyHint : scope.switchHint,
            scopeManageLabel: scope.kind ? scope.kind.manageLabel : '',
            scopeEmpty: scope.empty,
            showScopeTag: scope.isAll,
            // 不再无条件关闭切换弹层：onShow 的异步刷新与用户点击存在时序竞争，
            // 以前 showScopePicker: false 会让「添加第二个孩子 / 班级」时弹层偶尔一闪就消失。
            scopeOptions: scopes.optionsOf(scope),
            batchMode: false,
            selectedIds: [],
            selectedCount: 0,
            // 身份 / 数据刷新后关闭详情，避免展示另一份课表里的课程
            showCourseDetail: false,
            detailCourse: null,
            unmatchedCount: unmatched.length,
            unmatchedText: unmatched.slice(0, 2).map(course =>
                (course.scopeName ? course.scopeName + ' · ' : '') + course.title + ' '
                + course.start_time + '–' + course.end_time
            ).join('；') + (unmatched.length > 2 ? ' 等' : ''),
        };
        // 只有身份真的变了才收起弹层，普通刷新保留用户当前是否打开弹层
        if (settings.role !== this.data.role) patch.showScopePicker = false;
        // 只有「首次进入 / 重新登录」才把周次重置回本周；
        // 取消、删除、下拉刷新都保持用户当前所在的周，避免连周次一起被甩回去。
        if (!keepScroll) {
            patch.weekOffsetNum = 0;
            patch.parityMode = S.parityOf(new Date(), settings.term_start);
        }
        this.setData(patch, () => this.recompute({ keepScroll: keepScroll }));
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
            scopeChipVisible: false,
            showScopeTag: false,
            showScopePicker: false,
            scopeOptions: [],
            unmatchedCount: 0,
            unmatchedText: '',
            showPeriodEditor: false,
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

    // 只有用户明确「回本周 / 切周 / 首次进入」时才归位：本周停在今天，其它周从周一开始。
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

    // keepScroll=true 用于「取消批量 / 删除完成 / 下拉刷新」这类只刷新数据或状态的场景：
    // 视图必须停在用户当前看的那一列，不能被自动拉回今天。
    recompute(options) {
        const keepScroll = Boolean(options && options.keepScroll);
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
        // 批量模式、以及「只刷新不归位」的场景下完全不改写滚动目标
        if (!keepScroll && !this.data.batchMode) {
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
            this.setData({ parityMode: 'all' }, () => this.recompute({ keepScroll: true }));
            return;
        }
        const offset = findOffsetForParity(
            this.data.weekOffsetNum || 0,
            mode,
            (this.settings || {}).term_start,
        );
        this.setData({ weekOffsetNum: offset, parityMode: mode }, () => this.recompute({ keepScroll: true }));
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
        this.setData({ monthYear: year, monthMonth: month }, () => this.recompute({ keepScroll: true }));
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
        // 身份变了，旧的归属选项已失效，顺手收起切换弹层
        this.setData({ showRolePicker: false, showScopePicker: false });
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

    // 家长切孩子、老师切班级 / 看全部班级
    openScopePicker() {
        if (this.data.demoMode) {
            wx.showToast({ title: '登录后即可切换', icon: 'none' });
            return;
        }
        const scope = scopes.scopeOf(this.settings || {});
        // 一个孩子 / 班级都还没添加时直接进添加表单，
        // 不再弹一个只有「全部班级」的空菜单让用户找不到入口。
        if (scope.needsScope && scope.list.length === 0) {
            this.goScopesAdd();
            return;
        }
        this.setData({
            showScopePicker: true,
            scopeOptions: scopes.optionsOf(scope),
            scopeTitle: scope.kind ? scope.kind.switchTitle : '',
            scopeHint: scope.switchHint,
            scopeManageLabel: scope.kind ? scope.kind.manageLabel : '',
        });
    },

    closeScopePicker() {
        this.setData({ showScopePicker: false });
    },

    async pickScope(event) {
        const key = event.currentTarget.dataset.key;
        if (!key) return;
        this.setData({ showScopePicker: false });
        const scope = scopes.scopeOf(this.settings || {});
        if (key === scope.key) return;
        if (key === scopes.ALL_SCOPE_KEY && scope.role !== 'teacher') return;
        const result = await store.saveSettings({ active_scope: key });
        if (result.error) {
            wx.showToast({ title: result.error.message || '切换失败', icon: 'none' });
            return;
        }
        this.settings = Object.assign({}, this.settings, result.data);
        getApp().globalData.settings = this.settings;
        wx.showToast({ title: key === scopes.ALL_SCOPE_KEY ? '已显示全部班级' : '已切换', icon: 'success' });
        // 归属切换后重新拉云端课程，且保持当前所看的周与列
        await this.loadAll({ keepScroll: true });
    },

    goScopes() {
        this.setData({ showScopePicker: false });
        wx.navigateTo({ url: '/pages/scopes/scopes' });
    },

    // 顶部常驻「＋ 管理孩子 / 班级」：直接打开管理页并弹出添加表单，
    // 已添加一个之后也能立刻加第二个，不依赖切换弹层。
    goScopesAdd() {
        this.setData({ showScopePicker: false });
        wx.navigateTo({ url: '/pages/scopes/scopes?action=add' });
    },

    // 时间不在现有节次内：去设置页增加 / 调整节次（家长 / 老师 / 学生通用）
    goPeriodSettings() {
        wx.navigateTo({ url: '/pages/settings/settings?focus=periods' });
    },

    // 点周视图左侧节次，直接弹出时间编辑
    onPeriodRailTap(event) {
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可调整节次', icon: 'none' });
            return;
        }
        const index = Number(event.currentTarget.dataset.index);
        const rail = (this.data.timeRail || [])[index];
        const sortNo = rail ? Number(rail.sort_no) : 0;
        const period = sortNo
            ? (this.periods || []).find(item => Number(item.sort_no) === sortNo)
            : (this.periods || [])[index];
        if (!period) return;
        const startParts = timePartsOf(period.start_time);
        const endParts = timePartsOf(period.end_time);
        this.setData({
            showPeriodEditor: true,
            periodEditIndex: index,
            periodEditSort: Number(period.sort_no || sortNo || index + 1),
            periodEditLabel: period.label || ('第 ' + (index + 1) + ' 节'),
            periodStartParts: startParts,
            periodEndParts: endParts,
            periodStartText: S.pad2(startParts[0]) + ':' + S.pad2(startParts[1]),
            periodEndText: S.pad2(endParts[0]) + ':' + S.pad2(endParts[1]),
            errorText: '',
        });
    },

    closePeriodEditor() {
        this.setData({ showPeriodEditor: false });
    },

    onPeriodTimeColumnChange(event) {
        const which = event.currentTarget.dataset.which;
        const column = Number(event.detail.column);
        const value = Number(event.detail.value);
        const key = which === 'end' ? 'periodEndParts' : 'periodStartParts';
        const parts = (this.data[key] || [0, 0]).slice();
        parts[column] = value;
        const patch = {};
        patch[key] = parts;
        this.setData(patch);
    },

    onPeriodTimeChange(event) {
        const which = event.currentTarget.dataset.which;
        const picked = event.detail.value || [0, 0];
        const parts = [Number(picked[0]) || 0, Number(picked[1]) || 0];
        const text = S.pad2(parts[0]) + ':' + S.pad2(parts[1]);
        const patch = {};
        if (which === 'end') {
            patch.periodEndParts = parts;
            patch.periodEndText = text;
        } else {
            patch.periodStartParts = parts;
            patch.periodStartText = text;
        }
        this.setData(patch);
    },

    async savePeriodTime() {
        if (this.data.periodSaving) return;
        const startText = this.data.periodStartText;
        const endText = this.data.periodEndText;
        const start = S.timeToMinutes(startText);
        const end = S.timeToMinutes(endText);
        if (start < 0 || end < 0 || end <= start) {
            wx.showToast({ title: '结束时间要晚于开始时间', icon: 'none' });
            return;
        }
        const periods = (this.periods || []).map(item => Object.assign({}, item));
        const target = periods.findIndex(item => Number(item.sort_no) === Number(this.data.periodEditSort));
        if (target < 0) return;
        periods[target] = Object.assign({}, periods[target], {
            start_time: startText,
            end_time: endText,
        });
        // 相邻节次不能重叠，否则同一时段会同时显示两节课
        const ordered = periods.slice().sort((a, b) =>
            S.timeToMinutes(a.start_time) - S.timeToMinutes(b.start_time));
        for (let i = 1; i < ordered.length; i += 1) {
            if (S.timeToMinutes(ordered[i].start_time) < S.timeToMinutes(ordered[i - 1].end_time)) {
                wx.showToast({ title: '与其它节次时间重叠，请调整', icon: 'none' });
                return;
            }
        }
        this.setData({ periodSaving: true });
        let result;
        try {
            result = await store.replacePeriods(periods);
        } catch (error) {
            result = { error: { message: (error && error.message) || '保存失败，请重试' } };
        }
        this.setData({ periodSaving: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '保存失败', icon: 'none' });
            return;
        }
        const saved = (result.data || []).map(item => Object.assign({}, item));
        this.periods = saved;
        getApp().globalData.periods = saved;
        this.setData({ showPeriodEditor: false });
        wx.showToast({ title: '节次时间已更新', icon: 'success' });
        await this.loadAll({ keepScroll: true });
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
        // 「取消」只是退出勾选状态，视图必须停在当前那一列（周一 / 长按那天 / 快捷跳转的那天）。
        // 不能 recompute()：非批量模式下它会把滚动目标改回今天；也不能 scrollToId()。
        // scroll-into-view 的值保持不变，框架就不会重新滚动。
        this.setData({ batchMode: false, selectedIds: [], selectedCount: 0 }, () => this.refreshSelection());
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
        // 删完同样停在原处，不把用户甩回今天
        await this.loadAll({ keepScroll: true });
    },

    // 点课程卡片：只读查看，不再直接跳编辑页
    findCourseById(id) {
        const key = String(id);
        let found = null;
        (this.rawColumns || []).forEach(col => (col.cells || []).forEach(cell => {
            (cell.courses || []).forEach(course => {
                if (String(course.id) === key) found = course;
            });
        }));
        return found;
    },

    openCourseDetail(course) {
        if (!course) return;
        // 月视图抽屉与详情不叠加，打开详情时收起抽屉
        this.setData({ showCourseDetail: true, detailCourse: course, showDaySheet: false });
    },

    closeCourseDetail() {
        this.setData({ showCourseDetail: false, detailCourse: null });
    },

    onSheetCourseTap(event) {
        const id = event.currentTarget.dataset.id;
        const course = (this.data.selectedDayCourses || []).find(item => String(item.id) === String(id));
        if (course) this.openCourseDetail(course);
    },

    editFromDetail(event) {
        const id = (event && event.detail && event.detail.id) || (this.data.detailCourse || {}).id;
        this.closeCourseDetail();
        if (!id) return;
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可编辑课程', icon: 'none' });
            return;
        }
        wx.navigateTo({ url: '/pages/course-edit/course-edit?id=' + id });
    },

    async removeFromDetail(event) {
        if (this.data.detailBusy) return;
        const detail = (event && event.detail) || {};
        const course = this.data.detailCourse || {};
        const id = detail.id || course.id;
        const title = detail.title || course.title || '这节课';
        if (!id) return;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '删除「' + title + '」？',
                content: '会移到「已删除的课程」，随时可以恢复。',
                confirmText: '删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        if (this.data.demoMode || this.data.authState !== 'signed-in') {
            wx.showToast({ title: '登录后即可管理课程', icon: 'none' });
            return;
        }
        this.setData({ detailBusy: true });
        let result;
        try {
            result = await store.removeCourse(id);
        } catch (error) {
            result = { error: { message: (error && error.message) || '删除失败，请重试' } };
        }
        this.setData({ detailBusy: false });
        if (result.error) {
            wx.showToast({ title: result.error.message || '删除失败', icon: 'none' });
            return;
        }
        this.closeCourseDetail();
        wx.showToast({ title: '已移入已删除', icon: 'success' });
        // 删除后仍停在当前列与当前周，不把用户甩回今天
        await this.loadAll({ keepScroll: true });
    },

    onCourseTap(event) {
        if (this.data.batchMode) {
            this.toggleSelectAt(event.currentTarget.dataset.id);
            return;
        }
        const course = this.findCourseById(event.currentTarget.dataset.id);
        if (course) this.openCourseDetail(course);
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
