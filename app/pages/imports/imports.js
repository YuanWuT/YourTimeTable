const store = require('../../utils/store');

const SOURCE_META = {
    photo: { label: '拍照 / 相册识别', icon: '📷' },
    excel: { label: 'Excel / CSV 表格', icon: '📊' },
    text: { label: '粘贴文字整理', icon: '📋' },
    manual: { label: '手动录入', icon: '✍️' },
};

// created_at 是带时区的 ISO 字符串（例如 2026-11-12T09:55:34.20262+08:00）。
// 小程序 JSCore 对超过 3 位小数的秒解析不一致，直接按字符串截取，避免时区被再换算一次。
function formatTime(value) {
    const raw = String(value || '');
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (match) return match[1] + '-' + match[2] + '-' + match[3] + ' ' + match[4] + ':' + match[5];
    return raw.slice(0, 16) || '时间未知';
}

Page({
    data: {
        authState: 'checking',
        loading: true,
        errorText: '',
        items: [],
        totalRows: 0,
    },

    onShow() {
        this.restore();
    },

    async restore() {
        this.setData({ authState: 'checking', loading: true });
        const result = await getApp().ensureSession();
        if (result.error || !result.data) {
            getApp().resetSession();
            this.setData({ authState: 'signed-out', loading: false });
            return;
        }
        this.setData({ authState: 'signed-in' });
        await this.load();
    },

    async load() {
        this.setData({ loading: true, errorText: '' });
        const result = await store.listImports();
        if (result.error) {
            this.setData({ loading: false, errorText: result.error.message || '加载失败' });
            return;
        }
        const rows = result.data || [];
        const items = rows.map((row, index) => {
            const meta = SOURCE_META[row.source] || { label: row.source || '其他来源', icon: '📄' };
            return {
                id: row.id !== undefined ? row.id : index,
                label: meta.label,
                icon: meta.icon,
                fileName: row.file_name || '未记录文件名',
                rowCount: Number(row.row_count) || 0,
                timeText: formatTime(row.created_at),
                hasFile: Boolean(row.storage_path),
            };
        });
        const totalRows = rows.reduce((sum, row) => sum + (Number(row.row_count) || 0), 0);
        this.setData({ loading: false, errorText: '', items: items, totalRows: totalRows });
    },

    goImport() {
        wx.switchTab({ url: '/pages/import/import' });
    },

    goBack() {
        wx.navigateBack();
    },

    onRetry() {
        this.restore();
    },

    onDemo() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    noop() {},
});
