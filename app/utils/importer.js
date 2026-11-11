// 课程表导入：拍照/相册图片经多模态模型识别、自由文本经模型解析、Excel(.xlsx)/CSV 本地解析。
// 解析结果统一归一化成课程对象，交给导入页确认后再批量写入云端。
const { cloud } = require('./cloud');
const { COURSE_COLORS } = require('./config');
const { DEFAULT_PERIODS, timeToMinutes } = require('./schedule');

const SYSTEM_PROMPT = [
    '你是中文课程表信息抽取助手。把用户提供的课程表内容转换成 JSON 数组，不要输出任何解释、Markdown 代码块或多余文字。',
    '数组每项字段固定为：title(课程名,必填)、teacher(教师)、location(地点)、day_of_week(整数1-7，1=周一,7=周日)、',
    'start_time(HH:MM 24小时制)、end_time(HH:MM)、week_type(仅允许 all/odd/even，分别代表每周/仅单周/仅双周)、note(备注)。',
    '识别不到信息的字段填空字符串或默认值：day_of_week 默认 1，start_time 默认 08:00，end_time 默认 08:45，week_type 默认 all。',
    '照片里若出现"单周/双周"标记，必须写入对应课程的 week_type；同一格里的教室、老师分别放进 location 和 teacher。',
    '课程名不要连带节次编号或时间；一节课只输出一条记录；不要臆造照片中不存在的课程。',
].join('');

const PHOTO_HINT = '请识别这张课程表照片中的全部课程，按上面的字段要求输出 JSON 数组。';
const TEXT_HINT = '请从下面的课程表文字中识别全部课程：\n';

function trimText(value, limit) {
    return String(value === undefined || value === null ? '' : value).trim().slice(0, limit || 120);
}

function parseWeekday(value) {
    const raw = String(value === undefined || value === null ? '' : value).trim();
    if (!raw) return 1;
    if (/^[1-7]$/.test(raw)) return Number(raw);
    const cn = raw.match(/[一二三四五六日天]/);
    if (cn) {
        const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 };
        return map[cn[0]] || 1;
    }
    const en = raw.toLowerCase().match(/^(mon|tue|wed|thu|fri|sat|sun)/);
    if (en) return ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].indexOf(en[1]) + 1;
    return 1;
}

function parseWeekType(value) {
    const raw = String(value || '');
    if (/单周|odd|单/i.test(raw)) return 'odd';
    if (/双周|even|双/i.test(raw)) return 'even';
    return 'all';
}

function normalizeTime(value) {
    const raw = String(value === undefined || value === null ? '' : value);
    const match = raw.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
    if (match) {
        const h = Math.min(23, Number(match[1]));
        const m = Math.min(59, Number(match[2]));
        return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
    }
    const compact = raw.match(/\b(\d{2})(\d{2})\b/);
    if (compact) {
        const h = Number(compact[1]);
        const m = Number(compact[2]);
        if (h < 24 && m < 60) return compact[1] + ':' + compact[2];
    }
    return '';
}

function plusMinutes(time, delta) {
    const start = timeToMinutes(time);
    const total = (start < 0 ? 480 : start) + delta;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return (h < 10 ? '0' + h : String(h)) + ':' + (m < 10 ? '0' + m : String(m));
}

function parseTimeRange(value, fallbackIndex) {
    const raw = String(value || '');
    const matches = raw.match(/(\d{1,2}\s*[:：]\s*\d{2})/g) || [];
    const start = normalizeTime(matches[0] || '') || (DEFAULT_PERIODS[fallbackIndex] || DEFAULT_PERIODS[0]).start_time;
    const end = normalizeTime(matches[1] || '') || plusMinutes(start, 45);
    return { start_time: start, end_time: end };
}

function colorFor(title) {
    let hash = 0;
    for (let i = 0; i < title.length; i += 1) hash = (hash * 31 + title.charCodeAt(i)) % 997;
    return COURSE_COLORS[hash % COURSE_COLORS.length].key;
}

function normalizeCourse(raw) {
    const item = raw || {};
    let title = trimText(item.title || item.name || item.course || '', 60);
    //  Sometimes the model returns "课程名（单周）"; strip the parity suffix into week_type.
    const parityInTitle = title.match(/[（(]?\s*(单周|双周)\s*[)）]?/);
    const weekType = parityInTitle ? parseWeekType(parityInTitle[1]) : parseWeekType(item.week_type || item.weeks || item.week);
    if (parityInTitle) title = title.replace(parityInTitle[0], '').trim();
    title = title.replace(/^第?\s*\d+\s*节[:：\s]*/, '').trim();
    if (!title) return null;
    const start = normalizeTime(item.start_time || item.start || item.begin) || '08:00';
    const end = normalizeTime(item.end_time || item.end || item.finish) || plusMinutes(start, 45);
    return {
        title: title,
        teacher: trimText(item.teacher || item.teacherName || '', 60),
        location: trimText(item.location || item.room || item.place || '', 80),
        day_of_week: parseWeekday(item.day_of_week !== undefined ? item.day_of_week : (item.day || item.weekday)),
        period_no: 0,
        start_time: start,
        end_time: end,
        week_type: weekType,
        color: colorFor(title),
        note: trimText(item.note || item.remark || '', 200),
        remind: true,
        lead_minutes: 15,
    };
}

