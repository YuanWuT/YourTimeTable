const DAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

// 纯展示转换：只读，不写云端、不改动传入的课程对象
function detailOf(course, roleName) {
    const item = course || {};
    const day = Number(item.day_of_week || 1);
    const start = String(item.start_time || '').trim();
    const end = String(item.end_time || '').trim();
    const note = String(item.note === undefined || item.note === null ? '' : item.note).trim();
    const lead = Number(item.lead_minutes || 0);
    const remindOff = item.remind === false;
    const periodNo = Number(item.period_no || 0);
    return {
        title: item.title || '未命名课程',
        solid: item.solid || '#2f6bed',
        dayText: item.dayText || DAY_NAMES[day - 1] || '周一',
        periodText: periodNo > 0 ? '第 ' + periodNo + ' 节' : '自定义时间',
        timeText: item.timeText || (start + (end ? '–' + end : '')),
        weekText: item.weekText || '每周',
        locationText: item.location || '未填地点',
        teacherText: item.teacher || '未填老师',
        note: note,
        hasNote: note.length > 0,
        remindText: remindOff
            ? '未开启'
            : (lead > 0 ? '已开启 · 提前 ' + lead + ' 分钟' : '已开启 · 上课时提醒'),
        roleName: roleName || '学生',
    };
}

Component({
    properties: {
        visible: { type: Boolean, value: false },
        course: { type: Object, value: null },
        roleName: { type: String, value: '学生' },
    },

    data: {
        view: detailOf(null, '学生'),
    },

    observers: {
        'course, roleName': function (course, roleName) {
            this.setData({ view: detailOf(course, roleName) });
        },
    },

    methods: {
        noop() {},

        onClose() {
            this.triggerEvent('close');
        },

        onEdit() {
            const course = this.data.course || {};
            this.triggerEvent('edit', { id: course.id, title: course.title || '' });
        },

        onRemove() {
            const course = this.data.course || {};
            this.triggerEvent('remove', { id: course.id, title: course.title || '' });
        },

        // 顶部把手区域向下滑动超过 80px 关闭；内容区滚动不触发，避免误关
        onTouchStart(event) {
            const touch = event.touches && event.touches[0];
            this._startY = touch ? touch.clientY : undefined;
        },

        onTouchEnd(event) {
            const touch = event.changedTouches && event.changedTouches[0];
            const endY = touch ? touch.clientY : undefined;
            if (this._startY !== undefined && endY !== undefined && endY - this._startY > 80) {
                this.onClose();
            }
            this._startY = undefined;
        },
    },
});
