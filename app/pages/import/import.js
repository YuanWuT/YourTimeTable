const store = require('../../utils/store');
const importer = require('../../utils/importer');
const template = require('../../utils/template');
const S = require('../../utils/schedule');

const ENTRIES = [
    { key: 'manual', icon: '✍️', title: '手动录入', desc: '显示课表网格，点对应节次添加或删除', tag: '最准确' },
    { key: 'photo', icon: '📷', title: '拍照 / 相册识别', desc: '拍下纸质课表，自动识别成课程', tag: 'AI 识别' },
    { key: 'excel', icon: '📊', title: 'Excel / CSV 表格', desc: '上传 .xlsx 或 .csv 批量导入', tag: '批量' },
    { key: 'text', icon: '📋', title: '粘贴文字', desc: '把课表文字粘贴进来自动整理', tag: 'AI 整理' },
];

function pickImage() {
    return new Promise((resolve, reject) => {
        if (typeof wx.chooseMedia === 'function') {
            wx.chooseMedia({
                count: 1,
                mediaType: ['image'],
                sourceType: ['album', 'camera'],
                sizeType: ['compressed'],
                success(result) {
                    const file = result && result.tempFiles && result.tempFiles[0];
                    if (!file) return reject(new Error('没有选中图片'));
                    resolve({ path: file.tempFilePath, size: file.size || 0 });
                },
                fail(error) { reject(new Error((error && error.errMsg) || '选择图片失败')); },
            });
            return;
        }
        if (typeof wx.chooseImage === 'function') {
            wx.chooseImage({
                count: 1,
                sizeType: ['compressed'],
                sourceType: ['album', 'camera'],
                success(result) {
                    const path = result && result.tempFilePaths && result.tempFilePaths[0];
                    if (!path) return reject(new Error('没有选中图片'));
                    resolve({ path: path, size: 0 });
                },
                fail(error) { reject(new Error((error && error.errMsg) || '选择图片失败')); },
            });
            return;
        }
        reject(new Error('当前环境不支持选择图片，请在微信客户端内使用'));
    });
}

function pickFile() {
    return new Promise((resolve, reject) => {
        if (typeof wx.chooseMessageFile !== 'function') {
            reject(new Error('当前环境不支持选择文件，请在微信客户端内从聊天记录选择 Excel 文件'));
            return;
        }
        wx.chooseMessageFile({
            count: 1,
            type: 'file',
            extension: ['xlsx', 'csv', 'txt'],
            success(result) {
                const file = result && result.tempFiles && result.tempFiles[0];
                if (!file) return reject(new Error('没有选中文件'));
                resolve({ path: file.path, name: file.name || 'import.xlsx', size: file.size || 0 });
            },
            fail(error) { reject(new Error((error && error.errMsg) || '选择文件失败')); },
        });
    });
}