function extractJson(text) {
    let source = String(text || '').trim();
    source = source.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const arrayStart = source.indexOf('[');
    const arrayEnd = source.lastIndexOf(']');
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        source = source.slice(arrayStart, arrayEnd + 1);
    } else {
        const objectStart = source.indexOf('{');
        const objectEnd = source.lastIndexOf('}');
        if (objectStart >= 0 && objectEnd > objectStart) {
            source = '[' + source.slice(objectStart, objectEnd + 1) + ']';
        }
    }
    const parsed = JSON.parse(source);
    const list = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.courses) ? parsed.courses : [parsed]);
    return list.map(normalizeCourse).filter(Boolean);
}

async function chooseModel(needImage) {
    const models = await cloud.llm.models.list();
    const usable = (models || []).filter(m => m && m.enabled !== false && m.disabled !== true && m.id && m.id.indexOf('image') < 0);
    if (usable.length === 0) return null;
    if (needImage) {
        return usable.find(m => m.supportsImages === true && m.disabledMultimodal !== true) || null;
    }
    // 文本抽取优先便宜、快速且稳定的模型
    return usable.find(m => /flash|fast|auto/i.test(m.id)) || usable[0];
}

function friendlyLLMError(error) {
    const code = error && error.error && typeof error.error.code === 'string' ? error.error.code : '';
    if (code.indexOf('auth_') === 0) return '识别服务的域名授权未就绪，请在小程序后台配置 request 合法域名后重试';
    if (code.indexOf('quota_') === 0) return '识别额度暂时用完，请稍后再试，或改用手动录入';
    if (code.indexOf('request_') === 0) return '识别请求不被当前模型支持，请改用手动录入或 Excel 导入';
    if (code.indexOf('gateway_') === 0 || code.indexOf('model_') === 0) return '识别服务暂时不可用，请稍后重试';
    return (error && error.error && error.error.message) || (error && error.message) || '识别失败，请重试或改用手动录入';
}

// 统一的模型调用：system 消息必须位于 messages[0]，且只能使用流式接口
async function llmExtract(options) {
    const opts = options || {};
    try {
        const model = await chooseModel(Boolean(opts.imageBase64));
        if (!model) {
            return { data: [], error: { code: 'NO_MODEL', message: '当前没有可用的识别模型，请改用手动录入或 Excel 导入' } };
        }
        let userContent;
        if (opts.imageBase64) {
            const mime = /png/i.test(opts.imageMime || '') ? 'image/png' : 'image/jpeg';
            userContent = [
                { type: 'text', text: PHOTO_HINT },
                { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + opts.imageBase64 } },
            ];
        } else {
            userContent = TEXT_HINT + String(opts.text || '').slice(0, 6000);
        }
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
        ];
        let answer = '';
        const stream = cloud.llm.chat.completions.create({
            model: model.id,
            messages: messages,
            stream: true,
            temperature: 0.2,
        });
        for await (const chunk of stream) {
            const choice = chunk && chunk.choices && chunk.choices[0];
            const delta = choice && choice.delta;
            if (delta && delta.content) answer += delta.content;
        }
        const courses = extractJson(answer);
        if (courses.length === 0) {
            return { data: [], error: { code: 'EMPTY_RESULT', message: '没有识别到课程，请换一张更清晰的照片或手动录入' } };
        }
        return { data: courses, error: null };
    } catch (error) {
        return { data: [], error: { code: 'LLM_FAILED', message: friendlyLLMError(error) } };
    }
}

/* ------------------------- CSV / Excel 本地解析 ------------------------- */

