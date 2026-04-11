/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import { useAppStore } from '@/stores/app';
import { resolveAssetUrl } from '@/utils/asset';
const authStore = useAuthStore();
const appStore = useAppStore();
const profileFormRef = ref();
const passwordFormRef = ref();
const avatarInputRef = ref();
const profileSubmitting = ref(false);
const passwordSubmitting = ref(false);
const avatarUploading = ref(false);
const ALLOWED_AVATAR_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif']);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const profileForm = reactive({
    nickname: '',
    email: '',
    phone: '',
    gitlabUsername: ''
});
const passwordForm = reactive({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
});
const profileRules = {
    nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }]
};
const passwordRules = {
    currentPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
    newPassword: [
        { required: true, message: '请输入新密码', trigger: 'blur' },
        { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
    ],
    confirmPassword: [
        { required: true, message: '请再次输入新密码', trigger: 'blur' },
        {
            validator: (_rule, value, callback) => {
                if (value !== passwordForm.newPassword) {
                    callback(new Error('两次输入的新密码不一致'));
                    return;
                }
                callback();
            },
            trigger: 'blur'
        }
    ]
};
const activeTheme = computed(() => appStore.currentTheme);
const profileAvatarUrl = computed(() => resolveAssetUrl(authStore.user?.avatarUrl));
const profileAvatarInitial = computed(() => (authStore.user?.nickname || authStore.user?.username || 'U').slice(0, 1).toUpperCase());
const syncFromUser = () => {
    profileForm.nickname = authStore.user?.nickname || '';
    profileForm.email = authStore.user?.email || '';
    profileForm.phone = authStore.user?.phone || '';
    profileForm.gitlabUsername = authStore.user?.gitlabUsername || '';
};
const handleTriggerAvatarUpload = () => {
    avatarInputRef.value?.click();
};
const resetAvatarInput = () => {
    if (avatarInputRef.value) {
        avatarInputRef.value.value = '';
    }
};
// 先在前端完成基础图片校验，减少无效请求并给出更直观的提示。
const handleAvatarSelected = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) {
        return;
    }
    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
        ElMessage.warning('请上传 PNG、JPG 或 GIF 图片');
        resetAvatarInput();
        return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
        ElMessage.warning('头像大小不能超过 5MB');
        resetAvatarInput();
        return;
    }
    avatarUploading.value = true;
    try {
        await authStore.uploadAvatar(file);
        ElMessage.success('头像已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '头像上传失败');
    }
    finally {
        avatarUploading.value = false;
        resetAvatarInput();
    }
};
const handleThemeChange = (themeId) => {
    // 主题切换只在前端本地完成，用户选择后立即生效并写入浏览器缓存。
    appStore.setTheme(themeId);
    const nextTheme = appStore.themePresets.find((item) => item.id === themeId);
    ElMessage.success(`已切换为${nextTheme?.name || '新风格'}`);
};
const handleSaveProfile = async () => {
    const valid = await profileFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    profileSubmitting.value = true;
    try {
        await authStore.updateProfile({
            nickname: profileForm.nickname,
            email: profileForm.email,
            phone: profileForm.phone,
            gitlabUsername: profileForm.gitlabUsername
        });
        ElMessage.success('个人资料已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        profileSubmitting.value = false;
    }
};
const handleChangePassword = async () => {
    const valid = await passwordFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    passwordSubmitting.value = true;
    try {
        await authStore.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
        passwordForm.currentPassword = '';
        passwordForm.newPassword = '';
        passwordForm.confirmPassword = '';
        passwordFormRef.value?.clearValidate();
        ElMessage.success('密码已更新');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '密码更新失败');
    }
    finally {
        passwordSubmitting.value = false;
    }
};
onMounted(() => {
    syncFromUser();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['profile-avatar-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-card']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-card']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-orb']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-orb']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-block']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-line']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-line']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-identity-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-actions-block']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-cache-note']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-page" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "page-card profile-card" },
    shadow: "never",
}));
const __VLS_2 = __VLS_1({
    ...{ class: "page-card profile-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "platform-form-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-identity-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-avatar-shell" },
    ...{ class: ({ uploading: __VLS_ctx.avatarUploading }) },
});
if (__VLS_ctx.profileAvatarUrl) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
        src: (__VLS_ctx.profileAvatarUrl),
        alt: "当前用户头像",
        ...{ class: "profile-avatar-image" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.profileAvatarInitial);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-identity-copy" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-identity-title" },
});
(__VLS_ctx.authStore.user?.nickname || __VLS_ctx.authStore.user?.username || '当前用户');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-identity-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-avatar-actions-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onChange: (__VLS_ctx.handleAvatarSelected) },
    ref: "avatarInputRef",
    ...{ class: "profile-avatar-input" },
    type: "file",
    accept: "image/png,image/jpeg,image/gif",
});
/** @type {typeof __VLS_ctx.avatarInputRef} */ ;
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    plain: true,
    loading: (__VLS_ctx.avatarUploading),
    disabled: (__VLS_ctx.avatarUploading),
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    plain: true,
    loading: (__VLS_ctx.avatarUploading),
    disabled: (__VLS_ctx.avatarUploading),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.handleTriggerAvatarUpload)
};
__VLS_7.slots.default;
var __VLS_7;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-avatar-tip" },
});
const __VLS_12 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ref: "profileFormRef",
    model: (__VLS_ctx.profileForm),
    rules: (__VLS_ctx.profileRules),
    labelWidth: "110px",
}));
const __VLS_14 = __VLS_13({
    ref: "profileFormRef",
    model: (__VLS_ctx.profileForm),
    rules: (__VLS_ctx.profileRules),
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
/** @type {typeof __VLS_ctx.profileFormRef} */ ;
var __VLS_16 = {};
__VLS_15.slots.default;
const __VLS_18 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    label: "用户名",
}));
const __VLS_20 = __VLS_19({
    label: "用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_21.slots.default;
const __VLS_22 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
    modelValue: (__VLS_ctx.authStore.user?.username || ''),
    disabled: true,
}));
const __VLS_24 = __VLS_23({
    modelValue: (__VLS_ctx.authStore.user?.username || ''),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
var __VLS_21;
const __VLS_26 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
    label: "昵称",
    prop: "nickname",
}));
const __VLS_28 = __VLS_27({
    label: "昵称",
    prop: "nickname",
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_29.slots.default;
const __VLS_30 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
    modelValue: (__VLS_ctx.profileForm.nickname),
    placeholder: "请输入昵称",
}));
const __VLS_32 = __VLS_31({
    modelValue: (__VLS_ctx.profileForm.nickname),
    placeholder: "请输入昵称",
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
var __VLS_29;
const __VLS_34 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
    label: "邮箱",
}));
const __VLS_36 = __VLS_35({
    label: "邮箱",
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
__VLS_37.slots.default;
const __VLS_38 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    modelValue: (__VLS_ctx.profileForm.email),
    placeholder: "请输入邮箱",
}));
const __VLS_40 = __VLS_39({
    modelValue: (__VLS_ctx.profileForm.email),
    placeholder: "请输入邮箱",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
var __VLS_37;
const __VLS_42 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
    label: "手机号",
}));
const __VLS_44 = __VLS_43({
    label: "手机号",
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
__VLS_45.slots.default;
const __VLS_46 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_47 = __VLS_asFunctionalComponent(__VLS_46, new __VLS_46({
    modelValue: (__VLS_ctx.profileForm.phone),
    placeholder: "请输入手机号",
}));
const __VLS_48 = __VLS_47({
    modelValue: (__VLS_ctx.profileForm.phone),
    placeholder: "请输入手机号",
}, ...__VLS_functionalComponentArgsRest(__VLS_47));
var __VLS_45;
const __VLS_50 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
    label: "GitLab 用户名",
}));
const __VLS_52 = __VLS_51({
    label: "GitLab 用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
__VLS_53.slots.default;
const __VLS_54 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent(__VLS_54, new __VLS_54({
    modelValue: (__VLS_ctx.profileForm.gitlabUsername),
    placeholder: "用于关联个人 GitLab MR，例如：zhangsan",
}));
const __VLS_56 = __VLS_55({
    modelValue: (__VLS_ctx.profileForm.gitlabUsername),
    placeholder: "用于关联个人 GitLab MR，例如：zhangsan",
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
var __VLS_53;
const __VLS_58 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
    label: "角色",
}));
const __VLS_60 = __VLS_59({
    label: "角色",
}, ...__VLS_functionalComponentArgsRest(__VLS_59));
__VLS_61.slots.default;
const __VLS_62 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({
    modelValue: (__VLS_ctx.authStore.user?.roleNames?.join(' / ') || '暂无角色'),
    disabled: true,
}));
const __VLS_64 = __VLS_63({
    modelValue: (__VLS_ctx.authStore.user?.roleNames?.join(' / ') || '暂无角色'),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_63));
