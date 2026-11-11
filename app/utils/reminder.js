// 上课提醒：微信订阅消息授权 + 手机日历提醒（真实系统通知）。
// 说明：微信订阅消息的「定时推送」需要服务端定时发送能力，小程序端负责授权与保存订阅状态；
// 手机日历提醒由端上直接写入系统日历，可立即生效，作为可用的本地提醒通道。
const { SUBSCRIBE_TEMPLATE_IDS } = require('./config');
const { addDays, dayOfWeek, parityOf, timeToMinutes } = require('./schedule');

function templatesReady() {
    return SUBSCRIBE_TEMPLATE_IDS.length > 0;
}

function requestSubscribe() {
    if (!templatesReady()) {
        return Promise.resolve({
            data: null,
            error: {
                code: 'NOT_CONFIGURED',
                message: '尚未配置订阅消息模板 ID。上线前请在微信公众平台申请「上课提醒」模板，并填入 utils/config.js。',
            },
        });
    }
    return new Promise((resolve) => {
        if (typeof wx.requestSubscribeMessage !== 'function') {
            resolve({ data: null, error: { code: 'UNSUPPORTED', message: '当前环境不支持微信订阅消息，请在微信客户端内使用' } });
            return;
        }
        wx.requestSubscribeMessage({
            tmplIds: SUBSCRIBE_TEMPLATE_IDS,
            success(result) {
                const accepted = SUBSCRIBE_TEMPLATE_IDS.filter(id => result && result[id] === 'accept');
                resolve({
                    data: { raw: result || {}, accepted: accepted, allAccepted: accepted.length === SUBSCRIBE_TEMPLATE_IDS.length },
                    error: null,
                });
            },
            fail(error) {
                resolve({ data: null, error: { code: 'SUBSCRIBE_FAILED', message: (error && error.errMsg) || '订阅授权未完成' } });
            },
        });
    });
}

function occurrenceAt(date, time) {
    const minutes = timeToMinutes(time);
    const start = minutes < 0 ? 480 : minutes;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(start / 60), start % 60, 0);
}

function seconds(date) {
    return Math.floor(date.getTime() / 1000);
}

// 找到某节课下一次真正会上的时间点（最多向后找 16 周）
function nextOccurrences(course, termStart, count) {
    const now = new Date();
    const result = [];
    const targetDay = Number(course.day_of_week) || 1;
    const type = course.week_type || 'all';
    for (let i = 0; i < 112 && result.length < count; i += 1) {
        const date = addDays(now, i);
        if (dayOfWeek(date) !== targetDay) continue;
        const parity = parityOf(date, termStart);
        if (type !== 'all' && type !== parity) continue;
        const start = occurrenceAt(date, course.start_time);
        if (start.getTime() <= now.getTime()) continue;
        const endMinutes = timeToMinutes(course.end_time);
        const end = new Date(start.getTime() + Math.max(10, (endMinutes < 0 ? timeToMinutes(course.start_time) + 45 : endMinutes) - timeToMinutes(course.start_time)) * 60000);
        result.push({ start: start, end: end });
    }
    return result;
}

function calendarPayload(course, start, end, leadMinutes) {
    const lead = Math.max(0, Number(leadMinutes) || 0);
    return {
        title: '上课提醒 · ' + course.title,
        startTime: seconds(start),
        endTime: seconds(end),
        allDay: false,
        alarm: true,
        alarmOffset: lead * 60,
        description: (course.teacher ? course.teacher + ' · ' : '') + (course.week_type === 'all' ? '每周' : course.week_type === 'odd' ? '仅单周' : '仅双周') + '课程',
        location: course.location || '',
    };
}

function callCalendar(method, payload) {
    return new Promise((resolve) => {
        if (typeof wx[method] !== 'function') {
            resolve(false);
            return;
        }
        wx[method](Object.assign({}, payload, {
            success: () => resolve(true),
            fail: () => resolve(false),
        }));
    });
}

async function syncCalendar(courses, termStart, defaultLead) {
    if (!courses || courses.length === 0) {
        return { data: { added: 0, skipped: 0 }, error: { code: 'EMPTY', message: '还没有课程，先添加课程再同步日历' } };
    }
    if (typeof wx.addPhoneRepeatCalendar !== 'function') {
        return { data: null, error: { code: 'UNSUPPORTED', message: '当前微信版本不支持日历提醒，请升级微信后重试' } };
    }
    const tasks = [];
    let skipped = 0;
    courses.forEach((course) => {
        if (course.remind === false) {
            skipped += 1;
            return;
        }
        const lead = Number(course.lead_minutes);
        const leadMinutes = Number.isFinite(lead) ? lead : (Number(defaultLead) || 15);
        if (course.week_type === 'all') {
            const list = nextOccurrences(course, termStart, 1);
            if (list.length === 0) {
                skipped += 1;
                return;
            }
            tasks.push(callCalendar('addPhoneRepeatCalendar', Object.assign(
                calendarPayload(course, list[0].start, list[0].end, leadMinutes),
                { repeatInterval: 'week' },
            )));
        } else {
            // 系统日历只支持按周重复，单/双周课程改为写入未来 6 次单次事件，避免错周误提醒
            const list = nextOccurrences(course, termStart, 6);
            if (list.length === 0) {
                skipped += 1;
                return;
            }
            list.forEach((item) => {
                tasks.push(callCalendar('addPhoneCalendar', calendarPayload(course, item.start, item.end, leadMinutes)));
            });
        }
    });
    if (tasks.length === 0) {
        return { data: { added: 0, skipped: skipped }, error: { code: 'EMPTY', message: '没有需要提醒的课程' } };
    }
    const limited = tasks.slice(0, 40);
    // 所有日历 API 都在同一次点击的同步调用栈里发起，满足「仅在点击行为时调用」的限制
    const results = await Promise.all(limited);
    const added = results.filter(Boolean).length;
    return {
        data: { added: added, failed: results.length - added, skipped: skipped, truncated: tasks.length > limited.length },
        error: null,
    };
}

module.exports = {
    templatesReady,
    requestSubscribe,
    syncCalendar,
};
