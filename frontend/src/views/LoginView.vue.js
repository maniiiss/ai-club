/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const formRef = ref();
const registerFormRef = ref();
const submitting = ref(false);
const registerSubmitting = ref(false);
const registerDialogVisible = ref(false);
const form = reactive({
    username: '',
    password: ''
});
const registerForm = reactive({
    username: '',
    nickname: '',
    email: '',
    phone: '',
    gitlabUsername: '',
    password: '',
    confirmPassword: ''
});
const rules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};
const registerRules = {
    username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
    nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
    password: [
        { required: true, message: '请输入密码', trigger: 'blur' },
        { min: 6, message: '密码长度至少 6 位', trigger: 'blur' }
    ],
    confirmPassword: [
        { required: true, message: '请再次输入密码', trigger: 'blur' },
        {
            validator: (_rule, value, callback) => {
                if (value !== registerForm.password) {
                    callback(new Error('两次输入的密码不一致'));
                    return;
                }
                callback();
            },
            trigger: 'blur'
        }
    ]
};
const openRegisterDialog = () => {
    registerForm.username = '';
    registerForm.nickname = '';
    registerForm.email = '';
    registerForm.phone = '';
    registerForm.gitlabUsername = '';
    registerForm.password = '';
    registerForm.confirmPassword = '';
    registerFormRef.value?.clearValidate();
    registerDialogVisible.value = true;
};
const handleLogin = async () => {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    submitting.value = true;
    try {
        await authStore.login(form.username, form.password);
        ElMessage.success('登录成功');
        const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
        await router.replace(redirect);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '登录失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleRegister = async () => {
    const valid = await registerFormRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    registerSubmitting.value = true;
    try {
        await authStore.register({
            username: registerForm.username,
            nickname: registerForm.nickname,
            email: registerForm.email,
            phone: registerForm.phone,
            gitlabUsername: registerForm.gitlabUsername,
            password: registerForm.password
        });
        registerDialogVisible.value = false;
        ElMessage.success('注册成功，请等待管理员激活账号');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '注册失败');
    }
    finally {
        registerSubmitting.value = false;
    }
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['showcase-noise']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-orbit']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form']} */ ;
/** @type {__VLS_StyleScopedClasses['login-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['login-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-showcase']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['form-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['form-title']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-metrics']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "login-showcase" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-noise" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-orbit showcase-orbit-a" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-orbit showcase-orbit-b" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "showcase-brand-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "showcase-metrics" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "metric-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
    ...{ class: "metric-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "login-form-panel" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-brand" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "form-brand-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-subtitle" },
});
const __VLS_0 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "login-form" },
}));
const __VLS_2 = __VLS_1({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelPosition: "top",
    ...{ class: "login-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_6 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
    label: "用户名 / 电子邮箱",
    prop: "username",
}));
const __VLS_8 = __VLS_7({
    label: "用户名 / 电子邮箱",
    prop: "username",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
__VLS_9.slots.default;
const __VLS_10 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form.username),
    size: "large",
    placeholder: "请输入用户名",
}));
const __VLS_12 = __VLS_11({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form.username),
    size: "large",
    placeholder: "请输入用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
let __VLS_14;
let __VLS_15;
let __VLS_16;
const __VLS_17 = {
    onKeyup: (__VLS_ctx.handleLogin)
};
var __VLS_13;
var __VLS_9;
const __VLS_18 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    label: "密码",
    prop: "password",
}));
const __VLS_20 = __VLS_19({
    label: "密码",
    prop: "password",
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_21.slots.default;
const __VLS_22 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form.password),
    size: "large",
    type: "password",
    showPassword: true,
    placeholder: "请输入密码",
}));
const __VLS_24 = __VLS_23({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.form.password),
    size: "large",
    type: "password",
    showPassword: true,
    placeholder: "请输入密码",
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
let __VLS_26;
let __VLS_27;
let __VLS_28;
const __VLS_29 = {
    onKeyup: (__VLS_ctx.handleLogin)
};
var __VLS_25;
var __VLS_21;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-extra" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_30 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
    ...{ 'onClick': {} },
    type: "primary",
    size: "large",
    ...{ class: "login-btn" },
    loading: (__VLS_ctx.submitting),
}));
const __VLS_32 = __VLS_31({
    ...{ 'onClick': {} },
    type: "primary",
    size: "large",
    ...{ class: "login-btn" },
    loading: (__VLS_ctx.submitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
let __VLS_34;
let __VLS_35;
let __VLS_36;
const __VLS_37 = {
    onClick: (__VLS_ctx.handleLogin)
};
__VLS_33.slots.default;
var __VLS_33;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "register-entry" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_38 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_40 = __VLS_39({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
let __VLS_42;
let __VLS_43;
let __VLS_44;
const __VLS_45 = {
    onClick: (__VLS_ctx.openRegisterDialog)
};
__VLS_41.slots.default;
var __VLS_41;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "login-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_46 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_47 = __VLS_asFunctionalComponent(__VLS_46, new __VLS_46({
    modelValue: (__VLS_ctx.registerDialogVisible),
    title: "注册账号",
    width: "560px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
    destroyOnClose: true,
}));
const __VLS_48 = __VLS_47({
    modelValue: (__VLS_ctx.registerDialogVisible),
    title: "注册账号",
    width: "560px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_47));
__VLS_49.slots.default;
const __VLS_50 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
    ref: "registerFormRef",
    model: (__VLS_ctx.registerForm),
    rules: (__VLS_ctx.registerRules),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_52 = __VLS_51({
    ref: "registerFormRef",
    model: (__VLS_ctx.registerForm),
    rules: (__VLS_ctx.registerRules),
    labelWidth: "110px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_51));
/** @type {typeof __VLS_ctx.registerFormRef} */ ;
var __VLS_54 = {};
__VLS_53.slots.default;
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
const __VLS_56 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "用户名",
    prop: "username",
}));
const __VLS_58 = __VLS_57({
    label: "用户名",
    prop: "username",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
const __VLS_60 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    modelValue: (__VLS_ctx.registerForm.username),
    placeholder: "请输入用户名",
}));
const __VLS_62 = __VLS_61({
    modelValue: (__VLS_ctx.registerForm.username),
    placeholder: "请输入用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
var __VLS_59;
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "昵称",
    prop: "nickname",
}));
const __VLS_66 = __VLS_65({
    label: "昵称",
    prop: "nickname",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    modelValue: (__VLS_ctx.registerForm.nickname),
    placeholder: "请输入昵称",
}));
const __VLS_70 = __VLS_69({
    modelValue: (__VLS_ctx.registerForm.nickname),
    placeholder: "请输入昵称",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_67;
const __VLS_72 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    label: "邮箱",
}));
const __VLS_74 = __VLS_73({
    label: "邮箱",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    modelValue: (__VLS_ctx.registerForm.email),
    placeholder: "请输入邮箱",
}));
const __VLS_78 = __VLS_77({
    modelValue: (__VLS_ctx.registerForm.email),
    placeholder: "请输入邮箱",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
var __VLS_75;
const __VLS_80 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "手机号",
}));
const __VLS_82 = __VLS_81({
    label: "手机号",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
const __VLS_84 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    modelValue: (__VLS_ctx.registerForm.phone),
    placeholder: "请输入手机号",
}));
const __VLS_86 = __VLS_85({
    modelValue: (__VLS_ctx.registerForm.phone),
    placeholder: "请输入手机号",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
var __VLS_83;
const __VLS_88 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    label: "GitLab 用户名",
}));
const __VLS_90 = __VLS_89({
    label: "GitLab 用户名",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
const __VLS_92 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    modelValue: (__VLS_ctx.registerForm.gitlabUsername),
    placeholder: "例如：zhangsan",
}));
const __VLS_94 = __VLS_93({
    modelValue: (__VLS_ctx.registerForm.gitlabUsername),
    placeholder: "例如：zhangsan",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
var __VLS_91;
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "密码",
    prop: "password",
}));
const __VLS_98 = __VLS_97({
    label: "密码",
    prop: "password",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.registerForm.password),
    type: "password",
    showPassword: true,
    placeholder: "至少 6 位",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.registerForm.password),
    type: "password",
    showPassword: true,
    placeholder: "至少 6 位",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
