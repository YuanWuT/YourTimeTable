// 家长「多个孩子」、老师「多个班级」的数据模型（下称 scope）。
//
// 存储：配置以 JSON 字符串放在 app_settings.children / classes，
//       课程用 courses.scope_key 标记归属，active_scope 记住当前选中的那个。
// 兼容：升级前录入的课程 scope_key 为空，统一算在「第一个孩子 / 第一个班级」名下，
//       这样老用户添加孩子或班级后，原来的课表不会突然消失。
// 学生：完全不参与 scope，读写都保持 scope_key = ''，行为与升级前一致。
// 性别：孩子可选男孩 / 女孩，只影响显示头像与列表标注，不参与课程过滤；
//       老数据没有 gender 字段时回退到中性头像，班级也统一用学校图标。
// 本文件是纯函数，不依赖 wx / 云端，便于单独测试。

const MAX_SCOPES = 20;
const ALL_SCOPE_KEY = 'all';

const NAME_LIMIT = 20;
const DETAIL_LIMIT = 40;
const EXTRA_LIMIT = 40;
const NOTE_LIMIT = 60;
const ID_LIMIT = 40;

const GENDERS = [
    { key: 'boy', name: '男孩', icon: '👦' },
    { key: 'girl', name: '女孩', icon: '👧' },
];

const KINDS = {
    parent: {
        listKey: 'children',
        noun: '孩子',
        icon: '🧒',
        listTitle: '我的孩子',
        switchTitle: '切换孩子',
        addLabel: '添加孩子',
        manageLabel: '管理孩子',
        nameLabel: '孩子名称',
        namePlaceholder: '例如：小雨 / 大宝',
        detailLabel: '所在班级',
        detailPlaceholder: '例如：三年级二班',
        extraLabel: '学校',
        extraPlaceholder: '例如：实验小学',
        noteLabel: '备注',
        notePlaceholder: '选填，例如：班主任、放学时间',
        emptyTitle: '还未添加孩子信息',
        emptyHint: '添加后就能分别查看每个孩子的课表；升级前录入的老课表会归到第一个孩子名下。',
        switchHint: '每个孩子有独立的课表，切换后只显示这个孩子的课程。',
    },
    teacher: {
        listKey: 'classes',
        noun: '班级',
        icon: '🏫',
        listTitle: '我教的班级',
        switchTitle: '选择班级',
        addLabel: '添加班级',
        manageLabel: '管理班级',
        nameLabel: '班级名称',
        namePlaceholder: '例如：三年级二班',
        detailLabel: '年级 / 学段',
        detailPlaceholder: '例如：小学三年级',
        extraLabel: '任教科目',
        extraPlaceholder: '例如：数学',
        noteLabel: '备注',
        notePlaceholder: '选填，例如：固定教室、课代表',
        emptyTitle: '还未添加班级信息',
        emptyHint: '添加后可按班级单独查看，也能一次查看全部班级的课程。',
        switchHint: '选一个班只看这个班的课；选「全部班级」一次看所有课，课程上会标出班级。',
    },
};

function clip(value, limit) {
    const result = value === undefined || value === null ? '' : String(value);
    return result.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeGender(value) {
    const key = clip(value, 10);
    return GENDERS.some(item => item.key === key) ? key : '';
}

function genderName(value) {
    const hit = GENDERS.find(item => item.key === normalizeGender(value));
    return hit ? hit.name : '';
}

// 家长按性别显示男孩 / 女孩头像；老师统一用班级图标。
function iconOf(item, role) {
    if (role !== 'parent') return KINDS.teacher.icon;
    const hit = GENDERS.find(entry => entry.key === normalizeGender(item && item.gender));
    return hit ? hit.icon : KINDS.parent.icon;
}

function parseList(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        // 云端字段被写坏时不能让整个页面崩掉，当作空列表处理
        return [];
    }
}

function normalizeScope(raw) {
    const item = raw || {};
    return {
        id: clip(item.id, ID_LIMIT),
        name: clip(item.name, NAME_LIMIT),
        gender: normalizeGender(item.gender),
        detail: clip(item.detail, DETAIL_LIMIT),
        extra: clip(item.extra, EXTRA_LIMIT),
        note: clip(item.note, NOTE_LIMIT),
    };
}

function newScopeId() {
    return 'sc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function settingsScopes(settings, role) {
    const kind = KINDS[role];
    if (!kind) return [];
    const source = settings || {};
    return parseList(source[kind.listKey])
        .map(normalizeScope)
        .filter(item => item.id && item.name)
        .slice(0, MAX_SCOPES);
}

