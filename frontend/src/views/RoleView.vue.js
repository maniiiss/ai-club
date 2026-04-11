/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, UserFilled } from '@element-plus/icons-vue';
import { createRole, deleteRole, listPermissionOptions, pageRoles, updateRole } from '@/api/access';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('system:role:manage'));
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEditing = ref(false);
const readonlyMode = ref(false);
const currentId = ref(null);
const currentBuiltIn = ref(false);
const roleList = ref([]);
const permissionOptions = ref([]);
const formRef = ref();
const pagination = reactive({ page: 1, size: 10, total: 0 });
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const filters = reactive({ keyword: '', enabled: '' });
const roleFilterPopoverVisible = ref(false);
const dialogTitle = computed(() => {
    if (readonlyMode.value) {
        return '查看角色';
    }
    return isEditing.value ? '编辑角色' : '新建角色';
});
const dataPermissionScopeOptions = [
    { value: 'NONE', label: '无权限' },
    { value: 'OWNER_ONLY', label: '仅负责人' },
    { value: 'CREATOR_ONLY', label: '仅创建人' },
    { value: 'OWNER_OR_CREATOR', label: '负责人或创建人' },
    { value: 'PROJECT_PARTICIPANT', label: '项目参与人' },
    { value: 'ALL', label: '所有人' }
];
const dataPermissionScopeLabelMap = {
    NONE: '无权限',
    OWNER_ONLY: '仅负责人',
    CREATOR_ONLY: '仅创建人',
    OWNER_OR_CREATOR: '负责人或创建人',
    PROJECT_PARTICIPANT: '项目参与人',
    ALL: '所有人'
};
const form = reactive({
    name: '',
    code: '',
    enabled: true,
    description: '',
    projectVisibilityScope: 'PROJECT_PARTICIPANT',
    projectManageScope: 'OWNER_OR_CREATOR',
    iterationDeleteScope: 'CREATOR_ONLY',
    taskDeleteScope: 'CREATOR_ONLY',
    permissionIds: []
});
const rules = {
    name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
    code: [{ required: true, message: '请输入角色编码', trigger: 'blur' }],
    projectVisibilityScope: [{ required: true, message: '请选择项目可见范围', trigger: 'change' }],
    projectManageScope: [{ required: true, message: '请选择项目维护范围', trigger: 'change' }],
    iterationDeleteScope: [{ required: true, message: '请选择迭代删除范围', trigger: 'change' }],
    taskDeleteScope: [{ required: true, message: '请选择工作项删除范围', trigger: 'change' }]
};
const resetForm = () => {
    currentId.value = null;
    currentBuiltIn.value = false;
    form.name = '';
    form.code = '';
    form.enabled = true;
    form.description = '';
    form.projectVisibilityScope = 'PROJECT_PARTICIPANT';
    form.projectManageScope = 'OWNER_OR_CREATOR';
    form.iterationDeleteScope = 'CREATOR_ONLY';
    form.taskDeleteScope = 'CREATOR_ONLY';
    form.permissionIds = [];
    formRef.value?.clearValidate();
};
/**
 * 统一构建角色列表中的数据权限摘要，减少表格横向空间占用。
 */
