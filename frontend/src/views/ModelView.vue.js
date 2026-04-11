/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Connection, Cpu, Delete, EditPen, Filter, Plus, RefreshRight, Search } from '@element-plus/icons-vue';
import { createModelConfig, deleteModelConfig, pageModelConfigs, testModelConfig, updateModelConfig } from '@/api/models';
const loading = ref(false);
const submitting = ref(false);
const dialogVisible = ref(false);
const isEditing = ref(false);
const readonlyMode = ref(false);
const testingId = ref(null);
const currentId = ref(null);
const list = ref([]);
const formRef = ref();
const pagination = reactive({ page: 1, size: 10, total: 0 });
const filters = reactive({
    keyword: '',
    provider: undefined,
    enabled: undefined
});
const modelFilterPopoverVisible = ref(false);
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const form = reactive({
    name: '',
    provider: 'OPENAI',
    apiBaseUrl: 'https://api.openai.com/v1',
    modelName: '',
    apiKey: '',
    description: '',
    enabled: true
});
watch(() => form.provider, (provider) => {
    form.apiBaseUrl = provider === 'ANTHROPIC' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1';
});
const rules = {
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
    provider: [{ required: true, message: '请选择提供商', trigger: 'change' }],
    apiBaseUrl: [{ required: true, message: '请输入 API 地址', trigger: 'blur' }],
    modelName: [{ required: true, message: '请输入模型名', trigger: 'blur' }]
};
const dialogTitle = computed(() => {
    if (readonlyMode.value) {
        return '查看模型';
    }
    return isEditing.value ? '编辑模型' : '新增模型';
});
const resetForm = () => {
    currentId.value = null;
    form.name = '';
    form.provider = 'OPENAI';
    form.apiBaseUrl = 'https://api.openai.com/v1';
    form.modelName = '';
    form.apiKey = '';
    form.description = '';
    form.enabled = true;
    formRef.value?.clearValidate();
};
const loadData = async () => {
    loading.value = true;
    try {
        const pageData = await pageModelConfigs({ ...filters, page: pagination.page, size: pagination.size });
        list.value = pageData.records;
        pagination.total = pageData.total;
    }
    finally {
        loading.value = false;
    }
};
const handleSearch = async () => {
    modelFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadData();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.provider = undefined;
    filters.enabled = undefined;
    pagination.page = 1;
    await loadData();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadData();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadData();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadData();
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
    form.name = row.name;
    form.provider = row.provider;
    form.apiBaseUrl = row.apiBaseUrl;
    form.modelName = row.modelName;
    form.apiKey = '';
    form.description = row.description;
    form.enabled = row.enabled;
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
    if (!isEditing.value && !form.apiKey.trim()) {
        ElMessage.warning('新增模型时必须填写 API Key');
        return;
    }
    submitting.value = true;
    try {
        if (isEditing.value && currentId.value !== null) {
            await updateModelConfig(currentId.value, { ...form });
            ElMessage.success('模型已更新');
        }
        else {
            await createModelConfig({ ...form });
            ElMessage.success('模型已创建');
        }
        dialogVisible.value = false;
        await loadData();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '保存失败');
    }
    finally {
        submitting.value = false;
    }
};
const handleTest = async (id) => {
    testingId.value = id;
    try {
        const result = await testModelConfig(id);
        await ElMessageBox.alert(result.message || '测试完成', result.success ? '测试成功' : '测试失败', {
            type: result.success ? 'success' : 'error'
        });
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '模型测试失败');
    }
    finally {
        testingId.value = null;
    }
};
const handleDelete = async (id) => {
    try {
        await ElMessageBox.confirm('确认删除该模型配置吗？', '提示', { type: 'warning' });
        await deleteModelConfig(id);
        ElMessage.success('模型已删除');
        await loadData();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
onMounted(() => {
    loadData();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['model-col-name']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['model-api-link']} */ ;
/** @type {__VLS_StyleScopedClasses['model-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-search-shell" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "atelier-search-icon" },
}));
const __VLS_2 = __VLS_1({
    ...{ class: "atelier-search-icon" },
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
    ...{ class: "atelier-search-input" },
    type: "text",
    placeholder: "搜索名称、模型或描述...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.modelFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "atelier-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.modelFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "atelier-filter-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_11.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "atelier-toolbar-button" },
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
    ...{ class: "atelier-filter-panel atelier-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.filters.provider),
    clearable: true,
    placeholder: "提供商",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.filters.provider),
    clearable: true,
    placeholder: "提供商",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "OpenAI",
    value: "OPENAI",
}));
const __VLS_26 = __VLS_25({
    label: "OpenAI",
    value: "OPENAI",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "Anthropic",
    value: "ANTHROPIC",
}));
const __VLS_30 = __VLS_29({
    label: "Anthropic",
    value: "ANTHROPIC",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
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
    value: (true),
    label: "启用",
}));
const __VLS_38 = __VLS_37({
    value: (true),
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    value: (false),
    label: "停用",
}));
const __VLS_42 = __VLS_41({
    value: (false),
    label: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-actions" },
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
    ...{ class: "atelier-toolbar-button" },
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
    ...{ class: "atelier-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCreateDialog) },
    ...{ class: "atelier-create-button" },
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-table-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-list model-list-table mobile-card-list" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head model-list-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-provider center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-name" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-api" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-key center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-status center" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-data-head-item model-col-actions right" },
});
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.list))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (row.id),
        ...{ class: "atelier-data-row model-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-main" },
        'data-label': "模型配置",
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
    const __VLS_80 = {}.Cpu;
    /** @type {[typeof __VLS_components.Cpu, ]} */ ;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-provider center" },
        'data-label': "提供商",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill neutral" },
    });
    (row.provider);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-name" },
        'data-label': "模型名",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-text" },
    });
    (row.modelName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-api" },
        'data-label': "接口地址",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
        ...{ class: "management-list-text model-api-link" },
        href: (row.apiBaseUrl),
        target: "_blank",
        rel: "noreferrer",
    });
    (row.apiBaseUrl);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-key center" },
        'data-label': "密钥",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.apiKeyConfigured ? 'success' : 'neutral') },
    });
    (row.apiKeyConfigured ? '已配置' : '未配置');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-status center" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.enabled ? 'success' : 'danger') },
    });
    (row.enabled ? '启用' : '停用');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-cell model-col-actions right" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-row-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleTest(row.id);
            } },
        ...{ class: "management-list-row-button" },
        type: "button",
        title: "测试模型",
    });
    const __VLS_84 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    const __VLS_88 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
    const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
    var __VLS_87;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openEditDialog(row);
            } },
        ...{ class: "management-list-row-button" },
        type: "button",
        title: "编辑模型",
    });
    const __VLS_92 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
    const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    const __VLS_96 = {}.EditPen;
    /** @type {[typeof __VLS_components.EditPen, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
    const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
    var __VLS_95;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleDelete(row.id);
            } },
        ...{ class: "management-list-row-button danger" },
        type: "button",
        title: "删除模型",
    });
    const __VLS_100 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
    const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    const __VLS_104 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
    const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
    var __VLS_103;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-table-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.pagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-page-size atelier-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_108 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_110 = __VLS_109({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
let __VLS_112;
let __VLS_113;
let __VLS_114;
const __VLS_115 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_111.slots.default;
const __VLS_116 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    value: (5),
    label: "5",
}));
const __VLS_118 = __VLS_117({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
const __VLS_120 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    value: (10),
    label: "10",
}));
const __VLS_122 = __VLS_121({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    value: (20),
    label: "20",
}));
const __VLS_126 = __VLS_125({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
const __VLS_128 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    value: (50),
    label: "50",
}));
const __VLS_130 = __VLS_129({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_111;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "atelier-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_132 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
const __VLS_136 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_135;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-page-text" },
});
(__VLS_ctx.pagination.page);
(__VLS_ctx.totalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNextPage) },
    ...{ class: "atelier-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page >= __VLS_ctx.totalPages),
});
const __VLS_140 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_143;
const __VLS_148 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "620px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "620px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_154 = __VLS_153({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "100px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_156 = {};
__VLS_155.slots.default;
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
const __VLS_158 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    label: "名称",
    prop: "name",
}));
const __VLS_160 = __VLS_159({
    label: "名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
const __VLS_162 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "例如：代码审查模型",
}));
const __VLS_164 = __VLS_163({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "例如：代码审查模型",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
var __VLS_161;
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "提供商",
    prop: "provider",
}));
const __VLS_168 = __VLS_167({
    label: "提供商",
    prop: "provider",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.form.provider),
    ...{ style: {} },
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.form.provider),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
__VLS_173.slots.default;
const __VLS_174 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    label: "OpenAI",
    value: "OPENAI",
}));
const __VLS_176 = __VLS_175({
    label: "OpenAI",
    value: "OPENAI",
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
const __VLS_178 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    label: "Anthropic",
    value: "ANTHROPIC",
}));
const __VLS_180 = __VLS_179({
    label: "Anthropic",
    value: "ANTHROPIC",
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
var __VLS_173;
var __VLS_169;
const __VLS_182 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    label: "API 地址",
    prop: "apiBaseUrl",
}));
const __VLS_184 = __VLS_183({
    label: "API 地址",
    prop: "apiBaseUrl",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    modelValue: (__VLS_ctx.form.apiBaseUrl),
}));
const __VLS_188 = __VLS_187({
    modelValue: (__VLS_ctx.form.apiBaseUrl),
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
var __VLS_185;
const __VLS_190 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
    label: "模型名",
    prop: "modelName",
}));
const __VLS_192 = __VLS_191({
    label: "模型名",
    prop: "modelName",
}, ...__VLS_functionalComponentArgsRest(__VLS_191));
__VLS_193.slots.default;
const __VLS_194 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    modelValue: (__VLS_ctx.form.modelName),
    placeholder: "如：gpt-5.4 / claude-sonnet-4-20250514",
}));
const __VLS_196 = __VLS_195({
    modelValue: (__VLS_ctx.form.modelName),
    placeholder: "如：gpt-5.4 / claude-sonnet-4-20250514",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
var __VLS_193;
const __VLS_198 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    label: "API 密钥",
    prop: "apiKey",
}));
const __VLS_200 = __VLS_199({
    label: "API 密钥",
    prop: "apiKey",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
const __VLS_202 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.form.apiKey),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.isEditing ? '留空则保留原密钥' : '请输入 API 密钥'),
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.form.apiKey),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.isEditing ? '留空则保留原密钥' : '请输入 API 密钥'),
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
var __VLS_201;
const __VLS_206 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    label: "描述",
}));
const __VLS_208 = __VLS_207({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_209.slots.default;
const __VLS_210 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
}));
const __VLS_212 = __VLS_211({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
var __VLS_209;
const __VLS_214 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    label: "启用",
}));
const __VLS_216 = __VLS_215({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
__VLS_217.slots.default;
const __VLS_218 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    modelValue: (__VLS_ctx.form.enabled),
}));
const __VLS_220 = __VLS_219({
    modelValue: (__VLS_ctx.form.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
var __VLS_217;
var __VLS_155;
{
    const { footer: __VLS_thisSlot } = __VLS_151.slots;
    const __VLS_222 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
        ...{ 'onClick': {} },
    }));
    const __VLS_224 = __VLS_223({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_223));
    let __VLS_226;
    let __VLS_227;
    let __VLS_228;
    const __VLS_229 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_225.slots.default;
    (__VLS_ctx.readonlyMode ? '关闭' : '取消');
    var __VLS_225;
    if (!__VLS_ctx.readonlyMode) {
        const __VLS_230 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_232 = __VLS_231({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_231));
        let __VLS_234;
        let __VLS_235;
        let __VLS_236;
        const __VLS_237 = {
            onClick: (__VLS_ctx.handleSubmit)
        };
        __VLS_233.slots.default;
        var __VLS_233;
    }
}
var __VLS_151;
/** @type {__VLS_StyleScopedClasses['atelier-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-list']} */ ;
/** @type {__VLS_StyleScopedClasses['model-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-list']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head']} */ ;
/** @type {__VLS_StyleScopedClasses['model-list-head']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-provider']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-name']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-key']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-row']} */ ;
/** @type {__VLS_StyleScopedClasses['model-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-provider']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['neutral']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-name']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['model-api-link']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-key']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['model-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-footer-total']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-footer-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-size']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-compact-input']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-nav']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-text']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-page-button']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
// @ts-ignore
var __VLS_157 = __VLS_156;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Connection: Connection,
            Cpu: Cpu,
            Delete: Delete,
            EditPen: EditPen,
            Filter: Filter,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            loading: loading,
            submitting: submitting,
            dialogVisible: dialogVisible,
            isEditing: isEditing,
            readonlyMode: readonlyMode,
            list: list,
            formRef: formRef,
            pagination: pagination,
            filters: filters,
            modelFilterPopoverVisible: modelFilterPopoverVisible,
            totalPages: totalPages,
            form: form,
            rules: rules,
            dialogTitle: dialogTitle,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            openCreateDialog: openCreateDialog,
            openDetailDialog: openDetailDialog,
            openEditDialog: openEditDialog,
            handleSubmit: handleSubmit,
            handleTest: handleTest,
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
//# sourceMappingURL=ModelView.vue.js.map