/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Delete, EditPen, Filter, Plus, RefreshRight, Search, Setting } from '@element-plus/icons-vue';
import { createPermission, deletePermission, listPermissionOptions, pagePermissions, updatePermission } from '@/api/access';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('system:permission:manage'));
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEditing = ref(false);
const readonlyMode = ref(false);
const currentId = ref(null);
const currentBuiltIn = ref(false);
const permissionList = ref([]);
const allPermissions = ref([]);
const formRef = ref();
const pagination = reactive({ page: 1, size: 10, total: 0 });
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const filters = reactive({
    keyword: '',
    type: '',
    enabled: ''
});
const permissionFilterPopoverVisible = ref(false);
const dialogTitle = computed(() => {
    if (readonlyMode.value) {
        return '查看功能';
    }
    return isEditing.value ? '编辑功能' : '新建功能';
});
const form = reactive({
    name: '',
    code: '',
    type: 'MENU',
    path: '',
    component: '',
    icon: '',
    parentId: null,
    sortOrder: 100,
    enabled: true,
    description: ''
});
const rules = {
    name: [{ required: true, message: '请输入功能名称', trigger: 'blur' }],
    code: [{ required: true, message: '请输入功能编码', trigger: 'blur' }],
    type: [{ required: true, message: '请选择功能类型', trigger: 'change' }],
    sortOrder: [{ required: true, message: '请输入排序值', trigger: 'change' }]
};
const permissionMap = computed(() => new Map(allPermissions.value.map((item) => [item.id, item.name])));
const parentOptions = computed(() => allPermissions.value.filter((item) => item.id !== currentId.value));
const parentName = (parentId) => {
    if (!parentId)
        return '-';
    return permissionMap.value.get(parentId) || '-';
};
const resetForm = () => {
    currentId.value = null;
    currentBuiltIn.value = false;
    form.name = '';
    form.code = '';
    form.type = 'MENU';
    form.path = '';
    form.component = '';
    form.icon = '';
    form.parentId = null;
    form.sortOrder = 100;
    form.enabled = true;
    form.description = '';
    formRef.value?.clearValidate();
};
const loadAllPermissions = async () => {
    allPermissions.value = await listPermissionOptions();
};
const loadPermissions = async () => {
    loading.value = true;
    try {
        const data = await pagePermissions({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            type: filters.type,
            enabled: filters.enabled
        });
        permissionList.value = data.records;
        pagination.total = data.total;
    }
    finally {
        loading.value = false;
    }
};
const handleSearch = async () => {
    permissionFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadPermissions();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.type = '';
    filters.enabled = '';
    pagination.page = 1;
    await loadPermissions();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadPermissions();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadPermissions();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadPermissions();
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
    form.type = row.type;
    form.path = row.path || '';
    form.component = row.component || '';
    form.icon = row.icon || '';
    form.parentId = row.parentId;
    form.sortOrder = row.sortOrder;
    form.enabled = row.enabled;
    form.description = row.description;
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
            type: form.type,
            path: form.path || null,
            component: form.component || null,
            icon: form.icon,
            parentId: form.parentId,
            sortOrder: form.sortOrder,
            enabled: form.enabled,
            description: form.description
        };
        if (isEditing.value && currentId.value !== null) {
            await updatePermission(currentId.value, payload);
            ElMessage.success('功能更新成功');
        }
        else {
            await createPermission(payload);
            ElMessage.success('功能创建成功');
        }
        dialogVisible.value = false;
        await loadAllPermissions();
        await loadPermissions();
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
        await ElMessageBox.confirm('删除功能后，关联角色将失去该权限，确认继续吗？', '提示', { type: 'warning' });
        await deletePermission(id);
        ElMessage.success('功能删除成功');
        await loadAllPermissions();
        await loadPermissions();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
