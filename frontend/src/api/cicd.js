import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const pageJenkinsServers = async (query) => {
    const { data } = await http.get('/api/cicd/jenkins-servers', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listJenkinsServerOptions = async () => {
    const { data } = await http.get('/api/cicd/jenkins-servers/options');
    return data.data;
};
export const createJenkinsServer = async (payload) => {
    const { data } = await http.post('/api/cicd/jenkins-servers', payload);
    return data.data;
};
export const updateJenkinsServer = async (id, payload) => {
    const { data } = await http.put(`/api/cicd/jenkins-servers/${id}`, payload);
    return data.data;
};
export const deleteJenkinsServer = async (id) => {
    await http.delete(`/api/cicd/jenkins-servers/${id}`);
};
export const testJenkinsServer = async (id) => {
    const { data } = await http.post(`/api/cicd/jenkins-servers/${id}/test`);
    return data.data;
};
export const listJenkinsJobs = async (id) => {
    const { data } = await http.get(`/api/cicd/jenkins-servers/${id}/jobs`);
    return data.data;
};
export const triggerJenkinsJob = async (id, jobName) => {
    const { data } = await http.post(`/api/cicd/jenkins-servers/${id}/jobs/trigger`, null, {
        params: cleanParams({ jobName })
    });
    return data.data;
};
export const pagePipelineBindings = async (query) => {
    const { data } = await http.get('/api/cicd/pipeline-bindings', {
        params: cleanParams(query)
    });
    return data.data;
};
export const createPipelineBinding = async (payload) => {
    const { data } = await http.post('/api/cicd/pipeline-bindings', payload);
    return data.data;
};
export const listPipelineBuilds = async (id, limit = 20) => {
    const { data } = await http.get(`/api/cicd/pipeline-bindings/${id}/builds`, {
        params: cleanParams({ limit })
    });
    return data.data;
};
export const getPipelineBuildLog = async (id, buildNumber) => {
    const { data } = await http.get(`/api/cicd/pipeline-bindings/${id}/builds/${buildNumber}/log`);
    return data.data;
};
export const updatePipelineBinding = async (id, payload) => {
    const { data } = await http.put(`/api/cicd/pipeline-bindings/${id}`, payload);
    return data.data;
};
export const deletePipelineBinding = async (id) => {
    await http.delete(`/api/cicd/pipeline-bindings/${id}`);
};
export const triggerPipelineBuild = async (id) => {
    const { data } = await http.post(`/api/cicd/pipeline-bindings/${id}/trigger`);
    return data.data;
};
//# sourceMappingURL=cicd.js.map