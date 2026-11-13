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

// 微信底层失败信息形如 "chooseMessageFile:fail cancel"，不能直接展示给用户。
// 统一翻译成中文，并把「用户主动取消」单独标记，避免当成故障反复弹卡片。
function friendlyPickError(raw, fallback) {
    const source = String(raw || '').trim();
    if (!source) return fallback || '操作未完成，请重试';
    if (/cancel/i.test(source)) return '用户未上传，可重新选择';
    if (/chooseMessageFile|chooseMedia|chooseImage/i.test(source)) {
        return '选择未完成，请重新选择文件后再试';
    }
    if (/auth|deny|permission|authorize/i.test(source)) {
        return '还没有获得文件或相册权限，请在微信设置里允许后重试';
    }
    if (/not support|not exist|no such/i.test(source)) return '当前环境不支持该操作，请在微信客户端内使用';
    // 兜底：任何形如 xxx:fail xxx 的英文系统错误都不外泄
    if (/^[\w.]+\s*:\s*fail/i.test(source) || /^[a-zA-Z\s:._-]+$/.test(source)) {
        return fallback || '操作未完成，请重试';
    }
    return source;
}

function cancelledError(message) {
    const error = new Error(message);
    error.cancelled = true;
    return error;
}

function pickerFail(reject, fallback) {
    return (error) => {
        const raw = (error && error.errMsg) || '';
        if (/cancel/i.test(String(raw))) {
            reject(cancelledError(fallback === 'image' ? '未选择图片，可重新选择' : '用户未上传，可重新选择'));
            return;
        }
        reject(new Error(friendlyPickError(raw, fallback === 'image' ? '选择图片失败，请重试' : '选择文件失败，请重试')));
    };
}

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
                fail: pickerFail(reject, 'image'),
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
                fail: pickerFail(reject, 'image'),
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
            fail: pickerFail(reject, 'file'),
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

    onLoad() {
        // 「未上传」轻提示在整个页面实例里只出现一次，再次返回不再重复打扰
        this.cancelToastShown = false;
    },

    onShow() {
        // 返回本页时清掉上一次的错误卡片，避免反复看到同一条提示
        this.setData({ errorText: '' });
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
        this.setData({
            errorText: friendlyPickError(message, '操作失败，请重试'),
            busy: false,
            busyText: '',
        });
    },

    clearError() {
        this.setData({ errorText: '' });
    },

    // 用户主动取消选择不是故障：清掉 busy，只给一次轻提示，不留下错误卡片。
    handlePickFailure(error, fallback) {
        this.setData({ busy: false, busyText: '', errorText: '' });
        if (error && error.cancelled) {
            if (!this.cancelToastShown) {
                this.cancelToastShown = true;
                wx.showToast({ title: '用户未上传，可重新选择', icon: 'none', duration: 1800 });
            }
            return;
        }
        this.showError((error && error.message) || fallback);
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
                this.handlePickFailure(error, '照片读取失败，请重试');
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
                this.handlePickFailure(error, '文件读取失败，请重试');
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

        // 1) 时间先按作息节次收敛，再去掉本次结果里「同名同天同时间段」的重复项
        const normalized = selected.map(item => S.snapCourseToPeriods(item, this.periods || []));
        const unique = S.dedupeCourses(normalized);
        let skipped = normalized.length - unique.length;

        // 2) 与云端已有课程比对：已经导入过的同一节课直接跳过，不再写入第二份
        const existingResult = await store.listCourses();
        if (existingResult.error) {
            this.setData({ importing: false });
            this.showError(existingResult.error.message || '无法核对已有课程，请稍后重试');
            return;
        }
        const existing = existingResult.data || [];
        const fresh = unique.filter(item => !existing.some(old => S.isSameCourseSlot(old, item)));
        skipped += unique.length - fresh.length;
        if (fresh.length === 0) {
            this.setData({ importing: false, reviewVisible: false, reviewCourses: [], selectedCount: 0 });
            wx.showToast({ title: '这些课程已在课表中，无需重复导入', icon: 'none', duration: 2500 });
            return;
        }

        // 3) 不同课程却占用同一时间段：既比对云端已有课程，也检查本次导入内部互相重叠，
        //    否则一次导入里两门课挤在同一节不会有任何提示。
        const clashLabels = [];
        fresh.forEach((item, index) => {
            const outside = S.findConflicts(item, existing);
            if (outside.length > 0) clashLabels.push(S.conflictLabel(outside[0]));
            const inside = S.findConflicts(item, fresh.slice(0, index));
            if (inside.length > 0) clashLabels.push(S.conflictLabel(inside[0]));
        });
        if (clashLabels.length > 0) {
            const confirmed = await new Promise((resolve) => {
                wx.showModal({
                    title: '有课程时间重叠',
                    content: '发现 ' + clashLabels.length + ' 处时间重叠（如 ' + clashLabels[0]
                        + '），可能包含本次导入课程之间的冲突。仍要导入吗？',
                    confirmText: '仍然导入',
                    cancelText: '先不导入',
                    success: res => resolve(Boolean(res.confirm)),
                    fail: () => resolve(false),
                });
            });
            if (!confirmed) {
                this.setData({ importing: false });
                return;
            }
        }

        // 去掉展示用的样式字段，只提交业务字段
        const payload = fresh.map(item => ({
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
        wx.showToast({
            title: '已导入 ' + result.data.length + ' 节' + (skipped > 0 ? '，跳过 ' + skipped + ' 节重复' : ''),
            icon: 'none',
            duration: 2200,
        });
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