onMounted(async () => {
    await loadAllPermissions();
    await loadPermissions();
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
    placeholder: "搜索功能名称、编码或描述...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.permissionFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.permissionFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
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
    modelValue: (__VLS_ctx.filters.type),
    clearable: true,
    placeholder: "类型",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.filters.type),
    clearable: true,
    placeholder: "类型",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "菜单",
    value: "MENU",
}));
const __VLS_26 = __VLS_25({
    label: "菜单",
    value: "MENU",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "动作",
    value: "ACTION",
}));
const __VLS_30 = __VLS_29({
    label: "动作",
    value: "ACTION",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    modelValue: (__VLS_ctx.filters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_34 = __VLS_33({
    modelValue: (__VLS_ctx.filters.enabled),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "启用",
    value: (true),
}));
const __VLS_38 = __VLS_37({
    label: "启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "禁用",
    value: (false),
}));
const __VLS_42 = __VLS_41({
    label: "禁用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
});
const __VLS_44 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_47.slots.default;
var __VLS_47;
const __VLS_52 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ 'onClick': {} },
}));
const __VLS_54 = __VLS_53({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
let __VLS_56;
let __VLS_57;
let __VLS_58;
const __VLS_59 = {
    onClick: (__VLS_ctx.handleReset)
};
__VLS_55.slots.default;
var __VLS_55;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_60 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_63;
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
    const __VLS_68 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    const __VLS_72 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    var __VLS_71;
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
    ...{ class: "management-list-table permission-list-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-code" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-type center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-parent" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-path" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-sort center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-status center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "permission-col-built center" },
});
if (__VLS_ctx.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
        ...{ class: "permission-col-actions right" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.permissionList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-main" },
        'data-label': "功能",
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
    const __VLS_76 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
    const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    const __VLS_80 = {}.Setting;
    /** @type {[typeof __VLS_components.Setting, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
    const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
    var __VLS_79;
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
        ...{ class: "permission-col-code" },
        'data-label': "编码",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-text" },
    });
    (row.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-type center" },
        'data-label': "类型",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.type === 'MENU' ? 'info' : 'warning') },
    });
    (row.type === 'MENU' ? '菜单' : '动作');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-parent" },
        'data-label': "上级",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-empty" },
    });
    (__VLS_ctx.parentName(row.parentId));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-path" },
        'data-label': "路径",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-empty" },
    });
    (row.path || '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-sort center" },
        'data-label': "排序",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-text" },
    });
    (row.sortOrder);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-status center" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.enabled ? 'success' : 'danger') },
    });
    (row.enabled ? '启用' : '禁用');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "permission-col-built center" },
        'data-label': "内置",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill neutral" },
    });
    (row.builtIn ? '是' : '否');
    if (__VLS_ctx.canManage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
            ...{ class: "permission-col-actions right" },
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
            title: "编辑功能",
        });
        const __VLS_84 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
        const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        const __VLS_88 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
        const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
        var __VLS_87;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.canManage))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "management-list-row-button danger" },
            type: "button",
            disabled: (row.builtIn),
            title: "删除功能",
        });
        const __VLS_92 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
        const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        const __VLS_96 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
        const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
        var __VLS_95;
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
const __VLS_100 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_102 = __VLS_101({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
let __VLS_104;
let __VLS_105;
let __VLS_106;
const __VLS_107 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_103.slots.default;
const __VLS_108 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    value: (5),
    label: "5",
}));
const __VLS_110 = __VLS_109({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
const __VLS_112 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    value: (10),
    label: "10",
}));
const __VLS_114 = __VLS_113({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
const __VLS_116 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    value: (20),
    label: "20",
}));
const __VLS_118 = __VLS_117({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
const __VLS_120 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    value: (50),
    label: "50",
}));
const __VLS_122 = __VLS_121({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_103;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_124 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_127;
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
const __VLS_132 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_135;
const __VLS_140 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "620px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "620px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_146 = __VLS_145({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_148 = {};
__VLS_147.slots.default;
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
const __VLS_150 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
    label: "功能名称",
    prop: "name",
}));
const __VLS_152 = __VLS_151({
    label: "功能名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_151));
__VLS_153.slots.default;
const __VLS_154 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入功能名称",
}));
const __VLS_156 = __VLS_155({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入功能名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_155));
var __VLS_153;
const __VLS_158 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    label: "功能编码",
    prop: "code",
}));
const __VLS_160 = __VLS_159({
    label: "功能编码",
    prop: "code",
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
const __VLS_162 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    modelValue: (__VLS_ctx.form.code),
    disabled: (__VLS_ctx.currentBuiltIn),
    placeholder: "例如：project:view",
}));
const __VLS_164 = __VLS_163({
    modelValue: (__VLS_ctx.form.code),
    disabled: (__VLS_ctx.currentBuiltIn),
    placeholder: "例如：project:view",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
var __VLS_161;
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "功能类型",
    prop: "type",
}));
const __VLS_168 = __VLS_167({
    label: "功能类型",
    prop: "type",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.form.type),
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.form.type),
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
__VLS_173.slots.default;
const __VLS_174 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    label: "MENU",
}));
const __VLS_176 = __VLS_175({
    label: "MENU",
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
__VLS_177.slots.default;
var __VLS_177;
const __VLS_178 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    label: "ACTION",
}));
const __VLS_180 = __VLS_179({
    label: "ACTION",
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
__VLS_181.slots.default;
var __VLS_181;
var __VLS_173;
var __VLS_169;
const __VLS_182 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    label: "上级功能",
}));
const __VLS_184 = __VLS_183({
    label: "上级功能",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    modelValue: (__VLS_ctx.form.parentId),
    clearable: true,
    placeholder: "请选择上级功能",
    ...{ style: {} },
}));
const __VLS_188 = __VLS_187({
    modelValue: (__VLS_ctx.form.parentId),
    clearable: true,
    placeholder: "请选择上级功能",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.parentOptions))) {
    const __VLS_190 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
        key: (item.id),
        label: (`${item.name} (${item.code})`),
        value: (item.id),
    }));
    const __VLS_192 = __VLS_191({
        key: (item.id),
        label: (`${item.name} (${item.code})`),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_191));
}
var __VLS_189;
var __VLS_185;
const __VLS_194 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    label: "路由路径",
}));
const __VLS_196 = __VLS_195({
    label: "路由路径",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
__VLS_197.slots.default;
const __VLS_198 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    modelValue: (__VLS_ctx.form.path),
    placeholder: "菜单可配置，例如 /projects",
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_ctx.form.path),
    placeholder: "菜单可配置，例如 /projects",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
var __VLS_197;
const __VLS_202 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    label: "组件名称",
}));
const __VLS_204 = __VLS_203({
    label: "组件名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
__VLS_205.slots.default;
const __VLS_206 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    modelValue: (__VLS_ctx.form.component),
    placeholder: "例如：ProjectView",
}));
const __VLS_208 = __VLS_207({
    modelValue: (__VLS_ctx.form.component),
    placeholder: "例如：ProjectView",
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
var __VLS_205;
const __VLS_210 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    label: "图标",
}));
const __VLS_212 = __VLS_211({
    label: "图标",
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    modelValue: (__VLS_ctx.form.icon),
    placeholder: "例如：User / Lock",
}));
const __VLS_216 = __VLS_215({
    modelValue: (__VLS_ctx.form.icon),
    placeholder: "例如：User / Lock",
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
var __VLS_213;
const __VLS_218 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "排序值",
    prop: "sortOrder",
}));
const __VLS_220 = __VLS_219({
    label: "排序值",
    prop: "sortOrder",
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
__VLS_221.slots.default;
const __VLS_222 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    modelValue: (__VLS_ctx.form.sortOrder),
    min: (0),
    max: (9999),
    ...{ style: {} },
}));
const __VLS_224 = __VLS_223({
    modelValue: (__VLS_ctx.form.sortOrder),
    min: (0),
    max: (9999),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
var __VLS_221;
const __VLS_226 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
    label: "启用",
}));
const __VLS_228 = __VLS_227({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_227));
__VLS_229.slots.default;
const __VLS_230 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
    modelValue: (__VLS_ctx.form.enabled),
    disabled: (__VLS_ctx.currentBuiltIn),
}));
const __VLS_232 = __VLS_231({
    modelValue: (__VLS_ctx.form.enabled),
    disabled: (__VLS_ctx.currentBuiltIn),
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
var __VLS_229;
const __VLS_234 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    label: "描述",
}));
const __VLS_236 = __VLS_235({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
__VLS_237.slots.default;
const __VLS_238 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "请输入描述",
}));
const __VLS_240 = __VLS_239({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "请输入描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_239));
var __VLS_237;
var __VLS_147;
{
    const { footer: __VLS_thisSlot } = __VLS_143.slots;
    const __VLS_242 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
        ...{ 'onClick': {} },
    }));
    const __VLS_244 = __VLS_243({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_243));
    let __VLS_246;
    let __VLS_247;
    let __VLS_248;
    const __VLS_249 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_245.slots.default;
    (__VLS_ctx.readonlyMode ? '关闭' : '取消');
    var __VLS_245;
    if (!__VLS_ctx.readonlyMode) {
        const __VLS_250 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_252 = __VLS_251({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_251));
        let __VLS_254;
        let __VLS_255;
        let __VLS_256;
        const __VLS_257 = {
            onClick: (__VLS_ctx.handleSubmit)
        };
        __VLS_253.slots.default;
        var __VLS_253;
    }
}
var __VLS_143;
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
/** @type {__VLS_StyleScopedClasses['management-list-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-parent']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-path']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-sort']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-built']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-code']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-type']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-parent']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-path']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-sort']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-built']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['permission-col-actions']} */ ;
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
// @ts-ignore
var __VLS_149 = __VLS_148;
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
            Setting: Setting,
            canManage: canManage,
            loading: loading,
            submitting: submitting,
            dialogVisible: dialogVisible,
            readonlyMode: readonlyMode,
            currentBuiltIn: currentBuiltIn,
            permissionList: permissionList,
            formRef: formRef,
            pagination: pagination,
            totalPages: totalPages,
            filters: filters,
            permissionFilterPopoverVisible: permissionFilterPopoverVisible,
            dialogTitle: dialogTitle,
            form: form,
            rules: rules,
            parentOptions: parentOptions,
            parentName: parentName,
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
//# sourceMappingURL=PermissionView.vue.js.map