// 云端数据层。页面只调用这里的方法，不直接碰 cloud.database / cloud.storage。
// 所有方法返回 { data, error }，不 reject；error 统一带可展示的 message。
const { cloud } = require('./cloud');
const { createTableAccess } = require('./workbuddy-data-access');
const { DEFAULT_PERIODS, defaultTermStart, sortCourses, normalizePeriods, dedupeCourses } = require('./schedule');
const { NOTE_MAX_LENGTH } = require('./config');

const COURSE_COLUMNS = [
    'id', 'title', 'teacher', 'location', 'day_of_week', 'period_no',
    'start_time', 'end_time', 'week_type', 'color', 'note', 'remind',
    'lead_minutes', 'role', 'deleted', 'deleted_at', 'created_at', 'updated_at',
];
const PERIOD_COLUMNS = ['id', 'sort_no', 'label', 'start_time', 'end_time'];
const IMPORT_COLUMNS = ['id', 'source', 'file_name', 'storage_path', 'row_count', 'created_at'];

function clientError(error) {
    const message = error && typeof error.message === 'string' ? error.message : '网络异常，请稍后重试';
    return { code: 'CLIENT_EXCEPTION', message: message };
}

function ok(data) {
    return { data: data === undefined ? null : data, error: null };
}

function fail(error) {
    return { data: null, error: error || { code: 'UNKNOWN', message: '操作失败，请重试' } };
}

function int(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value, fallback, limit) {
    const result = value === undefined || value === null ? fallback : String(value);
    return result.slice(0, limit || 120);
}

const ROLE_KEYS = ['student', 'parent', 'teacher'];
const WEEK_TYPES = ['all', 'odd', 'even'];
const COLOR_KEYS = ['blue', 'cyan', 'violet', 'amber', 'rose', 'green'];

function courseToRow(course) {
    const row = {};
    const c = course || {};
    if (c.title !== undefined) row.title = text(c.title, '', 60).trim();
    if (c.teacher !== undefined) row.teacher = text(c.teacher, '', 60);
    if (c.location !== undefined) row.location = text(c.location, '', 80);
    if (c.day_of_week !== undefined) row.day_of_week = int(c.day_of_week, 1, 7, 1);
    if (c.period_no !== undefined) row.period_no = int(c.period_no, 0, 30, 0);
    if (c.start_time !== undefined) row.start_time = text(c.start_time, '08:00', 10);
    if (c.end_time !== undefined) row.end_time = text(c.end_time, '08:45', 10);
    if (c.week_type !== undefined) row.week_type = WEEK_TYPES.indexOf(c.week_type) >= 0 ? c.week_type : 'all';
    if (c.color !== undefined) row.color = COLOR_KEYS.indexOf(c.color) >= 0 ? c.color : 'blue';
    if (c.note !== undefined) row.note = text(c.note, '', NOTE_MAX_LENGTH);
    if (c.remind !== undefined) row.remind = Boolean(c.remind);
    if (c.lead_minutes !== undefined) row.lead_minutes = int(c.lead_minutes, 0, 180, 15);
    if (c.role !== undefined) row.role = ROLE_KEYS.indexOf(c.role) >= 0 ? c.role : 'student';
    if (c.deleted !== undefined) row.deleted = Boolean(c.deleted);
    if (c.deleted_at !== undefined) row.deleted_at = c.deleted_at || null;
    return row;
}

function courseFromRow(row) {
    const r = row || {};
    return {
        id: r.id,
        title: r.title || '',
        teacher: r.teacher || '',
        location: r.location || '',
        day_of_week: int(r.day_of_week, 1, 7, 1),
        period_no: int(r.period_no, 0, 30, 0),
        start_time: r.start_time || '08:00',
        end_time: r.end_time || '08:45',
        week_type: WEEK_TYPES.indexOf(r.week_type) >= 0 ? r.week_type : 'all',
        color: COLOR_KEYS.indexOf(r.color) >= 0 ? r.color : 'blue',
        note: r.note || '',
        remind: r.remind !== false,
        lead_minutes: int(r.lead_minutes, 0, 180, 15),
        role: ROLE_KEYS.indexOf(r.role) >= 0 ? r.role : 'student',
        deleted: r.deleted === true,
        deleted_at: r.deleted_at || '',
        created_at: r.created_at || '',
        updated_at: r.updated_at || '',
    };
}