var __VLS_61;
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-actions" },
});
const __VLS_66 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.profileSubmitting),
}));
const __VLS_68 = __VLS_67({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.profileSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_67));
let __VLS_70;
let __VLS_71;
let __VLS_72;
const __VLS_73 = {
    onClick: (__VLS_ctx.handleSaveProfile)
};
__VLS_69.slots.default;
var __VLS_69;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "platform-form-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-subtitle" },
});
const __VLS_74 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
    ref: "passwordFormRef",
    model: (__VLS_ctx.passwordForm),
    rules: (__VLS_ctx.passwordRules),
    labelWidth: "110px",
}));
const __VLS_76 = __VLS_75({
    ref: "passwordFormRef",
    model: (__VLS_ctx.passwordForm),
    rules: (__VLS_ctx.passwordRules),
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_75));
/** @type {typeof __VLS_ctx.passwordFormRef} */ ;
var __VLS_78 = {};
__VLS_77.slots.default;
const __VLS_80 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "当前密码",
    prop: "currentPassword",
}));
const __VLS_82 = __VLS_81({
    label: "当前密码",
    prop: "currentPassword",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
const __VLS_84 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    modelValue: (__VLS_ctx.passwordForm.currentPassword),
    type: "password",
    showPassword: true,
    placeholder: "请输入当前密码",
}));
const __VLS_86 = __VLS_85({
    modelValue: (__VLS_ctx.passwordForm.currentPassword),
    type: "password",
    showPassword: true,
    placeholder: "请输入当前密码",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
var __VLS_83;
const __VLS_88 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    label: "新密码",
    prop: "newPassword",
}));
const __VLS_90 = __VLS_89({
    label: "新密码",
    prop: "newPassword",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
const __VLS_92 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    modelValue: (__VLS_ctx.passwordForm.newPassword),
    type: "password",
    showPassword: true,
    placeholder: "至少 6 位",
}));
const __VLS_94 = __VLS_93({
    modelValue: (__VLS_ctx.passwordForm.newPassword),
    type: "password",
    showPassword: true,
    placeholder: "至少 6 位",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
var __VLS_91;
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "确认新密码",
    prop: "confirmPassword",
}));
const __VLS_98 = __VLS_97({
    label: "确认新密码",
    prop: "confirmPassword",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.passwordForm.confirmPassword),
    type: "password",
    showPassword: true,
    placeholder: "再次输入新密码",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.passwordForm.confirmPassword),
    type: "password",
    showPassword: true,
    placeholder: "再次输入新密码",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
