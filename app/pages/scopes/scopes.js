const store = require('../../utils/store');
const scopes = require('../../utils/scopes');

Page({
    data: {
        authState: 'checking',
        loading: true,
        saving: false,
        errorText: '',
        studentMode: false,
        isParent: false,
        kind: scopes.KINDS.parent,
        genders: scopes.GENDERS,
        list: [],
        countText: '0 / ' + scopes.MAX_SCOPES,
        scopeLabel: '',
        editorVisible: false,
        editorTitle: '',
        editorId: '',
        form: { name: '', gender: '', detail: '', extra: '', note: '' },
    },

    onLoad(options) {
        // 从课表页顶部「＋ 管理孩子 / 班级」进来时直接打开添加表单，
        // 不用先找切换弹层、再点管理菜单。
        this.pendingAdd = Boolean(options && options.action === 'add');
    },

    async onShow() {
        await this.restore();
        if (!this.pendingAdd) return;
        this.pendingAdd = false;
        if (this.data.authState === 'signed-in' && !this.data.studentMode && !this.data.errorText) {
            this.openAdd();
        }
    },

    async restore() {
        this.setData({ authState: 'checking', loading: true, errorText: '' });
        const session = await getApp().ensureSession();
        if (session.error || !session.data) {
            getApp().resetSession();
            this.setData({ authState: 'signed-out', loading: false });
            return;
        }
        const result = await store.syncSettings();
        if (result.error) {
            this.setData({
                authState: 'signed-in',
                loading: false,
                errorText: result.error.message || '加载设置失败',
            });
            return;
        }
        const settings = result.data;
        const scope = scopes.scopeOf(settings);
        this.settings = settings;
        this.scope = scope;
        this.activeScopeKey = settings.active_scope || '';
        if (!scope.needsScope) {
            this.setData({
                authState: 'signed-in',
                loading: false,
                studentMode: true,
                list: [],
            });
            return;
        }
        this.applyList(scope);
    },

    applyList(scope) {
        const kind = scope.kind;
        this.setData({
            authState: 'signed-in',
            loading: false,
            errorText: '',
            studentMode: false,
            isParent: scope.role === 'parent',
            kind: kind,
            list: scope.list.map(item => ({
                id: item.id,
                name: item.name,
                genderName: scopes.genderName(item.gender),
                summary: scopes.summaryOf(item),
                note: item.note,
                icon: scopes.iconOf(item, scope.role),
                selected: item.id === scope.key,
            })),
            countText: scope.list.length + ' / ' + scopes.MAX_SCOPES,
            scopeLabel: scope.label,
        });
    },

    openAdd() {
        const kind = this.data.kind || scopes.KINDS.parent;
        if (this.data.list.length >= scopes.MAX_SCOPES) {
            wx.showToast({ title: '最多添加 ' + scopes.MAX_SCOPES + ' 个', icon: 'none' });
            return;
        }
        this.setData({
            editorVisible: true,
            editorTitle: kind.addLabel,
            editorId: '',
            form: { name: '', gender: '', detail: '', extra: '', note: '' },
        });
    },

    openEdit(event) {
        const id = event.currentTarget.dataset.id;
        const item = (this.scope && this.scope.list || []).find(entry => entry.id === id);
        if (!item) return;
        this.setData({
            editorVisible: true,
            editorTitle: '编辑' + this.data.kind.noun,
            editorId: id,
            form: {
                name: item.name,
                gender: item.gender || '',
                detail: item.detail,
                extra: item.extra,
                note: item.note,
            },
        });
    },

    closeEditor() {
        this.setData({ editorVisible: false });
    },

    onFormInput(event) {
        const field = event.currentTarget.dataset.field;
        if (!field) return;
        const form = Object.assign({}, this.data.form);
        form[field] = event.detail.value;
        this.setData({ form: form, errorText: '' });
    },

    // 只用于孩子；再点一次已选中的性别可取消选择，回到中性头像
    onGenderChange(event) {
        const value = event.currentTarget.dataset.gender || '';
        const form = Object.assign({}, this.data.form);
        form.gender = form.gender === value ? '' : value;
        this.setData({ form: form, errorText: '' });
    },

    async saveEditor() {
        if (this.data.saving) return;
        const name = scopes.clip(this.data.form.name, 20);
        if (!name) {
            wx.showToast({ title: '请填写' + (this.data.kind.nameLabel || '名称'), icon: 'none' });
            return;
        }
        const built = scopes.buildScope(Object.assign({}, this.data.form, { name: name }), this.data.editorId || '');
        const list = (this.scope && this.scope.list || []).slice();
        if (this.data.editorId) {
            const index = list.findIndex(item => item.id === this.data.editorId);
            if (index < 0) return;
            list[index] = built;
        } else {
            list.push(built);
        }
        const saved = await this.persist(list);
        if (saved) wx.showToast({ title: '已保存', icon: 'success' });
    },

    // 配置保存到云端 app_settings；课程归属由 courses.scope_key 单独维护
    async persist(list) {
        this.setData({ saving: true, errorText: '' });
        const patch = {};
        patch[this.scope.kind.listKey] = scopes.serializeScopes(list);
        const ids = list.map(item => item.id);
        const active = this.activeScopeKey || '';
        if (active === scopes.ALL_SCOPE_KEY) {
            // 老师「全部班级」视图保留；一个班都不剩时退回空
            patch.active_scope = ids.length ? scopes.ALL_SCOPE_KEY : '';
        } else if (ids.indexOf(active) < 0) {
            patch.active_scope = ids.length ? ids[0] : '';
        } else {
            patch.active_scope = active;
        }
        const result = await store.saveSettings(patch);
        this.setData({ saving: false });
        if (result.error) {
            this.setData({ errorText: result.error.message || '保存失败，请重试' });
            wx.showToast({ title: result.error.message || '保存失败', icon: 'none' });
            return false;
        }
        this.settings = result.data;
        this.activeScopeKey = result.data.active_scope || '';
        getApp().globalData.settings = result.data;
        this.scope = scopes.scopeOf(result.data);
        this.applyList(this.scope);
        this.setData({ editorVisible: false });
        return true;
    },

    async removeOne(event) {
        if (this.data.saving) return;
        const id = event.currentTarget.dataset.id;
        const item = (this.scope && this.scope.list || []).find(entry => entry.id === id);
        if (!item) return;
        const kind = this.data.kind;
        const confirmed = await new Promise((resolve) => {
            wx.showModal({
                title: '删除「' + item.name + '」？',
                content: '这个' + kind.noun + '名下的课程会移到「已删除的课程」，随时可以恢复；其它'
                    + kind.noun + '的课表不受影响。',
                confirmText: '删除',
                confirmColor: '#d95050',
                success: res => resolve(Boolean(res.confirm)),
                fail: () => resolve(false),
            });
        });
        if (!confirmed) return;
        const wasFirst = Boolean(this.scope.list[0] && this.scope.list[0].id === id);
        this.setData({ saving: true });
        // 删第一个时把无归属的老课程一并收进回收站，避免它们突然「跳」到另一个孩子 / 班级
        const removed = await store.removeCoursesByScope(this.scope.role, id, wasFirst);
        if (removed.error) {
            this.setData({ saving: false, errorText: removed.error.message || '删除失败' });
            wx.showToast({ title: removed.error.message || '删除失败', icon: 'none' });
            return;
        }
        this.setData({ saving: false });
        const list = this.scope.list.filter(entry => entry.id !== id);
        const saved = await this.persist(list);
        if (saved) wx.showToast({ title: '已删除，课程可在回收站恢复', icon: 'none', duration: 2400 });
    },

    goRole() {
        wx.switchTab({ url: '/pages/profile/profile' });
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
