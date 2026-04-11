/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ArrowDown, Search } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), {
    placeholder: '指派负责人/协作者',
    disabled: false,
    popoverWidth: 220
});
const emit = defineEmits();
const visible = ref(false);
const keyword = ref('');
const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase());
const projectMemberIdSet = computed(() => new Set(props.projectMemberUserIds));
const assigneeUser = computed(() => props.assigneeUserId
    ? props.userOptions.find((item) => item.id === props.assigneeUserId) || null
    : null);
const collaboratorUsers = computed(() => props.collaboratorUserIds
    .map((id) => props.userOptions.find((item) => item.id === id) || null)
    .filter((item) => Boolean(item)));
/**
 * 表单态只展示“负责人头像+名字 / 协作人头像组”，
 * 保持字段信息足够清晰，同时尽量贴近用户给出的紧凑视觉参考。
 */
const inlineCollaboratorUsers = computed(() => collaboratorUsers.value.slice(0, 3));
const hiddenCollaboratorCount = computed(() => Math.max(0, collaboratorUsers.value.length - inlineCollaboratorUsers.value.length));
const hasSelection = computed(() => Boolean(assigneeUser.value || collaboratorUsers.value.length));
const selectionTitle = computed(() => {
    const titleParts = [];
    if (assigneeUser.value) {
        titleParts.push(`负责人：${buildUserName(assigneeUser.value)}`);
    }
    if (collaboratorUsers.value.length) {
        titleParts.push(`协作人：${collaboratorUsers.value.map((item) => buildUserName(item)).join('、')}`);
    }
    return titleParts.join('；') || props.placeholder;
});
/**
 * 按“项目成员 / 企业成员”分组，并在每个分组内带上已选数量，
 * 让一个字段里同时承载负责人与协作者的配置语义。
 */
const visibleSections = computed(() => {
    const isMatchedUser = (item) => {
        if (!normalizedKeyword.value) {
            return true;
        }
        const searchableText = `${item.nickname} ${item.username}`.toLowerCase();
        return searchableText.includes(normalizedKeyword.value);
    };
    const buildSection = (key, label, users) => ({
        key,
        label,
        users: users.filter(isMatchedUser),
        selectedCount: users.filter((item) => item.id === props.assigneeUserId || props.collaboratorUserIds.includes(item.id)).length,
        totalCount: users.length
    });
    const projectUsers = props.userOptions.filter((item) => projectMemberIdSet.value.has(item.id));
    const enterpriseUsers = props.userOptions.filter((item) => !projectMemberIdSet.value.has(item.id));
    return [
        buildSection('project', '项目成员', projectUsers),
        buildSection('enterprise', '企业成员', enterpriseUsers)
    ].filter((item) => item.users.length > 0);
});
watch(visible, (nextVisible) => {
    if (!nextVisible) {
        keyword.value = '';
    }
});
function buildUserName(item) {
    if (!item) {
        return '';
    }
    return item.nickname?.trim() || item.username;
}
function buildUserAvatar(item) {
    return buildUserName(item).slice(0, 1).toUpperCase();
}
function isAssigneeSelected(userId) {
    return props.assigneeUserId === userId;
}
function isCollaboratorSelected(userId) {
    return props.collaboratorUserIds.includes(userId);
}
function rowStateClass(userId) {
    return {
        'is-selected': isAssigneeSelected(userId) || isCollaboratorSelected(userId),
        'is-assignee-selected': isAssigneeSelected(userId),
        'is-collaborator-selected': isCollaboratorSelected(userId)
    };
}
/**
 * 统一处理组合字段的双向绑定输出，保证负责人和协作者互斥，
 * 避免父级表单里留下同一用户同时承担两种角色的脏数据。
 */
function emitMemberChange(nextAssigneeUserId, nextCollaboratorUserIds) {
    const normalizedCollaborators = Array.from(new Set(nextCollaboratorUserIds))
        .filter((item) => Number.isFinite(item))
        .filter((item) => item !== nextAssigneeUserId);
    emit('update:assigneeUserId', nextAssigneeUserId);
    emit('update:collaboratorUserIds', normalizedCollaborators);
    emit('change', {
        assigneeUserId: nextAssigneeUserId,
        collaboratorUserIds: normalizedCollaborators
    });
}
/**
 * 点击负责人按钮时允许重复点击取消，这样单字段交互也保留清空负责人能力。
 */
function toggleAssignee(userId) {
    const nextAssigneeUserId = props.assigneeUserId === userId ? null : userId;
    emitMemberChange(nextAssigneeUserId, props.collaboratorUserIds);
}
/**
 * 协作者支持多选；当用户已被设置为负责人时，不再允许追加为协作者。
 */
