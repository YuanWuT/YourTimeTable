// 云服务公开配置：来自 workbuddy_cloud_service 返回的 publicConfig。
// 这些是面向终端用户的公开值，可以随小程序代码一起发布；不含任何长期密钥。
const publicConfig = {
    endpoint: 'https://mp-api.app.workbuddy.host',
    publishableKey: 'wbpk_4PAcxfFnvI1BM8NLK5FI9m_n34kfi5Czj8ZagZKyn4btE1GKQXYuc1O',
    oauthRelayBaseUrl: 'https://www.workbuddy.cn/v2/as/genie-baas/oauth',
    workBuddyOAuthClientId: 'cb_jq6QyEPkOkJXPcpz0JxS_wbapp_4PAcxfFnvI1BM8NLK5FI9m',
};

// 微信订阅消息模板 ID。
// 上线前在「微信公众平台 → 订阅消息」申请「上课提醒」类模板，把模板 ID 填入此数组。
// 留空时应用不会调用 wx.requestSubscribeMessage，而是给出明确的配置提示，避免运行时报错。
const SUBSCRIBE_TEMPLATE_IDS = [];

// 备注在课表格子里要和时间、地点挤在一起，限制录入字数才能保证显示整洁。
// 手工录入、Excel/拍照导入、云端写入都统一使用这个值。
const NOTE_MAX_LENGTH = 20;

const ROLES = [
    { key: 'student', name: '学生', icon: '🎒', desc: '管理我自己的课表' },
    { key: 'parent', name: '家长', icon: '👨‍👩‍👧', desc: '查看孩子的上课安排' },
    { key: 'teacher', name: '老师', icon: '📚', desc: '管理我的授课安排' },
];

const COURSE_COLORS = [
    { key: 'blue', name: '晴空蓝', bg: '#E8F0FF', fg: '#1B4FC1', solid: '#3B6EF6' },
    { key: 'cyan', name: '湖青', bg: '#E1F6F6', fg: '#0E7381', solid: '#22A6B8' },
    { key: 'violet', name: '薰衣紫', bg: '#F0EBFF', fg: '#6142BE', solid: '#8B6BEF' },
    { key: 'amber', name: '暖阳橙', bg: '#FFF2DC', fg: '#9B6200', solid: '#EFA63A' },
    { key: 'rose', name: '蜜桃粉', bg: '#FFE8EE', fg: '#AE3557', solid: '#EE6D90' },
    { key: 'green', name: '薄荷绿', bg: '#E4F5EB', fg: '#1B7346', solid: '#35AE72' },
];

module.exports = {
    publicConfig,
    SUBSCRIBE_TEMPLATE_IDS,
    NOTE_MAX_LENGTH,
    ROLES,
    COURSE_COLORS,
};
