/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute, useRouter } from 'vue-router';
import { getProjectDetail, getProjectKnowledgeGraph, rebuildProjectKnowledgeGraph } from '@/api/platform';
const KnowledgeGraphCanvas = defineAsyncComponent(() => import('@/components/KnowledgeGraphCanvas.vue'));
const route = useRoute();
const router = useRouter();
const projectId = Number(route.params.projectId);
const projectName = ref('');
const graph = ref(null);
const loading = ref(false);
const rebuilding = ref(false);
const nodeTypeFilter = ref('');
const layoutMode = ref('cluster');
const selectedNodeId = ref(null);
const selectedEdgeId = ref(null);
const layoutOptions = [
    { label: '平铺', value: 'flat' },
    { label: '环形', value: 'ring' },
    { label: '聚簇', value: 'cluster' },
    { label: '网格', value: 'grid' }
];
const nodeTypeOrder = ['PROJECT', 'ITERATION', 'REQUIREMENT', 'TASK', 'BUG', 'TEST_PLAN', 'TEST_CASE', 'USER', 'AGENT'];
const currentLayoutLabel = computed(() => layoutOptions.find((item) => item.value === layoutMode.value)?.label || layoutMode.value);
const nodeTypeOptions = computed(() => {
    const values = new Set((graph.value?.nodes || []).map((item) => item.nodeType));
    return nodeTypeOrder.filter((item) => values.has(item));
});
const nodeMap = computed(() => {
    const result = new Map();
    for (const item of graph.value?.nodes || []) {
        result.set(item.id, item);
    }
    return result;
});
const filteredNodes = computed(() => {
    if (!nodeTypeFilter.value)
        return graph.value?.nodes || [];
    return (graph.value?.nodes || []).filter((item) => item.nodeType === nodeTypeFilter.value);
});
const visibleNodeIds = computed(() => {
    if (!nodeTypeFilter.value) {
        return new Set((graph.value?.nodes || []).map((item) => item.id));
    }
    const selectedIds = new Set(filteredNodes.value.map((item) => item.id));
    for (const edge of graph.value?.edges || []) {
        if (selectedIds.has(edge.fromNodeId) || selectedIds.has(edge.toNodeId)) {
            selectedIds.add(edge.fromNodeId);
            selectedIds.add(edge.toNodeId);
        }
    }
    return selectedIds;
});
const visibleNodes = computed(() => (graph.value?.nodes || []).filter((item) => visibleNodeIds.value.has(item.id)));
const visibleEdges = computed(() => (graph.value?.edges || []).filter((item) => visibleNodeIds.value.has(item.fromNodeId) && visibleNodeIds.value.has(item.toNodeId)));
const edgeRows = computed(() => visibleEdges.value.map((item) => ({
    ...item,
    fromName: nodeMap.value.get(item.fromNodeId)?.name || `#${item.fromNodeId}`,
    toName: nodeMap.value.get(item.toNodeId)?.name || `#${item.toNodeId}`
})));
const selectedNode = computed(() => visibleNodes.value.find((item) => item.id === selectedNodeId.value) || null);
const selectedEdge = computed(() => edgeRows.value.find((item) => item.id === selectedEdgeId.value) || null);
const parseMetadata = (value) => {
    if (!value)
        return {};
    try {
        return JSON.parse(value);
    }
    catch {
        return {};
    }
};
const selectedNodeMetaEntries = computed(() => {
    const meta = parseMetadata(selectedNode.value?.metadataJson);
    return Object.entries(meta).map(([key, value]) => ({
        key,
        value: String(value)
    }));
});
const selectedNodeEdges = computed(() => {
    if (!selectedNode.value)
        return [];
    return edgeRows.value
        .filter((item) => item.fromNodeId === selectedNode.value?.id || item.toNodeId === selectedNode.value?.id)
        .map((item) => ({
        ...item,
        otherName: item.fromNodeId === selectedNode.value?.id ? item.toName : item.fromName
    }));
});
const nodeTypeLabel = (nodeType) => {
    const map = {
        PROJECT: '项目',
        ITERATION: '迭代',
        REQUIREMENT: '需求',
        TASK: '任务',
        BUG: '缺陷',
        TEST_PLAN: '测试计划',
        TEST_CASE: '测试用例',
        USER: '用户',
        AGENT: 'Agent'
    };
    return map[nodeType] || nodeType;
};
const nodeTagType = (nodeType) => {
    if (nodeType === 'PROJECT')
        return 'primary';
    if (nodeType === 'ITERATION')
        return 'success';
    if (nodeType === 'REQUIREMENT')
        return 'warning';
    if (nodeType === 'BUG')
        return 'danger';
    return 'info';
};
const nodeColor = (nodeType) => {
    const map = {
        PROJECT: '#1f7a8c',
        ITERATION: '#2fa56b',
        REQUIREMENT: '#f59e0b',
        TASK: '#3b82f6',
        BUG: '#e25555',
        TEST_PLAN: '#f97316',
        TEST_CASE: '#f8b55a',
        USER: '#7c8ea3',
        AGENT: '#475569'
    };
    return map[nodeType] || '#7c8ea3';
};
const loadProject = async () => {
    const project = await getProjectDetail(projectId);
    projectName.value = project.name;
};
const loadGraph = async (refresh = false) => {
    loading.value = true;
    try {
        graph.value = await getProjectKnowledgeGraph(projectId, refresh);
    }
    finally {
        loading.value = false;
    }
};
const handleRebuild = async () => {
    rebuilding.value = true;
    try {
        graph.value = await rebuildProjectKnowledgeGraph(projectId);
        ElMessage.success('知识图谱已重建');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '重建失败');
    }
    finally {
        rebuilding.value = false;
    }
};
const handleSelectNode = (id) => {
    selectedNodeId.value = id;
    selectedEdgeId.value = null;
};
const handleSelectEdge = (id) => {
    selectedEdgeId.value = id;
    selectedNodeId.value = null;
};
const handleClearSelection = () => {
    selectedNodeId.value = null;
    selectedEdgeId.value = null;
};
const handleNodeRowClick = (row) => {
    handleSelectNode(row.id);
};
const handleEdgeRowClick = (row) => {
    handleSelectEdge(row.id);
};
const goBack = () => {
    router.push({ name: 'projects' });
};
watch(() => graph.value, (value) => {
    if (!value?.nodes.length) {
        selectedNodeId.value = null;
        selectedEdgeId.value = null;
        return;
    }
    const projectNode = value.nodes.find((item) => item.nodeType === 'PROJECT');
    selectedNodeId.value = projectNode?.id || value.nodes[0].id;
    selectedEdgeId.value = null;
}, { immediate: true });
watch(nodeTypeFilter, () => {
    if (selectedNodeId.value && !visibleNodeIds.value.has(selectedNodeId.value)) {
        const nextNode = visibleNodes.value[0];
        selectedNodeId.value = nextNode?.id || null;
    }
    if (selectedEdgeId.value && !visibleEdges.value.some((item) => item.id === selectedEdgeId.value)) {
        selectedEdgeId.value = null;
    }
});
onMounted(async () => {
    if (Number.isNaN(projectId) || projectId <= 0) {
        ElMessage.error('项目参数不正确');
        goBack();
        return;
    }
    try {
        await Promise.all([loadProject(), loadGraph()]);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.message || '加载知识图谱失败');
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['main-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "knowledge-graph-page" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ class: "page-card" },
    shadow: "never",
}));
const __VLS_2 = __VLS_1({
    ...{ class: "page-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    text: true,
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    text: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.goBack)
};
__VLS_7.slots.default;
var __VLS_7;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-title" },
});
(__VLS_ctx.projectName || '知识图谱');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-subtitle" },
});
const __VLS_12 = {}.ElSpace;
/** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    wrap: true,
}));
const __VLS_14 = __VLS_13({
    wrap: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.layoutMode),
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.layoutMode),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.layoutOptions))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_22 = __VLS_21({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_19;
const __VLS_24 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    modelValue: (__VLS_ctx.nodeTypeFilter),
    clearable: true,
    placeholder: "筛选节点类型",
    ...{ style: {} },
}));
const __VLS_26 = __VLS_25({
    modelValue: (__VLS_ctx.nodeTypeFilter),
    clearable: true,
    placeholder: "筛选节点类型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.nodeTypeOptions))) {
    const __VLS_28 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        key: (item),
        label: (__VLS_ctx.nodeTypeLabel(item)),
        value: (item),
    }));
    const __VLS_30 = __VLS_29({
        key: (item),
        label: (__VLS_ctx.nodeTypeLabel(item)),
        value: (item),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
}
var __VLS_27;
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (...[$event]) => {
        __VLS_ctx.loadGraph(true);
    }
};
__VLS_35.slots.default;
var __VLS_35;
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.rebuilding),
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.rebuilding),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.handleRebuild)
};
__VLS_43.slots.default;
var __VLS_43;
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stats-grid" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.graph?.projectId ?? __VLS_ctx.projectId);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.currentLayoutLabel);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.visibleNodes.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.visibleEdges.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "stat-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "stat-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.graph?.generatedAt || '-');
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "main-grid" },
});
const __VLS_48 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ class: "page-card graph-card" },
    shadow: "never",
}));
const __VLS_50 = __VLS_49({
    ...{ class: "page-card graph-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_51.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_52 = {}.ElSpace;
    /** @type {[typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, typeof __VLS_components.ElSpace, typeof __VLS_components.elSpace, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        wrap: true,
    }));
    const __VLS_54 = __VLS_53({
        wrap: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        type: "info",
    }));
    const __VLS_58 = __VLS_57({
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    (__VLS_ctx.visibleNodes.length);
    var __VLS_59;
    const __VLS_60 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        type: "info",
    }));
    const __VLS_62 = __VLS_61({
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    (__VLS_ctx.visibleEdges.length);
    var __VLS_63;
    var __VLS_55;
}
const __VLS_64 = {}.KnowledgeGraphCanvas;
/** @type {[typeof __VLS_components.KnowledgeGraphCanvas, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onSelectNode': {} },
    ...{ 'onSelectEdge': {} },
    ...{ 'onClearSelection': {} },
    nodes: (__VLS_ctx.visibleNodes),
    edges: (__VLS_ctx.visibleEdges),
    layoutMode: (__VLS_ctx.layoutMode),
    selectedNodeId: (__VLS_ctx.selectedNodeId),
    selectedEdgeId: (__VLS_ctx.selectedEdgeId),
}));
const __VLS_66 = __VLS_65({
    ...{ 'onSelectNode': {} },
    ...{ 'onSelectEdge': {} },
    ...{ 'onClearSelection': {} },
    nodes: (__VLS_ctx.visibleNodes),
    edges: (__VLS_ctx.visibleEdges),
    layoutMode: (__VLS_ctx.layoutMode),
    selectedNodeId: (__VLS_ctx.selectedNodeId),
    selectedEdgeId: (__VLS_ctx.selectedEdgeId),
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onSelectNode: (__VLS_ctx.handleSelectNode)
};
const __VLS_72 = {
    onSelectEdge: (__VLS_ctx.handleSelectEdge)
};
const __VLS_73 = {
    onClearSelection: (__VLS_ctx.handleClearSelection)
};
var __VLS_67;
var __VLS_51;
const __VLS_74 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
    ...{ class: "page-card detail-card" },
    shadow: "never",
}));
const __VLS_76 = __VLS_75({
    ...{ class: "page-card detail-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_75));
__VLS_77.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_77.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.selectedNode) {
        const __VLS_78 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({
            ...{ style: ({ background: __VLS_ctx.nodeColor(__VLS_ctx.selectedNode.nodeType), color: '#fff', border: 'none' }) },
        }));
        const __VLS_80 = __VLS_79({
            ...{ style: ({ background: __VLS_ctx.nodeColor(__VLS_ctx.selectedNode.nodeType), color: '#fff', border: 'none' }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_79));
        __VLS_81.slots.default;
        (__VLS_ctx.nodeTypeLabel(__VLS_ctx.selectedNode.nodeType));
        var __VLS_81;
    }
    else if (__VLS_ctx.selectedEdge) {
        const __VLS_82 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
            type: "info",
        }));
        const __VLS_84 = __VLS_83({
            type: "info",
        }, ...__VLS_functionalComponentArgsRest(__VLS_83));
        __VLS_85.slots.default;
        (__VLS_ctx.selectedEdge.edgeType);
        var __VLS_85;
    }
}
if (__VLS_ctx.selectedNode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-title" },
    });
    (__VLS_ctx.selectedNode.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.selectedNode.bizId);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.nodeTypeLabel(__VLS_ctx.selectedNode.nodeType));
    if (__VLS_ctx.selectedNode.description) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block-content" },
        });
        (__VLS_ctx.selectedNode.description);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-block-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "meta-grid" },
    });
    for (const [entry] of __VLS_getVForSourceType((__VLS_ctx.selectedNodeMetaEntries))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (entry.key),
            ...{ class: "meta-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-key" },
        });
        (entry.key);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-value" },
        });
        (entry.value);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-block-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "relation-chips" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.selectedNodeEdges))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            key: (item.id),
            ...{ class: "relation-chip" },
        });
        (item.edgeType);
        (item.otherName);
    }
}
else if (__VLS_ctx.selectedEdge) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-title" },
    });
    (__VLS_ctx.selectedEdge.edgeType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.selectedEdge.fromName);
    (__VLS_ctx.selectedEdge.toName);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.selectedEdge.status);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.selectedEdge.sourceType);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "detail-meta" },
    });
    (__VLS_ctx.selectedEdge.confidence ?? '-');
    if (__VLS_ctx.selectedEdge.evidenceText) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "detail-block-content" },
        });
        (__VLS_ctx.selectedEdge.evidenceText);
    }
}
else {
    const __VLS_86 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_87 = __VLS_asFunctionalComponent(__VLS_86, new __VLS_86({
        description: "点击图中的节点或边查看详情",
    }));
    const __VLS_88 = __VLS_87({
        description: "点击图中的节点或边查看详情",
    }, ...__VLS_functionalComponentArgsRest(__VLS_87));
}
var __VLS_77;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "content-grid" },
});
const __VLS_90 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
    ...{ class: "page-card" },
    shadow: "never",
}));
const __VLS_92 = __VLS_91({
    ...{ class: "page-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_91));
__VLS_93.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_93.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_94 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
        type: "info",
    }));
    const __VLS_96 = __VLS_95({
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_95));
    __VLS_97.slots.default;
    (__VLS_ctx.filteredNodes.length);
    var __VLS_97;
}
const __VLS_98 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.filteredNodes),
    height: "420",
}));
const __VLS_100 = __VLS_99({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.filteredNodes),
    height: "420",
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
let __VLS_102;
let __VLS_103;
let __VLS_104;
const __VLS_105 = {
    onRowClick: (__VLS_ctx.handleNodeRowClick)
};
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_101.slots.default;
const __VLS_106 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
    label: "类型",
    width: "120",
}));
const __VLS_108 = __VLS_107({
    label: "类型",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_107));
__VLS_109.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_109.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_110 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
        type: (__VLS_ctx.nodeTagType(row.nodeType)),
    }));
    const __VLS_112 = __VLS_111({
        type: (__VLS_ctx.nodeTagType(row.nodeType)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_111));
    __VLS_113.slots.default;
    (__VLS_ctx.nodeTypeLabel(row.nodeType));
    var __VLS_113;
}
var __VLS_109;
const __VLS_114 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_115 = __VLS_asFunctionalComponent(__VLS_114, new __VLS_114({
    prop: "name",
    label: "名称",
    minWidth: "180",
    showOverflowTooltip: true,
}));
const __VLS_116 = __VLS_115({
    prop: "name",
    label: "名称",
    minWidth: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_115));
const __VLS_118 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_119 = __VLS_asFunctionalComponent(__VLS_118, new __VLS_118({
    prop: "bizId",
    label: "业务ID",
    width: "110",
}));
const __VLS_120 = __VLS_119({
    prop: "bizId",
    label: "业务ID",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_119));
const __VLS_122 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_123 = __VLS_asFunctionalComponent(__VLS_122, new __VLS_122({
    prop: "description",
    label: "说明",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_124 = __VLS_123({
    prop: "description",
    label: "说明",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_123));
var __VLS_101;
var __VLS_93;
const __VLS_126 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_127 = __VLS_asFunctionalComponent(__VLS_126, new __VLS_126({
    ...{ class: "page-card" },
    shadow: "never",
}));
const __VLS_128 = __VLS_127({
    ...{ class: "page-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_127));
__VLS_129.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_129.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_130 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({
        type: "info",
    }));
    const __VLS_132 = __VLS_131({
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_131));
    __VLS_133.slots.default;
    (__VLS_ctx.edgeRows.length);
    var __VLS_133;
}
const __VLS_134 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.edgeRows),
    height: "420",
}));
const __VLS_136 = __VLS_135({
    ...{ 'onRowClick': {} },
    data: (__VLS_ctx.edgeRows),
    height: "420",
}, ...__VLS_functionalComponentArgsRest(__VLS_135));
let __VLS_138;
let __VLS_139;
let __VLS_140;
const __VLS_141 = {
    onRowClick: (__VLS_ctx.handleEdgeRowClick)
};
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_137.slots.default;
const __VLS_142 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
    prop: "edgeType",
    label: "关系类型",
    width: "180",
}));
const __VLS_144 = __VLS_143({
    prop: "edgeType",
    label: "关系类型",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_143));
const __VLS_146 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    prop: "fromName",
    label: "起点",
    minWidth: "180",
    showOverflowTooltip: true,
}));
const __VLS_148 = __VLS_147({
    prop: "fromName",
    label: "起点",
    minWidth: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
const __VLS_150 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
    prop: "toName",
    label: "终点",
    minWidth: "180",
    showOverflowTooltip: true,
}));
const __VLS_152 = __VLS_151({
    prop: "toName",
    label: "终点",
    minWidth: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_151));
const __VLS_154 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
    prop: "status",
    label: "状态",
    width: "120",
}));
const __VLS_156 = __VLS_155({
    prop: "status",
    label: "状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_155));
const __VLS_158 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    label: "置信度",
    width: "100",
}));
const __VLS_160 = __VLS_159({
    label: "置信度",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_161.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.confidence ?? '-');
}
var __VLS_161;
var __VLS_137;
var __VLS_129;
/** @type {__VLS_StyleScopedClasses['knowledge-graph-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['stats-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['main-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['graph-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-content']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-item']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-key']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-value']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['relation-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['relation-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['detail-block-content']} */ ;
/** @type {__VLS_StyleScopedClasses['content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-header']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            KnowledgeGraphCanvas: KnowledgeGraphCanvas,
            projectId: projectId,
            projectName: projectName,
            graph: graph,
            loading: loading,
            rebuilding: rebuilding,
            nodeTypeFilter: nodeTypeFilter,
            layoutMode: layoutMode,
            selectedNodeId: selectedNodeId,
            selectedEdgeId: selectedEdgeId,
            layoutOptions: layoutOptions,
            currentLayoutLabel: currentLayoutLabel,
            nodeTypeOptions: nodeTypeOptions,
            filteredNodes: filteredNodes,
            visibleNodes: visibleNodes,
            visibleEdges: visibleEdges,
            edgeRows: edgeRows,
            selectedNode: selectedNode,
            selectedEdge: selectedEdge,
            selectedNodeMetaEntries: selectedNodeMetaEntries,
            selectedNodeEdges: selectedNodeEdges,
            nodeTypeLabel: nodeTypeLabel,
            nodeTagType: nodeTagType,
            nodeColor: nodeColor,
            loadGraph: loadGraph,
            handleRebuild: handleRebuild,
            handleSelectNode: handleSelectNode,
            handleSelectEdge: handleSelectEdge,
            handleClearSelection: handleClearSelection,
            handleNodeRowClick: handleNodeRowClick,
            handleEdgeRowClick: handleEdgeRowClick,
            goBack: goBack,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=KnowledgeGraphView.vue.js.map