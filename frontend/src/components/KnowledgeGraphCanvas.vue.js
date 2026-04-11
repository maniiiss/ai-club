/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ElEmpty } from 'element-plus';
import { ConcentricLayout, ForceLayout, Graph as G6Graph } from '@antv/g6';
const props = defineProps();
const emit = defineEmits();
const graphContainerRef = ref(null);
const containerWidth = ref(1100);
const containerHeight = ref(680);
let graphInstance = null;
let resizeObserver = null;
let renderToken = 0;
const nodeTypeOrder = ['PROJECT', 'ITERATION', 'REQUIREMENT', 'TASK', 'BUG', 'TEST_PLAN', 'TEST_CASE', 'USER', 'AGENT'];
const nodeTypeOptions = computed(() => {
    const values = new Set(props.nodes.map((item) => item.nodeType));
    return nodeTypeOrder.filter((item) => values.has(item));
});
const selectedNode = computed(() => props.nodes.find((item) => item.id === props.selectedNodeId) || null);
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
const edgeColor = (edgeType) => {
    if (edgeType.includes('TEST'))
        return '#f59e0b';
    if (edgeType.includes('AGENT'))
        return '#64748b';
    if (edgeType.includes('ASSIGNED') || edgeType.includes('MEMBER') || edgeType.includes('OWNED'))
        return '#1f7a8c';
    if (edgeType.includes('REQUIREMENT'))
        return '#f59e0b';
    return '#8ca0b3';
};
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
const truncate = (value, max) => {
    if (!value)
        return '';
    return value.length > max ? `${value.slice(0, max)}…` : value;
};
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
const nodeSecondary = (node) => {
    const meta = parseMetadata(node.metadataJson);
    return String(meta.status || meta.priority || meta.category || meta.type || meta.username || '');
};
const comboId = (nodeType) => `combo-${nodeType.toLowerCase()}`;
const buildPresetPositions = (nodes) => {
    const grouped = new Map();
    for (const type of nodeTypeOptions.value)
        grouped.set(type, []);
    nodes.forEach((node) => {
        const bucket = grouped.get(node.nodeType) || [];
        bucket.push(node);
        grouped.set(node.nodeType, bucket);
    });
    const width = Math.max(containerWidth.value, 980);
    const height = Math.max(containerHeight.value, 620);
    const sidePadding = 100;
    const topPadding = 100;
    const bottomPadding = 80;
    const columnCount = Math.max(nodeTypeOptions.value.length, 1);
    const columnGap = columnCount === 1 ? 0 : (width - sidePadding * 2) / (columnCount - 1);
    const result = new Map();
    nodeTypeOptions.value.forEach((type, columnIndex) => {
        const items = grouped.get(type) || [];
        const count = Math.max(items.length, 1);
        const availableHeight = Math.max(height - topPadding - bottomPadding, 1);
        const rowGap = count === 1 ? 0 : availableHeight / (count - 1);
        items.forEach((item, rowIndex) => {
            result.set(item.id, {
                x: sidePadding + columnIndex * columnGap,
                y: topPadding + rowIndex * rowGap
            });
        });
    });
    return result;
};
const graphData = computed(() => {
    const positions = buildPresetPositions(props.nodes);
    const useCombos = props.layoutMode === 'cluster';
    const nodes = props.nodes.map((item) => {
        const position = positions.get(item.id);
        return {
            id: String(item.id),
            combo: useCombos && item.nodeType !== 'PROJECT' ? comboId(item.nodeType) : undefined,
            data: {
                bizId: item.bizId,
                name: item.name,
                description: item.description,
                nodeType: item.nodeType,
                secondary: nodeSecondary(item),
                metadataJson: item.metadataJson
            },
            style: props.layoutMode === 'flat' && position
                ? {
                    x: position.x,
                    y: position.y
                }
                : undefined
        };
    });
    const edges = props.edges.map((item) => ({
        id: String(item.id),
        source: String(item.fromNodeId),
        target: String(item.toNodeId),
        data: {
            edgeType: item.edgeType,
            status: item.status,
            sourceType: item.sourceType,
            confidence: item.confidence,
            evidenceText: item.evidenceText
        }
    }));
    const combos = useCombos
        ? nodeTypeOptions.value
            .filter((type) => type !== 'PROJECT' && props.nodes.some((item) => item.nodeType === type))
            .map((type) => ({
            id: comboId(type),
            data: {
                label: nodeTypeLabel(type),
                nodeType: type
            }
        }))
        : [];
    return { nodes, edges, combos };
});
const createLayoutConfig = () => {
    const width = Math.max(containerWidth.value, 980);
    const height = Math.max(containerHeight.value, 620);
    const center = [width / 2, height / 2];
    const common = { width, height, center };
    if (props.layoutMode === 'grid') {
        return {
            type: 'grid',
            ...common,
            preventOverlap: true,
            cols: Math.max(Math.ceil(Math.sqrt(Math.max(props.nodes.length, 1))), 3)
        };
    }
    if (props.layoutMode === 'ring') {
        return {
            type: 'circular',
            ...common,
            startAngle: -Math.PI / 2,
            endAngle: (Math.PI * 3) / 2,
            clockwise: true,
            divisions: 1
        };
    }
    if (props.layoutMode === 'cluster') {
        return {
            type: 'combo-combined',
            ...common,
            comboPadding: 32,
            spacing: 22,
            outerLayout: new ForceLayout({
                ...common,
                gravity: 0.8,
                linkDistance: 220,
                preventOverlap: true,
                nodeSize: 42
            }),
            innerLayout: new ConcentricLayout({
                ...common,
                preventOverlap: true,
                nodeSpacing: 16,
                sortBy: 'id'
            })
        };
    }
    return undefined;
};
const initGraph = async () => {
    const container = graphContainerRef.value;
    if (!container || !props.nodes.length) {
        if (graphInstance) {
            graphInstance.destroy();
            graphInstance = null;
        }
        return;
    }
    const currentToken = ++renderToken;
    const width = Math.max(container.clientWidth, 980);
    const height = Math.max(container.clientHeight, 620);
    containerWidth.value = width;
    containerHeight.value = height;
    if (graphInstance) {
        graphInstance.destroy();
        graphInstance = null;
    }
    graphInstance = new G6Graph({
        container,
        width,
        height,
        autoFit: 'view',
        animation: true,
        data: graphData.value,
        layout: createLayoutConfig(),
        node: {
            type: 'rect',
            style: {
                size: [174, 68],
                radius: 18,
                lineWidth: 1.6,
                fill: (datum) => `${nodeColor(String(datum.data?.nodeType || ''))}18`,
                stroke: (datum) => nodeColor(String(datum.data?.nodeType || '')),
                shadowColor: 'rgba(15, 23, 42, 0.08)',
                shadowBlur: 10,
                shadowOffsetY: 4,
                labelText: (datum) => truncate(String(datum.data?.name || ''), 14),
                labelFontWeight: 700,
                labelFontSize: 14,
                labelFill: '#17324c',
                labelPlacement: 'center'
            },
            state: {
                selected: { lineWidth: 3, shadowBlur: 18, shadowColor: 'rgba(23, 50, 76, 0.18)' },
                related: { lineWidth: 2.4 },
                dimmed: { opacity: 0.22 }
            }
        },
        combo: {
            type: 'rect',
            style: {
                radius: 24,
                fill: (datum) => `${nodeColor(String(datum.data?.nodeType || ''))}10`,
                stroke: (datum) => `${nodeColor(String(datum.data?.nodeType || ''))}88`,
                lineWidth: 1.8,
                padding: [28, 22, 22, 22],
                labelText: (datum) => String(datum.data?.label || ''),
                labelFontWeight: 700,
                labelFill: '#385166',
                labelPlacement: 'top'
            },
            state: {
                related: { lineWidth: 2.4 },
                dimmed: { opacity: 0.14 }
            }
        },
        edge: {
            type: 'cubic',
            style: {
                stroke: (datum) => edgeColor(String(datum.data?.edgeType || '')),
                lineWidth: 1.8,
                endArrow: true,
                opacity: 0.68
            },
            state: {
                selected: { lineWidth: 3.2, opacity: 1 },
                related: { opacity: 0.92 },
                dimmed: { opacity: 0.1 }
            }
        },
        behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element']
    });
    graphInstance.on('node:click', (event) => {
        const id = Number(event?.target?.id);
        if (!Number.isNaN(id))
            emit('select-node', id);
    });
    graphInstance.on('edge:click', (event) => {
        const id = Number(event?.target?.id);
        if (!Number.isNaN(id))
            emit('select-edge', id);
    });
    graphInstance.on('canvas:click', () => {
        emit('clear-selection');
    });
    await graphInstance.render();
    if (currentToken !== renderToken) {
        graphInstance.destroy();
        graphInstance = null;
        return;
    }
    await graphInstance.fitView();
    await applySelectionStates();
};
const applySelectionStates = async () => {
    if (!graphInstance)
        return;
    const states = {};
    const nodeIds = graphData.value.nodes?.map((item) => String(item.id)) || [];
    const edgeIds = graphData.value.edges?.map((item) => String(item.id)) || [];
    const comboIds = graphData.value.combos?.map((item) => String(item.id)) || [];
    if (props.selectedNodeId === null && props.selectedEdgeId === null) {
        ;
        [...nodeIds, ...edgeIds, ...comboIds].forEach((id) => {
            states[id] = [];
        });
        await graphInstance.setElementState(states, false);
        return;
    }
    const relatedNodeIds = new Set();
    const relatedEdgeIds = new Set();
    const relatedComboIds = new Set();
    if (props.selectedNodeId !== null) {
        const selectedId = String(props.selectedNodeId);
        relatedNodeIds.add(selectedId);
        const selectedNode = graphData.value.nodes?.find((item) => String(item.id) === selectedId);
        if (selectedNode?.combo)
            relatedComboIds.add(String(selectedNode.combo));
        for (const edge of graphData.value.edges || []) {
            const source = String(edge.source);
            const target = String(edge.target);
            if (source === selectedId || target === selectedId) {
                relatedEdgeIds.add(String(edge.id));
                relatedNodeIds.add(source);
                relatedNodeIds.add(target);
            }
        }
        for (const node of graphData.value.nodes || []) {
            if (relatedNodeIds.has(String(node.id)) && node.combo)
                relatedComboIds.add(String(node.combo));
        }
    }
    else if (props.selectedEdgeId !== null) {
        const selectedId = String(props.selectedEdgeId);
        relatedEdgeIds.add(selectedId);
        const selected = graphData.value.edges?.find((item) => String(item.id) === selectedId);
        if (selected) {
            relatedNodeIds.add(String(selected.source));
            relatedNodeIds.add(String(selected.target));
        }
        for (const node of graphData.value.nodes || []) {
            if (relatedNodeIds.has(String(node.id)) && node.combo)
                relatedComboIds.add(String(node.combo));
        }
    }
    nodeIds.forEach((id) => {
        if (props.selectedNodeId !== null && id === String(props.selectedNodeId))
            states[id] = ['selected'];
        else if (relatedNodeIds.has(id))
            states[id] = ['related'];
        else
            states[id] = ['dimmed'];
    });
    edgeIds.forEach((id) => {
        if (props.selectedEdgeId !== null && id === String(props.selectedEdgeId))
            states[id] = ['selected'];
        else if (relatedEdgeIds.has(id))
            states[id] = ['related'];
        else
            states[id] = ['dimmed'];
    });
    comboIds.forEach((id) => {
        states[id] = relatedComboIds.has(id) ? ['related'] : ['dimmed'];
    });
    await graphInstance.setElementState(states, false);
    if (props.selectedNodeId !== null) {
        await graphInstance.focusElement(String(props.selectedNodeId), false);
    }
    else if (props.selectedEdgeId !== null) {
        await graphInstance.focusElement(String(props.selectedEdgeId), false);
    }
};
const ensureContainerSize = () => {
    const container = graphContainerRef.value;
    if (!container)
        return;
    containerWidth.value = Math.max(container.clientWidth, 980);
    containerHeight.value = Math.max(container.clientHeight, 620);
};
const focusFirstNode = (nodeType) => {
    const target = props.nodes.find((item) => item.nodeType === nodeType);
    if (target)
        emit('select-node', target.id);
};
watch([() => props.nodes, () => props.edges, () => props.layoutMode, containerWidth, containerHeight], async () => {
    await nextTick();
    ensureContainerSize();
    await initGraph();
}, { deep: true });
watch([() => props.selectedNodeId, () => props.selectedEdgeId], async () => {
    await applySelectionStates();
});
onMounted(async () => {
    resizeObserver = new ResizeObserver(() => {
        ensureContainerSize();
    });
    await nextTick();
    if (graphContainerRef.value) {
        resizeObserver.observe(graphContainerRef.value);
        ensureContainerSize();
    }
    await initGraph();
});
onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (graphInstance) {
        graphInstance.destroy();
        graphInstance = null;
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['legend-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.nodes.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "graph-empty" },
    });
    const __VLS_0 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        description: "暂无图谱数据",
    }));
    const __VLS_2 = __VLS_1({
        description: "暂无图谱数据",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "graph-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "graph-legend" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.nodeTypeOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    __VLS_ctx.focusFirstNode(item);
                } },
            key: (item),
            type: "button",
            ...{ class: "legend-item" },
            ...{ class: ({ active: __VLS_ctx.selectedNode?.nodeType === item }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "legend-dot" },
            ...{ style: ({ background: __VLS_ctx.nodeColor(item) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.nodeTypeLabel(item));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "graphContainerRef",
        ...{ class: "graph-container" },
    });
    /** @type {typeof __VLS_ctx.graphContainerRef} */ ;
}
/** @type {__VLS_StyleScopedClasses['graph-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['graph-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['graph-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-item']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['graph-container']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElEmpty: ElEmpty,
            graphContainerRef: graphContainerRef,
            nodeTypeOptions: nodeTypeOptions,
            selectedNode: selectedNode,
            nodeColor: nodeColor,
            nodeTypeLabel: nodeTypeLabel,
            focusFirstNode: focusFirstNode,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=KnowledgeGraphCanvas.vue.js.map