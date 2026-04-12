import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const pageUsers = async (query) => {
    const { data } = await http.get('/api/users', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listUserOptions = async () => {
    const { data } = await http.get('/api/users/options');
    return data.data;
};
export const createUser = async (payload) => {
    const { data } = await http.post('/api/users', payload);
    return data.data;
};
export const updateUser = async (id, payload) => {
    const { data } = await http.put(`/api/users/${id}`, payload);
    return data.data;
};
export const deleteUser = async (id) => {
    await http.delete(`/api/users/${id}`);
};
export const resetUserPassword = async (id, password) => {
    await http.post(`/api/users/${id}/reset-password`, { password });
};
export const pageRoles = async (query) => {
    const { data } = await http.get('/api/roles', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listRoleOptions = async () => {
    const { data } = await http.get('/api/roles/options');
    return data.data;
};
export const createRole = async (payload) => {
    const { data } = await http.post('/api/roles', payload);
    return data.data;
};
export const updateRole = async (id, payload) => {
    const { data } = await http.put(`/api/roles/${id}`, payload);
    return data.data;
};
export const deleteRole = async (id) => {
    await http.delete(`/api/roles/${id}`);
};
export const pagePermissions = async (query) => {
    const { data } = await http.get('/api/permissions', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listPermissionOptions = async () => {
    const { data } = await http.get('/api/permissions/options');
    return data.data;
};
export const createPermission = async (payload) => {
    const { data } = await http.post('/api/permissions', payload);
    return data.data;
};
export const updatePermission = async (id, payload) => {
    const { data } = await http.put(`/api/permissions/${id}`, payload);
    return data.data;
};
export const deletePermission = async (id) => {
    await http.delete(`/api/permissions/${id}`);
};
export const pagePlatformTools = async (query) => {
    const { data } = await http.get('/api/platform-tools', {
        params: cleanParams(query)
    });
    return data.data;
};
export const getPlatformToolDetail = async (toolCode) => {
    const { data } = await http.get(`/api/platform-tools/${encodeURIComponent(toolCode)}`);
    return data.data;
};
export const updatePlatformTool = async (toolCode, payload) => {
    const { data } = await http.put(`/api/platform-tools/${encodeURIComponent(toolCode)}`, payload);
    return data.data;
};
//# sourceMappingURL=access.js.map