function extensionOf(path) {
    const match = String(path || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : 'bin';
}

function mimeOf(extension) {
    if (extension === 'png') return 'image/png';
    if (extension === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (extension === 'csv' || extension === 'txt') return 'text/plain';
    return 'image/jpeg';
}

Page({
    data: {
        authState: 'checking',
        entries: ENTRIES,
        busy: false,
        busyText: '',
        errorText: '',
        textPanelVisible: false,
        textInput: '',
        reviewVisible: false,
        reviewCourses: [],
        reviewSource: '',
        selectedCount: 0,
        importing: false,
        fileName: '',
        storagePath: '',
    },

    onShow() {
        this.restore();
    },

    async restore() {
        this.setData({ authState: 'checking' });
        const result = await getApp().ensureSession();
        if (result.error || !result.data) {
            getApp().resetSession();
            this.session = null;
            this.setData({ authState: 'signed-out' });
            return;
        }
        this.session = result.data;
        // 识别 / 解析需要用户当前的作息节次，用来把「第N节」还原成具体时间
        const [settingsResult, periodsResult] = await Promise.all([
            store.syncSettings(),
            store.listPeriods(),
        ]);
        this.periods = periodsResult.error ? [] : (periodsResult.data || []);
        if (settingsResult.error) {
            this.setData({ authState: 'signed-in', errorText: settingsResult.error.message || '加载设置失败' });
            return;
        }
        this.setData({ authState: 'signed-in' });
    },

    onSignedIn() {
        getApp().resetSession();
        this.restore();
    },

    onDemo() {
        wx.switchTab({ url: '/pages/index/index' });
    },

    showError(message) {
        this.setData({ errorText: message || '操作失败，请重试', busy: false, busyText: '' });
    },

    clearError() {
        this.setData({ errorText: '' });
    },

    async saveSourceRecord(source, fileName, storagePath, rowCount) {
        const result = await store.createImport({
            source: source,
            file_name: fileName || '',
            storage_path: storagePath || '',
            row_count: rowCount || 0,
        });
        // 导入历史写入失败不影响主流程
        if (result.error) console.warn('[import] record not saved');
    },

    async uploadBestEffort(path, name) {
        try {
            const ext = extensionOf(name || path);
            const result = await store.uploadImportFile(path, ext, mimeOf(ext), this.session);
            return result.error ? '' : result.data;
        } catch (error) {
            return '';
        }
    },

    showReview(courses, source, fileName, storagePath) {
        const styled = S.styledCourses(courses).map((course, index) => Object.assign({}, course, {
            id: course.id || 'review-' + index,
            checked: true,
        }));
        this.setData({
            busy: false,
            busyText: '',
            errorText: '',
            reviewVisible: true,
            reviewCourses: styled,
            reviewSource: source,
            selectedCount: styled.length,
            fileName: fileName || '',
            storagePath: storagePath || '',
            textPanelVisible: false,
        });
    },

    async onEntry(event) {
        const key = event.currentTarget.dataset.key;
        if (!key || this.data.busy) return;
        this.clearError();
        if (key === 'manual') {
            wx.navigateTo({ url: '/pages/grid/grid' });
            return;
        }
        if (key === 'text') {
            this.setData({ textPanelVisible: true });
            return;
        }
        if (key === 'photo') {
            this.setData({ busy: true, busyText: '正在选择图片…' });
            try {
                const picked = await pickImage();
                if (picked.size > 8 * 1024 * 1024) {
                    this.showError('图片太大（超过 8MB），请压缩后再试');
                    return;
                }
                this.setData({ busyText: '正在识别课程表，请稍候…' });
                const ext = extensionOf(picked.path);
                const fs = wx.getFileSystemManager();
                const base64 = fs.readFileSync(picked.path, 'base64');
                const storagePath = await this.uploadBestEffort(picked.path, picked.path);
                const result = await importer.llmExtract({
                    imageBase64: base64,
                    imageMime: ext === 'png' ? 'image/png' : 'image/jpeg',
                    periods: this.periods,
                });
                if (result.error) {
                    this.showError(result.error.message);
                    return;
                }
                await this.saveSourceRecord('photo', '课表照片.' + ext, storagePath, result.data.length);
                this.showReview(result.data, '照片识别', '课表照片.' + ext, storagePath);
            } catch (error) {
                this.showError((error && error.message) || '照片读取失败，请重试');
            }
            return;
        }
        if (key === 'excel') {
            this.setData({ busy: true, busyText: '正在选择文件…' });
            try {
                const picked = await pickFile();
                this.setData({ busyText: '正在解析表格…' });
                const result = await importer.readTable(picked.path, picked.name, this.periods);
                if (result.error) {
                    this.showError(result.error.message);
                    return;
                }
                const storagePath = await this.uploadBestEffort(picked.path, picked.name);
                await this.saveSourceRecord('excel', picked.name, storagePath, result.data.length);
                this.showReview(result.data, '表格导入', picked.name, storagePath);
            } catch (error) {
                this.showError((error && error.message) || '文件读取失败，请重试');
            }
        }
    },

    onTextInput(event) {
        this.setData({ textInput: event.detail.value });
    },

    closeTextPanel() {
        this.setData({ textPanelVisible: false });
    },

    async submitText() {
        const text = String(this.data.textInput || '').trim();
        if (text.length < 4) {
            wx.showToast({ title: '请粘贴更多课表内容', icon: 'none' });
            return;
        }
        if (this.data.busy) return;
        this.setData({ busy: true, busyText: '正在整理课表文字…', errorText: '' });
        const result = await importer.llmExtract({ text: text, periods: this.periods });
        if (result.error) {
            this.showError(result.error.message);
            return;
        }
        await this.saveSourceRecord('text', '粘贴文字', '', result.data.length);
        this.showReview(result.data, '文字整理', '粘贴文字', '');
    },

    toggleReviewItem(event) {
        const index = Number(event.currentTarget.dataset.index);
        const list = this.data.reviewCourses.slice();
        if (!list[index]) return;
        list[index] = Object.assign({}, list[index], { checked: !list[index].checked });
        this.setData({ reviewCourses: list, selectedCount: list.filter(item => item.checked).length });
    },

    toggleAll() {
        const allSelected = this.data.selectedCount === this.data.reviewCourses.length;
        const list = this.data.reviewCourses.map(item => Object.assign({}, item, { checked: !allSelected }));
        this.setData({ reviewCourses: list, selectedCount: allSelected ? 0 : list.length });
    },

    removeReviewItem(event) {
        const index = Number(event.currentTarget.dataset.index);
        const list = this.data.reviewCourses.slice();
        list.splice(index, 1);
        this.setData({ reviewCourses: list, selectedCount: list.filter(item => item.checked).length });
    },

    cancelReview() {
        this.setData({ reviewVisible: false, reviewCourses: [], selectedCount: 0, errorText: '' });
    },

    async confirmImport() {
        const selected = this.data.reviewCourses.filter(item => item.checked);
        if (selected.length === 0) {
            wx.showToast({ title: '请至少勾选一节课', icon: 'none' });
            return;
        }
        if (this.data.importing) return;
        this.setData({ importing: true, errorText: '' });
        // 去掉展示用的样式字段，只提交业务字段
        const payload = selected.map(item => ({
            title: item.title,
            teacher: item.teacher,
            location: item.location,
            day_of_week: item.day_of_week,
            period_no: item.period_no,
            start_time: item.start_time,
            end_time: item.end_time,
            week_type: item.week_type,
            color: item.color,
            note: item.note,
            remind: true,
            lead_minutes: 15,
        }));
        const result = await store.createCoursesBatch(payload);
        this.setData({ importing: false });
        if (result.error) {
            this.showError(result.error.message || '导入失败，请稍后重试');
            return;
        }
        wx.showToast({ title: '已导入 ' + result.data.length + ' 节课', icon: 'success' });
        this.setData({ reviewVisible: false, reviewCourses: [], selectedCount: 0, textInput: '' });
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 900);
    },

    goGrid() {
        wx.navigateTo({ url: '/pages/grid/grid' });
    },

    goRecycle() {
        wx.navigateTo({ url: '/pages/recycle/recycle' });
    },

    goSettings() {
        wx.navigateTo({ url: '/pages/settings/settings' });
    },

    // 下载 Excel 导入模板：本地生成一个真 .xlsx，再交给微信保存到聊天。
    // 小程序不能直接把文件写到手机「下载目录」，标准做法是转发到聊天后用 Excel / WPS 打开。
    downloadTemplate(event) {
        const format = (event.currentTarget.dataset && event.currentTarget.dataset.format) || 'single';
        const config = template.FORMATS[format] || template.FORMATS.single;
        try {
            const buffer = template.buildXlsxTemplate(format);
            const base = (wx.env && wx.env.USER_DATA_PATH) || 'wxfile://usr';
            const filePath = base + '/' + config.fileName;
            wx.getFileSystemManager().writeFileSync(filePath, buffer);
            if (typeof wx.shareFileMessage === 'function') {
                wx.shareFileMessage({
                    filePath: filePath,
                    fileName: config.fileName,
                    success: () => wx.showToast({ title: '模板已发送到聊天', icon: 'success' }),
                    fail: (error) => {
                        // 用户主动取消转发就不要再弹预览，避免打扰
                        if (error && /cancel/i.test(String(error.errMsg || ''))) return;
                        this.openTemplateFile(filePath);
                    },
                });
            } else {
                this.openTemplateFile(filePath);
            }
        } catch (error) {
            this.templateHint((error && error.message) || '当前环境不支持写入文件');
        }
    },

    openTemplateFile(filePath) {
        if (typeof wx.openDocument === 'function') {
            wx.openDocument({
                filePath: filePath,
                fileType: 'xlsx',
                showMenu: true,
                fail: () => this.templateHint('当前环境无法直接预览文件'),
            });
            return;
        }
        this.templateHint('当前环境不支持文件转发');
    },

    templateHint(reason) {
        wx.showModal({
            title: 'Excel 模板下载',
            content: (reason ? reason + '。\n\n' : '')
                + '请在微信客户端里点「下载 Excel 模板」：文件会发送到微信聊天，用 Excel / WPS 打开填写，再发回微信，然后从上方「Excel / CSV 表格」选择导入。\n\n'
                + '表头：' + template.SINGLE_HEADERS.join('、'),
            showCancel: false,
            confirmText: '我知道了',
        });
    },

    noop() {},
});
