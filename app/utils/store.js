// 云端数据层。页面只调用这里的方法，不直接碰 cloud.database / cloud.storage。
// 所有方法返回 { data, error }，不 reject；error 统一带可展示的 message。
const { cloud } = require('./cloud');
const { createTableAccess } = require('./workbuddy-data-access');
const { DEFAULT_PERIODS, defaultTermStart, sortCourses, normalizePeriods } = require('./schedule');

const COURSE_COLUMNS = [
    'id', 'title', 'teacher', 'location', 'day_of_week', 'period_no',
    'start_time', 'end_time', 'week_type', 'color', 'note', 'remind',
    'lead_minutes', 'created_at', 'updated_at',
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
    if (c.note !== undefined) row.note = text(c.note, '', 300);
    if (c.remind !== undefined) row.remind = Boolean(c.remind);
    if (c.lead_minutes !== undefined) row.lead_minutes = int(c.lead_minutes, 0, 180, 15);
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

async function saveSettings(patch) {
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

async function listCourses() {
    const result = await coursesAccess.list();
    if (result.error) return result;
    return ok(sortCourses(result.data || []));
}

function createCourse(payload) {
    return coursesAccess.create(payload);
}

function updateCourse(id, patch) {
    return coursesAccess.update(id, patch);
}

function removeCourse(id) {
    return coursesAccess.remove(id);
}

async function createCoursesBatch(list) {
    try {
        const rows = (list || []).map(courseToRow).filter(row => row.title);
        if (rows.length === 0) {
            return fail({ code: 'INVALID_PAYLOAD', message: '没有可导入的课程' });
        }
        const result = await cloud.database
            .from('courses')
            .insert(rows)
            .select(COURSE_COLUMNS.join(','));
        if (result.error) return fail(result.error);
        return ok((result.data || []).map(courseFromRow));
    } catch (error) {
        return fail(clientError(error));
    }
}

async function listPeriods() {
    const result = await periodsAccess.list();
    if (result.error) return result;
    const data = result.data || [];
    if (data.length > 0) return ok(normalizePeriods(data));
    // 首次使用：写入一套可手动修改的默认作息，之后完全由用户编辑
    const rows = DEFAULT_PERIODS.map((period, index) => periodToRow(Object.assign({ sort_no: index + 1 }, period)));
    try {
        const inserted = await cloud.database.from('periods').insert(rows).select(PERIOD_COLUMNS.join(','));
        if (inserted.error) return ok(normalizePeriods([]));
        return ok(normalizePeriods(inserted.data || []));
    } catch (error) {
        return ok(normalizePeriods([]));
    }
}

async function replacePeriods(list) {
    try {
        const current = await periodsAccess.list();
        if (current.error) return current;
        const existing = current.data || [];
        const keepIds = [];
        for (let i = 0; i < (list || []).length; i += 1) {
            const item = list[i];
            const row = periodToRow(Object.assign({}, item, { sort_no: i + 1 }));
            if (item.id && typeof item.id === 'number') {
                keepIds.push(item.id);
                const updated = await periodsAccess.update(item.id, row);
                if (updated.error) return updated;
            } else {
                const created = await periodsAccess.create(row);
                if (created.error) return created;
                if (created.data && created.data.id) keepIds.push(created.data.id);
            }
        }
        const removed = existing.filter(item => keepIds.indexOf(item.id) < 0);
        for (let i = 0; i < removed.length; i += 1) {
            await periodsAccess.remove(removed[i].id);
        }
        return listPeriods();
    } catch (error) {
        return fail(clientError(error));
    }
}

function createImport(record) {
    return importsAccess.create(record);
}

function listImports() {
    return importsAccess.list();
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
    listCourses,
    createCourse,
    updateCourse,
    removeCourse,
    createCoursesBatch,
    listPeriods,
    replacePeriods,
    createImport,
    listImports,
    uploadImportFile,
};