var __VLS_99;
var __VLS_77;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-actions" },
});
const __VLS_104 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.passwordSubmitting),
}));
const __VLS_106 = __VLS_105({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.passwordSubmitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
let __VLS_108;
let __VLS_109;
let __VLS_110;
const __VLS_111 = {
    onClick: (__VLS_ctx.handleChangePassword)
};
__VLS_107.slots.default;
var __VLS_107;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "platform-form-section profile-theme-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "platform-form-section-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-theme-summary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-theme-current-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-theme-current-name" },
});
(__VLS_ctx.activeTheme.name);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-theme-cache-note" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "profile-theme-grid" },
});
for (const [theme] of __VLS_getVForSourceType((__VLS_ctx.appStore.themePresets))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleThemeChange(theme.id);
            } },
        key: (theme.id),
        ...{ class: "profile-theme-card" },
        ...{ class: ({ active: theme.id === __VLS_ctx.appStore.currentThemeId }) },
        type: "button",
        'aria-pressed': (theme.id === __VLS_ctx.appStore.currentThemeId),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-preview" },
        ...{ style: ({ background: theme.previewBackground }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-orb primary" },
        ...{ style: ({ background: theme.primary }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-orb accent" },
        ...{ style: ({ background: theme.accent }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-window" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-window-bar" },
        ...{ style: ({ background: theme.surface }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-window-block" },
        ...{ style: ({ background: theme.primary }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-window-line" },
        ...{ style: ({ background: theme.accent }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-window-line muted" },
        ...{ style: ({ background: theme.surface }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-card-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-name" },
    });
    (theme.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-description" },
    });
    (theme.description);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-badge" },
    });
    (theme.id === __VLS_ctx.appStore.currentThemeId ? '当前使用' : '点击切换');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "profile-theme-swatches" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-swatch" },
        ...{ style: ({ background: theme.primary }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-swatch" },
        ...{ style: ({ background: theme.accent }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "profile-theme-swatch muted" },
        ...{ style: ({ background: theme.surface }) },
    });
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['profile-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-card']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-identity-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-image']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-identity-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-identity-title']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-identity-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-actions-block']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-input']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-avatar-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-current-label']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-current-name']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-cache-note']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-card']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-orb']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-orb']} */ ;
/** @type {__VLS_StyleScopedClasses['accent']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-block']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-line']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-window-line']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-name']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-description']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-swatches']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['profile-theme-swatch']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
// @ts-ignore
var __VLS_17 = __VLS_16, __VLS_79 = __VLS_78;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            authStore: authStore,
            appStore: appStore,
            profileFormRef: profileFormRef,
            passwordFormRef: passwordFormRef,
            avatarInputRef: avatarInputRef,
            profileSubmitting: profileSubmitting,
            passwordSubmitting: passwordSubmitting,
            avatarUploading: avatarUploading,
            profileForm: profileForm,
            passwordForm: passwordForm,
            profileRules: profileRules,
            passwordRules: passwordRules,
            activeTheme: activeTheme,
            profileAvatarUrl: profileAvatarUrl,
            profileAvatarInitial: profileAvatarInitial,
            handleTriggerAvatarUpload: handleTriggerAvatarUpload,
            handleAvatarSelected: handleAvatarSelected,
            handleThemeChange: handleThemeChange,
            handleSaveProfile: handleSaveProfile,
            handleChangePassword: handleChangePassword,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=ProfileView.vue.js.map