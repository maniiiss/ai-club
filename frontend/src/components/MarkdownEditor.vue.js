/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { MdEditor } from 'md-editor-v3';
const props = withDefaults(defineProps(), {
    placeholder: '请填写内容，支持 Markdown 语法',
    height: 360,
    uploadImage: undefined
});
const emit = defineEmits();
const currentValue = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
});
const normalizedHeight = computed(() => typeof props.height === 'number' ? `${props.height}px` : props.height);
const handleUploadImg = async (files, callback) => {
    if (!props.uploadImage || !files.length) {
        return;
    }
    const urls = await Promise.all(files.map((file) => props.uploadImage(file)));
    callback(urls);
};
const toolbars = [
    'bold',
    'italic',
    'title',
    'strikeThrough',
    '-',
    'quote',
    'unorderedList',
    'orderedList',
    'task',
    '-',
    'link',
    'image',
    'table',
    'code',
    'codeRow',
    '-',
    'revoke',
    'next',
    '=',
    'preview',
    'previewOnly',
    'fullscreen'
];
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    placeholder: '请填写内容，支持 Markdown 语法',
    height: 360,
    uploadImage: undefined
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['md-editor-toolbar-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "markdown-editor-wrapper" },
});
const __VLS_0 = {}.MdEditor;
/** @type {[typeof __VLS_components.MdEditor, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.currentValue),
    language: "zh-CN",
    theme: "light",
    previewTheme: "github",
    codeTheme: "atom",
    placeholder: (__VLS_ctx.placeholder),
    ...{ style: ({ height: __VLS_ctx.normalizedHeight }) },
    toolbars: (__VLS_ctx.toolbars),
    footers: ([]),
    showToolbarName: (false),
    onUploadImg: (__VLS_ctx.handleUploadImg),
    noMermaid: true,
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.currentValue),
    language: "zh-CN",
    theme: "light",
    previewTheme: "github",
    codeTheme: "atom",
    placeholder: (__VLS_ctx.placeholder),
    ...{ style: ({ height: __VLS_ctx.normalizedHeight }) },
    toolbars: (__VLS_ctx.toolbars),
    footers: ([]),
    showToolbarName: (false),
    onUploadImg: (__VLS_ctx.handleUploadImg),
    noMermaid: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['markdown-editor-wrapper']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MdEditor: MdEditor,
            currentValue: currentValue,
            normalizedHeight: normalizedHeight,
            handleUploadImg: handleUploadImg,
            toolbars: toolbars,
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
//# sourceMappingURL=MarkdownEditor.vue.js.map