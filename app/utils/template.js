// Excel 导入模板生成器。
// 纯 JS 生成一个最小可用的 .xlsx（ZIP + OOXML，条目不压缩），不需要 npm 包、不需要网络。
// 生成结果是 ArrayBuffer，可直接交给 wx.getFileSystemManager().writeFileSync 落盘。
//
// 为什么选 .xlsx 而不是 .csv：微信里 .xlsx 能用 Excel / WPS 直接打开；项目自带的
// utils/importer.js 也支持解析 xlsx（inlineStr 单元格），模板与导入逻辑可以闭环验证。
// ZIP 采用 store 模式（不压缩），因此不需要引入任何压缩库。

const SINGLE_HEADERS = ['课程名称', '星期', '开始时间', '结束时间', '地点', '教师', '单双周', '备注'];
const SINGLE_ROWS = [
    SINGLE_HEADERS,
    ['高等数学', '周一', '08:00', '08:45', '教三 201', '张老师', '每周', '带练习册'],
    ['大学英语', '周三', '10:00', '10:45', '外语楼 305', '李老师', '单周', ''],
];

const MATRIX_HEADERS = ['时间段', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const MATRIX_ROWS = [
    MATRIX_HEADERS,
    ['08:00-08:45', '高等数学\n教三 201\n张老师', '', '大学英语\n外语楼 305\n李老师', '', '', '', ''],
    ['08:55-09:40', '', '线性代数\n教三 205\n王老师', '', '', '体育\n操场', '', ''],
];

const FORMATS = {
    single: {
        rows: SINGLE_ROWS,
        fileName: '课程表模板-一行一节课.xlsx',
        sheetName: '一行一节课',
    },
    matrix: {
        rows: MATRIX_ROWS,
        fileName: '课程表模板-课表矩阵.xlsx',
        sheetName: '课表矩阵',
    },
};

function xmlEscape(value) {
    return String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// 小程序 JSCore 不保证有 TextEncoder，所以手写 UTF-8 编码（含代理对处理）。
function utf8Bytes(value) {
    const text = String(value === undefined || value === null ? '' : value);
    const bytes = [];
    for (let i = 0; i < text.length; i += 1) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            const low = text.charCodeAt(i + 1);
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i += 1;
            }
        }
        if (code < 0x80) {
            bytes.push(code);
        } else if (code < 0x800) {
            bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
            bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        } else {
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f),
            );
        }
    }
    return bytes;
}

const CRC_TABLE = (function buildCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
}

function u16(target, value) {
    target.push(value & 0xff, (value >>> 8) & 0xff);
}

function u32(target, value) {
    target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function bytesTo(target, source) {
    for (let i = 0; i < source.length; i += 1) target.push(source[i]);
}

function buildZip(files) {
    const localChunks = [];
    const centralChunks = [];
    // DOS 日期：2026-01-01，时间 00:00；固定值即可，模板不需要真实时间戳
    const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
    let offset = 0;

    files.forEach((file) => {
        const name = utf8Bytes(file.name);
        const data = file.data;
        const checksum = crc32(data);

        const local = [];
        u32(local, 0x04034b50); // local file header
        u16(local, 20);         // version needed
        u16(local, 0x0800);     // UTF-8 文件名
        u16(local, 0);          // stored（不压缩）
        u16(local, 0);          // time
        u16(local, dosDate);
        u32(local, checksum);
        u32(local, data.length);
        u32(local, data.length);
        u16(local, name.length);
        u16(local, 0);          // extra length
        bytesTo(local, name);
        bytesTo(local, data);
        localChunks.push(local);

        const central = [];
        u32(central, 0x02014b50); // central directory header
        u16(central, 20);         // version made by
        u16(central, 20);         // version needed
        u16(central, 0x0800);
        u16(central, 0);
        u16(central, 0);
        u16(central, dosDate);
        u32(central, checksum);
        u32(central, data.length);
        u32(central, data.length);
        u16(central, name.length);
        u16(central, 0);          // extra length
        u16(central, 0);          // comment length
        u16(central, 0);          // disk number
        u16(central, 0);          // internal attrs
        u32(central, 0);          // external attrs
        u32(central, offset);
        bytesTo(central, name);
        centralChunks.push(central);

        offset += local.length;
    });

    const centralSize = centralChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = [];
    u32(end, 0x06054b50); // end of central directory
    u16(end, 0);
    u16(end, 0);
    u16(end, files.length);
    u16(end, files.length);
    u32(end, centralSize);
    u32(end, offset);
    u16(end, 0);

    const all = localChunks.concat(centralChunks, [end]);
    const total = all.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(total);
    let position = 0;
    all.forEach((chunk) => {
        result.set(chunk, position);
        position += chunk.length;
    });
    return result.buffer;
}

function columnName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
        const rest = (n - 1) % 26;
        name = String.fromCharCode(65 + rest) + name;
        n = Math.floor((n - 1) / 26);
    }
    return name;
}

function sheetXml(rows) {
    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const body = rows.map((row, rowIndex) => {
        const cells = [];
        row.forEach((value, columnIndex) => {
            const content = String(value === undefined || value === null ? '' : value);
            if (content === '') return; // 空单元格直接省略，解析器会补空字符串
            const ref = columnName(columnIndex) + (rowIndex + 1);
            cells.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">'
                + xmlEscape(content) + '</t></is></c>');
        });
        return '<row r="' + (rowIndex + 1) + '">' + cells.join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + '<dimension ref="A1:' + columnName(Math.max(0, columnCount - 1)) + rows.length + '"/>'
        + '<sheetViews><sheetView workbookViewId="0">'
        + '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        + '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
        + '</sheetView></sheetViews>'
        + '<cols><col min="1" max="' + columnCount + '" width="18" customWidth="1"/></cols>'
        + '<sheetData>' + body + '</sheetData>'
        + '</worksheet>';
}

function buildXlsxTemplate(format) {
    const config = FORMATS[format] || FORMATS.single;
    const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + '<sheets><sheet name="' + xmlEscape(config.sheetName) + '" sheetId="1" r:id="rId1"/></sheets>'
        + '</workbook>';
    const files = [
        {
            name: '[Content_Types].xml',
            data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                + '<Default Extension="xml" ContentType="application/xml"/>'
                + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                + '</Types>'),
        },
        {
            name: '_rels/.rels',
            data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                + '</Relationships>'),
        },
        { name: 'xl/workbook.xml', data: utf8Bytes(workbook) },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                + '</Relationships>'),
        },
        {
            name: 'xl/styles.xml',
            data: utf8Bytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
                + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
                + '<borders count="1"><border/></borders>'
                + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                + '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
                + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
                + '</styleSheet>'),
        },
        { name: 'xl/worksheets/sheet1.xml', data: utf8Bytes(sheetXml(config.rows)) },
    ];
    return buildZip(files);
}

module.exports = {
    FORMATS: FORMATS,
    SINGLE_HEADERS: SINGLE_HEADERS,
    SINGLE_ROWS: SINGLE_ROWS,
    MATRIX_HEADERS: MATRIX_HEADERS,
    MATRIX_ROWS: MATRIX_ROWS,
    buildXlsxTemplate: buildXlsxTemplate,
    sheetXml: sheetXml,
};
