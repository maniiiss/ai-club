/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, ArrowRight, Connection, Cpu, Delete, EditPen, Filter, Link, Plus, Promotion, RefreshRight, Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listModelConfigOptions } from '@/api/models';
import { createAgent, deleteAgent, listProjectOptions, pageAgents, testAgent, updateAgent } from '@/api/platform';
const categoryOptions = ['需求设计', 'UI设计', '技术设计', '开发', '测试', '部署'];
const typeOptions = ['规划', '开发', '评审', '测试', '运维'];
const statusOptions = ['在线', '空闲', '离线'];
const accessTypeOptions = [
    { label: '内置智能体', value: 'BUILT_IN' },
    { label: '提示词智能体', value: 'LLM_PROMPT' },
    { label: 'HTTP API 接入', value: 'HTTP_API' },
    { label: '运行时接入', value: 'AGENT_RUNTIME' }
];
const builtinOptions = [
    { label: '代码审查智能体', value: 'CODE_REVIEW' },
    { label: '测试建议智能体', value: 'TEST_SUGGESTION' },
    { label: '需求拆解智能体', value: 'REQUIREMENT_BREAKDOWN' }
];
const runtimeTypeOptions = [
    { label: 'OpenClaw', value: 'OPENCLAW' }
];
const loading = ref(false);
const submitting = ref(false);
const testing = ref(false);
const dialogVisible = ref(false);
const testDialogVisible = ref(false);
const isEditing = ref(false);
const readonlyMode = ref(false);
const currentId = ref(null);
const agentList = ref([]);
const modelOptions = ref([]);
const projectOptions = ref([]);
const currentTestAgent = ref(null);
const testResult = ref(null);
const testInput = ref('');
const formRef = ref();
const pagination = reactive({ page: 1, size: 10, total: 0 });
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.total / pagination.size) || 1));
const filters = reactive({
    keyword: '',
    status: '',
    type: '',
    category: '',
    accessType: undefined,
    projectId: undefined
});
const agentFilterPopoverVisible = ref(false);
const router = useRouter();
const defaultForm = () => ({
    name: '',
    type: '开发',
    category: '开发',
    status: '在线',
    enabled: true,
    accessType: 'BUILT_IN',
    builtinCode: 'CODE_REVIEW',
    capability: '',
    description: '',
    aiModelConfigId: null,
    projectId: null,
    systemPrompt: '',
    userPromptTemplate: '',
    endpointUrl: '',
    runtimeType: 'OPENCLAW',
    runtimeAgentRef: '',
    runtimeSessionKeyTemplate: '',
    httpMethod: 'POST',
    httpHeaders: '',
    httpAuthType: 'NONE',
    httpAuthToken: '',
    httpRequestTemplate: '',
    httpResponsePath: '',
    timeoutSeconds: 60
});
const form = reactive(defaultForm());
const rules = {
    name: [{ required: true, message: '请输入智能体名称', trigger: 'blur' }],
    type: [{ required: true, message: '请选择类型', trigger: 'change' }],
    category: [{ required: true, message: '请选择分类', trigger: 'change' }],
    status: [{ required: true, message: '请选择状态', trigger: 'change' }],
    accessType: [{ required: true, message: '请选择接入方式', trigger: 'change' }]
};
const accessTypeLabel = (value) => accessTypeOptions.find(item => item.value === value)?.label || value || '-';
const runtimeTypeLabel = (value) => runtimeTypeOptions.find(item => item.value === value)?.label || value || '-';
const agentAccessIcon = (accessType) => accessType === 'AGENT_RUNTIME' ? Connection : accessType === 'HTTP_API' ? Link : accessType === 'LLM_PROMPT' ? Cpu : Promotion;
const agentStatusClass = (status) => status === '在线' ? 'is-online' : status === '空闲' ? 'is-idle' : 'is-offline';
const agentStatusTone = (status) => status === '在线' ? 'success' : status === '空闲' ? 'info' : 'danger';
const agentRuntimeLabel = (row) => {
    if (row.accessType === 'AGENT_RUNTIME') {
        return `${runtimeTypeLabel(row.runtimeType)} / ${row.runtimeAgentRef || '-'}`;
    }
    if (row.accessType === 'HTTP_API') {
        return row.endpointUrl || '-';
    }
    return row.aiModelConfigName || '-';
};
const dialogTitle = computed(() => {
    if (readonlyMode.value) {
        return '查看智能体';
    }
    return isEditing.value ? '编辑智能体' : '新建智能体';
});
const resetForm = () => {
    Object.assign(form, defaultForm());
    currentId.value = null;
    formRef.value?.clearValidate();
};
const loadOptions = async () => {
    const [models, projects] = await Promise.all([listModelConfigOptions(), listProjectOptions()]);
    modelOptions.value = models;
    projectOptions.value = projects;
};
const loadAgents = async () => {
    loading.value = true;
    try {
        const pageData = await pageAgents({
            page: pagination.page,
            size: pagination.size,
            keyword: filters.keyword,
            status: filters.status,
            type: filters.type,
            accessType: filters.accessType,
            category: filters.category,
            projectId: filters.projectId
        });
        agentList.value = pageData.records;
        pagination.total = pageData.total;
    }
    finally {
        loading.value = false;
    }
};
const handleSearch = async () => {
    agentFilterPopoverVisible.value = false;
    pagination.page = 1;
    await loadAgents();
};
const handleReset = async () => {
    filters.keyword = '';
    filters.status = '';
    filters.type = '';
    filters.category = '';
    filters.accessType = undefined;
    filters.projectId = undefined;
    pagination.page = 1;
    await loadAgents();
};
const handleSizeChange = async () => {
    pagination.page = 1;
    await loadAgents();
};
const handlePrevPage = async () => {
    if (pagination.page <= 1)
        return;
    pagination.page -= 1;
    await loadAgents();
};
const handleNextPage = async () => {
    if (pagination.page >= totalPages.value)
        return;
    pagination.page += 1;
    await loadAgents();
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
    Object.assign(form, {
        name: row.name,
        type: row.type,
        category: row.category,
        status: row.status,
        enabled: row.enabled,
        accessType: row.accessType,
        builtinCode: row.builtinCode,
        capability: row.capability,
        description: row.description,
        aiModelConfigId: row.aiModelConfigId,
        projectId: row.projectId,
        systemPrompt: row.systemPrompt || '',
        userPromptTemplate: row.userPromptTemplate || '',
        endpointUrl: row.endpointUrl || '',
        runtimeType: row.runtimeType || 'OPENCLAW',
        runtimeAgentRef: row.runtimeAgentRef || '',
        runtimeSessionKeyTemplate: row.runtimeSessionKeyTemplate || '',
        httpMethod: row.httpMethod || 'POST',
        httpHeaders: row.httpHeaders || '',
        httpAuthType: row.httpAuthType || 'NONE',
        httpAuthToken: '',
        httpRequestTemplate: row.httpRequestTemplate || '',
        httpResponsePath: row.httpResponsePath || '',
        timeoutSeconds: row.timeoutSeconds || 60
    });
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
const goToProject = async (projectId) => {
    await router.push({ name: 'project-iterations', params: { projectId } });
};
const buildPayload = () => ({
    name: form.name,
    type: form.type,
    category: form.category,
    status: form.status,
    enabled: form.enabled,
    accessType: form.accessType,
    builtinCode: form.accessType === 'BUILT_IN' ? form.builtinCode : null,
    capability: form.capability,
    description: form.description,
    aiModelConfigId: form.accessType === 'BUILT_IN' || form.accessType === 'LLM_PROMPT' ? form.aiModelConfigId : null,
    projectId: form.projectId,
    systemPrompt: form.systemPrompt,
    userPromptTemplate: form.accessType === 'LLM_PROMPT' || form.accessType === 'AGENT_RUNTIME' ? form.userPromptTemplate : '',
    endpointUrl: form.accessType === 'HTTP_API' || form.accessType === 'AGENT_RUNTIME' ? form.endpointUrl : '',
    runtimeType: form.accessType === 'AGENT_RUNTIME' ? form.runtimeType : null,
    runtimeAgentRef: form.accessType === 'AGENT_RUNTIME' ? form.runtimeAgentRef : '',
    runtimeSessionKeyTemplate: form.accessType === 'AGENT_RUNTIME' ? form.runtimeSessionKeyTemplate : '',
    httpMethod: form.accessType === 'HTTP_API' ? form.httpMethod : '',
    httpHeaders: form.accessType === 'HTTP_API' ? form.httpHeaders : '',
    httpAuthType: form.accessType === 'HTTP_API' || form.accessType === 'AGENT_RUNTIME' ? form.httpAuthType : null,
    httpAuthToken: form.accessType === 'HTTP_API' || form.accessType === 'AGENT_RUNTIME' ? form.httpAuthToken : '',
    httpRequestTemplate: form.accessType === 'HTTP_API' ? form.httpRequestTemplate : '',
    httpResponsePath: form.accessType === 'HTTP_API' ? form.httpResponsePath : '',
    timeoutSeconds: form.accessType === 'HTTP_API' || form.accessType === 'AGENT_RUNTIME' ? form.timeoutSeconds : 60
});
const validateBusinessRules = () => {
    if (form.accessType === 'BUILT_IN') {
        if (!form.builtinCode) {
            ElMessage.warning('请选择内置能力');
            return false;
        }
        if (!form.aiModelConfigId) {
            ElMessage.warning('内置智能体需要绑定模型配置');
            return false;
        }
    }
    if (form.accessType === 'LLM_PROMPT') {
        if (!form.aiModelConfigId) {
            ElMessage.warning('提示词智能体需要绑定模型配置');
            return false;
        }
        if (!form.userPromptTemplate.trim()) {
            ElMessage.warning('请输入用户提示词模板');
            return false;
        }
    }
    if (form.accessType === 'HTTP_API' && !form.endpointUrl.trim()) {
        ElMessage.warning('请输入 HTTP API 地址');
        return false;
    }
    if (form.accessType === 'AGENT_RUNTIME') {
        if (!form.runtimeType) {
            ElMessage.warning('请选择 Runtime 类型');
            return false;
        }
        if (!form.endpointUrl.trim()) {
            ElMessage.warning('请输入 Gateway 地址');
            return false;
        }
        if (!form.runtimeAgentRef.trim()) {
            ElMessage.warning('请输入运行时智能体标识');
            return false;
        }
    }
    return true;
};
const handleSubmit = async () => {
    const valid = await formRef.value?.validate().catch(() => false);
    if (!valid || !validateBusinessRules())
        return;
    submitting.value = true;
    try {
        const payload = buildPayload();
        if (isEditing.value && currentId.value !== null) {
            await updateAgent(currentId.value, payload);
            ElMessage.success('智能体更新成功');
        }
        else {
            await createAgent(payload);
            ElMessage.success('智能体创建成功');
        }
        dialogVisible.value = false;
        await loadAgents();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '操作失败');
    }
    finally {
        submitting.value = false;
    }
};
const openTestDialog = (row) => {
    currentTestAgent.value = row;
    testInput.value = '';
    testResult.value = null;
    testDialogVisible.value = true;
};
const handleTest = async () => {
    if (!currentTestAgent.value)
        return;
    if (!testInput.value.trim()) {
        ElMessage.warning('请输入测试内容');
        return;
    }
    testResult.value = null;
    testing.value = true;
    try {
        testResult.value = await testAgent(currentTestAgent.value.id, testInput.value);
    }
    catch (error) {
        testResult.value = null;
        ElMessage.error(error?.response?.data?.message || '测试失败');
    }
    finally {
        testing.value = false;
    }
};
const handleDelete = async (id) => {
    try {
        await ElMessageBox.confirm('删除智能体后，关联任务会变成未分配，是否继续？', '提示', { type: 'warning' });
        await deleteAgent(id);
        ElMessage.success('智能体删除成功');
        await loadAgents();
    }
    catch (error) {
        if (error !== 'cancel') {
            ElMessage.error(error?.response?.data?.message || '删除失败');
        }
    }
};
onMounted(async () => {
    await loadOptions();
    await loadAgents();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['agent-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-runtime']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-category']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-status']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-status']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-status']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['access-type-group']} */ ;