const buildDataScopeLabel = (label, scope) => `${label}：${dataPermissionScopeLabelMap[scope]}`;
const loadPermissionOptions = async () => {
    permissionOptions.value = await listPermissionOptions();
};
const loadRoles = async () => {
    loading.value = true;
    try {
        const data = await pageRoles({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            enabled: filters.enabled
        });
        roleList.value = data.records;
        pagination.total = data.total;
    }
    finally {
        loading.value = false;
    }
};
const handleSearch = async () => {
    roleFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadRoles();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.enabled = '';
    pagination.page = 1;
    await loadRoles();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadRoles();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadRoles();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadRoles();
};
const openCreateDialog = () => {
    readonlyMode.value = false;
    isEditing.value = false;
    resetForm();
    dialogVisible.value = true;
};
const fillForm = (row) => {
    isEditing.value = true;
    currentId.value = row.id;
    currentBuiltIn.value = row.builtIn;
    form.name = row.name;
    form.code = row.code;
    form.enabled = row.enabled;
    form.description = row.description;
    form.projectVisibilityScope = row.projectVisibilityScope;
    form.projectManageScope = row.projectManageScope;
    form.iterationDeleteScope = row.iterationDeleteScope;
    form.taskDeleteScope = row.taskDeleteScope;
    form.permissionIds = [...row.permissionIds];
};
const openDetailDialog = (row) => {
    readonlyMode.value = true;
    fillForm(row);
    dialogVisible.value = true;
};
const openEditDialog = (row) => {
    readonlyMode.value = false;
    fillForm(row);
    dialogVisible.value = true;
};
const handleSubmit = async () => {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid)
        return;
    submitting.value = true;
    try {
        const payload = {
            name: form.name,
            code: form.code,
            enabled: form.enabled,
            description: form.description,
            projectVisibilityScope: form.projectVisibilityScope,
            projectManageScope: form.projectManageScope,
            iterationDeleteScope: form.iterationDeleteScope,
            taskDeleteScope: form.taskDeleteScope,
            permissionIds: form.permissionIds
        };
        if (isEditing.value && currentId.value !== null) {
            await updateRole(currentId.value, payload);
            ElMessage.success('角色更新成功');
        }
        else {
            await createRole(payload);
            ElMessage.success('角色创建成功');
        }
        dialogVisible.value = false;
        await loadRoles();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '操作失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleDelete = async (id) => {
    try {
        await ElMessageBox.confirm('删除角色后，关联用户将失去该角色权限，确认继续吗？', '提示', { type: 'warning' });
        await deleteRole(id);
        ElMessage.success('角色删除成功');
        await loadRoles();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
onMounted(async () => {
    await loadPermissionOptions();
    await loadRoles();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleSearch) },
    value: (__VLS_ctx.filters.keyword),
    ...{ class: "management-list-search-input" },
    type: "text",
    placeholder: "搜索角色名称、编码或描述...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.roleFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (280),
    popperClass: "management-list-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.roleFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (280),
    popperClass: "management-list-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_11.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.filters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.filters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "启用",
    value: (true),
}));
const __VLS_26 = __VLS_25({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "禁用",
    value: (false),
}));
const __VLS_30 = __VLS_29({
    label: "禁用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
});
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_35.slots.default;
var __VLS_35;
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.handleReset)
};
__VLS_43.slots.default;
var __VLS_43;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_48 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
var __VLS_51;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-side" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openCreateDialog) },
        ...{ class: "management-list-create-button" },
        type: "button",
    });
    const __VLS_56 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
    const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "management-list-table role-list-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-code" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-status center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-permissions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-data" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "role-col-built center" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "role-col-actions right" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.roleList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-main" },
        'data-label': "角色",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openDetailDialog(row);
            } },
        ...{ class: "management-list-title-trigger" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title-icon" },
    });
    const __VLS_64 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
    const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    const __VLS_68 = {}.UserFilled;
    /** @type {[typeof __VLS_components.UserFilled, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    var __VLS_67;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title" },
    });
    (row.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-subtitle" },
    });
    (row.description || '暂无描述');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-code" },
        'data-label': "编码",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-text" },
    });
    (row.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-status center" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.enabled ? 'success' : 'danger') },
    });
    (row.enabled ? '启用' : '禁用');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-permissions" },
        'data-label': "权限",
    });
    if (row.permissionNames.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-stack" },
        });
        for (const [item] of __VLS_getVForSourceType((row.permissionNames.slice(0, 3)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                key: (item),
                ...{ class: "management-list-chip" },
            });
            (item);
        }
        if (row.permissionNames.length > 3) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "management-list-chip muted" },
            });
            (row.permissionNames.length - 3);
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-data" },
        'data-label': "数据权限",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-chip" },
    });
    (__VLS_ctx.buildDataScopeLabel('项目可见', row.projectVisibilityScope));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-chip" },
    });
    (__VLS_ctx.buildDataScopeLabel('项目维护', row.projectManageScope));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-chip" },
    });
    (__VLS_ctx.buildDataScopeLabel('迭代删除', row.iterationDeleteScope));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-chip" },
    });
    (__VLS_ctx.buildDataScopeLabel('工作项删除', row.taskDeleteScope));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "role-col-built center" },
        'data-label': "内置",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill neutral" },
    });
    (row.builtIn ? '是' : '否');
    if (__VLS_ctx.canManage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "role-col-actions right" },
            'data-label': "操作",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-row-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.openEditDialog(row);
                } },
            ...{ class: "management-list-row-button" },
            type: "button",
            title: "编辑角色",
        });
        const __VLS_72 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
        const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        const __VLS_76 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
        const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
        var __VLS_75;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "management-list-row-button danger" },
            type: "button",
            disabled: (row.builtIn),
            title: "删除角色",
        });
        const __VLS_80 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
        const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        const __VLS_84 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
        const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
        var __VLS_83;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.pagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-size management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_88 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_90 = __VLS_89({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_91.slots.default;
const __VLS_96 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    value: (5),
    label: "5",
}));
const __VLS_98 = __VLS_97({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    value: (10),
    label: "10",
}));
const __VLS_102 = __VLS_101({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    value: (20),
    label: "20",
}));
const __VLS_106 = __VLS_105({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    value: (50),
    label: "50",
}));
const __VLS_110 = __VLS_109({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
var __VLS_91;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_112 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
var __VLS_115;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-page-text" },
});
(__VLS_ctx.pagination.page);
(__VLS_ctx.totalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNextPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.totalPages),
});
const __VLS_120 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
const __VLS_124 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
var __VLS_123;
const __VLS_128 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_130 = __VLS_129({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_134 = __VLS_133({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_136 = {};
__VLS_135.slots.default;
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
const __VLS_138 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
    label: "角色名称",
    prop: "name",
}));
const __VLS_140 = __VLS_139({
    label: "角色名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_139));
__VLS_141.slots.default;
const __VLS_142 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入角色名称",
}));
const __VLS_144 = __VLS_143({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入角色名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_143));
var __VLS_141;
const __VLS_146 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    label: "角色编码",
    prop: "code",
}));
const __VLS_148 = __VLS_147({
    label: "角色编码",
    prop: "code",
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
__VLS_149.slots.default;
const __VLS_150 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
    modelValue: (__VLS_ctx.form.code),
    disabled: (__VLS_ctx.currentBuiltIn),
    placeholder: "例如：DEV_MANAGER",
}));
const __VLS_152 = __VLS_151({
    modelValue: (__VLS_ctx.form.code),
    disabled: (__VLS_ctx.currentBuiltIn),
    placeholder: "例如：DEV_MANAGER",
}, ...__VLS_functionalComponentArgsRest(__VLS_151));
var __VLS_149;
const __VLS_154 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
    label: "权限配置",
}));
const __VLS_156 = __VLS_155({
    label: "权限配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_155));
__VLS_157.slots.default;
const __VLS_158 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    modelValue: (__VLS_ctx.form.permissionIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择权限",
    ...{ style: {} },
}));
const __VLS_160 = __VLS_159({
    modelValue: (__VLS_ctx.form.permissionIds),
    multiple: true,
    filterable: true,
    collapseTags: true,
    placeholder: "请选择权限",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.permissionOptions))) {
    const __VLS_162 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
        key: (item.id),
        label: (`${item.name} (${item.code})`),
        value: (item.id),
    }));
    const __VLS_164 = __VLS_163({
        key: (item.id),
        label: (`${item.name} (${item.code})`),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_163));
}
var __VLS_161;
var __VLS_157;
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "启用",
}));
const __VLS_168 = __VLS_167({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.form.enabled),
    disabled: (__VLS_ctx.currentBuiltIn),
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.form.enabled),
    disabled: (__VLS_ctx.currentBuiltIn),
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
var __VLS_169;
const __VLS_174 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    label: "描述",
}));
const __VLS_176 = __VLS_175({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
__VLS_177.slots.default;
const __VLS_178 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "请输入角色描述",
}));
const __VLS_180 = __VLS_179({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "请输入角色描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
var __VLS_177;
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
const __VLS_182 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    label: "项目可见",
    prop: "projectVisibilityScope",
}));
const __VLS_184 = __VLS_183({
    label: "项目可见",
    prop: "projectVisibilityScope",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    modelValue: (__VLS_ctx.form.projectVisibilityScope),
    placeholder: "请选择项目可见范围",
    ...{ style: {} },
}));
const __VLS_188 = __VLS_187({
    modelValue: (__VLS_ctx.form.projectVisibilityScope),
    placeholder: "请选择项目可见范围",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dataPermissionScopeOptions))) {
    const __VLS_190 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
        key: (`project-visibility-${item.value}`),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_192 = __VLS_191({
        key: (`project-visibility-${item.value}`),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_191));
}
var __VLS_189;
var __VLS_185;
const __VLS_194 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    label: "项目维护",
    prop: "projectManageScope",
}));
const __VLS_196 = __VLS_195({
    label: "项目维护",
    prop: "projectManageScope",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
__VLS_197.slots.default;
const __VLS_198 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    modelValue: (__VLS_ctx.form.projectManageScope),
    placeholder: "请选择项目维护范围",
    ...{ style: {} },
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_ctx.form.projectManageScope),
    placeholder: "请选择项目维护范围",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dataPermissionScopeOptions))) {
    const __VLS_202 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
        key: (`project-manage-${item.value}`),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_204 = __VLS_203({
        key: (`project-manage-${item.value}`),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_203));
}
var __VLS_201;
var __VLS_197;
const __VLS_206 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    label: "迭代删除",
    prop: "iterationDeleteScope",
}));
const __VLS_208 = __VLS_207({
    label: "迭代删除",
    prop: "iterationDeleteScope",
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_209.slots.default;
const __VLS_210 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    modelValue: (__VLS_ctx.form.iterationDeleteScope),
    placeholder: "请选择迭代删除范围",
    ...{ style: {} },
}));
const __VLS_212 = __VLS_211({
    modelValue: (__VLS_ctx.form.iterationDeleteScope),
    placeholder: "请选择迭代删除范围",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dataPermissionScopeOptions))) {
    const __VLS_214 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
        key: (`iteration-delete-${item.value}`),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_216 = __VLS_215({
        key: (`iteration-delete-${item.value}`),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_215));
}
var __VLS_213;
var __VLS_209;
const __VLS_218 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "工作项删除",
    prop: "taskDeleteScope",
}));
const __VLS_220 = __VLS_219({
    label: "工作项删除",
    prop: "taskDeleteScope",
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
__VLS_221.slots.default;
const __VLS_222 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.form.taskDeleteScope),
    placeholder: "请选择工作项删除范围",
    ...{ style: {} },
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.form.taskDeleteScope),
    placeholder: "请选择工作项删除范围",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
__VLS_225.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dataPermissionScopeOptions))) {
    const __VLS_226 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
        key: (`task-delete-${item.value}`),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_228 = __VLS_227({
        key: (`task-delete-${item.value}`),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_227));
}
var __VLS_225;
var __VLS_221;
var __VLS_135;
{
    const { footer: __VLS_thisSlot } = __VLS_131.slots;
    const __VLS_230 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
        ...{ 'onClick': {} },
    }));
    const __VLS_232 = __VLS_231({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_231));
    let __VLS_234;
    let __VLS_235;
    let __VLS_236;
    const __VLS_237 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_233.slots.default;
    (__VLS_ctx.readonlyMode ? '关闭' : '取消');
    var __VLS_233;
    if (!__VLS_ctx.readonlyMode) {
        const __VLS_238 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_240 = __VLS_239({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_239));
        let __VLS_242;
        let __VLS_243;
        let __VLS_244;
        const __VLS_245 = {
            onClick: (__VLS_ctx.handleSubmit)
        };
        __VLS_241.slots.default;
        var __VLS_241;
    }
}
var __VLS_131;
/** @type {__VLS_StyleScopedClasses['management-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['role-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-permissions']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-data']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-built']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-permissions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-data']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-built']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['role-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
// @ts-ignore
var __VLS_137 = __VLS_136;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            UserFilled: UserFilled,
            canManage: canManage,
            loading: loading,
            submitting: submitting,
            dialogVisible: dialogVisible,
            readonlyMode: readonlyMode,
            currentBuiltIn: currentBuiltIn,
            roleList: roleList,
            permissionOptions: permissionOptions,
            formRef: formRef,
            pagination: pagination,
            totalPages: totalPages,
            filters: filters,
            roleFilterPopoverVisible: roleFilterPopoverVisible,
            dialogTitle: dialogTitle,
            dataPermissionScopeOptions: dataPermissionScopeOptions,
            form: form,
            rules: rules,
            buildDataScopeLabel: buildDataScopeLabel,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            openCreateDialog: openCreateDialog,
            openDetailDialog: openDetailDialog,
            openEditDialog: openEditDialog,
            handleSubmit: handleSubmit,
            handleDelete: handleDelete,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=RoleView.vue.js.map