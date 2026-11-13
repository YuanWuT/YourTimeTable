// 课程表领域计算：日期、周次、单双周、网格/月历数据、课程展示样式。
// 所有复杂计算都放在 JS 里完成，WXML 只做简单渲染（小程序模板不支持函数与可选链）。
const { COURSE_COLORS, NOTE_MAX_LENGTH } = require('./config');

const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MONTH_HEADS = ['一', '二', '三', '四', '五', '六', '日'];

const DEFAULT_PERIODS = [
    { label: '第 1 节', start_time: '08:00', end_time: '08:45' },
    { label: '第 2 节', start_time: '08:55', end_time: '09:40' },
    { label: '第 3 节', start_time: '10:00', end_time: '10:45' },
    { label: '第 4 节', start_time: '10:55', end_time: '11:40' },
    { label: '第 5 节', start_time: '14:00', end_time: '14:45' },
    { label: '第 6 节', start_time: '14:55', end_time: '15:40' },
    { label: '第 7 节', start_time: '16:00', end_time: '16:45' },
    { label: '第 8 节', start_time: '16:55', end_time: '17:40' },
    { label: '第 9 节', start_time: '19:00', end_time: '19:45' },
    { label: '第 10 节', start_time: '19:55', end_time: '20:40' },
];

function pad2(n) {
    return n < 10 ? '0' + n : String(n);
}

function parseDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const text = String(value || '');
    const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDate(date) {
    if (!date) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function addDays(date, count) {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    next.setDate(next.getDate() + count);
    return next;
}

function diffDays(later, earlier) {
    const a = new Date(later.getFullYear(), later.getMonth(), later.getDate());
    const b = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
    return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function mondayOf(date) {
    const d = parseDate(date) || new Date();
    const shift = (d.getDay() + 6) % 7; // 周一 = 0
    return addDays(d, -shift);
}

function dayOfWeek(date) {
    return ((date.getDay() + 6) % 7) + 1; // 1..7，周一为 1
}

function defaultTermStart() {
    return formatDate(mondayOf(new Date()));
}

// weekOffset: 以开学第一周周一为 0；单双周按“第 1 周 = 单周”推算。
function weekOffset(date, termStart) {
    const base = parseDate(termStart) || mondayOf(new Date());
    return Math.floor(diffDays(mondayOf(date), mondayOf(base)) / 7);
}

function weekNumber(date, termStart) {
    return weekOffset(date, termStart) + 1;
}

function parityOf(date, termStart) {
    const offset = ((weekOffset(date, termStart) % 2) + 2) % 2;
    return offset === 0 ? 'odd' : 'even';
}

function parityLabel(parity) {
    return parity === 'odd' ? '单周' : '双周';
}

function weekTypeLabel(type) {
    if (type === 'odd') return '仅单周';
    if (type === 'even') return '仅双周';
    return '每周';
}

function courseVisible(course, parity) {
    // parity === 'all' 表示「全部周次」视图：单周课、双周课、每周课都显示
    if (parity === 'all') return true;
    return !course.week_type || course.week_type === 'all' || course.week_type === parity;
}

function timeToMinutes(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return -1;
    return h * 60 + m;
}

function isValidTime(value) {
    return /^(\d|0\d|1\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

// 宽松时间归一化：接受 8:5、8：40、"8: 40"、08:40 等手写格式，统一成 HH:MM。
// 解析不了时返回空字符串，由调用方决定保留原值还是给出提示。
function normalizeTime(value) {
    const raw = String(value === undefined || value === null ? '' : value)
        .replace(/[：]/g, ':')
        .replace(/\s+/g, '')
        .trim();
    const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return '';
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return '';
    return pad2(h) + ':' + pad2(m);
}

// 单双周：all 覆盖所有周，因此与任何周次都可能撞课；odd 与 even 互不冲突。
function weekTypesConflict(a, b) {
    const x = a || 'all';
    const y = b || 'all';
    if (x === 'all' || y === 'all') return true;
    return x === y;
}

// 两个时间区间是否真正相交（首尾相接不算重叠）
function timeRangesOverlap(a, b) {
    const as = timeToMinutes(a && a.start_time);
    const ae = timeToMinutes(a && a.end_time);
    const bs = timeToMinutes(b && b.start_time);
    const be = timeToMinutes(b && b.end_time);
    if (as < 0 || ae < 0 || bs < 0 || be < 0) return false;
    return as < be && bs < ae;
}

// 同一天、周次会相遇、时间有交集 => 这段时间被排了两次课
function coursesConflict(a, b) {
    if (!a || !b) return false;
    if (Number(a.day_of_week) !== Number(b.day_of_week)) return false;
    if (!weekTypesConflict(a.week_type, b.week_type)) return false;
    return timeRangesOverlap(a, b);
}

function isSameCourseSlot(a, b) {
    return coursesConflict(a, b)
        && String(a.title || '').trim() === String(b.title || '').trim();
}

function findConflicts(candidate, list, excludeId) {
    return (list || []).filter(course => {
        if (excludeId !== undefined && excludeId !== null && String(course.id) === String(excludeId)) return false;
        return coursesConflict(candidate, course);
    });
}

function conflictLabel(course) {
    return '「' + (course.title || '课程') + '」' + (course.start_time || '') + '–' + (course.end_time || '');
}

// 同名 + 同天 + 时间有交集 + 周次会相遇 => 视为同一节课被重复录入，只保留第一条。
// 用于导入前去重、周视图显示层兜底，避免一个格子里叠两张卡片看起来像「一节课变两节」。
function dedupeCourses(list) {
    const result = [];
    (list || []).forEach(course => {
        if (!course) return;
        const duplicate = result.some(kept => isSameCourseSlot(kept, course));
        if (!duplicate) result.push(course);
    });
    return result;
}

// 自定义时间若与某个作息节次几乎一致（如 08:40 / 10:29），收敛到该节次，
// 避免相邻节次时间「擦边」造成重叠、错位与重复课程。连堂课（结束时间差得远）不动。
function snapCourseToPeriods(course, periods, tolerance) {
    const tol = tolerance === undefined ? 12 : tolerance;
    const slots = normalizePeriods(periods);
    const source = course || {};
    const start = timeToMinutes(source.start_time);
    const end = timeToMinutes(source.end_time);
    if (start < 0 || slots.length === 0) return source;
    let best = null;
    let distance = Infinity;
    slots.forEach((slot) => {
        const d = Math.abs(timeToMinutes(slot.start_time) - start);
        if (d < distance) {
            distance = d;
            best = slot;
        }
    });
    if (!best || distance > tol) return source;
    if (end >= 0 && Math.abs(timeToMinutes(best.end_time) - end) > tol) return source;
    return Object.assign({}, source, {
        period_no: best.sort_no,
        start_time: best.start_time,
        end_time: best.end_time,
    });
}

function sortCourses(list) {
    return list.slice().sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        const at = timeToMinutes(a.start_time);
        const bt = timeToMinutes(b.start_time);
        if (at !== bt) return (at < 0 ? 9999 : at) - (bt < 0 ? 9999 : bt);
        return Number(a.id || 0) - Number(b.id || 0);
    });
}

function colorOf(key) {
    return COURSE_COLORS.find(item => item.key === key) || COURSE_COLORS[0];
}

// 课表格子很窄，老师 / 备注必须压成一行显示；超长内容用省略号收尾。
function clipText(value, limit) {
    const text = String(value === undefined || value === null ? '' : value)
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > limit ? text.slice(0, limit) + '…' : text;
}

// 给课程补上模板可直接使用的展示字段
function styleCourse(course) {
    const palette = colorOf(course.color);
    const start = String(course.start_time || '').trim();
    const end = String(course.end_time || '').trim();
    const teacher = course.teacher || '';
    const note = clipText(course.note, NOTE_MAX_LENGTH);
    const weekText = weekTypeLabel(course.week_type);
    return Object.assign({}, course, {
        bg: palette.bg,
        fg: palette.fg,
        solid: palette.solid,
        timeText: start + (end ? '–' + end : ''),
        weekText: weekText,
        locationText: course.location || '未填地点',
        teacherText: teacher,
        noteText: note,
        // 网格格子用一行紧凑文本：老师 + 备注，避免多占一行导致溢出
        chipExtraText: clipText([clipText(teacher, 8), clipText(note, 10)].filter(Boolean).join(' · '), 20),
        chipTimeText: start + (end ? '–' + end : '') + (weekText !== '每周' ? ' · ' + weekText : ''),
        dayText: DAY_NAMES[(Number(course.day_of_week) || 1) - 1] || '周一',
    });
}

function styledCourses(list) {
    return sortCourses(list || []).map(styleCourse);
}

function normalizePeriods(list) {
    const source = list && list.length ? list : DEFAULT_PERIODS.map((p, i) => Object.assign({ id: 'default-' + i, sort_no: i + 1 }, p));
    return source.slice().sort((a, b) => Number(a.sort_no || 0) - Number(b.sort_no || 0)).map((p, index) => ({
        id: p.id,
        sort_no: Number(p.sort_no || index + 1),
        label: p.label || '第 ' + (index + 1) + ' 节',
        start_time: p.start_time || '08:00',
        end_time: p.end_time || '08:45',
        timeText: (p.start_time || '08:00') + '–' + (p.end_time || '08:45'),
    }));
}

function slotIndexFor(course, slots) {
    const periodNo = Number(course.period_no || 0);
    if (periodNo > 0 && periodNo <= slots.length) return periodNo - 1;
    const start = timeToMinutes(course.start_time);
    if (start < 0) return 0;
    for (let i = 0; i < slots.length; i += 1) {
        const a = timeToMinutes(slots[i].start_time);
        const b = timeToMinutes(slots[i].end_time);
        if (start >= a && start < b) return i;
    }
    let best = 0;
    let distance = Infinity;
    slots.forEach((slot, i) => {
        const d = Math.abs(timeToMinutes(slot.start_time) - start);
        if (d < distance) {
            distance = d;
            best = i;
        }
    });
    return best;
}

// 周视图：左时间轴 + 7 天可横向滚动的列
function buildWeekColumns(courses, periods, monday, parity, todayKey) {
    const slots = normalizePeriods(periods);
    const source = styledCourses(courses || []);
    const columns = [];
    for (let day = 1; day <= 7; day += 1) {
        const date = addDays(monday, day - 1);
        const key = formatDate(date);
        const cells = slots.map(slot => ({
            key: key + '-' + slot.sort_no,
            day: day,
            periodNo: slot.sort_no,
            startTime: slot.start_time,
            endTime: slot.end_time,
            courses: [],
        }));
        // 同一时段被重复录入的同一门课只显示一次；单周 / 双周不同课仍可并列
        const matched = dedupeCourses(source.filter(course => (
            Number(course.day_of_week) === day && courseVisible(course, parity)
        )));
        matched.forEach((course) => {
            const index = slotIndexFor(course, slots);
            cells[index].courses.push(course);
        });
        columns.push({
            key: key,
            id: 'day-col-' + (day - 1),
            day: day,
            dayName: DAY_NAMES[day - 1],
            dateLabel: (date.getMonth() + 1) + '/' + date.getDate(),
            isToday: key === todayKey,
            count: matched.length,
            cells: cells,
        });
    }
    return { columns, slots, total: columns.reduce((sum, col) => sum + col.count, 0) };
}

// 月视图是日历，每天必须按「这一天真实的单 / 双周」取课。
// 周视图的「显示：单周 / 双周 / 全部」只是周视图的筛选器，不能让月视图把
// 仅单周的课程画到双周的日期上，因此这里不接收 parityMode。
function buildMonthCells(year, month, courses, termStart, todayKey) {
    const first = new Date(year, month - 1, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const gridStart = addDays(first, -startOffset);
    const source = styledCourses(courses || []);
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
        const date = addDays(gridStart, i);
        const key = formatDate(date);
        const inMonth = date.getMonth() === month - 1 && date.getFullYear() === year;
        const parity = parityOf(date, termStart);
        const day = dayOfWeek(date);
        const list = dedupeCourses(source.filter(c => Number(c.day_of_week) === day && courseVisible(c, parity)));
        cells.push({
            key: key,
            dayNumber: date.getDate(),
            inMonth: inMonth,
            isToday: key === todayKey,
            parity: parity,
            parityText: parity === 'odd' ? '单' : '双',
            count: list.length,
            dots: list.slice(0, 3).map((c, i) => ({ id: 'dot-' + i, color: c.solid })),
            courses: list,
        });
    }
    return cells;
}

function nextClass(courses, termStart) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const source = sortCourses(courses || []);
    for (let step = 0; step < 8; step += 1) {
        const date = addDays(now, step);
        const day = dayOfWeek(date);
        const parity = parityOf(date, termStart);
        const list = dedupeCourses(source.filter(c => Number(c.day_of_week) === day && courseVisible(c, parity)));
        for (let i = 0; i < list.length; i += 1) {
            const start = timeToMinutes(list[i].start_time);
            if (step === 0 && start <= nowMinutes) continue;
            const course = styleCourse(list[i]);
            const when = step === 0 ? '今天' : step === 1 ? '明天' : DAY_NAMES[day - 1];
            return Object.assign(course, {
                when: when,
                countdown: step === 0 ? '还有 ' + Math.max(0, start - nowMinutes) + ' 分钟' : when + ' ' + course.timeText,
            });
        }
    }
    return null;
}

const DEMO_COURSES = [
    { id: 'd1', title: '高等数学', teacher: '李老师', location: '教三 201', day_of_week: 1, period_no: 1, start_time: '08:00', end_time: '08:45', week_type: 'all', color: 'blue', note: '带练习册' },
    { id: 'd2', title: '大学英语', teacher: '王老师', location: '文科楼 305', day_of_week: 1, period_no: 3, start_time: '10:00', end_time: '10:45', week_type: 'odd', color: 'violet', note: '' },
    { id: 'd3', title: '数据结构', teacher: '张老师', location: '机房 A', day_of_week: 2, period_no: 2, start_time: '08:55', end_time: '09:40', week_type: 'all', color: 'cyan', note: '' },
    { id: 'd4', title: '体育课', teacher: '陈老师', location: '田径场', day_of_week: 3, period_no: 5, start_time: '14:00', end_time: '14:45', week_type: 'even', color: 'green', note: '' },
    { id: 'd5', title: '线性代数', teacher: '李老师', location: '教二 108', day_of_week: 4, period_no: 1, start_time: '08:00', end_time: '08:45', week_type: 'all', color: 'amber', note: '' },
    { id: 'd6', title: '计算机组成', teacher: '赵老师', location: '实验楼 402', day_of_week: 5, period_no: 3, start_time: '10:00', end_time: '10:45', week_type: 'all', color: 'rose', note: '' },
    { id: 'd7', title: '绘画社团', teacher: '', location: '艺术楼', day_of_week: 6, period_no: 5, start_time: '14:00', end_time: '15:30', week_type: 'all', color: 'violet', note: '' },
];

module.exports = {
    DAY_NAMES,
    MONTH_HEADS,
    DEFAULT_PERIODS,
    DEMO_COURSES,
    pad2,
    parseDate,
    formatDate,
    addDays,
    diffDays,
    mondayOf,
    dayOfWeek,
    defaultTermStart,
    weekOffset,
    weekNumber,
    parityOf,
    parityLabel,
    weekTypeLabel,
    courseVisible,
    timeToMinutes,
    isValidTime,
    normalizeTime,
    weekTypesConflict,
    timeRangesOverlap,
    coursesConflict,
    isSameCourseSlot,
    findConflicts,
    conflictLabel,
    dedupeCourses,
    snapCourseToPeriods,
    clipText,
    sortCourses,
    colorOf,
    styleCourse,
    styledCourses,
    normalizePeriods,
    buildWeekColumns,
    buildMonthCells,
    nextClass,
};