function decodeXml(value) {
    return String(value || '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
        .replace(/&amp;/g, '&');
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i];
        if (quoted) {
            if (ch === '"' && source[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (ch === '"') {
                quoted = false;
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(field);
            field = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && source[i + 1] === '\n') i += 1;
            row.push(field);
            if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
            row = [];
            field = '';
        } else {
            field += ch;
        }
    }
    row.push(field);
    if (row.some(cell => String(cell).trim() !== '')) rows.push(row);
    return rows;
}

function columnIndex(reference) {
    const match = String(reference || '').match(/^([A-Z]+)/);
    if (!match) return 0;
    let value = 0;
    const letters = match[1];
    for (let i = 0; i < letters.length; i += 1) value = value * 26 + (letters.charCodeAt(i) - 64);
    return value - 1;
}

function parseSharedStrings(xml) {
    const result = [];
    const siPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let match = siPattern.exec(xml);
    while (match) {
        const parts = [];
        const tPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let t = tPattern.exec(match[1]);
        while (t) {
            parts.push(decodeXml(t[1]));
            t = tPattern.exec(match[1]);
        }
        result.push(parts.join(''));
        match = siPattern.exec(xml);
    }
    return result;
}

function parseSheet(xml, shared) {
    const rows = [];
    const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
    let rowMatch = rowPattern.exec(xml);
    while (rowMatch) {
        const cells = [];
        const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
        let cellMatch = cellPattern.exec(rowMatch[1]);
        while (cellMatch) {
            const attrs = cellMatch[1] || '';
            const body = cellMatch[2] || '';
            const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
            const type = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
            let value = '';
            if (type === 's') {
                const v = body.match(/<v>([\s\S]*?)<\/v>/);
                value = v ? (shared[Number(v[1])] || '') : '';
            } else if (type === 'inlineStr') {
                const parts = [];
                const tPattern = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
                let t = tPattern.exec(body);
                while (t) {
                    parts.push(decodeXml(t[1]));
                    t = tPattern.exec(body);
                }
                value = parts.join('');
            } else {
                const v = body.match(/<v>([\s\S]*?)<\/v>/);
                value = v ? decodeXml(v[1]) : '';
            }
            const index = columnIndex(ref);
            cells[index] = String(value).trim();
            cellMatch = cellPattern.exec(rowMatch[1]);
        }
        for (let i = 0; i < cells.length; i += 1) if (cells[i] === undefined) cells[i] = '';
        if (cells.some(cell => String(cell).trim() !== '')) rows.push(cells);
        rowMatch = rowPattern.exec(xml);
    }
    return rows;
}

function readUtf8(path) {
    const fs = wx.getFileSystemManager();
    return fs.readFileSync(path, 'utf8');
}

function unzipAsync(fs, zipFilePath, targetPath) {
    return new Promise((resolve, reject) => {
        fs.unzip({
            zipFilePath: zipFilePath,
            targetPath: targetPath,
            success: resolve,
            fail: error => reject(new Error((error && error.errMsg) || '无法解压 Excel 文件')),
        });
    });
}

async function readXlsx(tempPath) {
    const fs = wx.getFileSystemManager();
    const base = (wx.env && wx.env.USER_DATA_PATH) || 'wxfile://usr';
    const stamp = Date.now() + '-' + Math.floor(Math.random() * 10000);
    const zipPath = base + '/wb-import-' + stamp + '.zip';
    const targetPath = base + '/wb-import-' + stamp;
    fs.copyFileSync(tempPath, zipPath);
    await unzipAsync(fs, zipPath, targetPath);
    let shared = [];
    try {
        shared = parseSharedStrings(readUtf8(targetPath + '/xl/sharedStrings.xml'));
    } catch (error) {
        shared = [];
    }
    let sheetPath = targetPath + '/xl/worksheets/sheet1.xml';
    try {
        fs.accessSync(sheetPath);
    } catch (error) {
        sheetPath = targetPath + '/xl/worksheets/sheet.xml';
    }
    const xml = readUtf8(sheetPath);
    return parseSheet(xml, shared);
}

const HEADER_ALIASES = {
    title: ['课程', '课程名称', '科目', '课名', '名称', 'course', 'title', 'subject', 'name'],
    day_of_week: ['星期', '周几', '周次', '天', 'day', 'weekday', '日期'],
    start_time: ['开始', '开始时间', '上课时间', '起始', 'start', 'begin'],
    end_time: ['结束', '结束时间', '下课时间', 'end', 'finish'],
    teacher: ['教师', '老师', '授课教师', 'teacher'],
    location: ['地点', '教室', '上课地点', 'room', 'location', 'place'],
    week_type: ['单双周', '周次类型', '单周', 'weektype', 'weeks'],
    note: ['备注', '说明', 'note', 'remark'],
};

function matchHeader(cell) {
    const value = String(cell || '').trim().toLowerCase().replace(/\s/g, '');
    for (const key of Object.keys(HEADER_ALIASES)) {
        for (const alias of HEADER_ALIASES[key]) {
            if (value.indexOf(alias.toLowerCase()) >= 0) return key;
        }
    }
    return '';
}

function weekdayFromHeader(cell) {
    const value = String(cell || '');
    if (/[周星]\s*[一二三四五六日天]|周[1-7]|星期[1-7]/i.test(value)) return parseWeekday(value);
    if (/^(mon|tue|wed|thu|fri|sat|sun)/i.test(value.trim())) return parseWeekday(value);
    return 0;
}

function splitCellContent(value) {
    const lines = String(value || '')
        .split(/[\n\r]+|@|\||；|;/)
        .map(part => part.trim())
        .filter(Boolean);
    const title = lines[0] || '';
    let teacher = '';
    let location = '';
    lines.slice(1).forEach((line) => {
        if (/楼|室|场|校区|教室|机房|实验室|操场|\d{3,}/.test(line) && !location) location = line;
        else if (!teacher) teacher = line;
    });
    return { title: title, teacher: teacher, location: location };
}

function rowsToCourses(rows) {
    const source = (rows || []).filter(row => row && row.some(cell => String(cell).trim() !== ''));
    if (source.length === 0) return [];
    const header = source[0].map(cell => String(cell || '').trim());
    const dayColumns = [];
    header.forEach((cell, index) => {
        const day = weekdayFromHeader(cell);
        if (day) dayColumns.push({ day: day, index: index });
    });

    // 矩阵式课程表：表头是周一~周日，每行是一个时间段
    if (dayColumns.length >= 2) {
        const result = [];
        for (let r = 1; r < source.length; r += 1) {
            const row = source[r];
            const range = parseTimeRange(row[0], Math.min(r - 1, DEFAULT_PERIODS.length - 1));
            dayColumns.forEach((col) => {
                const raw = String(row[col.index] || '').trim();
                if (!raw || /^[-—/无]$/.test(raw)) return;
                const parts = splitCellContent(raw);
                const course = normalizeCourse({
                    title: parts.title,
                    teacher: parts.teacher,
                    location: parts.location,
                    day_of_week: col.day,
                    start_time: range.start_time,
                    end_time: range.end_time,
                    week_type: /单周/.test(raw) ? 'odd' : /双周/.test(raw) ? 'even' : 'all',
                    note: '',
                });
                if (course) result.push(course);
            });
        }
        return result;
    }

    // 记录式表格：每行一节课
    const fields = {};
    header.forEach((cell, index) => {
        const key = matchHeader(cell);
        if (key && fields[key] === undefined) fields[key] = index;
    });
    if (fields.title === undefined) return [];
    const result = [];
    for (let r = 1; r < source.length; r += 1) {
        const row = source[r];
        const get = key => (fields[key] === undefined ? '' : row[fields[key]]);
        const combined = String(row[0] || '') + ' ' + String(get('day_of_week') || '');
        const range = parseTimeRange(get('start_time') || combined, 0);
        const course = normalizeCourse({
            title: get('title'),
            teacher: get('teacher'),
            location: get('location'),
            day_of_week: get('day_of_week') || combined,
            start_time: get('start_time') || range.start_time,
            end_time: get('end_time') || range.end_time,
            week_type: get('week_type'),
            note: get('note'),
        });
        if (course && course.title !== String(header[fields.title] || '').trim()) result.push(course);
    }
    return result;
}

async function readTable(tempPath, fileName) {
    const name = String(fileName || '').toLowerCase();
    if (/\.xls$/.test(name)) {
        return { data: [], error: { code: 'UNSUPPORTED', message: '旧版 .xls 暂不支持，请在 Excel 中另存为 .xlsx 或 .csv' } };
    }
    try {
        let rows;
        if (/\.xlsx$/.test(name)) {
            rows = await readXlsx(tempPath);
        } else {
            const text = readUtf8(tempPath);
            if (text.indexOf('\uFFFD') >= 0) {
                return { data: [], error: { code: 'BAD_ENCODING', message: '文件编码不是 UTF-8，请在 Excel 中另存为「CSV UTF-8」后重试' } };
            }
            rows = parseCsv(text);
        }
        const courses = rowsToCourses(rows);
        if (courses.length === 0) {
            return { data: [], error: { code: 'EMPTY_TABLE', message: '没读到课程，请检查表头是否包含「课程名称」或用周一~周日作为列标题' } };
        }
        return { data: courses, error: null };
    } catch (error) {
        return { data: [], error: { code: 'PARSE_FAILED', message: (error && error.message) || '文件解析失败，请确认是有效的 xlsx / csv 文件' } };
    }
}

module.exports = {
    SYSTEM_PROMPT,
    llmExtract,
    readTable,
    parseCsv,
    rowsToCourses,
    normalizeCourse,
    normalizeTime,
};