function toggleCollaborator(userId) {
    if (props.assigneeUserId === userId) {
        return;
    }
    const nextCollaboratorUserIds = props.collaboratorUserIds.includes(userId)
        ? props.collaboratorUserIds.filter((item) => item !== userId)
        : [...props.collaboratorUserIds, userId];
    emitMemberChange(props.assigneeUserId, nextCollaboratorUserIds);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    placeholder: '指派负责人/协作者',
    disabled: false,
    popoverWidth: 220
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['work-item-member-reference']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-reference']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-reference']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-reference']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-name']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-collaborators']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-collaborators']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['is-open']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-section']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['is-assignee']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['is-collaborator']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-member-field" },
});
const __VLS_0 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    visible: (__VLS_ctx.visible),
    trigger: "click",
    placement: "bottom-start",
    width: (__VLS_ctx.popoverWidth),
    popperClass: "work-item-member-popper",
}));
const __VLS_2 = __VLS_1({
    visible: (__VLS_ctx.visible),
    trigger: "click",
    placement: "bottom-start",
    width: (__VLS_ctx.popoverWidth),
    popperClass: "work-item-member-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "work-item-member-reference" },
        ...{ class: ({ 'is-open': __VLS_ctx.visible, disabled: __VLS_ctx.disabled, 'is-empty': !__VLS_ctx.hasSelection }) },
        type: "button",
        disabled: (__VLS_ctx.disabled),
        title: (__VLS_ctx.selectionTitle),
    });
    if (__VLS_ctx.hasSelection) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "work-item-member-inline" },
        });
        if (__VLS_ctx.assigneeUser) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "work-item-member-inline-owner" },
            });
            const __VLS_4 = {}.ElAvatar;
            /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
                size: (22),
                ...{ class: "work-item-member-inline-avatar owner" },
            }));
            const __VLS_6 = __VLS_5({
                size: (22),
                ...{ class: "work-item-member-inline-avatar owner" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_5));
            __VLS_7.slots.default;
            (__VLS_ctx.buildUserAvatar(__VLS_ctx.assigneeUser));
            var __VLS_7;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "work-item-member-inline-name" },
            });
            (__VLS_ctx.buildUserName(__VLS_ctx.assigneeUser));
        }
        if (__VLS_ctx.assigneeUser && __VLS_ctx.inlineCollaboratorUsers.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "work-item-member-inline-separator" },
            });
        }
        if (__VLS_ctx.inlineCollaboratorUsers.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "work-item-member-inline-collaborators" },
            });
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.inlineCollaboratorUsers))) {
                const __VLS_8 = {}.ElAvatar;
                /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
                // @ts-ignore
                const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                    key: (item.id),
                    size: (20),
                    ...{ class: "work-item-member-inline-avatar collaborator" },
                }));
                const __VLS_10 = __VLS_9({
                    key: (item.id),
                    size: (20),
                    ...{ class: "work-item-member-inline-avatar collaborator" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_9));
                __VLS_11.slots.default;
                (__VLS_ctx.buildUserAvatar(item));
                var __VLS_11;
            }
            if (__VLS_ctx.hiddenCollaboratorCount > 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "work-item-member-inline-more" },
                });
                (__VLS_ctx.hiddenCollaboratorCount);
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "work-item-member-inline-placeholder" },
        });
        (__VLS_ctx.placeholder);
    }
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ class: "work-item-member-arrow" },
        ...{ class: ({ 'is-open': __VLS_ctx.visible }) },
    }));
    const __VLS_14 = __VLS_13({
        ...{ class: "work-item-member-arrow" },
        ...{ class: ({ 'is-open': __VLS_ctx.visible }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.ArrowDown;
    /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "work-item-member-panel" },
});
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: "搜索成员",
    ...{ class: "work-item-member-search" },
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.keyword),
    clearable: true,
    placeholder: "搜索成员",
    ...{ class: "work-item-member-search" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_23.slots;
    const __VLS_24 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
    const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    const __VLS_28 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
    const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
    var __VLS_27;
}
var __VLS_23;
const __VLS_32 = {}.ElScrollbar;
/** @type {[typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, typeof __VLS_components.ElScrollbar, typeof __VLS_components.elScrollbar, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    maxHeight: "300px",
    ...{ class: "work-item-member-scroll" },
}));
const __VLS_34 = __VLS_33({
    maxHeight: "300px",
    ...{ class: "work-item-member-scroll" },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
if (__VLS_ctx.visibleSections.length) {
    for (const [section] of __VLS_getVForSourceType((__VLS_ctx.visibleSections))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            key: (section.key),
            ...{ class: "work-item-member-section" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "work-item-member-section-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (section.label);
        (section.selectedCount);
        (section.totalCount);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "work-item-member-section-body" },
        });
        for (const [item] of __VLS_getVForSourceType((section.users))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (item.id),
                ...{ class: "work-item-member-row" },
                ...{ class: (__VLS_ctx.rowStateClass(item.id)) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "work-item-member-user" },
            });
            const __VLS_36 = {}.ElAvatar;
            /** @type {[typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, typeof __VLS_components.ElAvatar, typeof __VLS_components.elAvatar, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                size: (26),
                ...{ class: "work-item-member-avatar" },
            }));
            const __VLS_38 = __VLS_37({
                size: (26),
                ...{ class: "work-item-member-avatar" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            __VLS_39.slots.default;
            (__VLS_ctx.buildUserAvatar(item));
            var __VLS_39;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "work-item-member-user-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "work-item-member-user-name" },
            });
            (__VLS_ctx.buildUserName(item));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "work-item-member-actions" },
            });
            const __VLS_40 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
                ...{ 'onClick': {} },
                plain: true,
                round: true,
                size: "small",
                type: "primary",
                ...{ class: "work-item-member-action" },
                ...{ class: (['is-assignee', { 'is-active': __VLS_ctx.isAssigneeSelected(item.id) }]) },
            }));
            const __VLS_42 = __VLS_41({
                ...{ 'onClick': {} },
                plain: true,
                round: true,
                size: "small",
                type: "primary",
                ...{ class: "work-item-member-action" },
                ...{ class: (['is-assignee', { 'is-active': __VLS_ctx.isAssigneeSelected(item.id) }]) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_41));
            let __VLS_44;
            let __VLS_45;
            let __VLS_46;
            const __VLS_47 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visibleSections.length))
                        return;
                    __VLS_ctx.toggleAssignee(item.id);
                }
            };
            __VLS_43.slots.default;
            var __VLS_43;
            const __VLS_48 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                ...{ 'onClick': {} },
                plain: true,
                round: true,
                size: "small",
                type: "success",
                ...{ class: "work-item-member-action" },
                ...{ class: (['is-collaborator', { 'is-active': __VLS_ctx.isCollaboratorSelected(item.id) }]) },
                disabled: (__VLS_ctx.isAssigneeSelected(item.id)),
            }));
            const __VLS_50 = __VLS_49({
                ...{ 'onClick': {} },
                plain: true,
                round: true,
                size: "small",
                type: "success",
                ...{ class: "work-item-member-action" },
                ...{ class: (['is-collaborator', { 'is-active': __VLS_ctx.isCollaboratorSelected(item.id) }]) },
                disabled: (__VLS_ctx.isAssigneeSelected(item.id)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            let __VLS_52;
            let __VLS_53;
            let __VLS_54;
            const __VLS_55 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visibleSections.length))
                        return;
                    __VLS_ctx.toggleCollaborator(item.id);
                }
            };
            __VLS_51.slots.default;
            var __VLS_51;
        }
    }
}
else {
    const __VLS_56 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        description: "暂无匹配成员",
        imageSize: (56),
    }));
    const __VLS_58 = __VLS_57({
        description: "暂无匹配成员",
        imageSize: (56),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
}
var __VLS_35;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['work-item-member-field']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-reference']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-owner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['owner']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-name']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-collaborators']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['collaborator']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-more']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-inline-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-search']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-section']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-section-body']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-row']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-user']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-user-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-user-name']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
/** @type {__VLS_StyleScopedClasses['work-item-member-action']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            Search: Search,
            visible: visible,
            keyword: keyword,
            assigneeUser: assigneeUser,
            inlineCollaboratorUsers: inlineCollaboratorUsers,
            hiddenCollaboratorCount: hiddenCollaboratorCount,
            hasSelection: hasSelection,
            selectionTitle: selectionTitle,
            visibleSections: visibleSections,
            buildUserName: buildUserName,
            buildUserAvatar: buildUserAvatar,
            isAssigneeSelected: isAssigneeSelected,
            isCollaboratorSelected: isCollaboratorSelected,
            rowStateClass: rowStateClass,
            toggleAssignee: toggleAssignee,
            toggleCollaborator: toggleCollaborator,
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
//# sourceMappingURL=WorkItemMemberField.vue.js.map