var __VLS_99;
const __VLS_104 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "确认密码",
    prop: "confirmPassword",
}));
const __VLS_106 = __VLS_105({
    label: "确认密码",
    prop: "confirmPassword",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    modelValue: (__VLS_ctx.registerForm.confirmPassword),
    type: "password",
    showPassword: true,
    placeholder: "再次输入密码",
}));
const __VLS_110 = __VLS_109({
    modelValue: (__VLS_ctx.registerForm.confirmPassword),
    type: "password",
    showPassword: true,
    placeholder: "再次输入密码",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_107;
var __VLS_53;
{
    const { footer: __VLS_thisSlot } = __VLS_49.slots;
    const __VLS_112 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        ...{ 'onClick': {} },
    }));
    const __VLS_114 = __VLS_113({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    let __VLS_116;
    let __VLS_117;
    let __VLS_118;
    const __VLS_119 = {
        onClick: (...[$event]) => {
            __VLS_ctx.registerDialogVisible = false;
        }
    };
    __VLS_115.slots.default;
    var __VLS_115;
    const __VLS_120 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.registerSubmitting),
    }));
    const __VLS_122 = __VLS_121({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.registerSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    let __VLS_124;
    let __VLS_125;
    let __VLS_126;
    const __VLS_127 = {
        onClick: (__VLS_ctx.handleRegister)
    };
    __VLS_123.slots.default;
    var __VLS_123;
}
var __VLS_49;
/** @type {__VLS_StyleScopedClasses['login-page']} */ ;
/** @type {__VLS_StyleScopedClasses['login-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['login-showcase']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-noise']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-orbit']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-orbit-a']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-orbit']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-orbit-b']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-content']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['showcase-metrics']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['metric-card']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['form-brand']} */ ;
/** @type {__VLS_StyleScopedClasses['form-brand-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['form-header']} */ ;
/** @type {__VLS_StyleScopedClasses['form-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['login-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-extra']} */ ;
/** @type {__VLS_StyleScopedClasses['login-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['register-entry']} */ ;
/** @type {__VLS_StyleScopedClasses['login-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
// @ts-ignore
var __VLS_5 = __VLS_4, __VLS_55 = __VLS_54;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formRef: formRef,
            registerFormRef: registerFormRef,
            submitting: submitting,
            registerSubmitting: registerSubmitting,
            registerDialogVisible: registerDialogVisible,
            form: form,
            registerForm: registerForm,
            rules: rules,
            registerRules: registerRules,
            openRegisterDialog: openRegisterDialog,
            handleLogin: handleLogin,
            handleRegister: handleRegister,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=LoginView.vue.js.map