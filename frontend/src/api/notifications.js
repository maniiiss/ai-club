import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const pageNotifications = async (query) => {
    const { data } = await http.get('/api/notifications', {
        params: cleanParams(query)
    });
    return data.data;
};
export const getUnreadNotificationCount = async () => {
    const { data } = await http.get('/api/notifications/unread-count');
    return data.data;
};
export const markNotificationRead = async (id) => {
    const { data } = await http.post(`/api/notifications/${id}/read`);
    return data.data;
};
export const markAllNotificationsRead = async () => {
    const { data } = await http.post('/api/notifications/read-all');
    return data.data;
};
//# sourceMappingURL=notifications.js.map