/** @type {__VLS_StyleScopedClasses['access-type-group']} */ ;
/** @type {__VLS_StyleScopedClasses['test-output']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-card-meta']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-list-page agent-page" },
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
    placeholder: "搜索智能体名称或能力...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "atelier-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_8 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    visible: (__VLS_ctx.agentFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
    popperClass: "atelier-filter-popper",
}));
const __VLS_10 = __VLS_9({
    visible: (__VLS_ctx.agentFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (360),
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
    modelValue: (__VLS_ctx.filters.projectId),
    clearable: true,
    placeholder: "所属项目",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.filters.projectId),
    clearable: true,
    placeholder: "所属项目",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_24 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_26 = __VLS_25({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.filters.accessType),
    clearable: true,
    placeholder: "接入方式",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.filters.accessType),
    clearable: true,
    placeholder: "接入方式",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.accessTypeOptions))) {
    const __VLS_32 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_34 = __VLS_33({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
var __VLS_31;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_36 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    modelValue: (__VLS_ctx.filters.category),
    clearable: true,
    placeholder: "分类",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_38 = __VLS_37({
    modelValue: (__VLS_ctx.filters.category),
    clearable: true,
    placeholder: "分类",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.categoryOptions))) {
    const __VLS_40 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_42 = __VLS_41({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_44 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_46 = __VLS_45({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
    placeholder: "状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.statusOptions))) {
    const __VLS_48 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_50 = __VLS_49({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
}
var __VLS_47;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-filter-actions" },
});
const __VLS_52 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_54 = __VLS_53({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
let __VLS_56;
let __VLS_57;
let __VLS_58;
const __VLS_59 = {
    onClick: (__VLS_ctx.handleSearch)
};
__VLS_55.slots.default;
var __VLS_55;
const __VLS_60 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    ...{ 'onClick': {} },
}));
const __VLS_62 = __VLS_61({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
let __VLS_64;
let __VLS_65;
let __VLS_66;
const __VLS_67 = {
    onClick: (__VLS_ctx.handleReset)
};
__VLS_63.slots.default;
var __VLS_63;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleReset) },
    ...{ class: "atelier-toolbar-button" },
    type: "button",
});
const __VLS_68 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
var __VLS_71;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openCreateDialog) },
    ...{ class: "atelier-create-button" },
    type: "button",
});
const __VLS_76 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "atelier-table-shell agent-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.agentList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-list agent-list-table mobile-card-list" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head agent-list-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-project" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-access center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-runtime" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-category" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-status center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-enabled center" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-data-head-item agent-col-actions right" },
    });
    for (const [row] of __VLS_getVForSourceType((__VLS_ctx.agentList))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (row.id),
            ...{ class: "atelier-data-row agent-list-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-main" },
            'data-label': "智能体",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.agentList.length))
                        return;
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
        const __VLS_84 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
        const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        const __VLS_88 = ((__VLS_ctx.agentAccessIcon(row.accessType)));
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
        const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
        var __VLS_87;
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
        (row.capability || '暂无能力描述');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-project" },
            'data-label': "所属项目",
        });
        if (row.projectId && row.projectName) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.agentList.length))
                            return;
                        if (!(row.projectId && row.projectName))
                            return;
                        __VLS_ctx.goToProject(row.projectId);
                    } },
                ...{ class: "management-list-link" },
                type: "button",
            });
            (row.projectName);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "management-list-empty" },
            });
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-access center" },
            'data-label': "接入方式",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill info" },
        });
        (__VLS_ctx.accessTypeLabel(row.accessType));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-runtime" },
            'data-label': "运行时",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (__VLS_ctx.agentRuntimeLabel(row));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-category" },
            'data-label': "分类 / 类型",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
        (row.category);
        (row.type);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-status center" },
            'data-label': "状态",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (__VLS_ctx.agentStatusTone(row.status)) },
        });
        (row.status || '未知');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-enabled center" },
            'data-label': "启用",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-pill" },
            ...{ class: (row.enabled ? 'success' : 'danger') },
        });
        (row.enabled ? '启用' : '停用');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "atelier-data-cell agent-col-actions right" },
            'data-label': "操作",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-row-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.agentList.length))
                        return;
                    __VLS_ctx.openTestDialog(row);
                } },
            ...{ class: "management-list-row-button" },
            type: "button",
            title: "测试智能体",
        });
        const __VLS_92 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
        const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        const __VLS_96 = {}.Promotion;
        /** @type {[typeof __VLS_components.Promotion, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
        const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
        var __VLS_95;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.agentList.length))
                        return;
                    __VLS_ctx.openEditDialog(row);
                } },
            ...{ class: "management-list-row-button" },
            type: "button",
            title: "编辑智能体",
        });
        const __VLS_100 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
        const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        const __VLS_104 = {}.EditPen;
        /** @type {[typeof __VLS_components.EditPen, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
        const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
        var __VLS_103;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.agentList.length))
                        return;
                    __VLS_ctx.handleDelete(row.id);
                } },
            ...{ class: "management-list-row-button danger" },
            type: "button",
            title: "删除智能体",
        });
        const __VLS_108 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
        const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
        __VLS_111.slots.default;
        const __VLS_112 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
        const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
        var __VLS_111;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "atelier-empty-state" },
    });
    const __VLS_116 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        description: "当前筛选条件下暂无智能体",
    }));
    const __VLS_118 = __VLS_117({
        description: "当前筛选条件下暂无智能体",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
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
const __VLS_120 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_122 = __VLS_121({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.pagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    onChange: (__VLS_ctx.handleSizeChange)
};
__VLS_123.slots.default;
const __VLS_128 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    value: (10),
    label: "10",
}));
const __VLS_130 = __VLS_129({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
const __VLS_132 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    value: (20),
    label: "20",
}));
const __VLS_134 = __VLS_133({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
const __VLS_136 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    value: (50),
    label: "50",
}));
const __VLS_138 = __VLS_137({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_123;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "atelier-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handlePrevPage) },
    ...{ class: "atelier-page-button" },
    type: "button",
    disabled: (__VLS_ctx.pagination.page <= 1),
});
const __VLS_140 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({}));
const __VLS_142 = __VLS_141({}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({}));
const __VLS_146 = __VLS_145({}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_143;
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
const __VLS_148 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({}));
const __VLS_154 = __VLS_153({}, ...__VLS_functionalComponentArgsRest(__VLS_153));
var __VLS_151;
const __VLS_156 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "960px",
    destroyOnClose: true,
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_158 = __VLS_157({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.dialogTitle),
    width: "960px",
    destroyOnClose: true,
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
const __VLS_160 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "110px",
    ...{ class: "agent-dialog-form" },
}));
const __VLS_162 = __VLS_161({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    disabled: (__VLS_ctx.readonlyMode),
    labelWidth: "110px",
    ...{ class: "agent-dialog-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_164 = {};
__VLS_163.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "form-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-grid two-columns" },
});
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "智能体名称",
    prop: "name",
}));
const __VLS_168 = __VLS_167({
    label: "智能体名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入智能体名称",
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入智能体名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
var __VLS_169;
const __VLS_174 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    label: "所属项目",
}));
const __VLS_176 = __VLS_175({
    label: "所属项目",
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
__VLS_177.slots.default;
const __VLS_178 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    modelValue: (__VLS_ctx.form.projectId),
    clearable: true,
    placeholder: "为空表示全局智能体",
    ...{ style: {} },
}));
const __VLS_180 = __VLS_179({
    modelValue: (__VLS_ctx.form.projectId),
    clearable: true,
    placeholder: "为空表示全局智能体",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
__VLS_181.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_182 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }));
    const __VLS_184 = __VLS_183({
        key: (item.id),
        label: (item.name),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_183));
}
var __VLS_181;
var __VLS_177;
const __VLS_186 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    label: "分类",
    prop: "category",
}));
const __VLS_188 = __VLS_187({
    label: "分类",
    prop: "category",
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
const __VLS_190 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
    modelValue: (__VLS_ctx.form.category),
    placeholder: "请选择分类",
    ...{ style: {} },
}));
const __VLS_192 = __VLS_191({
    modelValue: (__VLS_ctx.form.category),
    placeholder: "请选择分类",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_191));
__VLS_193.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.categoryOptions))) {
    const __VLS_194 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_196 = __VLS_195({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_195));
}
var __VLS_193;
var __VLS_189;
const __VLS_198 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    label: "类型",
    prop: "type",
}));
const __VLS_200 = __VLS_199({
    label: "类型",
    prop: "type",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
const __VLS_202 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.form.type),
    placeholder: "请选择类型",
    ...{ style: {} },
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.form.type),
    placeholder: "请选择类型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
__VLS_205.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.typeOptions))) {
    const __VLS_206 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_208 = __VLS_207({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_207));
}
var __VLS_205;
var __VLS_201;
const __VLS_210 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    label: "状态",
    prop: "status",
}));
const __VLS_212 = __VLS_211({
    label: "状态",
    prop: "status",
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}));
const __VLS_216 = __VLS_215({
    modelValue: (__VLS_ctx.form.status),
    placeholder: "请选择状态",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
__VLS_217.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.statusOptions))) {
    const __VLS_218 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
        key: (item),
        label: (item),
        value: (item),
    }));
    const __VLS_220 = __VLS_219({
        key: (item),
        label: (item),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_219));
}
var __VLS_217;
var __VLS_213;
const __VLS_222 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    label: "是否启用",
}));
const __VLS_224 = __VLS_223({
    label: "是否启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
__VLS_225.slots.default;
const __VLS_226 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
    modelValue: (__VLS_ctx.form.enabled),
}));
const __VLS_228 = __VLS_227({
    modelValue: (__VLS_ctx.form.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_227));
var __VLS_225;
const __VLS_230 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
    label: "接入方式",
    prop: "accessType",
    ...{ class: "span-2" },
}));
const __VLS_232 = __VLS_231({
    label: "接入方式",
    prop: "accessType",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_233.slots.default;
const __VLS_234 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    modelValue: (__VLS_ctx.form.accessType),
    ...{ class: "access-type-group" },
}));
const __VLS_236 = __VLS_235({
    modelValue: (__VLS_ctx.form.accessType),
    ...{ class: "access-type-group" },
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
__VLS_237.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.accessTypeOptions))) {
    const __VLS_238 = {}.ElRadioButton;
    /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
    // @ts-ignore
    const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
        key: (item.value),
        value: (item.value),
    }));
    const __VLS_240 = __VLS_239({
        key: (item.value),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_239));
    __VLS_241.slots.default;
    (item.label);
    var __VLS_241;
}
var __VLS_237;
var __VLS_233;
const __VLS_242 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
    label: "能力描述",
    ...{ class: "span-2" },
}));
const __VLS_244 = __VLS_243({
    label: "能力描述",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_243));
__VLS_245.slots.default;
const __VLS_246 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    modelValue: (__VLS_ctx.form.capability),
    placeholder: "例如：任务拆解、代码建议、测试建议、项目协作",
}));
const __VLS_248 = __VLS_247({
    modelValue: (__VLS_ctx.form.capability),
    placeholder: "例如：任务拆解、代码建议、测试建议、项目协作",
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
var __VLS_245;
const __VLS_250 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    label: "详细说明",
    ...{ class: "span-2" },
}));
const __VLS_252 = __VLS_251({
    label: "详细说明",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
__VLS_253.slots.default;
const __VLS_254 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "补充说明智能体的职责范围、输入输出要求等",
}));
const __VLS_256 = __VLS_255({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    placeholder: "补充说明智能体的职责范围、输入输出要求等",
}, ...__VLS_functionalComponentArgsRest(__VLS_255));
var __VLS_253;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "form-section" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-section-subtitle" },
});
if (__VLS_ctx.form.accessType === 'BUILT_IN') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid two-columns" },
    });
    const __VLS_258 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
        label: "内置能力",
        prop: "builtinCode",
    }));
    const __VLS_260 = __VLS_259({
        label: "内置能力",
        prop: "builtinCode",
    }, ...__VLS_functionalComponentArgsRest(__VLS_259));
    __VLS_261.slots.default;
    const __VLS_262 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
        modelValue: (__VLS_ctx.form.builtinCode),
        placeholder: "请选择内置能力",
        ...{ style: {} },
    }));
    const __VLS_264 = __VLS_263({
        modelValue: (__VLS_ctx.form.builtinCode),
        placeholder: "请选择内置能力",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_263));
    __VLS_265.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.builtinOptions))) {
        const __VLS_266 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_267 = __VLS_asFunctionalComponent(__VLS_266, new __VLS_266({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_268 = __VLS_267({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_267));
    }
    var __VLS_265;
    var __VLS_261;
    const __VLS_270 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
        label: "模型配置",
        prop: "aiModelConfigId",
    }));
    const __VLS_272 = __VLS_271({
        label: "模型配置",
        prop: "aiModelConfigId",
    }, ...__VLS_functionalComponentArgsRest(__VLS_271));
    __VLS_273.slots.default;
    const __VLS_274 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({
        modelValue: (__VLS_ctx.form.aiModelConfigId),
        placeholder: "请选择模型配置",
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_276 = __VLS_275({
        modelValue: (__VLS_ctx.form.aiModelConfigId),
        placeholder: "请选择模型配置",
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_275));
    __VLS_277.slots.default;
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.modelOptions))) {
        const __VLS_278 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
            key: (model.id),
            label: (`${model.name} / ${model.provider} / ${model.modelName}`),
            value: (model.id),
        }));
        const __VLS_280 = __VLS_279({
            key: (model.id),
            label: (`${model.name} / ${model.provider} / ${model.modelName}`),
            value: (model.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_279));
    }
    var __VLS_277;
    var __VLS_273;
    const __VLS_282 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
        label: "系统提示词",
        ...{ class: "span-2" },
    }));
    const __VLS_284 = __VLS_283({
        label: "系统提示词",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_283));
    __VLS_285.slots.default;
    const __VLS_286 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (8),
        placeholder: "可覆盖默认系统提示词",
    }));
    const __VLS_288 = __VLS_287({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (8),
        placeholder: "可覆盖默认系统提示词",
    }, ...__VLS_functionalComponentArgsRest(__VLS_287));
    var __VLS_285;
}
else if (__VLS_ctx.form.accessType === 'LLM_PROMPT') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid two-columns" },
    });
    const __VLS_290 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
        label: "模型配置",
        prop: "aiModelConfigId",
    }));
    const __VLS_292 = __VLS_291({
        label: "模型配置",
        prop: "aiModelConfigId",
    }, ...__VLS_functionalComponentArgsRest(__VLS_291));
    __VLS_293.slots.default;
    const __VLS_294 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
        modelValue: (__VLS_ctx.form.aiModelConfigId),
        placeholder: "请选择模型配置",
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_296 = __VLS_295({
        modelValue: (__VLS_ctx.form.aiModelConfigId),
        placeholder: "请选择模型配置",
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_295));
    __VLS_297.slots.default;
    for (const [model] of __VLS_getVForSourceType((__VLS_ctx.modelOptions))) {
        const __VLS_298 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
            key: (model.id),
            label: (`${model.name} / ${model.provider} / ${model.modelName}`),
            value: (model.id),
        }));
        const __VLS_300 = __VLS_299({
            key: (model.id),
            label: (`${model.name} / ${model.provider} / ${model.modelName}`),
            value: (model.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_299));
    }
    var __VLS_297;
    var __VLS_293;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({});
    const __VLS_302 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
        label: "系统提示词",
        ...{ class: "span-2" },
    }));
    const __VLS_304 = __VLS_303({
        label: "系统提示词",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_303));
    __VLS_305.slots.default;
    const __VLS_306 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (5),
        placeholder: "请输入系统提示词",
    }));
    const __VLS_308 = __VLS_307({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (5),
        placeholder: "请输入系统提示词",
    }, ...__VLS_functionalComponentArgsRest(__VLS_307));
    var __VLS_305;
    const __VLS_310 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
        label: "用户提示词模板",
        ...{ class: "span-2" },
        prop: "userPromptTemplate",
    }));
    const __VLS_312 = __VLS_311({
        label: "用户提示词模板",
        ...{ class: "span-2" },
        prop: "userPromptTemplate",
    }, ...__VLS_functionalComponentArgsRest(__VLS_311));
    __VLS_313.slots.default;
    const __VLS_314 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
        modelValue: (__VLS_ctx.form.userPromptTemplate),
        type: "textarea",
        rows: (8),
        placeholder: "支持 {{input}}、{{input_json}}、{{system_prompt}}、{{system_prompt_json}}",
    }));
    const __VLS_316 = __VLS_315({
        modelValue: (__VLS_ctx.form.userPromptTemplate),
        type: "textarea",
        rows: (8),
        placeholder: "支持 {{input}}、{{input_json}}、{{system_prompt}}、{{system_prompt_json}}",
    }, ...__VLS_functionalComponentArgsRest(__VLS_315));
    var __VLS_313;
}
else if (__VLS_ctx.form.accessType === 'AGENT_RUNTIME') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid two-columns" },
    });
    const __VLS_318 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
        label: "运行时类型",
        prop: "runtimeType",
    }));
    const __VLS_320 = __VLS_319({
        label: "运行时类型",
        prop: "runtimeType",
    }, ...__VLS_functionalComponentArgsRest(__VLS_319));
    __VLS_321.slots.default;
    const __VLS_322 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
        modelValue: (__VLS_ctx.form.runtimeType),
        placeholder: "请选择运行时类型",
        ...{ style: {} },
    }));
    const __VLS_324 = __VLS_323({
        modelValue: (__VLS_ctx.form.runtimeType),
        placeholder: "请选择运行时类型",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_323));
    __VLS_325.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.runtimeTypeOptions))) {
        const __VLS_326 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_328 = __VLS_327({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    }
    var __VLS_325;
    var __VLS_321;
    const __VLS_330 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_331 = __VLS_asFunctionalComponent(__VLS_330, new __VLS_330({
        label: "Gateway 地址",
        prop: "endpointUrl",
    }));
    const __VLS_332 = __VLS_331({
        label: "Gateway 地址",
        prop: "endpointUrl",
    }, ...__VLS_functionalComponentArgsRest(__VLS_331));
    __VLS_333.slots.default;
    const __VLS_334 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        modelValue: (__VLS_ctx.form.endpointUrl),
        placeholder: "例如：http://127.0.0.1:8081",
    }));
    const __VLS_336 = __VLS_335({
        modelValue: (__VLS_ctx.form.endpointUrl),
        placeholder: "例如：http://127.0.0.1:8081",
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    var __VLS_333;
    const __VLS_338 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_339 = __VLS_asFunctionalComponent(__VLS_338, new __VLS_338({
        label: "智能体标识",
        prop: "runtimeAgentRef",
    }));
    const __VLS_340 = __VLS_339({
        label: "智能体标识",
        prop: "runtimeAgentRef",
    }, ...__VLS_functionalComponentArgsRest(__VLS_339));
    __VLS_341.slots.default;
    const __VLS_342 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_343 = __VLS_asFunctionalComponent(__VLS_342, new __VLS_342({
        modelValue: (__VLS_ctx.form.runtimeAgentRef),
        placeholder: "例如：planner-agent",
    }));
    const __VLS_344 = __VLS_343({
        modelValue: (__VLS_ctx.form.runtimeAgentRef),
        placeholder: "例如：planner-agent",
    }, ...__VLS_functionalComponentArgsRest(__VLS_343));
    var __VLS_341;
    const __VLS_346 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({
        label: "会话 Key 模板",
    }));
    const __VLS_348 = __VLS_347({
        label: "会话 Key 模板",
    }, ...__VLS_functionalComponentArgsRest(__VLS_347));
    __VLS_349.slots.default;
    const __VLS_350 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_351 = __VLS_asFunctionalComponent(__VLS_350, new __VLS_350({
        modelValue: (__VLS_ctx.form.runtimeSessionKeyTemplate),
        placeholder: "例如：task:{{task_id}}:user:{{user_id}}",
    }));
    const __VLS_352 = __VLS_351({
        modelValue: (__VLS_ctx.form.runtimeSessionKeyTemplate),
        placeholder: "例如：task:{{task_id}}:user:{{user_id}}",
    }, ...__VLS_functionalComponentArgsRest(__VLS_351));
    var __VLS_349;
    const __VLS_354 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_355 = __VLS_asFunctionalComponent(__VLS_354, new __VLS_354({
        label: "认证方式",
    }));
    const __VLS_356 = __VLS_355({
        label: "认证方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_355));
    __VLS_357.slots.default;
    const __VLS_358 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_359 = __VLS_asFunctionalComponent(__VLS_358, new __VLS_358({
        modelValue: (__VLS_ctx.form.httpAuthType),
        ...{ style: {} },
    }));
    const __VLS_360 = __VLS_359({
        modelValue: (__VLS_ctx.form.httpAuthType),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_359));
    __VLS_361.slots.default;
    const __VLS_362 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_363 = __VLS_asFunctionalComponent(__VLS_362, new __VLS_362({
        label: "无",
        value: "NONE",
    }));
    const __VLS_364 = __VLS_363({
        label: "无",
        value: "NONE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_363));
    const __VLS_366 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_367 = __VLS_asFunctionalComponent(__VLS_366, new __VLS_366({
        label: "Bearer Token",
        value: "BEARER",
    }));
    const __VLS_368 = __VLS_367({
        label: "Bearer Token",
        value: "BEARER",
    }, ...__VLS_functionalComponentArgsRest(__VLS_367));
    var __VLS_361;
    var __VLS_357;
    const __VLS_370 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_371 = __VLS_asFunctionalComponent(__VLS_370, new __VLS_370({
        label: "超时时间(秒)",
    }));
    const __VLS_372 = __VLS_371({
        label: "超时时间(秒)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_371));
    __VLS_373.slots.default;
    const __VLS_374 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_375 = __VLS_asFunctionalComponent(__VLS_374, new __VLS_374({
        modelValue: (__VLS_ctx.form.timeoutSeconds),
        min: (5),
        max: (300),
        ...{ style: {} },
    }));
    const __VLS_376 = __VLS_375({
        modelValue: (__VLS_ctx.form.timeoutSeconds),
        min: (5),
        max: (300),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_375));
    var __VLS_373;
    const __VLS_378 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_379 = __VLS_asFunctionalComponent(__VLS_378, new __VLS_378({
        label: "Bearer Token",
        ...{ class: "span-2" },
    }));
    const __VLS_380 = __VLS_379({
        label: "Bearer Token",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_379));
    __VLS_381.slots.default;
    const __VLS_382 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_383 = __VLS_asFunctionalComponent(__VLS_382, new __VLS_382({
        modelValue: (__VLS_ctx.form.httpAuthToken),
        type: "password",
        showPassword: true,
        placeholder: "编辑时留空则沿用已有 Token",
    }));
    const __VLS_384 = __VLS_383({
        modelValue: (__VLS_ctx.form.httpAuthToken),
        type: "password",
        showPassword: true,
        placeholder: "编辑时留空则沿用已有 Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_383));
    var __VLS_381;
    const __VLS_386 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_387 = __VLS_asFunctionalComponent(__VLS_386, new __VLS_386({
        label: "系统提示词",
        ...{ class: "span-2" },
    }));
    const __VLS_388 = __VLS_387({
        label: "系统提示词",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_387));
    __VLS_389.slots.default;
    const __VLS_390 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_391 = __VLS_asFunctionalComponent(__VLS_390, new __VLS_390({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (5),
        placeholder: "运行时级系统提示词，可为空",
    }));
    const __VLS_392 = __VLS_391({
        modelValue: (__VLS_ctx.form.systemPrompt),
        type: "textarea",
        rows: (5),
        placeholder: "运行时级系统提示词，可为空",
    }, ...__VLS_functionalComponentArgsRest(__VLS_391));
    var __VLS_389;
    const __VLS_394 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_395 = __VLS_asFunctionalComponent(__VLS_394, new __VLS_394({
        label: "运行输入模板",
        ...{ class: "span-2" },
    }));
    const __VLS_396 = __VLS_395({
        label: "运行输入模板",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_395));
    __VLS_397.slots.default;
    const __VLS_398 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_399 = __VLS_asFunctionalComponent(__VLS_398, new __VLS_398({
        modelValue: (__VLS_ctx.form.userPromptTemplate),
        type: "textarea",
        rows: (8),
        placeholder: "支持 {{input}}、{{task_id}}、{{task_name}}、{{project_name}}、{{user_id}} 等变量",
    }));
    const __VLS_400 = __VLS_399({
        modelValue: (__VLS_ctx.form.userPromptTemplate),
        type: "textarea",
        rows: (8),
        placeholder: "支持 {{input}}、{{task_id}}、{{task_name}}、{{project_name}}、{{user_id}} 等变量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_399));
    var __VLS_397;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-grid two-columns" },
    });
    const __VLS_402 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_403 = __VLS_asFunctionalComponent(__VLS_402, new __VLS_402({
        label: "接口地址",
        prop: "endpointUrl",
    }));
    const __VLS_404 = __VLS_403({
        label: "接口地址",
        prop: "endpointUrl",
    }, ...__VLS_functionalComponentArgsRest(__VLS_403));
    __VLS_405.slots.default;
    const __VLS_406 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_407 = __VLS_asFunctionalComponent(__VLS_406, new __VLS_406({
        modelValue: (__VLS_ctx.form.endpointUrl),
        placeholder: "例如：http://127.0.0.1:8000/agent/run",
    }));
    const __VLS_408 = __VLS_407({
        modelValue: (__VLS_ctx.form.endpointUrl),
        placeholder: "例如：http://127.0.0.1:8000/agent/run",
    }, ...__VLS_functionalComponentArgsRest(__VLS_407));
    var __VLS_405;
    const __VLS_410 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_411 = __VLS_asFunctionalComponent(__VLS_410, new __VLS_410({
        label: "HTTP 方法",
    }));
    const __VLS_412 = __VLS_411({
        label: "HTTP 方法",
    }, ...__VLS_functionalComponentArgsRest(__VLS_411));
    __VLS_413.slots.default;
    const __VLS_414 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_415 = __VLS_asFunctionalComponent(__VLS_414, new __VLS_414({
        modelValue: (__VLS_ctx.form.httpMethod),
        ...{ style: {} },
    }));
    const __VLS_416 = __VLS_415({
        modelValue: (__VLS_ctx.form.httpMethod),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_415));
    __VLS_417.slots.default;
    const __VLS_418 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_419 = __VLS_asFunctionalComponent(__VLS_418, new __VLS_418({
        label: "POST",
        value: "POST",
    }));
    const __VLS_420 = __VLS_419({
        label: "POST",
        value: "POST",
    }, ...__VLS_functionalComponentArgsRest(__VLS_419));
    const __VLS_422 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_423 = __VLS_asFunctionalComponent(__VLS_422, new __VLS_422({
        label: "PUT",
        value: "PUT",
    }));
    const __VLS_424 = __VLS_423({
        label: "PUT",
        value: "PUT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_423));
    const __VLS_426 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_427 = __VLS_asFunctionalComponent(__VLS_426, new __VLS_426({
        label: "GET",
        value: "GET",
    }));
    const __VLS_428 = __VLS_427({
        label: "GET",
        value: "GET",
    }, ...__VLS_functionalComponentArgsRest(__VLS_427));
    var __VLS_417;
    var __VLS_413;
    const __VLS_430 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_431 = __VLS_asFunctionalComponent(__VLS_430, new __VLS_430({
        label: "认证方式",
    }));
    const __VLS_432 = __VLS_431({
        label: "认证方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_431));
    __VLS_433.slots.default;
    const __VLS_434 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_435 = __VLS_asFunctionalComponent(__VLS_434, new __VLS_434({
        modelValue: (__VLS_ctx.form.httpAuthType),
        ...{ style: {} },
    }));
    const __VLS_436 = __VLS_435({
        modelValue: (__VLS_ctx.form.httpAuthType),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_435));
    __VLS_437.slots.default;
    const __VLS_438 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_439 = __VLS_asFunctionalComponent(__VLS_438, new __VLS_438({
        label: "无",
        value: "NONE",
    }));
    const __VLS_440 = __VLS_439({
        label: "无",
        value: "NONE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_439));
    const __VLS_442 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_443 = __VLS_asFunctionalComponent(__VLS_442, new __VLS_442({
        label: "Bearer Token",
        value: "BEARER",
    }));
    const __VLS_444 = __VLS_443({
        label: "Bearer Token",
        value: "BEARER",
    }, ...__VLS_functionalComponentArgsRest(__VLS_443));
    var __VLS_437;
    var __VLS_433;
    const __VLS_446 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
        label: "超时时间(秒)",
    }));
    const __VLS_448 = __VLS_447({
        label: "超时时间(秒)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_447));
    __VLS_449.slots.default;
    const __VLS_450 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_451 = __VLS_asFunctionalComponent(__VLS_450, new __VLS_450({
        modelValue: (__VLS_ctx.form.timeoutSeconds),
        min: (5),
        max: (300),
        ...{ style: {} },
    }));
    const __VLS_452 = __VLS_451({
        modelValue: (__VLS_ctx.form.timeoutSeconds),
        min: (5),
        max: (300),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_451));
    var __VLS_449;
    const __VLS_454 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_455 = __VLS_asFunctionalComponent(__VLS_454, new __VLS_454({
        label: "Bearer Token",
        ...{ class: "span-2" },
    }));
    const __VLS_456 = __VLS_455({
        label: "Bearer Token",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_455));
    __VLS_457.slots.default;
    const __VLS_458 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_459 = __VLS_asFunctionalComponent(__VLS_458, new __VLS_458({
        modelValue: (__VLS_ctx.form.httpAuthToken),
        type: "password",
        showPassword: true,
        placeholder: "编辑时留空则沿用已有 Token",
    }));
    const __VLS_460 = __VLS_459({
        modelValue: (__VLS_ctx.form.httpAuthToken),
        type: "password",
        showPassword: true,
        placeholder: "编辑时留空则沿用已有 Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_459));
    var __VLS_457;
    const __VLS_462 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_463 = __VLS_asFunctionalComponent(__VLS_462, new __VLS_462({
        label: "Headers(JSON)",
        ...{ class: "span-2" },
    }));
    const __VLS_464 = __VLS_463({
        label: "Headers(JSON)",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_463));
    __VLS_465.slots.default;
    const __VLS_466 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_467 = __VLS_asFunctionalComponent(__VLS_466, new __VLS_466({
        modelValue: (__VLS_ctx.form.httpHeaders),
        type: "textarea",
        rows: (4),
        placeholder: '例如：{"X-App":"agent-platform"}',
    }));
    const __VLS_468 = __VLS_467({
        modelValue: (__VLS_ctx.form.httpHeaders),
        type: "textarea",
        rows: (4),
        placeholder: '例如：{"X-App":"agent-platform"}',
    }, ...__VLS_functionalComponentArgsRest(__VLS_467));
    var __VLS_465;
    const __VLS_470 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_471 = __VLS_asFunctionalComponent(__VLS_470, new __VLS_470({
        label: "请求模板",
        ...{ class: "span-2" },
    }));
    const __VLS_472 = __VLS_471({
        label: "请求模板",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_471));
    __VLS_473.slots.default;
    const __VLS_474 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_475 = __VLS_asFunctionalComponent(__VLS_474, new __VLS_474({
        modelValue: (__VLS_ctx.form.httpRequestTemplate),
        type: "textarea",
        rows: (7),
        placeholder: '默认发送 {"input":"..."}；也可自定义模板，支持 {{input}}、{{input_json}}',
    }));
    const __VLS_476 = __VLS_475({
        modelValue: (__VLS_ctx.form.httpRequestTemplate),
        type: "textarea",
        rows: (7),
        placeholder: '默认发送 {"input":"..."}；也可自定义模板，支持 {{input}}、{{input_json}}',
    }, ...__VLS_functionalComponentArgsRest(__VLS_475));
    var __VLS_473;
    const __VLS_478 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_479 = __VLS_asFunctionalComponent(__VLS_478, new __VLS_478({
        label: "响应路径",
        ...{ class: "span-2" },
    }));
    const __VLS_480 = __VLS_479({
        label: "响应路径",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_479));
    __VLS_481.slots.default;
    const __VLS_482 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_483 = __VLS_asFunctionalComponent(__VLS_482, new __VLS_482({
        modelValue: (__VLS_ctx.form.httpResponsePath),
        placeholder: "可选，例如 data.content 或 result.output",
    }));
    const __VLS_484 = __VLS_483({
        modelValue: (__VLS_ctx.form.httpResponsePath),
        placeholder: "可选，例如 data.content 或 result.output",
    }, ...__VLS_functionalComponentArgsRest(__VLS_483));
    var __VLS_481;
}
var __VLS_163;
{
    const { footer: __VLS_thisSlot } = __VLS_159.slots;
    const __VLS_486 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_487 = __VLS_asFunctionalComponent(__VLS_486, new __VLS_486({
        ...{ 'onClick': {} },
    }));
    const __VLS_488 = __VLS_487({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_487));
    let __VLS_490;
    let __VLS_491;
    let __VLS_492;
    const __VLS_493 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_489.slots.default;
    (__VLS_ctx.readonlyMode ? '关闭' : '取消');
    var __VLS_489;
    if (!__VLS_ctx.readonlyMode) {
        const __VLS_494 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_495 = __VLS_asFunctionalComponent(__VLS_494, new __VLS_494({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_496 = __VLS_495({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_495));
        let __VLS_498;
        let __VLS_499;
        let __VLS_500;
        const __VLS_501 = {
            onClick: (__VLS_ctx.handleSubmit)
        };
        __VLS_497.slots.default;
        var __VLS_497;
    }
}
var __VLS_159;
const __VLS_502 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_503 = __VLS_asFunctionalComponent(__VLS_502, new __VLS_502({
    modelValue: (__VLS_ctx.testDialogVisible),
    title: "测试智能体",
    width: "760px",
    destroyOnClose: true,
}));
const __VLS_504 = __VLS_503({
    modelValue: (__VLS_ctx.testDialogVisible),
    title: "测试智能体",
    width: "760px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_503));
__VLS_505.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "test-title" },
});
(__VLS_ctx.currentTestAgent?.name || '-');
const __VLS_506 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_507 = __VLS_asFunctionalComponent(__VLS_506, new __VLS_506({
    modelValue: (__VLS_ctx.testInput),
    type: "textarea",
    rows: (10),
    placeholder: "请输入测试内容",
}));
const __VLS_508 = __VLS_507({
    modelValue: (__VLS_ctx.testInput),
    type: "textarea",
    rows: (10),
    placeholder: "请输入测试内容",
}, ...__VLS_functionalComponentArgsRest(__VLS_507));
{
    const { footer: __VLS_thisSlot } = __VLS_505.slots;
    const __VLS_510 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_511 = __VLS_asFunctionalComponent(__VLS_510, new __VLS_510({
        ...{ 'onClick': {} },
    }));
    const __VLS_512 = __VLS_511({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_511));
    let __VLS_514;
    let __VLS_515;
    let __VLS_516;
    const __VLS_517 = {
        onClick: (...[$event]) => {
            __VLS_ctx.testDialogVisible = false;
        }
    };
    __VLS_513.slots.default;
    var __VLS_513;
    const __VLS_518 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_519 = __VLS_asFunctionalComponent(__VLS_518, new __VLS_518({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.testing),
    }));
    const __VLS_520 = __VLS_519({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.testing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_519));
    let __VLS_522;
    let __VLS_523;
    let __VLS_524;
    const __VLS_525 = {
        onClick: (__VLS_ctx.handleTest)
    };
    __VLS_521.slots.default;
    var __VLS_521;
}
if (__VLS_ctx.testResult) {
    const __VLS_526 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_527 = __VLS_asFunctionalComponent(__VLS_526, new __VLS_526({
        title: (__VLS_ctx.testResult.message),
        type: (__VLS_ctx.testResult.success ? 'success' : 'error'),
        showIcon: true,
        closable: (false),
        ...{ class: "test-result-alert" },
    }));
    const __VLS_528 = __VLS_527({
        title: (__VLS_ctx.testResult.message),
        type: (__VLS_ctx.testResult.success ? 'success' : 'error'),
        showIcon: true,
        closable: (false),
        ...{ class: "test-result-alert" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_527));
}
if (__VLS_ctx.testResult) {
    const __VLS_530 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_531 = __VLS_asFunctionalComponent(__VLS_530, new __VLS_530({
        column: (2),
        border: true,
        ...{ class: "test-meta" },
    }));
    const __VLS_532 = __VLS_531({
        column: (2),
        border: true,
        ...{ class: "test-meta" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_531));
    __VLS_533.slots.default;
    const __VLS_534 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_535 = __VLS_asFunctionalComponent(__VLS_534, new __VLS_534({
        label: "智能体",
    }));
    const __VLS_536 = __VLS_535({
        label: "智能体",
    }, ...__VLS_functionalComponentArgsRest(__VLS_535));
    __VLS_537.slots.default;
    (__VLS_ctx.testResult.agentName);
    var __VLS_537;
    const __VLS_538 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_539 = __VLS_asFunctionalComponent(__VLS_538, new __VLS_538({
        label: "测试时间",
    }));
    const __VLS_540 = __VLS_539({
        label: "测试时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_539));
    __VLS_541.slots.default;
    (__VLS_ctx.testResult.testedAt);
    var __VLS_541;
    var __VLS_533;
}
if (__VLS_ctx.testResult?.output) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "test-output" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "test-output-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
    (__VLS_ctx.testResult.output);
}
var __VLS_505;
/** @type {__VLS_StyleScopedClasses['atelier-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-page']} */ ;
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
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-field']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-filter-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-toolbar-side']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-create-button']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-list']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-list']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-list-head']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-access']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-runtime']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-category']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-head-item']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-row']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-project']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-access']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['info']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-runtime']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-category']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-data-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['agent-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['atelier-empty-state']} */ ;
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
/** @type {__VLS_StyleScopedClasses['agent-dialog-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['access-type-group']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['two-columns']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['test-title']} */ ;
/** @type {__VLS_StyleScopedClasses['test-result-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['test-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['test-output']} */ ;
/** @type {__VLS_StyleScopedClasses['test-output-title']} */ ;
// @ts-ignore
var __VLS_165 = __VLS_164;
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
            Promotion: Promotion,
            RefreshRight: RefreshRight,
            Search: Search,
            categoryOptions: categoryOptions,
            typeOptions: typeOptions,
            statusOptions: statusOptions,
            accessTypeOptions: accessTypeOptions,
            builtinOptions: builtinOptions,
            runtimeTypeOptions: runtimeTypeOptions,
            loading: loading,
            submitting: submitting,
            testing: testing,
            dialogVisible: dialogVisible,
            testDialogVisible: testDialogVisible,
            readonlyMode: readonlyMode,
            agentList: agentList,
            modelOptions: modelOptions,
            projectOptions: projectOptions,
            currentTestAgent: currentTestAgent,
            testResult: testResult,
            testInput: testInput,
            formRef: formRef,
            pagination: pagination,
            totalPages: totalPages,
            filters: filters,
            agentFilterPopoverVisible: agentFilterPopoverVisible,
            form: form,
            rules: rules,
            accessTypeLabel: accessTypeLabel,
            agentAccessIcon: agentAccessIcon,
            agentStatusTone: agentStatusTone,
            agentRuntimeLabel: agentRuntimeLabel,
            dialogTitle: dialogTitle,
            handleSearch: handleSearch,
            handleReset: handleReset,
            handleSizeChange: handleSizeChange,
            handlePrevPage: handlePrevPage,
            handleNextPage: handleNextPage,
            openCreateDialog: openCreateDialog,
            openDetailDialog: openDetailDialog,
            openEditDialog: openEditDialog,
            goToProject: goToProject,
            handleSubmit: handleSubmit,
            openTestDialog: openTestDialog,
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
//# sourceMappingURL=AgentView.vue.js.map