function periodToRow(period) {
    const row = {};
    const p = period || {};
    if (p.sort_no !== undefined) row.sort_no = int(p.sort_no, 0, 99, 0);
    if (p.label !== undefined) row.label = text(p.label, '', 30);
    if (p.start_time !== undefined) row.start_time = text(p.start_time, '08:00', 10);
    if (p.end_time !== undefined) row.end_time = text(p.end_time, '08:45', 10);
    return row;
}

function periodFromRow(row) {
    const r = row || {};
    return {
        id: r.id,
        sort_no: int(r.sort_no, 0, 99, 0),
        label: r.label || '',
        start_time: r.start_time || '08:00',
        end_time: r.end_time || '08:45',
    };
}

function importToRow(record) {
    const row = {};
    const r = record || {};
    if (r.source !== undefined) row.source = text(r.source, 'manual', 20);
    if (r.file_name !== undefined) row.file_name = text(r.file_name, '', 120);
    if (r.storage_path !== undefined) row.storage_path = text(r.storage_path, '', 300);
    if (r.row_count !== undefined) row.row_count = int(r.row_count, 0, 100000, 0);
    return row;
}

const coursesAccess = createTableAccess(cloud, {
    table: 'courses',
    columns: COURSE_COLUMNS,
    fromRow: courseFromRow,
    toRow: courseToRow,
    orderBy: { column: 'day_of_week', ascending: true },
});

const periodsAccess = createTableAccess(cloud, {
    table: 'periods',
    columns: PERIOD_COLUMNS,
    fromRow: periodFromRow,
    toRow: periodToRow,
    orderBy: { column: 'sort_no', ascending: true },
});

const importsAccess = createTableAccess(cloud, {
    table: 'imports',
    columns: IMPORT_COLUMNS,
    orderBy: { column: 'created_at', ascending: false },
});

function settingsFromRow(row) {
    const r = row || {};
    return {
        id: r.id,
        role: ROLE_KEYS.indexOf(r.role) >= 0 ? r.role : 'student',
        nickname: r.nickname || '',
        avatar_url: r.avatar_url || '',
        term_start: r.term_start || defaultTermStart(),
        parity_base: r.parity_base || '',
        remind_enabled: r.remind_enabled !== false,
        default_lead: int(r.default_lead, 0, 180, 15),
        subscribe_state: r.subscribe_state || '',
        created_at: r.created_at || '',
        updated_at: r.updated_at || '',
    };
}

function settingsToRow(patch) {
    const row = {};
    const p = patch || {};
    if (p.role !== undefined) row.role = ROLE_KEYS.indexOf(p.role) >= 0 ? p.role : 'student';
    if (p.nickname !== undefined) row.nickname = text(p.nickname, '', 60);
    if (p.avatar_url !== undefined) row.avatar_url = text(p.avatar_url, '', 300);
    if (p.term_start !== undefined) row.term_start = text(p.term_start, defaultTermStart(), 10);
    if (p.parity_base !== undefined) row.parity_base = text(p.parity_base, '', 10);
    if (p.remind_enabled !== undefined) row.remind_enabled = Boolean(p.remind_enabled);
    if (p.default_lead !== undefined) row.default_lead = int(p.default_lead, 0, 180, 15);
    if (p.subscribe_state !== undefined) row.subscribe_state = text(p.subscribe_state, '', 1000);
    return row;
}

async function getSettings() {
    try {
        const result = await cloud.database.from('app_settings').select('*').maybeSingle();
        if (result.error) return fail(result.error);
        return ok(result.data ? settingsFromRow(result.data) : null);
    } catch (error) {
        return fail(clientError(error));
    }
}

// read-modify-write 不是原子操作：快速连点开关 / 日期会互相覆盖。
// 用串行队列保证每次写入都基于上一次写完的最新值。
let settingsWriteQueue = Promise.resolve();

function saveSettings(patch) {
    const run = () => saveSettingsOnce(patch);
    const result = settingsWriteQueue.then(run, run);
    settingsWriteQueue = result.catch(() => null);
    return result;
}