function serializeScopes(list) {
    return JSON.stringify((list || []).slice(0, MAX_SCOPES).map(normalizeScope));
}

// 当前身份下真正生效的归属视图
function scopeOf(settings) {
    const role = settings && KINDS[settings.role] ? settings.role : 'student';
    const kind = KINDS[role];
    const list = settingsScopes(settings, role);
    if (!kind) {
        return {
            role: 'student', kind: null, list: [], key: '', label: '', icon: '',
            isAll: false, needsScope: false, empty: false, switchHint: '',
        };
    }
    const active = clip(settings.active_scope, ID_LIMIT);
    if (list.length === 0) {
        return {
            role, kind, list, key: '', label: '', icon: kind.icon,
            isAll: false, needsScope: true, empty: true, switchHint: kind.emptyHint,
        };
    }
    if (role === 'teacher' && active === ALL_SCOPE_KEY) {
        return {
            role, kind, list, key: ALL_SCOPE_KEY, label: '全部班级', icon: '📚',
            isAll: true, needsScope: true, empty: false, switchHint: kind.switchHint,
        };
    }
    const hit = list.find(item => item.id === active) || list[0];
    return {
        role, kind, list, key: hit.id, label: hit.name, icon: iconOf(hit, role),
        isAll: false, needsScope: true, empty: false, switchHint: kind.switchHint,
    };
}

// 老数据（scope_key 为空）认领到的那一个 scope
function legacyKey(scope) {
    return scope && scope.list && scope.list.length ? scope.list[0].id : '';
}

function courseKey(course) {
    return clip(course && course.scope_key, ID_LIMIT);
}

function nameOf(scope, key) {
    const effective = key || legacyKey(scope);
    const hit = (scope.list || []).find(item => item.id === effective);
    return hit ? hit.name : '';
}

// 新建 / 批量导入课程时，如果调用方没有明确指定归属，就写到当前选中的 scope。
// 「全部班级」是查看模式，不能写入，退回第一个班级。
function defaultWriteKey(scope) {
    if (!scope || !scope.needsScope) return '';
    if (!scope.list || scope.list.length === 0) return '';
    if (scope.key && scope.key !== ALL_SCOPE_KEY) return scope.key;
    return scope.list[0].id;
}

function belongsTo(course, scope) {
    if (!scope || !scope.needsScope) return true;
    if (!scope.list || scope.list.length === 0) return true;
    if (scope.isAll) return true;
    const key = courseKey(course);
    if (key === scope.key) return true;
    return key === '' && legacyKey(scope) === scope.key;
}

// 给课程补 scopeName，供格子 / 详情 / 回收站展示（尤其「全部班级」视图）
function decorate(courses, settings) {
    const scope = scopeOf(settings);
    if (!scope.needsScope || scope.list.length === 0) return (courses || []).slice();
    return (courses || []).map(course => Object.assign({}, course, {
        scopeName: nameOf(scope, courseKey(course)),
    }));
}

function optionsOf(scope) {
    if (!scope || !scope.needsScope) return [];
    const options = (scope.list || []).map(item => ({
        key: item.id,
        name: item.name,
        desc: [item.detail, item.extra].filter(Boolean).join(' · ') || item.note || '',
        icon: iconOf(item, scope.role),
        selected: !scope.isAll && item.id === scope.key,
    }));
    // 一个班都还没添加时不给「全部班级」这个空选项，避免弹层里出现没有意义的一行
    if (scope.role === 'teacher' && options.length > 0) {
        options.unshift({
            key: ALL_SCOPE_KEY,
            name: '全部班级',
            desc: '一次查看所有任教班级的课程',
            icon: '📚',
            selected: scope.isAll,
        });
    }
    return options;
}

// 编辑弹层保存时统一补齐 id 与字段长度
function buildScope(raw, existingId) {
    const item = normalizeScope(raw);
    return {
        id: existingId || item.id || newScopeId(),
        name: item.name,
        gender: item.gender,
        detail: item.detail,
        extra: item.extra,
        note: item.note,
    };
}

function summaryOf(item) {
    return [item.detail, item.extra].filter(Boolean).join(' · ');
}

module.exports = {
    MAX_SCOPES,
    ALL_SCOPE_KEY,
    KINDS,
    GENDERS,
    clip,
    normalizeGender,
    genderName,
    iconOf,
    parseList,
    normalizeScope,
    newScopeId,
    settingsScopes,
    serializeScopes,
    scopeOf,
    legacyKey,
    courseKey,
    nameOf,
    defaultWriteKey,
    belongsTo,
    decorate,
    optionsOf,
    buildScope,
    summaryOf,
};
