/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { ArrowDown } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), {
    placeholder: '请选择',
    disabled: false,
    popoverWidth: 180,
    size: 'small'
});
const emit = defineEmits();
const visible = ref(false);
const selectedOption = computed(() => props.options.find((item) => item.value === props.modelValue));
const selectedToneClass = computed(() => toneClass(selectedOption.value?.tone));
const sizeClass = computed(() => (props.size === 'default' ? 'is-default' : 'is-small'));
function toneClass(tone) {
    if (!tone)
        return '';
    return `tone-${tone}`;
}
function handleSelect(value) {
    emit('update:modelValue', value);
    emit('change', value);
    visible.value = false;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    placeholder: '请选择',
    disabled: false,
    popoverWidth: 180,
    size: 'small'
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-value']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item-main']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-value']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item-main']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    visible: (__VLS_ctx.visible),
    trigger: "click",
    placement: "bottom-start",
    width: (__VLS_ctx.popoverWidth),
    popperClass: "compact-select-popper",
}));
const __VLS_2 = __VLS_1({
    visible: (__VLS_ctx.visible),
    trigger: "click",
    placement: "bottom-start",
    width: (__VLS_ctx.popoverWidth),
    popperClass: "compact-select-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "compact-select-trigger" },
        ...{ class: ([__VLS_ctx.sizeClass, { disabled: __VLS_ctx.disabled }]) },
        type: "button",
        disabled: (__VLS_ctx.disabled),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "compact-select-value" },
    });
    if (__VLS_ctx.selectedToneClass) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
            ...{ class: "compact-select-dot" },
            ...{ class: (__VLS_ctx.selectedToneClass) },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.selectedOption?.label || __VLS_ctx.placeholder);
    const __VLS_5 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        ...{ class: "compact-select-arrow" },
    }));
    const __VLS_7 = __VLS_6({
        ...{ class: "compact-select-arrow" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_8.slots.default;
    const __VLS_9 = {}.ArrowDown;
    /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({}));
    const __VLS_11 = __VLS_10({}, ...__VLS_functionalComponentArgsRest(__VLS_10));
    var __VLS_8;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "compact-select-menu" },
});
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleSelect(item.value);
            } },
        key: (String(item.value)),
        ...{ class: "compact-select-item" },
        ...{ class: ({ active: item.value === __VLS_ctx.modelValue }) },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "compact-select-item-main" },
    });
    if (__VLS_ctx.toneClass(item.tone)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
            ...{ class: "compact-select-dot" },
            ...{ class: (__VLS_ctx.toneClass(item.tone)) },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (item.label);
    if (item.value === __VLS_ctx.modelValue) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "compact-select-check" },
        });
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['compact-select-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-value']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-item-main']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-select-check']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            visible: visible,
            selectedOption: selectedOption,
            selectedToneClass: selectedToneClass,
            sizeClass: sizeClass,
            toneClass: toneClass,
            handleSelect: handleSelect,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=CompactSelectMenu.vue.js.map