async function saveSettingsOnce(patch) {
    try {
        const current = await getSettings();
        if (current.error) return current;
        const row = settingsToRow(patch);
        if (Object.keys(row).length === 0) return current;
        row.updated_at = new Date().toISOString();
        if (current.data && current.data.id) {
            const result = await cloud.database
                .from('app_settings')
                .update(row)
                .eq('id', current.data.id)
                .select();
            if (result.error) return fail(result.error);
            if (!result.data || result.data.length === 0) {
                return fail({ code: 'NOT_FOUND_OR_FORBIDDEN', message: '没有保存成功，请重新登录后重试' });
            }
            return ok(settingsFromRow(result.data[0]));
        }
        const result = await cloud.database.from('app_settings').insert(row).select();
        if (result.error) return fail(result.error);
        if (!result.data || result.data.length === 0) {
            return fail({ code: 'WRITE_BLOCKED', message: '没有保存成功，请检查登录状态' });
        }
        return ok(settingsFromRow(result.data[0]));
    } catch (error) {
        return fail(clientError(error));
    }
}

async function ensureSettings() {
    const current = await getSettings();
    if (current.error) return current;
    if (current.data) return current;
    return saveSettings({ role: 'student', term_start: defaultTermStart(), remind_enabled: true, default_lead: 15 });
}

// 页面加载时先同步一次身份到全局，保证后续 listCourses / createCourse 用对角色。
async function syncSettings() {
    const result = await ensureSettings();
    if (!result.error && result.data) {
        try {
            getApp().globalData.settings = result.data;
        } catch (error) {
            // 单元测试环境没有 getApp，忽略
        }
    }
    return result;
}

// 当前身份以全局设置为准；页面切换身份后先更新 globalData.settings 再拉取课程。
function currentRole() {
    try {
        const settings = getApp().globalData.settings;
        if (settings && ROLE_KEYS.indexOf(settings.role) >= 0) return settings.role;
    } catch (error) {
        // 单元测试或页面尚未初始化时退回默认身份
    }
    return 'student';
}

async function listCourses(role) {
    const wanted = ROLE_KEYS.indexOf(role) >= 0 ? role : currentRole();
    const result = await coursesAccess.list();
    if (result.error) return result;
    const visible = (result.data || []).filter(item => !item.deleted && item.role === wanted);
    return ok(sortCourses(visible));
}

async function listDeletedCourses(role) {
    const wanted = ROLE_KEYS.indexOf(role) >= 0 ? role : currentRole();
    const result = await coursesAccess.list();
    if (result.error) return result;
    const deleted = (result.data || []).filter(item => item.deleted && item.role === wanted);
    return ok(sortCourses(deleted));
}

function createCourse(payload) {
    const source = payload || {};
    const row = Object.assign({}, source, {
        role: ROLE_KEYS.indexOf(source.role) >= 0 ? source.role : currentRole(),
        deleted: false,
        deleted_at: null,
    });
    return coursesAccess.create(row);
}

function updateCourse(id, patch) {
    return coursesAccess.update(id, patch);
}

// 删除改为软删除：课程进入「已删除的课程」，可随时恢复，避免误删后重新录入。
function removeCourse(id) {
    return coursesAccess.update(id, {
        deleted: true,
        deleted_at: new Date().toISOString(),
    });
}

// 批量勾选删除：一次请求软删除多条，仍然走 RLS，只影响当前用户自己的课程。
async function removeCourses(ids) {
    // 页面里用 String 存选中态，写回数据库前还原成数值 id，避免 bigint 与文本比较失败
    const list = (ids || [])
        .map(id => {
            const n = Number(id);
            return Number.isFinite(n) && String(n) === String(id) ? n : id;
        })
        .filter(id => id !== undefined && id !== null && String(id).trim() !== '');
    if (list.length === 0) return ok(0);
    try {
        const stamp = new Date().toISOString();
        const builder = cloud.database.from('courses').update({
            deleted: true,
            deleted_at: stamp,
            updated_at: stamp,
        });
        if (typeof builder.in !== 'function') {
            // 兼容不支持 in 过滤的旧版 SDK：逐条软删除，行为一致
            let count = 0;
            for (let i = 0; i < list.length; i += 1) {
                const one = await coursesAccess.update(list[i], { deleted: true, deleted_at: stamp });
                if (one.error) return one;
                count += 1;
            }
            return ok(count);
        }
        const result = await builder.in('id', list).select('id');
        if (result.error) return fail(result.error);
        return ok((result.data || []).length);
    } catch (error) {
        return fail(clientError(error));
    }
}

