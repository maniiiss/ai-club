import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const getDashboardOverview = async () => {
    const { data } = await http.get('/api/dashboard/overview');
    return data.data;
};
export const listDashboardQuickTasks = async () => {
    const { data } = await http.get('/api/dashboard/quick-tasks');
    return data.data;
};
export const saveDashboardQuickTasks = async (items) => {
    const { data } = await http.put('/api/dashboard/quick-tasks', { items });
    return data.data;
};
export const pageProjects = async (query) => {
    const { data } = await http.get('/api/projects', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listProjectOptions = async () => {
    const { data } = await http.get('/api/projects/options');
    return data.data;
};
export const createProject = async (payload) => {
    const { data } = await http.post('/api/projects', payload);
    return data.data;
};
export const updateProject = async (id, payload) => {
    const { data } = await http.put(`/api/projects/${id}`, payload);
    return data.data;
};
export const getProjectDetail = async (id) => {
    const { data } = await http.get(`/api/projects/${id}`);
    return data.data;
};
export const deleteProject = async (id) => {
    await http.delete(`/api/projects/${id}`);
};
export const pageAgents = async (query) => {
    const { data } = await http.get('/api/agents', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listAgentOptions = async (projectId) => {
    const { data } = await http.get('/api/agents/options', {
        params: cleanParams({ projectId })
    });
    return data.data;
};
export const createAgent = async (payload) => {
    const { data } = await http.post('/api/agents', payload);
    return data.data;
};
export const updateAgent = async (id, payload) => {
    const { data } = await http.put(`/api/agents/${id}`, payload);
    return data.data;
};
export const deleteAgent = async (id) => {
    await http.delete(`/api/agents/${id}`);
};
export const testAgent = async (id, input) => {
    const { data } = await http.post(`/api/agents/${id}/test`, { input });
    return data.data;
};
export const pageTasks = async (query) => {
    const { data } = await http.get('/api/tasks', {
        params: cleanParams(query)
    });
    return data.data;
};
export const createTask = async (payload) => {
    const { data } = await http.post('/api/tasks', payload);
    return data.data;
};
export const updateTask = async (id, payload) => {
    const { data } = await http.put(`/api/tasks/${id}`, payload);
    return data.data;
};
export const deleteTask = async (id) => {
    await http.delete(`/api/tasks/${id}`);
};
export const getTaskDetail = async (id) => {
    const { data } = await http.get(`/api/tasks/${id}`);
    return data.data;
};
export const listTaskAgentRuns = async (id) => {
    const { data } = await http.get(`/api/tasks/${id}/agent-runs`);
    return data.data;
};
export const listTaskComments = async (id) => {
    const { data } = await http.get(`/api/tasks/${id}/comments`);
    return data.data;
};
export const createTaskComment = async (id, content) => {
    const { data } = await http.post(`/api/tasks/${id}/comments`, { content });
    return data.data;
};
export const uploadTaskCommentImage = async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await http.post(`/api/tasks/${id}/comment-images`, formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return data.data;
};
export const uploadTaskImage = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await http.post('/api/tasks/images', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return data.data;
};
export const generateTaskRequirementAi = async (id, payload) => {
    const { data } = await http.post(`/api/tasks/${id}/requirement-ai`, payload);
    return data.data;
};
export const runTaskAgent = async (id, input) => {
    const { data } = await http.post(`/api/tasks/${id}/agent-runs`, { input });
    return data.data;
};
export const passRequirementDev = async (id) => {
    const { data } = await http.post(`/api/tasks/${id}/requirement-dev-pass`);
    return data.data;
};
export const passRequirementTest = async (id) => {
    const { data } = await http.post(`/api/tasks/${id}/requirement-test-pass`);
    return data.data;
};
export const pageTestPlans = async (query) => {
    const { data } = await http.get('/api/test-plans', {
        params: cleanParams(query)
    });
    return data.data;
};
export const getTestPlanDetail = async (id) => {
    const { data } = await http.get(`/api/test-plans/${id}`);
    return data.data;
};
export const listTestPlanIterations = async (projectId) => {
    const { data } = await http.get(`/api/test-plans/projects/${projectId}/iterations`);
    return data.data;
};
export const createTestPlan = async (payload) => {
    const { data } = await http.post('/api/test-plans', payload);
    return data.data;
};
export const updateTestPlan = async (id, payload) => {
    const { data } = await http.put(`/api/test-plans/${id}`, payload);
    return data.data;
};
export const deleteTestPlan = async (id) => {
    await http.delete(`/api/test-plans/${id}`);
};
export const getIterationBoard = async (projectId) => {
    const { data } = await http.get(`/api/projects/${projectId}/iteration-board`);
    return data.data;
};
export const getProjectBurndown = async (projectId) => {
    const { data } = await http.get(`/api/projects/${projectId}/burndown`);
    return data.data;
};
export const getProjectKnowledgeGraph = async (projectId, refresh = false) => {
    const { data } = await http.get(`/api/projects/${projectId}/knowledge-graph`, {
        params: cleanParams({ refresh })
    });
    return data.data;
};
export const rebuildProjectKnowledgeGraph = async (projectId) => {
    const { data } = await http.post(`/api/projects/${projectId}/knowledge-graph/rebuild`);
    return data.data;
};
export const listProjectIterations = async (projectId) => {
    const { data } = await http.get(`/api/projects/${projectId}/iterations`);
    return data.data;
};
export const createIteration = async (projectId, payload) => {
    const { data } = await http.post(`/api/projects/${projectId}/iterations`, payload);
    return data.data;
};
export const updateIteration = async (projectId, iterationId, payload) => {
    const { data } = await http.put(`/api/projects/${projectId}/iterations/${iterationId}`, payload);
    return data.data;
};
export const deleteIteration = async (projectId, iterationId) => {
    await http.delete(`/api/projects/${projectId}/iterations/${iterationId}`);
};
export const listProjectWorkItems = async (projectId, query) => {
    const { data } = await http.get(`/api/projects/${projectId}/work-items`, {
        params: cleanParams(query)
    });
    return data.data;
};
export const pageProjectWorkItems = async (projectId, query) => {
    const { data } = await http.get(`/api/projects/${projectId}/work-items/page`, {
        params: cleanParams(query)
    });
    return data.data;
};
//# sourceMappingURL=platform.js.map
