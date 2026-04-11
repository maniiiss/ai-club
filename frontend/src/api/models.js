import { http } from './http';
const cleanParams = (params) => Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
export const pageModelConfigs = async (query) => {
    const { data } = await http.get('/api/model-configs', {
        params: cleanParams(query)
    });
    return data.data;
};
export const listModelConfigOptions = async () => {
    const { data } = await http.get('/api/model-configs/options');
    return data.data;
};
export const createModelConfig = async (payload) => {
    const { data } = await http.post('/api/model-configs', payload);
    return data.data;
};
export const updateModelConfig = async (id, payload) => {
    const { data } = await http.put(`/api/model-configs/${id}`, payload);
    return data.data;
};
export const deleteModelConfig = async (id) => {
    await http.delete(`/api/model-configs/${id}`);
};
export const testModelConfig = async (id) => {
    const { data } = await http.post(`/api/model-configs/${id}/test`);
    return data.data;
};
//# sourceMappingURL=models.js.map