function restoreCourse(id) {
    return coursesAccess.update(id, { deleted: false, deleted_at: null });
}

function purgeCourse(id) {
    return coursesAccess.remove(id);
}

async function createCoursesBatch(list) {
    try {
        const role = currentRole();
        const rows = dedupeCourses(list || []).map(item => {
            const source = item || {};
            return courseToRow(Object.assign({}, source, {
                role: ROLE_KEYS.indexOf(source.role) >= 0 ? source.role : role,
                deleted: false,
                deleted_at: null,
            }));
        }).filter(row => row.title);
        if (rows.length === 0) {
            return fail({ code: 'INVALID_PAYLOAD', message: '没有可导入的课程' });
        }
        const result = await cloud.database
            .from('courses')
            .insert(rows)
            .select(COURSE_COLUMNS.join(','));
        if (result.error) return fail(result.error);
        if (!result.data || result.data.length === 0) {
            return fail({ code: 'WRITE_BLOCKED', message: '没有课程写入成功，请检查登录状态后重试' });
        }
        return ok(result.data.map(courseFromRow));
    } catch (error) {
        return fail(clientError(error));
    }
}

async function listPeriods() {
    const result = await periodsAccess.list();
    if (result.error) return result;
    const data = result.data || [];
    if (data.length > 0) return ok(normalizePeriods(data));
    // 首次使用：写入一套可手动修改的默认作息，之后完全由用户编辑。
    // 写入失败必须如实返回 error：以前返回 10 节「假数据」会让页面以为已保存，
    // 云端其实一行都没有，后续 replacePeriods 还会重复创建。
    const rows = DEFAULT_PERIODS.map((period, index) => periodToRow(Object.assign({ sort_no: index + 1 }, period)));
    try {
        const inserted = await cloud.database.from('periods').insert(rows).select(PERIOD_COLUMNS.join(','));
        if (inserted.error) return fail(inserted.error);
        if (!inserted.data || inserted.data.length === 0) {
            return fail({ code: 'WRITE_BLOCKED', message: '作息时间没有保存成功，请检查登录状态后重试' });
        }
        return ok(normalizePeriods(inserted.data));
    } catch (error) {
        return fail(clientError(error));
    }
}

function idOf(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && String(n) === String(value) ? n : value;
}

// 节次数减少后，原本排在「第 7~10 节」的课程 period_no 会越界，
// slotIndexFor 只能把它们硬塞进最后一节，看起来像几节课挤在一起。
// 保存作息时把这些课程统一收敛到最后一节的标准时间，保证课表与作息一致。
async function clampCoursePeriods(periods) {
    const maxNo = (periods || []).length;
    if (maxNo < 1) return;
    let result;
    try {
        result = await coursesAccess.list();
    } catch (error) {
        return;
    }
    if (!result || result.error) return;
    const last = periods[maxNo - 1];
    const ids = (result.data || [])
        .filter(item => !item.deleted && Number(item.period_no) > maxNo)
        .map(item => idOf(item.id))
        .filter(id => id !== null);
    if (ids.length === 0) return;
    const patch = {
        period_no: maxNo,
        start_time: last.start_time,
        end_time: last.end_time,
    };
    try {
        const builder = cloud.database.from('courses').update(patch);
        if (typeof builder.in === 'function') {
            await builder.in('id', ids).select('id');
        } else {
            for (let i = 0; i < ids.length; i += 1) {
                await coursesAccess.update(ids[i], patch);
            }
        }
    } catch (error) {
        // 课程收敛属于补偿动作，失败不影响作息本身已经保存成功
    }
}

// 作息保存是多条写入：设置页连续点「新增 / 删除 / 快捷设节数」时，
// 两次替换若交叉执行会留下半套节次，这里统一串行。
let periodsWriteQueue = Promise.resolve();

function replacePeriods(list) {
    const run = () => replacePeriodsOnce(list);
    const result = periodsWriteQueue.then(run, run);
    periodsWriteQueue = result.catch(() => null);
    return result;
}

