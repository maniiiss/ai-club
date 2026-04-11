/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const width = 760;
const height = 176;
const paddingLeft = 36;
const paddingRight = 12;
const paddingTop = 18;
const paddingBottom = 26;
const hasChartData = computed(() => (props.data?.labels.length ?? 0) > 0);
const maxValue = computed(() => {
    const values = [...(props.data?.idealRemaining ?? []), ...(props.data?.actualRemaining ?? [])];
    const max = values.length ? Math.max(...values) : 0;
    return Math.max(max, 1);
});
const rangeText = computed(() => {
    if (!props.data)
        return '暂无数据';
    return `${props.data.startDate} 至 ${props.data.endDate}`;
});
const getX = (index, total) => {
    if (total <= 1)
        return paddingLeft;
    const chartWidth = width - paddingLeft - paddingRight;
    return paddingLeft + (chartWidth * index) / (total - 1);
};
const getY = (value) => {
    const chartHeight = height - paddingTop - paddingBottom;
    return paddingTop + chartHeight * (1 - value / maxValue.value);
};
const buildPoints = (series) => series.map((value, index) => `${getX(index, series.length)},${getY(value)}`).join(' ');
const actualPointList = computed(() => (props.data?.actualRemaining ?? []).map((value, index, list) => ({
    x: getX(index, list.length),
    y: getY(value)
})));
const idealPoints = computed(() => buildPoints(props.data?.idealRemaining ?? []));
const actualPoints = computed(() => buildPoints(props.data?.actualRemaining ?? []));
const yTicks = computed(() => {
    const values = [maxValue.value, Math.round(maxValue.value / 2), 0];
    return values.map((value) => ({ value, y: getY(value) }));
});
const firstLabel = computed(() => props.data?.labels[0] ?? '-');
const middleLabel = computed(() => {
    const labels = props.data?.labels ?? [];
    if (!labels.length)
        return '-';
    return labels[Math.floor((labels.length - 1) / 2)];
});
const lastLabel = computed(() => {
    const labels = props.data?.labels ?? [];
    return labels.length ? labels[labels.length - 1] : '-';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['burndown-header']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['ideal-line']} */ ;
/** @type {__VLS_StyleScopedClasses['actual-line']} */ ;
/** @type {__VLS_StyleScopedClasses['x-axis-labels']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-header']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-stats']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-subtitle" },
});
(__VLS_ctx.rangeText);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "burndown-stats" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.data?.totalWorkItemCount ?? 0);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.data?.completedWorkItemCount ?? 0);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.data?.remainingWorkItemCount ?? 0);
if (__VLS_ctx.hasChartData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "burndown-chart" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        viewBox: (`0 0 ${__VLS_ctx.width} ${__VLS_ctx.height}`),
        ...{ class: "chart-svg" },
        preserveAspectRatio: "none",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: (__VLS_ctx.paddingLeft),
        y1: (__VLS_ctx.height - __VLS_ctx.paddingBottom),
        x2: (__VLS_ctx.width - __VLS_ctx.paddingRight),
        y2: (__VLS_ctx.height - __VLS_ctx.paddingBottom),
        ...{ class: "axis-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
        x1: (__VLS_ctx.paddingLeft),
        y1: (__VLS_ctx.paddingTop),
        x2: (__VLS_ctx.paddingLeft),
        y2: (__VLS_ctx.height - __VLS_ctx.paddingBottom),
        ...{ class: "axis-line" },
    });
    for (const [tick] of __VLS_getVForSourceType((__VLS_ctx.yTicks))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
            key: (`grid-${tick.value}`),
            x1: (__VLS_ctx.paddingLeft),
            y1: (tick.y),
            x2: (__VLS_ctx.width - __VLS_ctx.paddingRight),
            y2: (tick.y),
            ...{ class: "grid-line" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.idealPoints),
        ...{ class: "ideal-line" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.polyline)({
        points: (__VLS_ctx.actualPoints),
        ...{ class: "actual-line" },
    });
    for (const [point] of __VLS_getVForSourceType((__VLS_ctx.actualPointList))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
            key: (`${point.x}-${point.y}`),
            cx: (point.x),
            cy: (point.y),
            r: "2.8",
            ...{ class: "actual-point" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "x-axis-labels" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.firstLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.middleLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.lastLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chart-legend" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "legend-dot ideal" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
        ...{ class: "legend-dot actual" },
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "burndown-empty" },
    });
}
/** @type {__VLS_StyleScopedClasses['burndown-card']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-header']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-title']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-chart']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-svg']} */ ;
/** @type {__VLS_StyleScopedClasses['axis-line']} */ ;
/** @type {__VLS_StyleScopedClasses['axis-line']} */ ;
/** @type {__VLS_StyleScopedClasses['grid-line']} */ ;
/** @type {__VLS_StyleScopedClasses['ideal-line']} */ ;
/** @type {__VLS_StyleScopedClasses['actual-line']} */ ;
/** @type {__VLS_StyleScopedClasses['actual-point']} */ ;
/** @type {__VLS_StyleScopedClasses['x-axis-labels']} */ ;
/** @type {__VLS_StyleScopedClasses['chart-legend']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ideal']} */ ;
/** @type {__VLS_StyleScopedClasses['legend-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['actual']} */ ;
/** @type {__VLS_StyleScopedClasses['burndown-empty']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            width: width,
            height: height,
            paddingLeft: paddingLeft,
            paddingRight: paddingRight,
            paddingTop: paddingTop,
            paddingBottom: paddingBottom,
            hasChartData: hasChartData,
            rangeText: rangeText,
            actualPointList: actualPointList,
            idealPoints: idealPoints,
            actualPoints: actualPoints,
            yTicks: yTicks,
            firstLabel: firstLabel,
            middleLabel: middleLabel,
            lastLabel: lastLabel,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=ProjectBurndownChart.vue.js.map