// 小程序数据访问资产：只处理数据读写；owner 由服务端 DEFAULT auth.uid() 与 RLS 决定；0 行命中视为失败；认证与本地迁移不在此文件。

const TABLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

const NOT_FOUND_OR_FORBIDDEN_ERROR = {
    code: 'NOT_FOUND_OR_FORBIDDEN',
    message: '没有保存成功，这条记录可能已被删除或无权修改',
};

const INVALID_ID_ERROR = {
    code: 'INVALID_ID',
    message: '缺少记录 id',
};

const INVALID_PAYLOAD_ERROR = {
    code: 'INVALID_PAYLOAD',
    message: '没有可提交的字段',
};

function identity(value) {
    return value;
}

// toRow 的结果必须是至少含一个字段的普通对象，否则不发请求：
// 空对象或 undefined 提交上去只会得到含糊的服务端报错。
function hasWritableFields(row) {
    return row !== null && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).length > 0;
}

function clientException(error) {
    const message = error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : '';
    return { data: null, error: { code: 'CLIENT_EXCEPTION', message } };
}

function asRows(data) {
    return Array.isArray(data) ? data : [];
}

function invalidId(id) {
    if (typeof id === 'string') return id.trim() === '';
    if (typeof id === 'number') return !Number.isFinite(id);
    return true;
}

function mustBeTableName(table) {
    if (typeof table !== 'string' || !TABLE_NAME_RE.test(table)) {
        throw new TypeError('table 必须是合法表名');
    }
}

function mustBeColumns(columns) {
    if (!Array.isArray(columns) || columns.length === 0) {
        throw new TypeError('columns 不能为空');
    }
    for (const column of columns) {
        if (typeof column !== 'string' || column.trim() === '') {
            throw new TypeError('columns 必须是非空字符串数组');
        }
    }
}

async function safely(executor) {
    try {
        return await executor();
    } catch (error) {
        return clientException(error);
    }
}

function createTableAccess(cloud, options) {
    const config = options || {};
    const { table, columns, fromRow = identity, toRow = identity, orderBy } = config;

    mustBeTableName(table);
    mustBeColumns(columns);
    if (!cloud || !cloud.database || typeof cloud.database.from !== 'function') {
        throw new TypeError('cloud 必须是 createMiniProgramWorkBuddyCloud 返回的客户端（需要 cloud.database.from）');
    }

    const selectedColumns = columns.join(',');
    const from = () => cloud.database.from(table);

    return {
        list() {
            return safely(async () => {
                let query = from().select(selectedColumns);
                if (orderBy && typeof orderBy.column === 'string' && orderBy.column.trim() !== '') {
                    query = query.order(orderBy.column, { ascending: orderBy.ascending !== false });
                }
                const result = await query;
                return {
                    data: asRows(result && result.data).map(fromRow),
                    error: result ? result.error : null,
                };
            });
        },

        create(payload) {
            return safely(async () => {
                const row = toRow(payload);
                if (!hasWritableFields(row)) {
                    return { data: null, error: INVALID_PAYLOAD_ERROR };
                }
                const result = await from()
                    .insert(row)
                    .select(selectedColumns);
                const rows = asRows(result && result.data);
                return {
                    data: rows.length > 0 ? fromRow(rows[0]) : null,
                    error: result ? result.error : null,
                };
            });
        },

        update(id, patch) {
            if (invalidId(id)) {
                return Promise.resolve({ data: null, error: INVALID_ID_ERROR });
            }
            return safely(async () => {
                const row = toRow(patch);
                if (!hasWritableFields(row)) {
                    return { data: null, error: INVALID_PAYLOAD_ERROR };
                }
                const result = await from()
                    .update(row)
                    .eq('id', id)
                    .select(selectedColumns);
                const rows = asRows(result && result.data);
                if (rows.length === 0) {
                    return { data: null, error: NOT_FOUND_OR_FORBIDDEN_ERROR };
                }
                return {
                    data: fromRow(rows[0]),
                    error: result ? result.error : null,
                };
            });
        },

        remove(id) {
            if (invalidId(id)) {
                return Promise.resolve({ data: null, error: INVALID_ID_ERROR });
            }
            return safely(async () => {
                const result = await from()
                    .delete()
                    .eq('id', id)
                    .select(selectedColumns);
                const rows = asRows(result && result.data);
                if (rows.length === 0) {
                    return { data: null, error: NOT_FOUND_OR_FORBIDDEN_ERROR };
                }
                return {
                    data: { removed: rows.length },
                    error: result ? result.error : null,
                };
            });
        },
    };
}

module.exports = { createTableAccess };
