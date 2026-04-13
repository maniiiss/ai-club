import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const pageGitlabBindings = async (query) => {
    const { data } = await http.get('/api/gitlab/bindings', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listGitlabBindingOptions = async () => {
    const { data } = await http.get('/api/gitlab/bindings/options');
    return data.data;
};
export const createGitlabBinding = async (payload) => {
    const { data } = await http.post('/api/gitlab/bindings', payload);
    return data.data;
};
export const updateGitlabBinding = async (id, payload) => {
    const { data } = await http.put(`/api/gitlab/bindings/${id}`, payload);
    return data.data;
};
export const deleteGitlabBinding = async (id) => {
    await http.delete(`/api/gitlab/bindings/${id}`);
};
export const testGitlabBinding = async (id) => {
    const { data } = await http.post(`/api/gitlab/bindings/${id}/test`);
    return data.data;
};
export const previewBindingMergeRequests = async (id, targetBranch) => {
    const { data } = await http.get(`/api/gitlab/bindings/${id}/merge-requests`, {
        params: cleanParams({ targetBranch })
    });
    return data.data;
};
export const listGitlabBranches = async (id, search) => {
    const { data } = await http.get(`/api/gitlab/bindings/${id}/branches`, {
        params: cleanParams({ search })
    });
    return data.data;
};
export const createGitlabTag = async (id, payload) => {
    const { data } = await http.post(`/api/gitlab/bindings/${id}/tags`, payload);
    return data.data;
};
export const createGitlabMergeRequest = async (id, payload) => {
    const { data } = await http.post(`/api/gitlab/bindings/${id}/merge-requests`, payload);
    return data.data;
};
export const getCurrentUserGitlabOauthBinding = async () => {
    const { data } = await http.get('/api/gitlab/user-oauth-binding');
    return data.data;
};
export const createCurrentUserGitlabOauthAuthorizeUrl = async (payload = {}) => {
    const { data } = await http.post('/api/gitlab/user-oauth-binding/authorize', payload);
    return data.data;
};
export const handleCurrentUserGitlabOauthCallback = async (payload) => {
    const { data } = await http.post('/api/gitlab/user-oauth-binding/callback', payload);
    return data.data;
};
export const deleteCurrentUserGitlabOauthBinding = async () => {
    await http.delete('/api/gitlab/user-oauth-binding');
};
export const pageGitlabAutoMergeConfigs = async (query) => {
    const { data } = await http.get('/api/gitlab/auto-merge-configs', {
        params: cleanParams(query)
    });
    return data.data;
};
export const createGitlabAutoMergeConfig = async (payload) => {
    const { data } = await http.post('/api/gitlab/auto-merge-configs', payload);
    return data.data;
};
export const pageGitlabAutoMergeLogs = async (query) => {
    const { data } = await http.get('/api/gitlab/auto-merge-logs', {
        params: cleanParams(query)
    });
    return data.data;
};
export const updateGitlabAutoMergeConfig = async (id, payload) => {
    const { data } = await http.put(`/api/gitlab/auto-merge-configs/${id}`, payload);
    return data.data;
};
export const deleteGitlabAutoMergeConfig = async (id) => {
    await http.delete(`/api/gitlab/auto-merge-configs/${id}`);
};
export const testGitlabAutoMergeConfig = async (id) => {
    const { data } = await http.post(`/api/gitlab/auto-merge-configs/${id}/test`);
    return data.data;
};
export const previewAutoMergeConfigMergeRequests = async (id) => {
    const { data } = await http.get(`/api/gitlab/auto-merge-configs/${id}/merge-requests`);
    return data.data;
};
export const runAutoMergeConfig = async (id) => {
    const { data } = await http.post(`/api/gitlab/auto-merge-configs/${id}/run`);
    return data.data;
};
//# sourceMappingURL=gitlab.js.map
