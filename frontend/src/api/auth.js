import { http } from './http';
export const loginApi = async (payload) => {
    const { data } = await http.post('/api/auth/login', payload);
    return data.data;
};
export const registerApi = async (payload) => {
    await http.post('/api/auth/register', payload);
};
export const getCurrentUser = async () => {
    const { data } = await http.get('/api/auth/me');
    return data.data;
};
export const updateProfileApi = async (payload) => {
    const { data } = await http.put('/api/auth/profile', payload);
    return data.data;
};
export const uploadProfileAvatarApi = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const { data } = await http.post('/api/auth/avatar', formData, {
        headers: {
            'Content-Type': 'multipart/form-data'
        }
    });
    return data.data;
};
export const changePasswordApi = async (payload) => {
    await http.post('/api/auth/change-password', payload);
};
export const logoutApi = async () => {
    await http.post('/api/auth/logout');
};
//# sourceMappingURL=auth.js.map