async function replacePeriodsOnce(list) {
    try {
        const current = await periodsAccess.list();
        if (current.error) return current;
        const existing = current.data || [];
        // 统一用字符串比较：云端 id 可能是数字，也可能被序列化成字符串，
        // 类型不一致会把「刚更新过的行」误判成待删除行。
        const keepIds = [];
        const errors = [];
        for (let i = 0; i < (list || []).length; i += 1) {
            const item = list[i];
            const row = periodToRow(Object.assign({}, item, { sort_no: i + 1 }));
            const id = idOf(item.id);
            if (id !== null) {
                const updated = await periodsAccess.update(id, row);
                if (updated.error) {
                    // 这一行可能已被另一台设备 / 上一次替换删掉：按新行补建，
                    // 避免整套作息缺一节，也避免把陈旧 id 报成保存失败。
                    const rebuilt = await periodsAccess.create(row);
                    if (rebuilt.error) errors.push(rebuilt.error);
                    else if (rebuilt.data && rebuilt.data.id !== undefined) keepIds.push(String(idOf(rebuilt.data.id)));
                } else {
                    keepIds.push(String(id));
                }
            } else {
                const created = await periodsAccess.create(row);
                if (created.error) errors.push(created.error);
                else if (created.data && created.data.id !== undefined) keepIds.push(String(idOf(created.data.id)));
            }
        }
        const removed = existing.filter(item => keepIds.indexOf(String(item.id)) < 0);
        for (let i = 0; i < removed.length; i += 1) {
            const deleted = await periodsAccess.remove(removed[i].id);
            if (deleted.error) errors.push(deleted.error);
        }
        // 不中途 return：尽量把整套作息写完再如实报错，避免留下半套数据
        const saved = await listPeriods();
        if (!saved.error) await clampCoursePeriods(saved.data || []);
        if (errors.length > 0) {
            return fail({
                code: 'PARTIAL_SAVE',
                message: '有 ' + errors.length + ' 个节次没保存成功（'
                    + ((errors[0] && errors[0].message) || '请重试') + '），请重新打开本页核对',
            });
        }
        return saved;
    } catch (error) {
        return fail(clientError(error));
    }
}

function createImport(record) {
    return importsAccess.create(record);
}

// 导入记录会越积越多：首屏只取最近 100 条，避免每次进页面都拉全表。
async function listImports(limit) {
    try {
        let query = cloud.database.from('imports')
            .select(IMPORT_COLUMNS.join(','))
            .order('created_at', { ascending: false });
        if (typeof query.limit === 'function') {
            query = query.limit(Math.min(200, Math.max(1, Number(limit) || 100)));
        }
        const result = await query;
        if (result && result.error) return fail(result.error);
        return ok((result && Array.isArray(result.data)) ? result.data : []);
    } catch (error) {
        return fail(clientError(error));
    }
}

// 把导入的原始文件存到当前用户自己的云存储目录，供日后追溯。
async function uploadImportFile(tempPath, extension, contentType, session) {
    try {
        if (!session || !session.user || !session.user.id) {
            return fail({ code: 'UNAUTHENTICATED', message: '请先登录后再上传' });
        }
        const fs = wx.getFileSystemManager();
        const buffer = fs.readFileSync(tempPath);
        const stamp = Date.now() + '-' + Math.floor(Math.random() * 100000);
        const safeExt = /^[a-z0-9]{1,8}$/i.test(extension) ? extension : 'bin';
        const path = cloud.storage.userPath(session.user.id, 'imports/' + stamp + '.' + safeExt);
        const result = await cloud.storage.upload(path, buffer, { contentType: contentType, upsert: false });
        if (result.error) return fail(result.error);
        return ok(path);
    } catch (error) {
        return fail(clientError(error));
    }
}

module.exports = {
    courseToRow,
    courseFromRow,
    getSettings,
    saveSettings,
    ensureSettings,
    syncSettings,
    currentRole,
    listCourses,
    listDeletedCourses,
    createCourse,
    updateCourse,
    removeCourse,
    removeCourses,
    restoreCourse,
    purgeCourse,
    createCoursesBatch,
    listPeriods,
    replacePeriods,
    createImport,
    listImports,
    uploadImportFile,
};
