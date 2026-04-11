/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, ArrowRight, Connection, Delete, DocumentCopy, EditPen, Filter, FolderOpened, Plus, RefreshRight, Search, Tickets, VideoPlay } from '@element-plus/icons-vue';
import { listAgentOptions, listProjectOptions } from '@/api/platform';
import { createGitlabAutoMergeConfig, createGitlabBinding, createGitlabTag, deleteGitlabAutoMergeConfig, deleteGitlabBinding, listGitlabBindingOptions, listGitlabBranches, pageGitlabAutoMergeConfigs, pageGitlabAutoMergeLogs, pageGitlabBindings, previewAutoMergeConfigMergeRequests, previewBindingMergeRequests, runAutoMergeConfig, testGitlabAutoMergeConfig, testGitlabBinding, updateGitlabAutoMergeConfig, updateGitlabBinding } from '@/api/gitlab';
import { renderMarkdownToHtml } from '@/utils/markdown';
const DEFAULT_GITLAB_API_URL = 'http://192.168.110.138:30080/api/v4';
const activeTab = ref('bindings');
const projectOptions = ref([]);
const bindingOptions = ref([]);
const reviewAgentOptions = ref([]);
const bindingLoading = ref(false);
const bindingSubmitting = ref(false);
const bindingDialogVisible = ref(false);
const bindingIsEditing = ref(false);
const currentBindingId = ref(null);
const bindingList = ref([]);
const bindingFormRef = ref();
const bindingPagination = reactive({ page: 1, size: 10, total: 0 });
const bindingTotalPages = computed(() => Math.max(1, Math.ceil(bindingPagination.total / bindingPagination.size) || 1));
const bindingFilters = reactive({ keyword: '', projectId: undefined });
const bindingFilterPopoverVisible = ref(false);
const bindingForm = reactive({ projectId: null, apiBaseUrl: DEFAULT_GITLAB_API_URL, gitlabProjectRef: '', defaultTargetBranch: '', apiToken: '', enabled: true });
const tagDialogVisible = ref(false);
const tagSubmitting = ref(false);
const tagResultVisible = ref(false);
const currentTagBinding = ref(null);
const tagFormRef = ref();
const tagForm = reactive({ tagName: '', branchName: '', message: '' });
const tagBranchOptions = ref([]);
const tagBranchLoading = ref(false);
const tagResult = ref(null);
const autoMergeLoading = ref(false);
const autoMergeSubmitting = ref(false);
const autoMergeDialogVisible = ref(false);
const autoMergeIsEditing = ref(false);
const autoMergeReadonlyMode = ref(false);
const currentAutoMergeId = ref(null);
const autoMergeList = ref([]);
const autoMergeFormRef = ref();
const autoMergePagination = reactive({ page: 1, size: 10, total: 0 });
const autoMergeTotalPages = computed(() => Math.max(1, Math.ceil(autoMergePagination.total / autoMergePagination.size) || 1));
const autoMergeFilters = reactive({ keyword: '', executionMode: undefined, enabled: undefined });
const autoMergeFilterPopoverVisible = ref(false);
const autoMergeForm = reactive({ name: '', executionMode: 'PROJECT_BOUND', description: '', bindingId: null, apiBaseUrl: DEFAULT_GITLAB_API_URL, gitlabProjectRef: '', apiToken: '', sourceBranch: '', targetBranch: '', titleKeyword: '', schedulerEnabled: false, schedulerCron: '0 */5 * * * *', enabled: true, autoMerge: true, squashOnMerge: false, removeSourceBranch: true, triggerPipelineAfterMerge: false, requirePipelineSuccess: true, reviewAgentId: null, aiReviewEnabled: false, aiReviewPrompt: '' });
const cronTemplate = ref('');
const logLoading = ref(false);
const logList = ref([]);
const logPagination = reactive({ page: 1, size: 10, total: 0 });
const logTotalPages = computed(() => Math.max(1, Math.ceil(logPagination.total / logPagination.size) || 1));
const logFilters = reactive({ result: undefined, triggerType: undefined });
const logFilterPopoverVisible = ref(false);
const logDetailVisible = ref(false);
const currentLogDetail = ref(null);
const mergeRequestDrawerVisible = ref(false);
const mergeRequestDrawerTitle = ref('');
const mergeRequestLoading = ref(false);
const mergeRequestList = ref([]);
const runResultVisible = ref(false);
const runResult = ref(null);
const bindingRules = { projectId: [{ required: true, message: '请选择平台项目', trigger: 'change' }], apiBaseUrl: [{ required: true, message: '请输入 GitLab API 地址', trigger: 'blur' }], gitlabProjectRef: [{ required: true, message: '请输入 GitLab 项目标识', trigger: 'blur' }] };
const tagRules = { tagName: [{ required: true, message: '请输入 Tag 名称', trigger: 'blur' }], branchName: [{ required: true, message: '请选择来源分支', trigger: 'change' }] };
const autoMergeRules = { name: [{ required: true, message: '请输入策略名称', trigger: 'blur' }], executionMode: [{ required: true, message: '请选择执行模式', trigger: 'change' }] };
watch(() => autoMergeForm.executionMode, (mode) => {
    if (mode === 'PROJECT_BOUND') {
        autoMergeForm.apiToken = '';
        autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL;
        autoMergeForm.gitlabProjectRef = '';
    }
    else {
        autoMergeForm.bindingId = null;
        autoMergeForm.triggerPipelineAfterMerge = false;
    }
});
watch(() => autoMergeForm.schedulerEnabled, (enabled) => {
    if (!enabled) {
        cronTemplate.value = '';
    }
});
const bindingStatusType = (status) => status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : 'info';
const runStatusType = (status) => status === 'SUCCESS' ? 'success' : status === 'PARTIAL' || status === 'SKIPPED' ? 'warning' : status === 'FAILED' ? 'danger' : 'info';
const logResultType = (result) => result === 'MERGED' ? 'success' : result === 'FAILED' ? 'danger' : result === 'EMPTY' ? 'info' : 'warning';
const logResultText = (result) => result === 'MERGED' ? '已合并' : result === 'FAILED' ? '失败' : result === 'AI_REJECTED' ? 'AI 拒绝' : result === 'SKIPPED' ? '已跳过' : result === 'EMPTY' ? '空执行' : (result || '未知');
const getMergeRequestBehindCount = (item) => item.divergedCommitsCount ?? item.diverged_commits_count ?? 0;
const isMergeRequestBehind = (item) => getMergeRequestBehindCount(item) > 0 || item.detailedMergeStatus === 'need_rebase';
const mergeRequestBehindTagType = (item) => isMergeRequestBehind(item) ? 'danger' : 'success';
const logDetailHtml = computed(() => renderMarkdownToHtml(currentLogDetail.value?.detailMarkdown || buildFallbackLogMarkdown(currentLogDetail.value)));
// 统一整理列表中用到的中文展示文案，避免模板层重复判断状态和时间格式。
const formatDateTimeText = (value) => value ? value.replace('T', ' ').slice(0, 16) : '-';
const formatBindingStatusLabel = (status) => status === 'SUCCESS' ? '连通正常' : status === 'FAILED' ? '连接失败' : '未测试';
const formatExecutionModeLabel = (mode) => mode === 'STANDALONE' ? '独立运行' : '关联业务';
const formatTriggerTypeLabel = (triggerType) => triggerType === 'SCHEDULED' ? '定时调度' : '手动执行';
const formatRunStatusLabel = (status) => status === 'SUCCESS' ? '执行成功' : status === 'PARTIAL' ? '部分成功' : status === 'SKIPPED' ? '已跳过' : status === 'FAILED' ? '执行失败' : '未执行';
// 主信息列会把多字段折叠成标题和副标题，保持桌面与移动端的阅读节奏一致。
const getBindingProjectUrl = (row) => resolveGitlabProjectUrl(row.gitlabProjectWebUrl, row.apiBaseUrl, row.gitlabProjectPath || row.gitlabProjectRef);
const buildBindingSubtitle = (row) => `${row.projectName}${row.gitlabProjectName ? ` · ${row.gitlabProjectName}` : ''}${row.tokenConfigured ? '' : ' · Token 未配置'}`;
const buildAutoMergeSubtitle = (row) => row.description || `${row.projectName || '独立运行'} · ${row.gitlabProjectRef}`;
const buildLogSubtitle = (row) => {
    const segments = [formatDateTimeText(row.executedAt)];
    if (row.mergeRequestIid) {
        segments.push(`!${row.mergeRequestIid}`);
    }
    if (row.mergeRequestTitle) {
        segments.push(row.mergeRequestTitle);
    }
    return segments.join(' · ');
};
const autoMergeDialogTitle = computed(() => {
    if (autoMergeReadonlyMode.value) {
        return '查看自动合并策略';
    }
    return autoMergeIsEditing.value ? '编辑自动合并策略' : '新增自动合并策略';
});
const resetBindingForm = () => { currentBindingId.value = null; bindingForm.projectId = projectOptions.value[0]?.id ?? null; bindingForm.apiBaseUrl = DEFAULT_GITLAB_API_URL; bindingForm.gitlabProjectRef = ''; bindingForm.defaultTargetBranch = ''; bindingForm.apiToken = ''; bindingForm.enabled = true; bindingFormRef.value?.clearValidate(); };
const resetTagForm = () => { currentTagBinding.value = null; tagForm.tagName = ''; tagForm.branchName = ''; tagForm.message = ''; tagBranchOptions.value = []; tagFormRef.value?.clearValidate(); };
const resetAutoMergeForm = () => { currentAutoMergeId.value = null; autoMergeForm.name = ''; autoMergeForm.executionMode = 'PROJECT_BOUND'; autoMergeForm.description = ''; autoMergeForm.bindingId = bindingOptions.value[0]?.id ?? null; autoMergeForm.apiBaseUrl = DEFAULT_GITLAB_API_URL; autoMergeForm.gitlabProjectRef = ''; autoMergeForm.apiToken = ''; autoMergeForm.sourceBranch = ''; autoMergeForm.targetBranch = ''; autoMergeForm.titleKeyword = ''; autoMergeForm.schedulerEnabled = false; autoMergeForm.schedulerCron = '0 */5 * * * *'; autoMergeForm.enabled = true; autoMergeForm.autoMerge = true; autoMergeForm.squashOnMerge = false; autoMergeForm.removeSourceBranch = true; autoMergeForm.triggerPipelineAfterMerge = false; autoMergeForm.requirePipelineSuccess = true; autoMergeForm.reviewAgentId = reviewAgentOptions.value[0]?.id ?? null; autoMergeForm.aiReviewEnabled = false; autoMergeForm.aiReviewPrompt = ''; cronTemplate.value = ''; autoMergeFormRef.value?.clearValidate(); };
const loadBaseOptions = async () => {
    const [projects, bindings, agents] = await Promise.all([listProjectOptions(), listGitlabBindingOptions(), listAgentOptions()]);
    projectOptions.value = projects;
    bindingOptions.value = bindings;
    reviewAgentOptions.value = agents.filter(item => item.accessType === 'BUILT_IN' && item.builtinCode === 'CODE_REVIEW');
    if (!bindingForm.projectId && projectOptions.value.length > 0)
        bindingForm.projectId = projectOptions.value[0].id;
    if (!autoMergeForm.bindingId && bindingOptions.value.length > 0)
        autoMergeForm.bindingId = bindingOptions.value[0].id;
    if (!autoMergeForm.reviewAgentId && reviewAgentOptions.value.length > 0)
        autoMergeForm.reviewAgentId = reviewAgentOptions.value[0].id;
};
const loadBindings = async () => { bindingLoading.value = true; try {
    const pageData = await pageGitlabBindings({ page: bindingPagination.page, size: bindingPagination.size, keyword: bindingFilters.keyword, projectId: bindingFilters.projectId });
    bindingList.value = pageData.records;
    bindingPagination.total = pageData.total;
}
finally {
    bindingLoading.value = false;
} };
const loadAutoMergeConfigs = async () => { autoMergeLoading.value = true; try {
    const pageData = await pageGitlabAutoMergeConfigs({ page: autoMergePagination.page, size: autoMergePagination.size, keyword: autoMergeFilters.keyword, executionMode: autoMergeFilters.executionMode, enabled: autoMergeFilters.enabled });
    autoMergeList.value = pageData.records;
    autoMergePagination.total = pageData.total;
}
finally {
    autoMergeLoading.value = false;
} };
const loadAutoMergeLogs = async () => { logLoading.value = true; try {
    const pageData = await pageGitlabAutoMergeLogs({ page: logPagination.page, size: logPagination.size, result: logFilters.result, triggerType: logFilters.triggerType });
    logList.value = pageData.records;
    logPagination.total = pageData.total;
}
finally {
    logLoading.value = false;
} };
const refreshAll = async () => { await loadBaseOptions(); await Promise.all([loadBindings(), loadAutoMergeConfigs(), loadAutoMergeLogs()]); };
const handleBindingSearch = async () => { bindingFilterPopoverVisible.value = false; bindingPagination.page = 1; await loadBindings(); };
const handleBindingReset = async () => { bindingFilters.keyword = ''; bindingFilters.projectId = undefined; bindingPagination.page = 1; await loadBindings(); };
const handleBindingSizeChange = async () => { bindingPagination.page = 1; await loadBindings(); };
const handleBindingPrevPage = async () => { if (bindingPagination.page <= 1)
    return; bindingPagination.page -= 1; await loadBindings(); };
const handleBindingNextPage = async () => { if (bindingPagination.page >= bindingTotalPages.value)
    return; bindingPagination.page += 1; await loadBindings(); };
const handleAutoMergeSearch = async () => { autoMergeFilterPopoverVisible.value = false; autoMergePagination.page = 1; await loadAutoMergeConfigs(); };
const handleAutoMergeReset = async () => { autoMergeFilters.keyword = ''; autoMergeFilters.executionMode = undefined; autoMergeFilters.enabled = undefined; autoMergePagination.page = 1; await loadAutoMergeConfigs(); };
const handleAutoMergeSizeChange = async () => { autoMergePagination.page = 1; await loadAutoMergeConfigs(); };
const handleAutoMergePrevPage = async () => { if (autoMergePagination.page <= 1)
    return; autoMergePagination.page -= 1; await loadAutoMergeConfigs(); };
const handleAutoMergeNextPage = async () => { if (autoMergePagination.page >= autoMergeTotalPages.value)
    return; autoMergePagination.page += 1; await loadAutoMergeConfigs(); };
const handleLogSearch = async () => { logFilterPopoverVisible.value = false; logPagination.page = 1; await loadAutoMergeLogs(); };
const handleLogReset = async () => { logFilters.result = undefined; logFilters.triggerType = undefined; logPagination.page = 1; await loadAutoMergeLogs(); };
const handleLogSizeChange = async () => { logPagination.page = 1; await loadAutoMergeLogs(); };
const handleLogPrevPage = async () => { if (logPagination.page <= 1)
    return; logPagination.page -= 1; await loadAutoMergeLogs(); };
const handleLogNextPage = async () => { if (logPagination.page >= logTotalPages.value)
    return; logPagination.page += 1; await loadAutoMergeLogs(); };
const handleCronTemplateChange = (value) => { if (value) {
    autoMergeForm.schedulerEnabled = true;
    autoMergeForm.schedulerCron = value;
} };
const resolveGitlabProjectUrl = (explicitUrl, apiBaseUrl, projectRef) => {
    if (explicitUrl && explicitUrl.trim())
        return explicitUrl.trim();
    if (!apiBaseUrl || !projectRef)
        return null;
    const ref = projectRef.trim();
    if (!ref || /^\d+$/.test(ref))
        return null;
    const base = apiBaseUrl.replace(/\/api\/v4\/?$/, '').replace(/\/+$/, '');
    return `${base}/${ref}`;
};
const getLogInitiatorDisplay = (log) => {
    if (!log)
        return '-';
    if (log.mergeRequestAuthorUsername && log.mergeRequestAuthorName) {
        return `${log.mergeRequestAuthorName} (${log.mergeRequestAuthorUsername})`;
    }
    return log.mergeRequestAuthorUsername || log.mergeRequestAuthorName || '-';
};
const buildFallbackLogMarkdown = (log) => {
    if (!log)
        return '';
    const lines = [
        '# 合并日志详情',
        '',
        `- 策略：${log.configName || '-'}`,
        `- 触发方式：${log.triggerType === 'SCHEDULED' ? '定时调度' : '手动执行'}`,
        `- 执行结果：${log.result || '-'}`,
        `- 执行时间：${log.executedAt || '-'}`,
        `- 发起人：${getLogInitiatorDisplay(log)}`,
        '',
        '## 原因摘要',
        '',
        log.reason || '-'
    ];
    if (log.mergeRequestIid) {
        lines.splice(5, 0, `- Merge Request：!${log.mergeRequestIid} ${log.mergeRequestTitle || ''}`.trim());
    }
    if (log.webUrl) {
        lines.push('', '## Link', '', `[Open](${log.webUrl})`);
    }
    return lines.join('\n');
};
const openLogDetail = (row) => {
    currentLogDetail.value = row;
    logDetailVisible.value = true;
};
// Tag 创建需要先基于当前仓库远程拉取分支列表，避免用户手输分支导致误打标。
const loadTagBranches = async (keyword = '') => {
    if (!currentTagBinding.value)
        return;
    tagBranchLoading.value = true;
    try {
        tagBranchOptions.value = await listGitlabBranches(currentTagBinding.value.id, keyword);
        if (!tagForm.branchName) {
            const preferredBranch = currentTagBinding.value.defaultTargetBranch || tagBranchOptions.value.find((item) => item.defaultBranch)?.name || '';
            if (preferredBranch) {
                tagForm.branchName = preferredBranch;
            }
        }
    }
    finally {
        tagBranchLoading.value = false;
    }
};
const handleTagBranchSearch = (keyword) => {
    void loadTagBranches(keyword);
};
const openBindingCreateDialog = () => { bindingIsEditing.value = false; resetBindingForm(); bindingDialogVisible.value = true; };
const openBindingEditDialog = (row) => { bindingIsEditing.value = true; currentBindingId.value = row.id; bindingForm.projectId = row.projectId; bindingForm.apiBaseUrl = row.apiBaseUrl; bindingForm.gitlabProjectRef = row.gitlabProjectPath || row.gitlabProjectRef; bindingForm.defaultTargetBranch = row.defaultTargetBranch || ''; bindingForm.apiToken = ''; bindingForm.enabled = row.enabled; bindingDialogVisible.value = true; };
const handleBindingSubmit = async () => { const valid = await bindingFormRef.value?.validate().catch(() => false); if (!valid || bindingForm.projectId === null)
    return; if (!bindingIsEditing.value && !bindingForm.apiToken.trim()) {
    ElMessage.warning('新增绑定时必须填写 APIToken');
    return;
} bindingSubmitting.value = true; try {
    const payload = { ...bindingForm, projectId: bindingForm.projectId };
    if (bindingIsEditing.value && currentBindingId.value !== null) {
        await updateGitlabBinding(currentBindingId.value, payload);
        ElMessage.success('GitLab 绑定已更新');
    }
    else {
        await createGitlabBinding(payload);
        ElMessage.success('GitLab 绑定已创建');
    }
    bindingDialogVisible.value = false;
    await refreshAll();
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存失败');
}
finally {
    bindingSubmitting.value = false;
} };
const handleBindingDelete = async (id) => { try {
    await ElMessageBox.confirm('删除绑定后，关联的自动合并策略也会受影响，是否继续？', '提示', { type: 'warning' });
    await deleteGitlabBinding(id);
    ElMessage.success('绑定已删除');
    await refreshAll();
}
catch (error) {
    if (error !== 'cancel')
        ElMessage.error(error?.response?.data?.message || '删除失败');
} };
const handleBindingTest = async (id) => { try {
    const result = await testGitlabBinding(id);
    ElMessage.success(`连接成功：${result.gitlabProjectPath || result.gitlabProjectRef}`);
    await refreshAll();
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '连接测试失败');
} };
const openTagCreateDialog = async (row) => { resetTagForm(); currentTagBinding.value = row; tagDialogVisible.value = true; await loadTagBranches(); };
const handleTagSubmit = async () => { const valid = await tagFormRef.value?.validate().catch(() => false); if (!valid || !currentTagBinding.value)
    return; tagSubmitting.value = true; try {
    const result = await createGitlabTag(currentTagBinding.value.id, { tagName: tagForm.tagName.trim(), branchName: tagForm.branchName.trim(), message: tagForm.message.trim() || undefined });
    tagResult.value = result;
    tagDialogVisible.value = false;
    tagResultVisible.value = true;
    ElMessage.success(`Tag ${result.tagName} 已创建`);
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '创建 Tag 失败');
}
finally {
    tagSubmitting.value = false;
} };
const openBindingMergeRequests = async (row) => { mergeRequestDrawerTitle.value = `绑定仓库 MR 预览 - ${row.projectName} / ${row.gitlabProjectPath || row.gitlabProjectRef}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try {
    mergeRequestList.value = await previewBindingMergeRequests(row.id, row.defaultTargetBranch || undefined);
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '加载 MR 失败');
}
finally {
    mergeRequestLoading.value = false;
} };
const openAutoMergeCreateDialog = () => { autoMergeReadonlyMode.value = false; autoMergeIsEditing.value = false; resetAutoMergeForm(); autoMergeDialogVisible.value = true; };
const fillAutoMergeForm = (row) => { autoMergeIsEditing.value = true; currentAutoMergeId.value = row.id; autoMergeForm.name = row.name; autoMergeForm.executionMode = row.executionMode; autoMergeForm.description = row.description; autoMergeForm.bindingId = row.bindingId; autoMergeForm.apiBaseUrl = row.apiBaseUrl; autoMergeForm.gitlabProjectRef = row.executionMode === 'STANDALONE' ? row.gitlabProjectRef : ''; autoMergeForm.apiToken = ''; autoMergeForm.sourceBranch = row.sourceBranch || ''; autoMergeForm.targetBranch = row.targetBranch || ''; autoMergeForm.titleKeyword = row.titleKeyword || ''; autoMergeForm.schedulerEnabled = row.schedulerEnabled; autoMergeForm.schedulerCron = row.schedulerCron || '0 */5 * * * *'; autoMergeForm.enabled = row.enabled; autoMergeForm.autoMerge = row.autoMerge; autoMergeForm.squashOnMerge = row.squashOnMerge; autoMergeForm.removeSourceBranch = row.removeSourceBranch; autoMergeForm.triggerPipelineAfterMerge = row.triggerPipelineAfterMerge; autoMergeForm.requirePipelineSuccess = row.requirePipelineSuccess; autoMergeForm.reviewAgentId = row.reviewAgentId; autoMergeForm.aiReviewEnabled = row.aiReviewEnabled; autoMergeForm.aiReviewPrompt = row.aiReviewPrompt || ''; cronTemplate.value = ''; };
const openAutoMergeDetailDialog = (row) => { autoMergeReadonlyMode.value = true; fillAutoMergeForm(row); autoMergeDialogVisible.value = true; };
const openAutoMergeEditDialog = (row) => { autoMergeReadonlyMode.value = false; fillAutoMergeForm(row); autoMergeDialogVisible.value = true; };
const handleAutoMergeSubmit = async () => { const valid = await autoMergeFormRef.value?.validate().catch(() => false); if (!valid)
    return; if (autoMergeForm.executionMode === 'PROJECT_BOUND' && !autoMergeForm.bindingId) {
    ElMessage.warning('关联业务项目模式必须选择 GitLab 绑定');
    return;
} if (autoMergeForm.executionMode === 'STANDALONE') {
    if (!autoMergeForm.apiBaseUrl.trim() || !autoMergeForm.gitlabProjectRef.trim()) {
        ElMessage.warning('独立运行模式必须填写 GitLab API 和项目标识');
        return;
    }
    if (!autoMergeIsEditing.value && !autoMergeForm.apiToken.trim()) {
        ElMessage.warning('独立运行模式新增时必须填写 APIToken');
        return;
    }
    if (autoMergeForm.triggerPipelineAfterMerge) {
        ElMessage.warning('独立运行模式不支持合并后自动触发 Jenkins');
        return;
    }
} if (autoMergeForm.schedulerEnabled && !autoMergeForm.schedulerCron.trim()) {
    ElMessage.warning('启用调度时必须填写 Cron 表达式');
    return;
} if (autoMergeForm.aiReviewEnabled && !autoMergeForm.reviewAgentId) {
    ElMessage.warning('启用 AI Review 时必须选择模型');
    return;
} autoMergeSubmitting.value = true; try {
    const payload = { ...autoMergeForm, schedulerCron: autoMergeForm.schedulerCron.trim() };
    if (autoMergeIsEditing.value && currentAutoMergeId.value !== null) {
        await updateGitlabAutoMergeConfig(currentAutoMergeId.value, payload);
        ElMessage.success('自动合并策略已更新');
    }
    else {
        await createGitlabAutoMergeConfig(payload);
        ElMessage.success('自动合并策略已创建');
    }
    autoMergeDialogVisible.value = false;
    await refreshAll();
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '保存失败');
}
finally {
    autoMergeSubmitting.value = false;
} };
const handleAutoMergeDelete = async (id) => { try {
    await ElMessageBox.confirm('确认删除该自动合并策略吗？', '提示', { type: 'warning' });
    await deleteGitlabAutoMergeConfig(id);
    ElMessage.success('自动合并策略已删除');
    await refreshAll();
}
catch (error) {
    if (error !== 'cancel')
        ElMessage.error(error?.response?.data?.message || '删除失败');
} };
const handleAutoMergeTest = async (id) => { try {
    await testGitlabAutoMergeConfig(id);
    ElMessage.success('策略测试成功');
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '策略测试失败');
} };
const openAutoMergeMergeRequests = async (row) => { mergeRequestDrawerTitle.value = `自动合并 MR 预览 - ${row.name}`; mergeRequestDrawerVisible.value = true; mergeRequestLoading.value = true; try {
    mergeRequestList.value = await previewAutoMergeConfigMergeRequests(row.id);
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '加载 MR 失败');
}
finally {
    mergeRequestLoading.value = false;
} };
const handleAutoMergeRun = async (id) => { try {
    const result = await runAutoMergeConfig(id);
    runResult.value = result;
    runResultVisible.value = true;
    ElMessage.success(`执行完成：成功 ${result.mergedCount}，未合并 ${result.skippedCount}`);
    await Promise.all([loadAutoMergeConfigs(), loadAutoMergeLogs()]);
}
catch (error) {
    ElMessage.error(error?.response?.data?.message || '执行失败');
    await loadAutoMergeLogs();
} };
const bindingSummary = computed(() => bindingOptions.value.length);
const recentExecutionLogs = computed(() => logList.value.slice(0, 6));
const gitlabOverviewCards = computed(() => [
    { label: '项目绑定', value: bindingPagination.total, caption: '已接入平台项目与 GitLab 仓库的映射数量' },
    { label: '自动策略', value: autoMergePagination.total, caption: '当前可执行的自动合并策略总数' },
    { label: '启用策略', value: autoMergeList.value.filter((item) => item.enabled).length, caption: '当前页中处于启用状态的自动策略数量' },
    { label: '异常日志', value: logList.value.filter((item) => item.result === 'FAILED' || item.result === 'AI_REJECTED').length, caption: '当前页日志里需要优先关注的失败或拒绝记录' }
]);
onMounted(async () => { await refreshAll(); if (bindingSummary.value === 0)
    activeTab.value = 'bindings'; });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-title-link']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['el-tabs__content']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['el-tab-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-side-log-item']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-side-summary-item']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-form']} */ ;
/** @type {__VLS_StyleScopedClasses['card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-form']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-bindings-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-overview']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gitlab-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gitlab-page-stack" },
});
const __VLS_0 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "gitlab-tabs" },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "gitlab-tabs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    label: "项目绑定",
    name: "bindings",
}));
const __VLS_6 = __VLS_5({
    label: "项目绑定",
    name: "bindings",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page gitlab-main-card gitlab-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gitlab-tab-switcher" },
    role: "tablist",
    'aria-label': "GitLab 页面切换",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'bindings';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'bindings' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'autoMerge';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'autoMerge' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'logs';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'logs' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleBindingSearch) },
    value: (__VLS_ctx.bindingFilters.keyword),
    ...{ class: "management-list-search-input" },
    type: "text",
    placeholder: "搜索平台项目或 GitLab 项目标识...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_16 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    visible: (__VLS_ctx.bindingFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (300),
    popperClass: "management-list-popper",
}));
const __VLS_18 = __VLS_17({
    visible: (__VLS_ctx.bindingFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (300),
    popperClass: "management-list-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_19.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_20 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    const __VLS_24 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
    const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
    var __VLS_23;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.bindingFilters.projectId),
    clearable: true,
    placeholder: "平台项目",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.bindingFilters.projectId),
    clearable: true,
    placeholder: "平台项目",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_32 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }));
    const __VLS_34 = __VLS_33({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
var __VLS_31;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
});
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.handleBindingSearch)
};
__VLS_39.slots.default;
var __VLS_39;
const __VLS_44 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.handleBindingReset)
};
__VLS_47.slots.default;
var __VLS_47;
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_52 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
var __VLS_55;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openBindingCreateDialog) },
    ...{ class: "management-list-create-button" },
    type: "button",
});
const __VLS_60 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_63;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.bindingLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "management-list-table gitlab-binding-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-binding-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-binding-col-branch" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-binding-col-api" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-binding-col-status" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-binding-col-test" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-binding-col-updated" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "right gitlab-binding-col-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
if (!__VLS_ctx.bindingList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "7",
        ...{ class: "gitlab-empty-row" },
    });
}
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.bindingList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-binding-col-main" },
        'data-label': "仓库绑定",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-cell" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-title-icon" },
    });
    const __VLS_68 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    const __VLS_72 = {}.FolderOpened;
    /** @type {[typeof __VLS_components.FolderOpened, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    var __VLS_71;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-copy" },
    });
    if (__VLS_ctx.getBindingProjectUrl(row)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "gitlab-title-link" },
            href: (__VLS_ctx.getBindingProjectUrl(row) || undefined),
            target: "_blank",
            rel: "noreferrer",
        });
        (row.gitlabProjectPath || row.gitlabProjectRef);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "management-list-title" },
        });
        (row.gitlabProjectPath || row.gitlabProjectRef);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-subtitle" },
    });
    (__VLS_ctx.buildBindingSubtitle(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-binding-col-branch" },
        'data-label': "默认目标分支",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-text" },
    });
    (row.defaultTargetBranch || '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-binding-col-api" },
        'data-label': "API 地址",
    });
    if (row.apiBaseUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "management-list-link gitlab-mono-text" },
            href: (row.apiBaseUrl),
            target: "_blank",
            rel: "noreferrer",
        });
        (row.apiBaseUrl);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty gitlab-mono-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-binding-col-status" },
        'data-label': "状态",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.enabled ? 'success' : 'neutral') },
    });
    (row.enabled ? '启用' : '停用');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-binding-col-test" },
        'data-label': "连通性",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (__VLS_ctx.bindingStatusType(row.lastTestStatus)) },
    });
    (__VLS_ctx.formatBindingStatusLabel(row.lastTestStatus));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-binding-col-updated" },
        'data-label': "最近测试",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "gitlab-meta-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-updated" },
    });
    (__VLS_ctx.formatDateTimeText(row.lastTestedAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "gitlab-meta-note" },
    });
    (row.lastTestMessage || '尚未执行连接测试');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right gitlab-binding-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-row-actions" },
    });
    const __VLS_76 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        content: "测试连接",
        placement: "top",
    }));
    const __VLS_78 = __VLS_77({
        content: "测试连接",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleBindingTest(row.id);
            } },
        ...{ class: "management-list-row-button gitlab-action-button connection" },
        type: "button",
        'aria-label': "测试 GitLab 连接",
    });
    const __VLS_80 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
    const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    var __VLS_83;
    var __VLS_79;
    const __VLS_88 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        content: "查看合并请求",
        placement: "top",
    }));
    const __VLS_90 = __VLS_89({
        content: "查看合并请求",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openBindingMergeRequests(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button preview" },
        type: "button",
        'aria-label': "查看合并请求",
    });
    const __VLS_92 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
    const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    const __VLS_96 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
    const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
    var __VLS_95;
    var __VLS_91;
    const __VLS_100 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        content: "创建 Tag",
        placement: "top",
    }));
    const __VLS_102 = __VLS_101({
        content: "创建 Tag",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openTagCreateDialog(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button run" },
        type: "button",
        'aria-label': "创建 GitLab Tag",
    });
    const __VLS_104 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
    const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    const __VLS_108 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
    const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
    var __VLS_107;
    var __VLS_103;
    const __VLS_112 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        content: "编辑绑定",
        placement: "top",
    }));
    const __VLS_114 = __VLS_113({
        content: "编辑绑定",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openBindingEditDialog(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button" },
        type: "button",
        'aria-label': "编辑 GitLab 绑定",
    });
    const __VLS_116 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
    const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    const __VLS_120 = {}.EditPen;
    /** @type {[typeof __VLS_components.EditPen, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
    const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
    var __VLS_119;
    var __VLS_115;
    const __VLS_124 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        content: "删除绑定",
        placement: "top",
    }));
    const __VLS_126 = __VLS_125({
        content: "删除绑定",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleBindingDelete(row.id);
            } },
        ...{ class: "management-list-row-button gitlab-action-button danger" },
        type: "button",
        'aria-label': "删除 GitLab 绑定",
    });
    const __VLS_128 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
    const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    const __VLS_132 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
    const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
    var __VLS_131;
    var __VLS_127;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.bindingPagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-size management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_136 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.bindingPagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_138 = __VLS_137({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.bindingPagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
let __VLS_140;
let __VLS_141;
let __VLS_142;
const __VLS_143 = {
    onChange: (__VLS_ctx.handleBindingSizeChange)
};
__VLS_139.slots.default;
const __VLS_144 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    value: (5),
    label: "5",
}));
const __VLS_146 = __VLS_145({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
const __VLS_148 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    value: (10),
    label: "10",
}));
const __VLS_150 = __VLS_149({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
const __VLS_152 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    value: (20),
    label: "20",
}));
const __VLS_154 = __VLS_153({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
const __VLS_156 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    value: (50),
    label: "50",
}));
const __VLS_158 = __VLS_157({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
var __VLS_139;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingPrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.bindingPagination.page <= 1),
});
const __VLS_160 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({}));
const __VLS_162 = __VLS_161({}, ...__VLS_functionalComponentArgsRest(__VLS_161));
__VLS_163.slots.default;
const __VLS_164 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({}));
const __VLS_166 = __VLS_165({}, ...__VLS_functionalComponentArgsRest(__VLS_165));
var __VLS_163;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-page-text" },
});
(__VLS_ctx.bindingPagination.page);
(__VLS_ctx.bindingTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBindingNextPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.bindingPagination.page >= __VLS_ctx.bindingTotalPages),
});
const __VLS_168 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({}));
const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
const __VLS_172 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({}));
const __VLS_174 = __VLS_173({}, ...__VLS_functionalComponentArgsRest(__VLS_173));
var __VLS_171;
var __VLS_7;
const __VLS_176 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "自动合并中心",
    name: "autoMerge",
}));
const __VLS_178 = __VLS_177({
    label: "自动合并中心",
    name: "autoMerge",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page gitlab-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gitlab-tab-switcher" },
    role: "tablist",
    'aria-label': "GitLab 页面切换",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'bindings';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'bindings' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'autoMerge';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'autoMerge' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'logs';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'logs' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_180 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_182 = __VLS_181({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
__VLS_183.slots.default;
const __VLS_184 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({}));
const __VLS_186 = __VLS_185({}, ...__VLS_functionalComponentArgsRest(__VLS_185));
var __VLS_183;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onKeyup: (__VLS_ctx.handleAutoMergeSearch) },
    value: (__VLS_ctx.autoMergeFilters.keyword),
    ...{ class: "management-list-search-input" },
    type: "text",
    placeholder: "搜索策略名、描述或项目...",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_188 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    visible: (__VLS_ctx.autoMergeFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}));
const __VLS_190 = __VLS_189({
    visible: (__VLS_ctx.autoMergeFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
__VLS_191.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_191.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_192 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({}));
    const __VLS_194 = __VLS_193({}, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    const __VLS_196 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({}));
    const __VLS_198 = __VLS_197({}, ...__VLS_functionalComponentArgsRest(__VLS_197));
    var __VLS_195;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_200 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    modelValue: (__VLS_ctx.autoMergeFilters.executionMode),
    clearable: true,
    placeholder: "执行模式",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_202 = __VLS_201({
    modelValue: (__VLS_ctx.autoMergeFilters.executionMode),
    clearable: true,
    placeholder: "执行模式",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
const __VLS_204 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    label: "关联业务项目",
    value: "PROJECT_BOUND",
}));
const __VLS_206 = __VLS_205({
    label: "关联业务项目",
    value: "PROJECT_BOUND",
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
const __VLS_208 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    label: "独立运行",
    value: "STANDALONE",
}));
const __VLS_210 = __VLS_209({
    label: "独立运行",
    value: "STANDALONE",
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
var __VLS_203;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_212 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
    modelValue: (__VLS_ctx.autoMergeFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_214 = __VLS_213({
    modelValue: (__VLS_ctx.autoMergeFilters.enabled),
    clearable: true,
    placeholder: "启用状态",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_213));
__VLS_215.slots.default;
const __VLS_216 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    value: (true),
    label: "启用",
}));
const __VLS_218 = __VLS_217({
    value: (true),
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
const __VLS_220 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    value: (false),
    label: "停用",
}));
const __VLS_222 = __VLS_221({
    value: (false),
    label: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
var __VLS_215;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
});
const __VLS_224 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_226 = __VLS_225({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_225));
let __VLS_228;
let __VLS_229;
let __VLS_230;
const __VLS_231 = {
    onClick: (__VLS_ctx.handleAutoMergeSearch)
};
__VLS_227.slots.default;
var __VLS_227;
const __VLS_232 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    ...{ 'onClick': {} },
}));
const __VLS_234 = __VLS_233({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_236;
let __VLS_237;
let __VLS_238;
const __VLS_239 = {
    onClick: (__VLS_ctx.handleAutoMergeReset)
};
__VLS_235.slots.default;
var __VLS_235;
var __VLS_191;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleAutoMergeReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_240 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({}));
const __VLS_242 = __VLS_241({}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_243.slots.default;
const __VLS_244 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({}));
const __VLS_246 = __VLS_245({}, ...__VLS_functionalComponentArgsRest(__VLS_245));
var __VLS_243;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openAutoMergeCreateDialog) },
    ...{ class: "management-list-create-button" },
    type: "button",
});
const __VLS_248 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({}));
const __VLS_250 = __VLS_249({}, ...__VLS_functionalComponentArgsRest(__VLS_249));
__VLS_251.slots.default;
const __VLS_252 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({}));
const __VLS_254 = __VLS_253({}, ...__VLS_functionalComponentArgsRest(__VLS_253));
var __VLS_251;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.autoMergeLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "management-list-table gitlab-auto-merge-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-auto-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-auto-col-mode" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-auto-col-rule" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-auto-col-scheduler" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-auto-col-enabled" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-auto-col-run" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "right gitlab-auto-col-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
if (!__VLS_ctx.autoMergeList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "7",
        ...{ class: "gitlab-empty-row" },
    });
}
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.autoMergeList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-auto-col-main" },
        'data-label': "策略",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openAutoMergeDetailDialog(row);
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
    const __VLS_256 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({}));
    const __VLS_258 = __VLS_257({}, ...__VLS_functionalComponentArgsRest(__VLS_257));
    __VLS_259.slots.default;
    const __VLS_260 = {}.Tickets;
    /** @type {[typeof __VLS_components.Tickets, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({}));
    const __VLS_262 = __VLS_261({}, ...__VLS_functionalComponentArgsRest(__VLS_261));
    var __VLS_259;
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
    (__VLS_ctx.buildAutoMergeSubtitle(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-auto-col-mode" },
        'data-label': "模式",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.executionMode === 'STANDALONE' ? 'warning' : 'info') },
    });
    (__VLS_ctx.formatExecutionModeLabel(row.executionMode));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-auto-col-rule" },
        'data-label': "分支规则",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "gitlab-meta-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.sourceBranch || '不限');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.targetBranch || '不限');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.titleKeyword || '不限');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-auto-col-scheduler" },
        'data-label': "调度",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "gitlab-meta-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.schedulerEnabled ? `Cron：${row.schedulerCron || '-'}` : '未启用调度');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.aiReviewEnabled ? (row.reviewAgentName || '已启用') : '关闭');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.triggerPipelineAfterMerge ? '开启' : '关闭');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-auto-col-enabled" },
        'data-label': "启用",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.enabled ? 'success' : 'neutral') },
    });
    (row.enabled ? '启用' : '停用');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-auto-col-run" },
        'data-label': "最近执行",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "gitlab-meta-stack" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (__VLS_ctx.runStatusType(row.lastRunStatus)) },
    });
    (__VLS_ctx.formatRunStatusLabel(row.lastRunStatus));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "gitlab-meta-note" },
    });
    (__VLS_ctx.formatDateTimeText(row.lastRunAt));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "gitlab-meta-note" },
    });
    (__VLS_ctx.formatDateTimeText(row.nextExecutionTime));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right gitlab-auto-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-row-actions" },
    });
    const __VLS_264 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
        content: "测试策略",
        placement: "top",
    }));
    const __VLS_266 = __VLS_265({
        content: "测试策略",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_265));
    __VLS_267.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleAutoMergeTest(row.id);
            } },
        ...{ class: "management-list-row-button gitlab-action-button connection" },
        type: "button",
        'aria-label': "测试自动合并策略",
    });
    const __VLS_268 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({}));
    const __VLS_270 = __VLS_269({}, ...__VLS_functionalComponentArgsRest(__VLS_269));
    __VLS_271.slots.default;
    const __VLS_272 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({}));
    const __VLS_274 = __VLS_273({}, ...__VLS_functionalComponentArgsRest(__VLS_273));
    var __VLS_271;
    var __VLS_267;
    const __VLS_276 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        content: "预览 MR",
        placement: "top",
    }));
    const __VLS_278 = __VLS_277({
        content: "预览 MR",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_279.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openAutoMergeMergeRequests(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button preview" },
        type: "button",
        'aria-label': "预览自动合并 MR",
    });
    const __VLS_280 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({}));
    const __VLS_282 = __VLS_281({}, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    const __VLS_284 = {}.DocumentCopy;
    /** @type {[typeof __VLS_components.DocumentCopy, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({}));
    const __VLS_286 = __VLS_285({}, ...__VLS_functionalComponentArgsRest(__VLS_285));
    var __VLS_283;
    var __VLS_279;
    const __VLS_288 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        content: "立即执行",
        placement: "top",
    }));
    const __VLS_290 = __VLS_289({
        content: "立即执行",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleAutoMergeRun(row.id);
            } },
        ...{ class: "management-list-row-button gitlab-action-button run" },
        type: "button",
        'aria-label': "立即执行自动合并",
    });
    const __VLS_292 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({}));
    const __VLS_294 = __VLS_293({}, ...__VLS_functionalComponentArgsRest(__VLS_293));
    __VLS_295.slots.default;
    const __VLS_296 = {}.VideoPlay;
    /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({}));
    const __VLS_298 = __VLS_297({}, ...__VLS_functionalComponentArgsRest(__VLS_297));
    var __VLS_295;
    var __VLS_291;
    const __VLS_300 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        content: "编辑策略",
        placement: "top",
    }));
    const __VLS_302 = __VLS_301({
        content: "编辑策略",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    __VLS_303.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openAutoMergeEditDialog(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button" },
        type: "button",
        'aria-label': "编辑自动合并策略",
    });
    const __VLS_304 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({}));
    const __VLS_306 = __VLS_305({}, ...__VLS_functionalComponentArgsRest(__VLS_305));
    __VLS_307.slots.default;
    const __VLS_308 = {}.EditPen;
    /** @type {[typeof __VLS_components.EditPen, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({}));
    const __VLS_310 = __VLS_309({}, ...__VLS_functionalComponentArgsRest(__VLS_309));
    var __VLS_307;
    var __VLS_303;
    const __VLS_312 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
        content: "删除策略",
        placement: "top",
    }));
    const __VLS_314 = __VLS_313({
        content: "删除策略",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    __VLS_315.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.handleAutoMergeDelete(row.id);
            } },
        ...{ class: "management-list-row-button gitlab-action-button danger" },
        type: "button",
        'aria-label': "删除自动合并策略",
    });
    const __VLS_316 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({}));
    const __VLS_318 = __VLS_317({}, ...__VLS_functionalComponentArgsRest(__VLS_317));
    __VLS_319.slots.default;
    const __VLS_320 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({}));
    const __VLS_322 = __VLS_321({}, ...__VLS_functionalComponentArgsRest(__VLS_321));
    var __VLS_319;
    var __VLS_315;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.autoMergePagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-size management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_324 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.autoMergePagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_326 = __VLS_325({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.autoMergePagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_325));
let __VLS_328;
let __VLS_329;
let __VLS_330;
const __VLS_331 = {
    onChange: (__VLS_ctx.handleAutoMergeSizeChange)
};
__VLS_327.slots.default;
const __VLS_332 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
    value: (5),
    label: "5",
}));
const __VLS_334 = __VLS_333({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_333));
const __VLS_336 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
    value: (10),
    label: "10",
}));
const __VLS_338 = __VLS_337({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_337));
const __VLS_340 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
    value: (20),
    label: "20",
}));
const __VLS_342 = __VLS_341({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_341));
const __VLS_344 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
    value: (50),
    label: "50",
}));
const __VLS_346 = __VLS_345({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_345));
var __VLS_327;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleAutoMergePrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.autoMergePagination.page <= 1),
});
const __VLS_348 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({}));
const __VLS_350 = __VLS_349({}, ...__VLS_functionalComponentArgsRest(__VLS_349));
__VLS_351.slots.default;
const __VLS_352 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({}));
const __VLS_354 = __VLS_353({}, ...__VLS_functionalComponentArgsRest(__VLS_353));
var __VLS_351;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-page-text" },
});
(__VLS_ctx.autoMergePagination.page);
(__VLS_ctx.autoMergeTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleAutoMergeNextPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.autoMergePagination.page >= __VLS_ctx.autoMergeTotalPages),
});
const __VLS_356 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({}));
const __VLS_358 = __VLS_357({}, ...__VLS_functionalComponentArgsRest(__VLS_357));
__VLS_359.slots.default;
const __VLS_360 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({}));
const __VLS_362 = __VLS_361({}, ...__VLS_functionalComponentArgsRest(__VLS_361));
var __VLS_359;
var __VLS_179;
const __VLS_364 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
    label: "自动合并日志",
    name: "logs",
}));
const __VLS_366 = __VLS_365({
    label: "自动合并日志",
    name: "logs",
}, ...__VLS_functionalComponentArgsRest(__VLS_365));
__VLS_367.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page gitlab-list-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gitlab-tab-switcher" },
    role: "tablist",
    'aria-label': "GitLab 页面切换",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'bindings';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'bindings' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'autoMerge';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'autoMerge' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.activeTab = 'logs';
        } },
    ...{ class: "gitlab-tab-button" },
    ...{ class: ({ active: __VLS_ctx.activeTab === 'logs' }) },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-search-shell" },
});
const __VLS_368 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
    ...{ class: "management-list-search-icon" },
}));
const __VLS_370 = __VLS_369({
    ...{ class: "management-list-search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_369));
__VLS_371.slots.default;
const __VLS_372 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({}));
const __VLS_374 = __VLS_373({}, ...__VLS_functionalComponentArgsRest(__VLS_373));
var __VLS_371;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ class: "management-list-search-input" },
    type: "text",
    value: "",
    placeholder: "通过筛选查看自动合并日志...",
    readonly: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-toolbar-divider" },
    'aria-hidden': "true",
});
const __VLS_376 = {}.ElPopover;
/** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
    visible: (__VLS_ctx.logFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}));
const __VLS_378 = __VLS_377({
    visible: (__VLS_ctx.logFilterPopoverVisible),
    trigger: "click",
    placement: "bottom-start",
    width: (320),
    popperClass: "management-list-popper",
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
__VLS_379.slots.default;
{
    const { reference: __VLS_thisSlot } = __VLS_379.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ class: "management-list-toolbar-button" },
        type: "button",
    });
    const __VLS_380 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({}));
    const __VLS_382 = __VLS_381({}, ...__VLS_functionalComponentArgsRest(__VLS_381));
    __VLS_383.slots.default;
    const __VLS_384 = {}.Filter;
    /** @type {[typeof __VLS_components.Filter, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({}));
    const __VLS_386 = __VLS_385({}, ...__VLS_functionalComponentArgsRest(__VLS_385));
    var __VLS_383;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-panel management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_388 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
    modelValue: (__VLS_ctx.logFilters.result),
    clearable: true,
    placeholder: "结果",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_390 = __VLS_389({
    modelValue: (__VLS_ctx.logFilters.result),
    clearable: true,
    placeholder: "结果",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_389));
__VLS_391.slots.default;
const __VLS_392 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
    label: "已合并",
    value: "MERGED",
}));
const __VLS_394 = __VLS_393({
    label: "已合并",
    value: "MERGED",
}, ...__VLS_functionalComponentArgsRest(__VLS_393));
const __VLS_396 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
    label: "已跳过",
    value: "SKIPPED",
}));
const __VLS_398 = __VLS_397({
    label: "已跳过",
    value: "SKIPPED",
}, ...__VLS_functionalComponentArgsRest(__VLS_397));
const __VLS_400 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
    label: "AI 拒绝",
    value: "AI_REJECTED",
}));
const __VLS_402 = __VLS_401({
    label: "AI 拒绝",
    value: "AI_REJECTED",
}, ...__VLS_functionalComponentArgsRest(__VLS_401));
const __VLS_404 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
    label: "失败",
    value: "FAILED",
}));
const __VLS_406 = __VLS_405({
    label: "失败",
    value: "FAILED",
}, ...__VLS_functionalComponentArgsRest(__VLS_405));
const __VLS_408 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
    label: "空执行",
    value: "EMPTY",
}));
const __VLS_410 = __VLS_409({
    label: "空执行",
    value: "EMPTY",
}, ...__VLS_functionalComponentArgsRest(__VLS_409));
var __VLS_391;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_412 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
    modelValue: (__VLS_ctx.logFilters.triggerType),
    clearable: true,
    placeholder: "触发方式",
    ...{ style: {} },
    teleported: (false),
}));
const __VLS_414 = __VLS_413({
    modelValue: (__VLS_ctx.logFilters.triggerType),
    clearable: true,
    placeholder: "触发方式",
    ...{ style: {} },
    teleported: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_413));
__VLS_415.slots.default;
const __VLS_416 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
    label: "手动执行",
    value: "MANUAL",
}));
const __VLS_418 = __VLS_417({
    label: "手动执行",
    value: "MANUAL",
}, ...__VLS_functionalComponentArgsRest(__VLS_417));
const __VLS_420 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
    label: "定时调度",
    value: "SCHEDULED",
}));
const __VLS_422 = __VLS_421({
    label: "定时调度",
    value: "SCHEDULED",
}, ...__VLS_functionalComponentArgsRest(__VLS_421));
var __VLS_415;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-filter-actions" },
});
const __VLS_424 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_426 = __VLS_425({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_425));
let __VLS_428;
let __VLS_429;
let __VLS_430;
const __VLS_431 = {
    onClick: (__VLS_ctx.handleLogSearch)
};
__VLS_427.slots.default;
var __VLS_427;
const __VLS_432 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
    ...{ 'onClick': {} },
}));
const __VLS_434 = __VLS_433({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_433));
let __VLS_436;
let __VLS_437;
let __VLS_438;
const __VLS_439 = {
    onClick: (__VLS_ctx.handleLogReset)
};
__VLS_435.slots.default;
var __VLS_435;
var __VLS_379;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleLogReset) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_440 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({}));
const __VLS_442 = __VLS_441({}, ...__VLS_functionalComponentArgsRest(__VLS_441));
__VLS_443.slots.default;
const __VLS_444 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({}));
const __VLS_446 = __VLS_445({}, ...__VLS_functionalComponentArgsRest(__VLS_445));
var __VLS_443;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-toolbar-side" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.loadAutoMergeLogs) },
    ...{ class: "management-list-toolbar-button" },
    type: "button",
});
const __VLS_448 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({}));
const __VLS_450 = __VLS_449({}, ...__VLS_functionalComponentArgsRest(__VLS_449));
__VLS_451.slots.default;
const __VLS_452 = {}.RefreshRight;
/** @type {[typeof __VLS_components.RefreshRight, ]} */ ;
// @ts-ignore
const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({}));
const __VLS_454 = __VLS_453({}, ...__VLS_functionalComponentArgsRest(__VLS_453));
var __VLS_451;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "management-list-shell" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-table-scroll mobile-card-scroll" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.logLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
    ...{ class: "management-list-table gitlab-log-table mobile-card-table" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-log-col-main" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-log-col-trigger" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-log-col-user" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "center gitlab-log-col-result" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-log-col-reason" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "gitlab-log-col-link" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
    ...{ class: "right gitlab-log-col-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
if (!__VLS_ctx.logList.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        colspan: "7",
        ...{ class: "gitlab-empty-row" },
    });
}
for (const [row] of __VLS_getVForSourceType((__VLS_ctx.logList))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
        key: (row.id),
        ...{ class: "management-list-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-log-col-main" },
        'data-label': "执行记录",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openLogDetail(row);
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
    const __VLS_456 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({}));
    const __VLS_458 = __VLS_457({}, ...__VLS_functionalComponentArgsRest(__VLS_457));
    __VLS_459.slots.default;
    const __VLS_460 = {}.DocumentCopy;
    /** @type {[typeof __VLS_components.DocumentCopy, ]} */ ;
    // @ts-ignore
    const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({}));
    const __VLS_462 = __VLS_461({}, ...__VLS_functionalComponentArgsRest(__VLS_461));
    var __VLS_459;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-title" },
    });
    (row.configName || '自动合并执行');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-subtitle" },
    });
    (__VLS_ctx.buildLogSubtitle(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-log-col-trigger" },
        'data-label': "触发方式",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (row.triggerType === 'SCHEDULED' ? 'warning' : 'info') },
    });
    (__VLS_ctx.formatTriggerTypeLabel(row.triggerType));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-log-col-user" },
        'data-label': "发起人",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-empty" },
    });
    (__VLS_ctx.getLogInitiatorDisplay(row));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "center gitlab-log-col-result" },
        'data-label': "结果",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-pill" },
        ...{ class: (__VLS_ctx.logResultType(row.result)) },
    });
    (__VLS_ctx.logResultText(row.result));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-log-col-reason" },
        'data-label': "原因",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "management-list-empty" },
    });
    (row.reason || '-');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "gitlab-log-col-link" },
        'data-label': "链接",
    });
    if (row.webUrl) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.a, __VLS_intrinsicElements.a)({
            ...{ class: "management-list-link" },
            href: (row.webUrl),
            target: "_blank",
            rel: "noreferrer",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "management-list-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
        ...{ class: "right gitlab-log-col-actions" },
        'data-label': "操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "management-list-row-actions" },
    });
    const __VLS_464 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
        content: "查看详情",
        placement: "top",
    }));
    const __VLS_466 = __VLS_465({
        content: "查看详情",
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_465));
    __VLS_467.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.openLogDetail(row);
            } },
        ...{ class: "management-list-row-button gitlab-action-button preview" },
        type: "button",
        'aria-label': "查看日志详情",
    });
    const __VLS_468 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({}));
    const __VLS_470 = __VLS_469({}, ...__VLS_functionalComponentArgsRest(__VLS_469));
    __VLS_471.slots.default;
    const __VLS_472 = {}.DocumentCopy;
    /** @type {[typeof __VLS_components.DocumentCopy, ]} */ ;
    // @ts-ignore
    const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({}));
    const __VLS_474 = __VLS_473({}, ...__VLS_functionalComponentArgsRest(__VLS_473));
    var __VLS_471;
    var __VLS_467;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-total" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.logPagination.total);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-footer-controls" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-size management-list-compact-input" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_476 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.logPagination.size),
    size: "small",
    ...{ style: {} },
}));
const __VLS_478 = __VLS_477({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.logPagination.size),
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_477));
let __VLS_480;
let __VLS_481;
let __VLS_482;
const __VLS_483 = {
    onChange: (__VLS_ctx.handleLogSizeChange)
};
__VLS_479.slots.default;
const __VLS_484 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
    value: (5),
    label: "5",
}));
const __VLS_486 = __VLS_485({
    value: (5),
    label: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_485));
const __VLS_488 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
    value: (10),
    label: "10",
}));
const __VLS_490 = __VLS_489({
    value: (10),
    label: "10",
}, ...__VLS_functionalComponentArgsRest(__VLS_489));
const __VLS_492 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
    value: (20),
    label: "20",
}));
const __VLS_494 = __VLS_493({
    value: (20),
    label: "20",
}, ...__VLS_functionalComponentArgsRest(__VLS_493));
const __VLS_496 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
    value: (50),
    label: "50",
}));
const __VLS_498 = __VLS_497({
    value: (50),
    label: "50",
}, ...__VLS_functionalComponentArgsRest(__VLS_497));
var __VLS_479;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "management-list-page-nav" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleLogPrevPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.logPagination.page <= 1),
});
const __VLS_500 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({}));
const __VLS_502 = __VLS_501({}, ...__VLS_functionalComponentArgsRest(__VLS_501));
__VLS_503.slots.default;
const __VLS_504 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({}));
const __VLS_506 = __VLS_505({}, ...__VLS_functionalComponentArgsRest(__VLS_505));
var __VLS_503;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "management-list-page-text" },
});
(__VLS_ctx.logPagination.page);
(__VLS_ctx.logTotalPages);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleLogNextPage) },
    ...{ class: "management-list-page-button" },
    type: "button",
    disabled: (__VLS_ctx.logPagination.page >= __VLS_ctx.logTotalPages),
});
const __VLS_508 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({}));
const __VLS_510 = __VLS_509({}, ...__VLS_functionalComponentArgsRest(__VLS_509));
__VLS_511.slots.default;
const __VLS_512 = {}.ArrowRight;
/** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
// @ts-ignore
const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({}));
const __VLS_514 = __VLS_513({}, ...__VLS_functionalComponentArgsRest(__VLS_513));
var __VLS_511;
var __VLS_367;
var __VLS_3;
const __VLS_516 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingIsEditing ? '编辑 GitLab 绑定' : '新增 GitLab 绑定'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_518 = __VLS_517({
    modelValue: (__VLS_ctx.bindingDialogVisible),
    title: (__VLS_ctx.bindingIsEditing ? '编辑 GitLab 绑定' : '新增 GitLab 绑定'),
    width: "640px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_517));
__VLS_519.slots.default;
const __VLS_520 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_522 = __VLS_521({
    ref: "bindingFormRef",
    model: (__VLS_ctx.bindingForm),
    rules: (__VLS_ctx.bindingRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_521));
/** @type {typeof __VLS_ctx.bindingFormRef} */ ;
var __VLS_524 = {};
__VLS_523.slots.default;
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
const __VLS_526 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_527 = __VLS_asFunctionalComponent(__VLS_526, new __VLS_526({
    label: "平台项目",
    prop: "projectId",
}));
const __VLS_528 = __VLS_527({
    label: "平台项目",
    prop: "projectId",
}, ...__VLS_functionalComponentArgsRest(__VLS_527));
__VLS_529.slots.default;
const __VLS_530 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_531 = __VLS_asFunctionalComponent(__VLS_530, new __VLS_530({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择平台项目",
    ...{ style: {} },
}));
const __VLS_532 = __VLS_531({
    modelValue: (__VLS_ctx.bindingForm.projectId),
    placeholder: "请选择平台项目",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_531));
__VLS_533.slots.default;
for (const [project] of __VLS_getVForSourceType((__VLS_ctx.projectOptions))) {
    const __VLS_534 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_535 = __VLS_asFunctionalComponent(__VLS_534, new __VLS_534({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }));
    const __VLS_536 = __VLS_535({
        key: (project.id),
        label: (project.name),
        value: (project.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_535));
}
var __VLS_533;
var __VLS_529;
const __VLS_538 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_539 = __VLS_asFunctionalComponent(__VLS_538, new __VLS_538({
    label: "GitLab API",
    prop: "apiBaseUrl",
}));
const __VLS_540 = __VLS_539({
    label: "GitLab API",
    prop: "apiBaseUrl",
}, ...__VLS_functionalComponentArgsRest(__VLS_539));
__VLS_541.slots.default;
const __VLS_542 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_543 = __VLS_asFunctionalComponent(__VLS_542, new __VLS_542({
    modelValue: (__VLS_ctx.bindingForm.apiBaseUrl),
}));
const __VLS_544 = __VLS_543({
    modelValue: (__VLS_ctx.bindingForm.apiBaseUrl),
}, ...__VLS_functionalComponentArgsRest(__VLS_543));
var __VLS_541;
const __VLS_546 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_547 = __VLS_asFunctionalComponent(__VLS_546, new __VLS_546({
    label: "项目 ID / 路径",
    prop: "gitlabProjectRef",
}));
const __VLS_548 = __VLS_547({
    label: "项目 ID / 路径",
    prop: "gitlabProjectRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_547));
__VLS_549.slots.default;
const __VLS_550 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_551 = __VLS_asFunctionalComponent(__VLS_550, new __VLS_550({
    modelValue: (__VLS_ctx.bindingForm.gitlabProjectRef),
}));
const __VLS_552 = __VLS_551({
    modelValue: (__VLS_ctx.bindingForm.gitlabProjectRef),
}, ...__VLS_functionalComponentArgsRest(__VLS_551));
var __VLS_549;
const __VLS_554 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_555 = __VLS_asFunctionalComponent(__VLS_554, new __VLS_554({
    label: "默认目标分支",
}));
const __VLS_556 = __VLS_555({
    label: "默认目标分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_555));
__VLS_557.slots.default;
const __VLS_558 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_559 = __VLS_asFunctionalComponent(__VLS_558, new __VLS_558({
    modelValue: (__VLS_ctx.bindingForm.defaultTargetBranch),
}));
const __VLS_560 = __VLS_559({
    modelValue: (__VLS_ctx.bindingForm.defaultTargetBranch),
}, ...__VLS_functionalComponentArgsRest(__VLS_559));
var __VLS_557;
const __VLS_562 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_563 = __VLS_asFunctionalComponent(__VLS_562, new __VLS_562({
    label: "APIToken",
}));
const __VLS_564 = __VLS_563({
    label: "APIToken",
}, ...__VLS_functionalComponentArgsRest(__VLS_563));
__VLS_565.slots.default;
const __VLS_566 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_567 = __VLS_asFunctionalComponent(__VLS_566, new __VLS_566({
    modelValue: (__VLS_ctx.bindingForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.bindingIsEditing ? '留空则保留原 Token' : '请输入 APIToken'),
}));
const __VLS_568 = __VLS_567({
    modelValue: (__VLS_ctx.bindingForm.apiToken),
    type: "password",
    showPassword: true,
    placeholder: (__VLS_ctx.bindingIsEditing ? '留空则保留原 Token' : '请输入 APIToken'),
}, ...__VLS_functionalComponentArgsRest(__VLS_567));
var __VLS_565;
const __VLS_570 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_571 = __VLS_asFunctionalComponent(__VLS_570, new __VLS_570({
    label: "启用",
}));
const __VLS_572 = __VLS_571({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_571));
__VLS_573.slots.default;
const __VLS_574 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_575 = __VLS_asFunctionalComponent(__VLS_574, new __VLS_574({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}));
const __VLS_576 = __VLS_575({
    modelValue: (__VLS_ctx.bindingForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_575));
var __VLS_573;
var __VLS_523;
{
    const { footer: __VLS_thisSlot } = __VLS_519.slots;
    const __VLS_578 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_579 = __VLS_asFunctionalComponent(__VLS_578, new __VLS_578({
        ...{ 'onClick': {} },
    }));
    const __VLS_580 = __VLS_579({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_579));
    let __VLS_582;
    let __VLS_583;
    let __VLS_584;
    const __VLS_585 = {
        onClick: (...[$event]) => {
            __VLS_ctx.bindingDialogVisible = false;
        }
    };
    __VLS_581.slots.default;
    var __VLS_581;
    const __VLS_586 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_587 = __VLS_asFunctionalComponent(__VLS_586, new __VLS_586({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bindingSubmitting),
    }));
    const __VLS_588 = __VLS_587({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bindingSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_587));
    let __VLS_590;
    let __VLS_591;
    let __VLS_592;
    const __VLS_593 = {
        onClick: (__VLS_ctx.handleBindingSubmit)
    };
    __VLS_589.slots.default;
    var __VLS_589;
}
var __VLS_519;
const __VLS_594 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_595 = __VLS_asFunctionalComponent(__VLS_594, new __VLS_594({
    modelValue: (__VLS_ctx.tagDialogVisible),
    title: "创建 GitLab Tag",
    width: "680px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_596 = __VLS_595({
    modelValue: (__VLS_ctx.tagDialogVisible),
    title: "创建 GitLab Tag",
    width: "680px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_595));
__VLS_597.slots.default;
const __VLS_598 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_599 = __VLS_asFunctionalComponent(__VLS_598, new __VLS_598({
    ref: "tagFormRef",
    model: (__VLS_ctx.tagForm),
    rules: (__VLS_ctx.tagRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}));
const __VLS_600 = __VLS_599({
    ref: "tagFormRef",
    model: (__VLS_ctx.tagForm),
    rules: (__VLS_ctx.tagRules),
    labelWidth: "120px",
    ...{ class: "platform-form-layout" },
}, ...__VLS_functionalComponentArgsRest(__VLS_599));
/** @type {typeof __VLS_ctx.tagFormRef} */ ;
var __VLS_602 = {};
__VLS_601.slots.default;
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
const __VLS_604 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_605 = __VLS_asFunctionalComponent(__VLS_604, new __VLS_604({
    label: "当前仓库",
}));
const __VLS_606 = __VLS_605({
    label: "当前仓库",
}, ...__VLS_functionalComponentArgsRest(__VLS_605));
__VLS_607.slots.default;
const __VLS_608 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_609 = __VLS_asFunctionalComponent(__VLS_608, new __VLS_608({
    modelValue: (__VLS_ctx.currentTagBinding ? `${__VLS_ctx.currentTagBinding.projectName} / ${__VLS_ctx.currentTagBinding.gitlabProjectPath || __VLS_ctx.currentTagBinding.gitlabProjectRef}` : ''),
    disabled: true,
}));
const __VLS_610 = __VLS_609({
    modelValue: (__VLS_ctx.currentTagBinding ? `${__VLS_ctx.currentTagBinding.projectName} / ${__VLS_ctx.currentTagBinding.gitlabProjectPath || __VLS_ctx.currentTagBinding.gitlabProjectRef}` : ''),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_609));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
(__VLS_ctx.currentTagBinding?.defaultTargetBranch || '未配置');
var __VLS_607;
const __VLS_612 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_613 = __VLS_asFunctionalComponent(__VLS_612, new __VLS_612({
    label: "Tag 名称",
    prop: "tagName",
}));
const __VLS_614 = __VLS_613({
    label: "Tag 名称",
    prop: "tagName",
}, ...__VLS_functionalComponentArgsRest(__VLS_613));
__VLS_615.slots.default;
const __VLS_616 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_617 = __VLS_asFunctionalComponent(__VLS_616, new __VLS_616({
    modelValue: (__VLS_ctx.tagForm.tagName),
    placeholder: "例如：v1.2.0",
}));
const __VLS_618 = __VLS_617({
    modelValue: (__VLS_ctx.tagForm.tagName),
    placeholder: "例如：v1.2.0",
}, ...__VLS_functionalComponentArgsRest(__VLS_617));
var __VLS_615;
const __VLS_620 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_621 = __VLS_asFunctionalComponent(__VLS_620, new __VLS_620({
    label: "来源分支",
    prop: "branchName",
}));
const __VLS_622 = __VLS_621({
    label: "来源分支",
    prop: "branchName",
}, ...__VLS_functionalComponentArgsRest(__VLS_621));
__VLS_623.slots.default;
const __VLS_624 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_625 = __VLS_asFunctionalComponent(__VLS_624, new __VLS_624({
    modelValue: (__VLS_ctx.tagForm.branchName),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleTagBranchSearch),
    loading: (__VLS_ctx.tagBranchLoading),
}));
const __VLS_626 = __VLS_625({
    modelValue: (__VLS_ctx.tagForm.branchName),
    filterable: true,
    remote: true,
    reserveKeyword: true,
    placeholder: "请输入关键字搜索分支",
    ...{ style: {} },
    remoteMethod: (__VLS_ctx.handleTagBranchSearch),
    loading: (__VLS_ctx.tagBranchLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_625));
__VLS_627.slots.default;
for (const [branch] of __VLS_getVForSourceType((__VLS_ctx.tagBranchOptions))) {
    const __VLS_628 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_629 = __VLS_asFunctionalComponent(__VLS_628, new __VLS_628({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }));
    const __VLS_630 = __VLS_629({
        key: (branch.name),
        label: (branch.defaultBranch ? `${branch.name}（默认）` : branch.name),
        value: (branch.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_629));
}
var __VLS_627;
var __VLS_623;
const __VLS_632 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_633 = __VLS_asFunctionalComponent(__VLS_632, new __VLS_632({
    label: "备注说明",
}));
const __VLS_634 = __VLS_633({
    label: "备注说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_633));
__VLS_635.slots.default;
const __VLS_636 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_637 = __VLS_asFunctionalComponent(__VLS_636, new __VLS_636({
    modelValue: (__VLS_ctx.tagForm.message),
    type: "textarea",
    rows: (3),
    placeholder: "留空将创建轻量 Tag",
}));
const __VLS_638 = __VLS_637({
    modelValue: (__VLS_ctx.tagForm.message),
    type: "textarea",
    rows: (3),
    placeholder: "留空将创建轻量 Tag",
}, ...__VLS_functionalComponentArgsRest(__VLS_637));
var __VLS_635;
var __VLS_601;
{
    const { footer: __VLS_thisSlot } = __VLS_597.slots;
    const __VLS_640 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_641 = __VLS_asFunctionalComponent(__VLS_640, new __VLS_640({
        ...{ 'onClick': {} },
    }));
    const __VLS_642 = __VLS_641({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_641));
    let __VLS_644;
    let __VLS_645;
    let __VLS_646;
    const __VLS_647 = {
        onClick: (...[$event]) => {
            __VLS_ctx.tagDialogVisible = false;
        }
    };
    __VLS_643.slots.default;
    var __VLS_643;
    const __VLS_648 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_649 = __VLS_asFunctionalComponent(__VLS_648, new __VLS_648({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.tagSubmitting),
    }));
    const __VLS_650 = __VLS_649({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.tagSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_649));
    let __VLS_652;
    let __VLS_653;
    let __VLS_654;
    const __VLS_655 = {
        onClick: (__VLS_ctx.handleTagSubmit)
    };
    __VLS_651.slots.default;
    var __VLS_651;
}
var __VLS_597;
const __VLS_656 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_657 = __VLS_asFunctionalComponent(__VLS_656, new __VLS_656({
    modelValue: (__VLS_ctx.tagResultVisible),
    title: "Tag 创建结果",
    width: "720px",
}));
const __VLS_658 = __VLS_657({
    modelValue: (__VLS_ctx.tagResultVisible),
    title: "Tag 创建结果",
    width: "720px",
}, ...__VLS_functionalComponentArgsRest(__VLS_657));
__VLS_659.slots.default;
if (__VLS_ctx.tagResult) {
    const __VLS_660 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_661 = __VLS_asFunctionalComponent(__VLS_660, new __VLS_660({
        column: (2),
        border: true,
    }));
    const __VLS_662 = __VLS_661({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_661));
    __VLS_663.slots.default;
    const __VLS_664 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_665 = __VLS_asFunctionalComponent(__VLS_664, new __VLS_664({
        label: "平台项目",
    }));
    const __VLS_666 = __VLS_665({
        label: "平台项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_665));
    __VLS_667.slots.default;
    (__VLS_ctx.tagResult.projectName);
    var __VLS_667;
    const __VLS_668 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_669 = __VLS_asFunctionalComponent(__VLS_668, new __VLS_668({
        label: "GitLab 仓库",
    }));
    const __VLS_670 = __VLS_669({
        label: "GitLab 仓库",
    }, ...__VLS_functionalComponentArgsRest(__VLS_669));
    __VLS_671.slots.default;
    (__VLS_ctx.tagResult.projectRef);
    var __VLS_671;
    const __VLS_672 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_673 = __VLS_asFunctionalComponent(__VLS_672, new __VLS_672({
        label: "Tag 名称",
    }));
    const __VLS_674 = __VLS_673({
        label: "Tag 名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_673));
    __VLS_675.slots.default;
    (__VLS_ctx.tagResult.tagName);
    var __VLS_675;
    const __VLS_676 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_677 = __VLS_asFunctionalComponent(__VLS_676, new __VLS_676({
        label: "来源分支",
    }));
    const __VLS_678 = __VLS_677({
        label: "来源分支",
    }, ...__VLS_functionalComponentArgsRest(__VLS_677));
    __VLS_679.slots.default;
    (__VLS_ctx.tagResult.branchName);
    var __VLS_679;
    const __VLS_680 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_681 = __VLS_asFunctionalComponent(__VLS_680, new __VLS_680({
        label: "Tag 类型",
    }));
    const __VLS_682 = __VLS_681({
        label: "Tag 类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_681));
    __VLS_683.slots.default;
    (__VLS_ctx.tagResult.message ? '注释 Tag' : '轻量 Tag');
    var __VLS_683;
    const __VLS_684 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_685 = __VLS_asFunctionalComponent(__VLS_684, new __VLS_684({
        label: "目标 SHA",
    }));
    const __VLS_686 = __VLS_685({
        label: "目标 SHA",
    }, ...__VLS_functionalComponentArgsRest(__VLS_685));
    __VLS_687.slots.default;
    (__VLS_ctx.tagResult.targetSha || '-');
    var __VLS_687;
    const __VLS_688 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_689 = __VLS_asFunctionalComponent(__VLS_688, new __VLS_688({
        label: "创建时间",
    }));
    const __VLS_690 = __VLS_689({
        label: "创建时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_689));
    __VLS_691.slots.default;
    (__VLS_ctx.formatDateTimeText(__VLS_ctx.tagResult.createdAt));
    var __VLS_691;
    const __VLS_692 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_693 = __VLS_asFunctionalComponent(__VLS_692, new __VLS_692({
        label: "受保护",
    }));
    const __VLS_694 = __VLS_693({
        label: "受保护",
    }, ...__VLS_functionalComponentArgsRest(__VLS_693));
    __VLS_695.slots.default;
    (__VLS_ctx.tagResult.protectedTag ? '是' : '否');
    var __VLS_695;
    const __VLS_696 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_697 = __VLS_asFunctionalComponent(__VLS_696, new __VLS_696({
        label: "备注说明",
        span: (2),
    }));
    const __VLS_698 = __VLS_697({
        label: "备注说明",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_697));
    __VLS_699.slots.default;
    (__VLS_ctx.tagResult.message || '-');
    var __VLS_699;
    const __VLS_700 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_701 = __VLS_asFunctionalComponent(__VLS_700, new __VLS_700({
        label: "链接",
        span: (2),
    }));
    const __VLS_702 = __VLS_701({
        label: "链接",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_701));
    __VLS_703.slots.default;
    if (__VLS_ctx.tagResult.webUrl) {
        const __VLS_704 = {}.ElLink;
        /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
        // @ts-ignore
        const __VLS_705 = __VLS_asFunctionalComponent(__VLS_704, new __VLS_704({
            href: (__VLS_ctx.tagResult.webUrl),
            target: "_blank",
            type: "primary",
        }));
        const __VLS_706 = __VLS_705({
            href: (__VLS_ctx.tagResult.webUrl),
            target: "_blank",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_705));
        __VLS_707.slots.default;
        var __VLS_707;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_703;
    var __VLS_663;
}
var __VLS_659;
const __VLS_708 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_709 = __VLS_asFunctionalComponent(__VLS_708, new __VLS_708({
    modelValue: (__VLS_ctx.autoMergeDialogVisible),
    title: (__VLS_ctx.autoMergeDialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}));
const __VLS_710 = __VLS_709({
    modelValue: (__VLS_ctx.autoMergeDialogVisible),
    title: (__VLS_ctx.autoMergeDialogTitle),
    width: "760px",
    ...{ class: "platform-form-dialog" },
    alignCenter: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_709));
__VLS_711.slots.default;
const __VLS_712 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_713 = __VLS_asFunctionalComponent(__VLS_712, new __VLS_712({
    ref: "autoMergeFormRef",
    ...{ class: "auto-merge-form platform-form-layout" },
    model: (__VLS_ctx.autoMergeForm),
    rules: (__VLS_ctx.autoMergeRules),
    disabled: (__VLS_ctx.autoMergeReadonlyMode),
    labelWidth: "140px",
}));
const __VLS_714 = __VLS_713({
    ref: "autoMergeFormRef",
    ...{ class: "auto-merge-form platform-form-layout" },
    model: (__VLS_ctx.autoMergeForm),
    rules: (__VLS_ctx.autoMergeRules),
    disabled: (__VLS_ctx.autoMergeReadonlyMode),
    labelWidth: "140px",
}, ...__VLS_functionalComponentArgsRest(__VLS_713));
/** @type {typeof __VLS_ctx.autoMergeFormRef} */ ;
var __VLS_716 = {};
__VLS_715.slots.default;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auto-merge-grid" },
});
const __VLS_718 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_719 = __VLS_asFunctionalComponent(__VLS_718, new __VLS_718({
    label: "策略名称",
    prop: "name",
}));
const __VLS_720 = __VLS_719({
    label: "策略名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_719));
__VLS_721.slots.default;
const __VLS_722 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_723 = __VLS_asFunctionalComponent(__VLS_722, new __VLS_722({
    modelValue: (__VLS_ctx.autoMergeForm.name),
}));
const __VLS_724 = __VLS_723({
    modelValue: (__VLS_ctx.autoMergeForm.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_723));
var __VLS_721;
const __VLS_726 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_727 = __VLS_asFunctionalComponent(__VLS_726, new __VLS_726({
    label: "执行模式",
    prop: "executionMode",
}));
const __VLS_728 = __VLS_727({
    label: "执行模式",
    prop: "executionMode",
}, ...__VLS_functionalComponentArgsRest(__VLS_727));
__VLS_729.slots.default;
const __VLS_730 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_731 = __VLS_asFunctionalComponent(__VLS_730, new __VLS_730({
    modelValue: (__VLS_ctx.autoMergeForm.executionMode),
}));
const __VLS_732 = __VLS_731({
    modelValue: (__VLS_ctx.autoMergeForm.executionMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_731));
__VLS_733.slots.default;
const __VLS_734 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_735 = __VLS_asFunctionalComponent(__VLS_734, new __VLS_734({
    value: "PROJECT_BOUND",
}));
const __VLS_736 = __VLS_735({
    value: "PROJECT_BOUND",
}, ...__VLS_functionalComponentArgsRest(__VLS_735));
__VLS_737.slots.default;
var __VLS_737;
const __VLS_738 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_739 = __VLS_asFunctionalComponent(__VLS_738, new __VLS_738({
    value: "STANDALONE",
}));
const __VLS_740 = __VLS_739({
    value: "STANDALONE",
}, ...__VLS_functionalComponentArgsRest(__VLS_739));
__VLS_741.slots.default;
var __VLS_741;
var __VLS_733;
var __VLS_729;
if (__VLS_ctx.autoMergeForm.executionMode === 'PROJECT_BOUND') {
    const __VLS_742 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_743 = __VLS_asFunctionalComponent(__VLS_742, new __VLS_742({
        label: "GitLab 绑定",
        prop: "bindingId",
        ...{ class: "span-2" },
    }));
    const __VLS_744 = __VLS_743({
        label: "GitLab 绑定",
        prop: "bindingId",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_743));
    __VLS_745.slots.default;
    const __VLS_746 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_747 = __VLS_asFunctionalComponent(__VLS_746, new __VLS_746({
        modelValue: (__VLS_ctx.autoMergeForm.bindingId),
        ...{ style: {} },
    }));
    const __VLS_748 = __VLS_747({
        modelValue: (__VLS_ctx.autoMergeForm.bindingId),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_747));
    __VLS_749.slots.default;
    for (const [binding] of __VLS_getVForSourceType((__VLS_ctx.bindingOptions))) {
        const __VLS_750 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_751 = __VLS_asFunctionalComponent(__VLS_750, new __VLS_750({
            key: (binding.id),
            label: (`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`),
            value: (binding.id),
        }));
        const __VLS_752 = __VLS_751({
            key: (binding.id),
            label: (`${binding.projectName} / ${binding.gitlabProjectPath || binding.gitlabProjectRef}`),
            value: (binding.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_751));
    }
    var __VLS_749;
    var __VLS_745;
}
else {
    const __VLS_754 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_755 = __VLS_asFunctionalComponent(__VLS_754, new __VLS_754({
        label: "GitLab API",
    }));
    const __VLS_756 = __VLS_755({
        label: "GitLab API",
    }, ...__VLS_functionalComponentArgsRest(__VLS_755));
    __VLS_757.slots.default;
    const __VLS_758 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_759 = __VLS_asFunctionalComponent(__VLS_758, new __VLS_758({
        modelValue: (__VLS_ctx.autoMergeForm.apiBaseUrl),
    }));
    const __VLS_760 = __VLS_759({
        modelValue: (__VLS_ctx.autoMergeForm.apiBaseUrl),
    }, ...__VLS_functionalComponentArgsRest(__VLS_759));
    var __VLS_757;
    const __VLS_762 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_763 = __VLS_asFunctionalComponent(__VLS_762, new __VLS_762({
        label: "项目 ID / 路径",
    }));
    const __VLS_764 = __VLS_763({
        label: "项目 ID / 路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_763));
    __VLS_765.slots.default;
    const __VLS_766 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_767 = __VLS_asFunctionalComponent(__VLS_766, new __VLS_766({
        modelValue: (__VLS_ctx.autoMergeForm.gitlabProjectRef),
    }));
    const __VLS_768 = __VLS_767({
        modelValue: (__VLS_ctx.autoMergeForm.gitlabProjectRef),
    }, ...__VLS_functionalComponentArgsRest(__VLS_767));
    var __VLS_765;
    const __VLS_770 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_771 = __VLS_asFunctionalComponent(__VLS_770, new __VLS_770({
        label: "APIToken",
        ...{ class: "span-2" },
    }));
    const __VLS_772 = __VLS_771({
        label: "APIToken",
        ...{ class: "span-2" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_771));
    __VLS_773.slots.default;
    const __VLS_774 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_775 = __VLS_asFunctionalComponent(__VLS_774, new __VLS_774({
        modelValue: (__VLS_ctx.autoMergeForm.apiToken),
        type: "password",
        showPassword: true,
        placeholder: (__VLS_ctx.autoMergeIsEditing ? '留空则保留原 Token' : '请输入 APIToken'),
    }));
    const __VLS_776 = __VLS_775({
        modelValue: (__VLS_ctx.autoMergeForm.apiToken),
        type: "password",
        showPassword: true,
        placeholder: (__VLS_ctx.autoMergeIsEditing ? '留空则保留原 Token' : '请输入 APIToken'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_775));
    var __VLS_773;
}
const __VLS_778 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_779 = __VLS_asFunctionalComponent(__VLS_778, new __VLS_778({
    label: "源分支",
}));
const __VLS_780 = __VLS_779({
    label: "源分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_779));
__VLS_781.slots.default;
const __VLS_782 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_783 = __VLS_asFunctionalComponent(__VLS_782, new __VLS_782({
    modelValue: (__VLS_ctx.autoMergeForm.sourceBranch),
    placeholder: "留空表示不限",
}));
const __VLS_784 = __VLS_783({
    modelValue: (__VLS_ctx.autoMergeForm.sourceBranch),
    placeholder: "留空表示不限",
}, ...__VLS_functionalComponentArgsRest(__VLS_783));
var __VLS_781;
const __VLS_786 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_787 = __VLS_asFunctionalComponent(__VLS_786, new __VLS_786({
    label: "目标分支",
}));
const __VLS_788 = __VLS_787({
    label: "目标分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_787));
__VLS_789.slots.default;
const __VLS_790 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_791 = __VLS_asFunctionalComponent(__VLS_790, new __VLS_790({
    modelValue: (__VLS_ctx.autoMergeForm.targetBranch),
    placeholder: "留空表示不限",
}));
const __VLS_792 = __VLS_791({
    modelValue: (__VLS_ctx.autoMergeForm.targetBranch),
    placeholder: "留空表示不限",
}, ...__VLS_functionalComponentArgsRest(__VLS_791));
var __VLS_789;
const __VLS_794 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_795 = __VLS_asFunctionalComponent(__VLS_794, new __VLS_794({
    label: "标题关键字",
}));
const __VLS_796 = __VLS_795({
    label: "标题关键字",
}, ...__VLS_functionalComponentArgsRest(__VLS_795));
__VLS_797.slots.default;
const __VLS_798 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_799 = __VLS_asFunctionalComponent(__VLS_798, new __VLS_798({
    modelValue: (__VLS_ctx.autoMergeForm.titleKeyword),
    placeholder: "留空表示不限",
}));
const __VLS_800 = __VLS_799({
    modelValue: (__VLS_ctx.autoMergeForm.titleKeyword),
    placeholder: "留空表示不限",
}, ...__VLS_functionalComponentArgsRest(__VLS_799));
var __VLS_797;
const __VLS_802 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_803 = __VLS_asFunctionalComponent(__VLS_802, new __VLS_802({
    label: "策略启用",
}));
const __VLS_804 = __VLS_803({
    label: "策略启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_803));
__VLS_805.slots.default;
const __VLS_806 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_807 = __VLS_asFunctionalComponent(__VLS_806, new __VLS_806({
    modelValue: (__VLS_ctx.autoMergeForm.enabled),
}));
const __VLS_808 = __VLS_807({
    modelValue: (__VLS_ctx.autoMergeForm.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_807));
var __VLS_805;
const __VLS_810 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_811 = __VLS_asFunctionalComponent(__VLS_810, new __VLS_810({
    label: "策略描述",
    ...{ class: "span-2" },
}));
const __VLS_812 = __VLS_811({
    label: "策略描述",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_811));
__VLS_813.slots.default;
const __VLS_814 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_815 = __VLS_asFunctionalComponent(__VLS_814, new __VLS_814({
    modelValue: (__VLS_ctx.autoMergeForm.description),
    type: "textarea",
    rows: (3),
}));
const __VLS_816 = __VLS_815({
    modelValue: (__VLS_ctx.autoMergeForm.description),
    type: "textarea",
    rows: (3),
}, ...__VLS_functionalComponentArgsRest(__VLS_815));
var __VLS_813;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auto-merge-grid" },
});
const __VLS_818 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_819 = __VLS_asFunctionalComponent(__VLS_818, new __VLS_818({
    label: "启用调度",
}));
const __VLS_820 = __VLS_819({
    label: "启用调度",
}, ...__VLS_functionalComponentArgsRest(__VLS_819));
__VLS_821.slots.default;
const __VLS_822 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_823 = __VLS_asFunctionalComponent(__VLS_822, new __VLS_822({
    modelValue: (__VLS_ctx.autoMergeForm.schedulerEnabled),
}));
const __VLS_824 = __VLS_823({
    modelValue: (__VLS_ctx.autoMergeForm.schedulerEnabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_823));
var __VLS_821;
const __VLS_826 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_827 = __VLS_asFunctionalComponent(__VLS_826, new __VLS_826({
    label: "Cron 示例",
}));
const __VLS_828 = __VLS_827({
    label: "Cron 示例",
}, ...__VLS_functionalComponentArgsRest(__VLS_827));
__VLS_829.slots.default;
const __VLS_830 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_831 = __VLS_asFunctionalComponent(__VLS_830, new __VLS_830({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.cronTemplate),
    clearable: true,
    placeholder: "选择一个常用示例",
    ...{ style: {} },
}));
const __VLS_832 = __VLS_831({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.cronTemplate),
    clearable: true,
    placeholder: "选择一个常用示例",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_831));
let __VLS_834;
let __VLS_835;
let __VLS_836;
const __VLS_837 = {
    onChange: (__VLS_ctx.handleCronTemplateChange)
};
__VLS_833.slots.default;
const __VLS_838 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_839 = __VLS_asFunctionalComponent(__VLS_838, new __VLS_838({
    label: "每5分钟：0 */5 * * * *",
    value: "0 */5 * * * *",
}));
const __VLS_840 = __VLS_839({
    label: "每5分钟：0 */5 * * * *",
    value: "0 */5 * * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_839));
const __VLS_842 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_843 = __VLS_asFunctionalComponent(__VLS_842, new __VLS_842({
    label: "每10分钟：0 */10 * * * *",
    value: "0 */10 * * * *",
}));
const __VLS_844 = __VLS_843({
    label: "每10分钟：0 */10 * * * *",
    value: "0 */10 * * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_843));
const __VLS_846 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_847 = __VLS_asFunctionalComponent(__VLS_846, new __VLS_846({
    label: "每30分钟：0 */30 * * * *",
    value: "0 */30 * * * *",
}));
const __VLS_848 = __VLS_847({
    label: "每30分钟：0 */30 * * * *",
    value: "0 */30 * * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_847));
const __VLS_850 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_851 = __VLS_asFunctionalComponent(__VLS_850, new __VLS_850({
    label: "每小时整点：0 0 * * * *",
    value: "0 0 * * * *",
}));
const __VLS_852 = __VLS_851({
    label: "每小时整点：0 0 * * * *",
    value: "0 0 * * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_851));
const __VLS_854 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_855 = __VLS_asFunctionalComponent(__VLS_854, new __VLS_854({
    label: "每天凌晨2点：0 0 2 * * *",
    value: "0 0 2 * * *",
}));
const __VLS_856 = __VLS_855({
    label: "每天凌晨2点：0 0 2 * * *",
    value: "0 0 2 * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_855));
var __VLS_833;
var __VLS_829;
const __VLS_858 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_859 = __VLS_asFunctionalComponent(__VLS_858, new __VLS_858({
    label: "调度 Cron",
    ...{ class: "span-2" },
}));
const __VLS_860 = __VLS_859({
    label: "调度 Cron",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_859));
__VLS_861.slots.default;
const __VLS_862 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_863 = __VLS_asFunctionalComponent(__VLS_862, new __VLS_862({
    modelValue: (__VLS_ctx.autoMergeForm.schedulerCron),
    disabled: (!__VLS_ctx.autoMergeForm.schedulerEnabled),
    placeholder: "例如：0 */5 * * * *",
}));
const __VLS_864 = __VLS_863({
    modelValue: (__VLS_ctx.autoMergeForm.schedulerCron),
    disabled: (!__VLS_ctx.autoMergeForm.schedulerEnabled),
    placeholder: "例如：0 */5 * * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_863));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_861;
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
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "auto-merge-grid" },
});
const __VLS_866 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_867 = __VLS_asFunctionalComponent(__VLS_866, new __VLS_866({
    label: "启用 AI 审核",
}));
const __VLS_868 = __VLS_867({
    label: "启用 AI 审核",
}, ...__VLS_functionalComponentArgsRest(__VLS_867));
__VLS_869.slots.default;
const __VLS_870 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_871 = __VLS_asFunctionalComponent(__VLS_870, new __VLS_870({
    modelValue: (__VLS_ctx.autoMergeForm.aiReviewEnabled),
}));
const __VLS_872 = __VLS_871({
    modelValue: (__VLS_ctx.autoMergeForm.aiReviewEnabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_871));
var __VLS_869;
const __VLS_874 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_875 = __VLS_asFunctionalComponent(__VLS_874, new __VLS_874({
    label: "Code Review Agent",
    ...{ class: "span-2" },
}));
const __VLS_876 = __VLS_875({
    label: "Code Review Agent",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_875));
__VLS_877.slots.default;
const __VLS_878 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_879 = __VLS_asFunctionalComponent(__VLS_878, new __VLS_878({
    modelValue: (__VLS_ctx.autoMergeForm.reviewAgentId),
    clearable: true,
    placeholder: "请选择内置 Code Review Agent",
    ...{ style: {} },
    disabled: (!__VLS_ctx.autoMergeForm.aiReviewEnabled),
}));
const __VLS_880 = __VLS_879({
    modelValue: (__VLS_ctx.autoMergeForm.reviewAgentId),
    clearable: true,
    placeholder: "请选择内置 Code Review Agent",
    ...{ style: {} },
    disabled: (!__VLS_ctx.autoMergeForm.aiReviewEnabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_879));
__VLS_881.slots.default;
for (const [agent] of __VLS_getVForSourceType((__VLS_ctx.reviewAgentOptions))) {
    const __VLS_882 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_883 = __VLS_asFunctionalComponent(__VLS_882, new __VLS_882({
        key: (agent.id),
        label: (agent.name),
        value: (agent.id),
    }));
    const __VLS_884 = __VLS_883({
        key: (agent.id),
        label: (agent.name),
        value: (agent.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_883));
}
var __VLS_881;
var __VLS_877;
const __VLS_886 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_887 = __VLS_asFunctionalComponent(__VLS_886, new __VLS_886({
    label: "自动合并",
}));
const __VLS_888 = __VLS_887({
    label: "自动合并",
}, ...__VLS_functionalComponentArgsRest(__VLS_887));
__VLS_889.slots.default;
const __VLS_890 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_891 = __VLS_asFunctionalComponent(__VLS_890, new __VLS_890({
    modelValue: (__VLS_ctx.autoMergeForm.autoMerge),
}));
const __VLS_892 = __VLS_891({
    modelValue: (__VLS_ctx.autoMergeForm.autoMerge),
}, ...__VLS_functionalComponentArgsRest(__VLS_891));
var __VLS_889;
const __VLS_894 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_895 = __VLS_asFunctionalComponent(__VLS_894, new __VLS_894({
    label: "需 Pipeline 成功",
}));
const __VLS_896 = __VLS_895({
    label: "需 Pipeline 成功",
}, ...__VLS_functionalComponentArgsRest(__VLS_895));
__VLS_897.slots.default;
const __VLS_898 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_899 = __VLS_asFunctionalComponent(__VLS_898, new __VLS_898({
    modelValue: (__VLS_ctx.autoMergeForm.requirePipelineSuccess),
}));
const __VLS_900 = __VLS_899({
    modelValue: (__VLS_ctx.autoMergeForm.requirePipelineSuccess),
}, ...__VLS_functionalComponentArgsRest(__VLS_899));
var __VLS_897;
const __VLS_902 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_903 = __VLS_asFunctionalComponent(__VLS_902, new __VLS_902({
    label: "Squash 合并",
}));
const __VLS_904 = __VLS_903({
    label: "Squash 合并",
}, ...__VLS_functionalComponentArgsRest(__VLS_903));
__VLS_905.slots.default;
const __VLS_906 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_907 = __VLS_asFunctionalComponent(__VLS_906, new __VLS_906({
    modelValue: (__VLS_ctx.autoMergeForm.squashOnMerge),
}));
const __VLS_908 = __VLS_907({
    modelValue: (__VLS_ctx.autoMergeForm.squashOnMerge),
}, ...__VLS_functionalComponentArgsRest(__VLS_907));
var __VLS_905;
const __VLS_910 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_911 = __VLS_asFunctionalComponent(__VLS_910, new __VLS_910({
    label: "删除源分支",
}));
const __VLS_912 = __VLS_911({
    label: "删除源分支",
}, ...__VLS_functionalComponentArgsRest(__VLS_911));
__VLS_913.slots.default;
const __VLS_914 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_915 = __VLS_asFunctionalComponent(__VLS_914, new __VLS_914({
    modelValue: (__VLS_ctx.autoMergeForm.removeSourceBranch),
}));
const __VLS_916 = __VLS_915({
    modelValue: (__VLS_ctx.autoMergeForm.removeSourceBranch),
}, ...__VLS_functionalComponentArgsRest(__VLS_915));
var __VLS_913;
const __VLS_918 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_919 = __VLS_asFunctionalComponent(__VLS_918, new __VLS_918({
    label: "合并后触发 Jenkins",
    ...{ class: "span-2" },
}));
const __VLS_920 = __VLS_919({
    label: "合并后触发 Jenkins",
    ...{ class: "span-2" },
}, ...__VLS_functionalComponentArgsRest(__VLS_919));
__VLS_921.slots.default;
const __VLS_922 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_923 = __VLS_asFunctionalComponent(__VLS_922, new __VLS_922({
    modelValue: (__VLS_ctx.autoMergeForm.triggerPipelineAfterMerge),
    disabled: (__VLS_ctx.autoMergeForm.executionMode !== 'PROJECT_BOUND'),
}));
const __VLS_924 = __VLS_923({
    modelValue: (__VLS_ctx.autoMergeForm.triggerPipelineAfterMerge),
    disabled: (__VLS_ctx.autoMergeForm.executionMode !== 'PROJECT_BOUND'),
}, ...__VLS_functionalComponentArgsRest(__VLS_923));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
var __VLS_921;
var __VLS_715;
{
    const { footer: __VLS_thisSlot } = __VLS_711.slots;
    const __VLS_926 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_927 = __VLS_asFunctionalComponent(__VLS_926, new __VLS_926({
        ...{ 'onClick': {} },
    }));
    const __VLS_928 = __VLS_927({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_927));
    let __VLS_930;
    let __VLS_931;
    let __VLS_932;
    const __VLS_933 = {
        onClick: (...[$event]) => {
            __VLS_ctx.autoMergeDialogVisible = false;
        }
    };
    __VLS_929.slots.default;
    (__VLS_ctx.autoMergeReadonlyMode ? '关闭' : '取消');
    var __VLS_929;
    if (!__VLS_ctx.autoMergeReadonlyMode) {
        const __VLS_934 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_935 = __VLS_asFunctionalComponent(__VLS_934, new __VLS_934({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.autoMergeSubmitting),
        }));
        const __VLS_936 = __VLS_935({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.autoMergeSubmitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_935));
        let __VLS_938;
        let __VLS_939;
        let __VLS_940;
        const __VLS_941 = {
            onClick: (__VLS_ctx.handleAutoMergeSubmit)
        };
        __VLS_937.slots.default;
        var __VLS_937;
    }
}
var __VLS_711;
const __VLS_942 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_943 = __VLS_asFunctionalComponent(__VLS_942, new __VLS_942({
    modelValue: (__VLS_ctx.mergeRequestDrawerVisible),
    title: (__VLS_ctx.mergeRequestDrawerTitle),
    size: "60%",
    appendToBody: true,
}));
const __VLS_944 = __VLS_943({
    modelValue: (__VLS_ctx.mergeRequestDrawerVisible),
    title: (__VLS_ctx.mergeRequestDrawerTitle),
    size: "60%",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_943));
__VLS_945.slots.default;
const __VLS_946 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_947 = __VLS_asFunctionalComponent(__VLS_946, new __VLS_946({
    data: (__VLS_ctx.mergeRequestList),
    ...{ style: {} },
}));
const __VLS_948 = __VLS_947({
    data: (__VLS_ctx.mergeRequestList),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_947));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.mergeRequestLoading) }, null, null);
__VLS_949.slots.default;
const __VLS_950 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_951 = __VLS_asFunctionalComponent(__VLS_950, new __VLS_950({
    prop: "iid",
    label: "IID",
    width: "80",
}));
const __VLS_952 = __VLS_951({
    prop: "iid",
    label: "IID",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_951));
const __VLS_954 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_955 = __VLS_asFunctionalComponent(__VLS_954, new __VLS_954({
    prop: "title",
    label: "标题",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_956 = __VLS_955({
    prop: "title",
    label: "标题",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_955));
const __VLS_958 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_959 = __VLS_asFunctionalComponent(__VLS_958, new __VLS_958({
    prop: "sourceBranch",
    label: "源分支",
    width: "140",
}));
const __VLS_960 = __VLS_959({
    prop: "sourceBranch",
    label: "源分支",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_959));
const __VLS_962 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_963 = __VLS_asFunctionalComponent(__VLS_962, new __VLS_962({
    prop: "targetBranch",
    label: "目标分支",
    width: "140",
}));
const __VLS_964 = __VLS_963({
    prop: "targetBranch",
    label: "目标分支",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_963));
const __VLS_966 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_967 = __VLS_asFunctionalComponent(__VLS_966, new __VLS_966({
    label: "落后状态",
    width: "120",
}));
const __VLS_968 = __VLS_967({
    label: "落后状态",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_967));
__VLS_969.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_969.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_970 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_971 = __VLS_asFunctionalComponent(__VLS_970, new __VLS_970({
        type: (__VLS_ctx.mergeRequestBehindTagType(row)),
    }));
    const __VLS_972 = __VLS_971({
        type: (__VLS_ctx.mergeRequestBehindTagType(row)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_971));
    __VLS_973.slots.default;
    (__VLS_ctx.isMergeRequestBehind(row) ? '落后' : '正常');
    var __VLS_973;
}
var __VLS_969;
const __VLS_974 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_975 = __VLS_asFunctionalComponent(__VLS_974, new __VLS_974({
    label: "落后提交数",
    width: "120",
}));
const __VLS_976 = __VLS_975({
    label: "落后提交数",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_975));
__VLS_977.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_977.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.getMergeRequestBehindCount(row));
}
var __VLS_977;
const __VLS_978 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_979 = __VLS_asFunctionalComponent(__VLS_978, new __VLS_978({
    prop: "detailedMergeStatus",
    label: "合并状态",
    minWidth: "160",
    showOverflowTooltip: true,
}));
const __VLS_980 = __VLS_979({
    prop: "detailedMergeStatus",
    label: "合并状态",
    minWidth: "160",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_979));
const __VLS_982 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_983 = __VLS_asFunctionalComponent(__VLS_982, new __VLS_982({
    prop: "pipelineStatus",
    label: "Pipeline",
    width: "120",
}));
const __VLS_984 = __VLS_983({
    prop: "pipelineStatus",
    label: "Pipeline",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_983));
const __VLS_986 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_987 = __VLS_asFunctionalComponent(__VLS_986, new __VLS_986({
    prop: "authorName",
    label: "作者",
    width: "120",
}));
const __VLS_988 = __VLS_987({
    prop: "authorName",
    label: "作者",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_987));
const __VLS_990 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_991 = __VLS_asFunctionalComponent(__VLS_990, new __VLS_990({
    label: "链接",
    width: "90",
}));
const __VLS_992 = __VLS_991({
    label: "链接",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_991));
__VLS_993.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_993.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_994 = {}.ElLink;
    /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
    // @ts-ignore
    const __VLS_995 = __VLS_asFunctionalComponent(__VLS_994, new __VLS_994({
        href: (row.webUrl),
        target: "_blank",
        type: "primary",
    }));
    const __VLS_996 = __VLS_995({
        href: (row.webUrl),
        target: "_blank",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_995));
    __VLS_997.slots.default;
    var __VLS_997;
}
var __VLS_993;
var __VLS_949;
var __VLS_945;
const __VLS_998 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_999 = __VLS_asFunctionalComponent(__VLS_998, new __VLS_998({
    modelValue: (__VLS_ctx.logDetailVisible),
    title: "合并日志详情",
    width: "860px",
}));
const __VLS_1000 = __VLS_999({
    modelValue: (__VLS_ctx.logDetailVisible),
    title: "合并日志详情",
    width: "860px",
}, ...__VLS_functionalComponentArgsRest(__VLS_999));
__VLS_1001.slots.default;
if (__VLS_ctx.currentLogDetail) {
    const __VLS_1002 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_1003 = __VLS_asFunctionalComponent(__VLS_1002, new __VLS_1002({
        column: (2),
        border: true,
    }));
    const __VLS_1004 = __VLS_1003({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1003));
    __VLS_1005.slots.default;
    const __VLS_1006 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1007 = __VLS_asFunctionalComponent(__VLS_1006, new __VLS_1006({
        label: "执行时间",
    }));
    const __VLS_1008 = __VLS_1007({
        label: "执行时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1007));
    __VLS_1009.slots.default;
    (__VLS_ctx.currentLogDetail.executedAt || '-');
    var __VLS_1009;
    const __VLS_1010 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1011 = __VLS_asFunctionalComponent(__VLS_1010, new __VLS_1010({
        label: "策略",
    }));
    const __VLS_1012 = __VLS_1011({
        label: "策略",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1011));
    __VLS_1013.slots.default;
    (__VLS_ctx.currentLogDetail.configName || '-');
    var __VLS_1013;
    const __VLS_1014 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1015 = __VLS_asFunctionalComponent(__VLS_1014, new __VLS_1014({
        label: "结果",
    }));
    const __VLS_1016 = __VLS_1015({
        label: "结果",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1015));
    __VLS_1017.slots.default;
    const __VLS_1018 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1019 = __VLS_asFunctionalComponent(__VLS_1018, new __VLS_1018({
        type: (__VLS_ctx.logResultType(__VLS_ctx.currentLogDetail.result)),
    }));
    const __VLS_1020 = __VLS_1019({
        type: (__VLS_ctx.logResultType(__VLS_ctx.currentLogDetail.result)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1019));
    __VLS_1021.slots.default;
    (__VLS_ctx.currentLogDetail.result);
    var __VLS_1021;
    var __VLS_1017;
    const __VLS_1022 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1023 = __VLS_asFunctionalComponent(__VLS_1022, new __VLS_1022({
        label: "发起人",
    }));
    const __VLS_1024 = __VLS_1023({
        label: "发起人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1023));
    __VLS_1025.slots.default;
    (__VLS_ctx.getLogInitiatorDisplay(__VLS_ctx.currentLogDetail));
    var __VLS_1025;
    const __VLS_1026 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1027 = __VLS_asFunctionalComponent(__VLS_1026, new __VLS_1026({
        label: "原因",
    }));
    const __VLS_1028 = __VLS_1027({
        label: "原因",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1027));
    __VLS_1029.slots.default;
    (__VLS_ctx.currentLogDetail.reason || '-');
    var __VLS_1029;
    var __VLS_1005;
}
if (__VLS_ctx.currentLogDetail) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "log-detail-markdown" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.logDetailHtml) }, null, null);
}
var __VLS_1001;
const __VLS_1030 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1031 = __VLS_asFunctionalComponent(__VLS_1030, new __VLS_1030({
    modelValue: (__VLS_ctx.runResultVisible),
    title: "自动合并执行结果",
    width: "760px",
}));
const __VLS_1032 = __VLS_1031({
    modelValue: (__VLS_ctx.runResultVisible),
    title: "自动合并执行结果",
    width: "760px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1031));
__VLS_1033.slots.default;
if (__VLS_ctx.runResult) {
    const __VLS_1034 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_1035 = __VLS_asFunctionalComponent(__VLS_1034, new __VLS_1034({
        column: (3),
        border: true,
    }));
    const __VLS_1036 = __VLS_1035({
        column: (3),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1035));
    __VLS_1037.slots.default;
    const __VLS_1038 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1039 = __VLS_asFunctionalComponent(__VLS_1038, new __VLS_1038({
        label: "策略",
    }));
    const __VLS_1040 = __VLS_1039({
        label: "策略",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1039));
    __VLS_1041.slots.default;
    (__VLS_ctx.runResult.configName);
    var __VLS_1041;
    const __VLS_1042 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1043 = __VLS_asFunctionalComponent(__VLS_1042, new __VLS_1042({
        label: "匹配 MR",
    }));
    const __VLS_1044 = __VLS_1043({
        label: "匹配 MR",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1043));
    __VLS_1045.slots.default;
    (__VLS_ctx.runResult.matchedCount);
    var __VLS_1045;
    const __VLS_1046 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1047 = __VLS_asFunctionalComponent(__VLS_1046, new __VLS_1046({
        label: "成功 / 未合并",
    }));
    const __VLS_1048 = __VLS_1047({
        label: "成功 / 未合并",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1047));
    __VLS_1049.slots.default;
    (__VLS_ctx.runResult.mergedCount);
    (__VLS_ctx.runResult.skippedCount);
    var __VLS_1049;
    var __VLS_1037;
}
if (__VLS_ctx.runResult) {
    const __VLS_1050 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_1051 = __VLS_asFunctionalComponent(__VLS_1050, new __VLS_1050({
        data: (__VLS_ctx.runResult.items),
        ...{ style: {} },
    }));
    const __VLS_1052 = __VLS_1051({
        data: (__VLS_ctx.runResult.items),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1051));
    __VLS_1053.slots.default;
    const __VLS_1054 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_1055 = __VLS_asFunctionalComponent(__VLS_1054, new __VLS_1054({
        prop: "iid",
        label: "IID",
        width: "80",
    }));
    const __VLS_1056 = __VLS_1055({
        prop: "iid",
        label: "IID",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1055));
    const __VLS_1058 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_1059 = __VLS_asFunctionalComponent(__VLS_1058, new __VLS_1058({
        prop: "title",
        label: "标题",
        minWidth: "220",
    }));
    const __VLS_1060 = __VLS_1059({
        prop: "title",
        label: "标题",
        minWidth: "220",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1059));
    const __VLS_1062 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_1063 = __VLS_asFunctionalComponent(__VLS_1062, new __VLS_1062({
        prop: "action",
        label: "动作",
        width: "120",
    }));
    const __VLS_1064 = __VLS_1063({
        prop: "action",
        label: "动作",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1063));
    const __VLS_1066 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_1067 = __VLS_asFunctionalComponent(__VLS_1066, new __VLS_1066({
        prop: "message",
        label: "结果说明",
        minWidth: "220",
        showOverflowTooltip: true,
    }));
    const __VLS_1068 = __VLS_1067({
        prop: "message",
        label: "结果说明",
        minWidth: "220",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1067));
    var __VLS_1053;
}
var __VLS_1033;
/** @type {__VLS_StyleScopedClasses['gitlab-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-page-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-main-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
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
/** @type {__VLS_StyleScopedClasses['gitlab-binding-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-branch']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-test']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-empty-row']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-title-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-branch']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-text']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-api']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-mono-text']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-mono-text']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-status']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-test']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-updated']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-note']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-binding-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['connection']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['run']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
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
/** @type {__VLS_StyleScopedClasses['management-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
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
/** @type {__VLS_StyleScopedClasses['gitlab-auto-merge-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-scheduler']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-run']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-empty-row']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-rule']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-scheduler']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-enabled']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-run']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-stack']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-note']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-meta-note']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-auto-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['connection']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['run']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
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
/** @type {__VLS_StyleScopedClasses['management-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-main']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-switcher']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-tab-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-divider']} */ ;
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
/** @type {__VLS_StyleScopedClasses['management-list-toolbar-button']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-table']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-table']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-card-table']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-user']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-result']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-reason']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-link']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-empty-row']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-main']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-title']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-user']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['center']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-result']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-reason']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-link']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['right']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-log-col-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['management-list-row-button']} */ ;
/** @type {__VLS_StyleScopedClasses['gitlab-action-button']} */ ;
/** @type {__VLS_StyleScopedClasses['preview']} */ ;
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
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-form']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['platform-form-section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['auto-merge-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['span-2']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['log-detail-markdown']} */ ;
// @ts-ignore
var __VLS_525 = __VLS_524, __VLS_603 = __VLS_602, __VLS_717 = __VLS_716;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Connection: Connection,
            Delete: Delete,
            DocumentCopy: DocumentCopy,
            EditPen: EditPen,
            Filter: Filter,
            FolderOpened: FolderOpened,
            Plus: Plus,
            RefreshRight: RefreshRight,
            Search: Search,
            Tickets: Tickets,
            VideoPlay: VideoPlay,
            activeTab: activeTab,
            projectOptions: projectOptions,
            bindingOptions: bindingOptions,
            reviewAgentOptions: reviewAgentOptions,
            bindingLoading: bindingLoading,
            bindingSubmitting: bindingSubmitting,
            bindingDialogVisible: bindingDialogVisible,
            bindingIsEditing: bindingIsEditing,
            bindingList: bindingList,
            bindingFormRef: bindingFormRef,
            bindingPagination: bindingPagination,
            bindingTotalPages: bindingTotalPages,
            bindingFilters: bindingFilters,
            bindingFilterPopoverVisible: bindingFilterPopoverVisible,
            bindingForm: bindingForm,
            tagDialogVisible: tagDialogVisible,
            tagSubmitting: tagSubmitting,
            tagResultVisible: tagResultVisible,
            currentTagBinding: currentTagBinding,
            tagFormRef: tagFormRef,
            tagForm: tagForm,
            tagBranchOptions: tagBranchOptions,
            tagBranchLoading: tagBranchLoading,
            tagResult: tagResult,
            autoMergeLoading: autoMergeLoading,
            autoMergeSubmitting: autoMergeSubmitting,
            autoMergeDialogVisible: autoMergeDialogVisible,
            autoMergeIsEditing: autoMergeIsEditing,
            autoMergeReadonlyMode: autoMergeReadonlyMode,
            autoMergeList: autoMergeList,
            autoMergeFormRef: autoMergeFormRef,
            autoMergePagination: autoMergePagination,
            autoMergeTotalPages: autoMergeTotalPages,
            autoMergeFilters: autoMergeFilters,
            autoMergeFilterPopoverVisible: autoMergeFilterPopoverVisible,
            autoMergeForm: autoMergeForm,
            cronTemplate: cronTemplate,
            logLoading: logLoading,
            logList: logList,
            logPagination: logPagination,
            logTotalPages: logTotalPages,
            logFilters: logFilters,
            logFilterPopoverVisible: logFilterPopoverVisible,
            logDetailVisible: logDetailVisible,
            currentLogDetail: currentLogDetail,
            mergeRequestDrawerVisible: mergeRequestDrawerVisible,
            mergeRequestDrawerTitle: mergeRequestDrawerTitle,
            mergeRequestLoading: mergeRequestLoading,
            mergeRequestList: mergeRequestList,
            runResultVisible: runResultVisible,
            runResult: runResult,
            bindingRules: bindingRules,
            tagRules: tagRules,
            autoMergeRules: autoMergeRules,
            bindingStatusType: bindingStatusType,
            runStatusType: runStatusType,
            logResultType: logResultType,
            logResultText: logResultText,
            getMergeRequestBehindCount: getMergeRequestBehindCount,
            isMergeRequestBehind: isMergeRequestBehind,
            mergeRequestBehindTagType: mergeRequestBehindTagType,
            logDetailHtml: logDetailHtml,
            formatDateTimeText: formatDateTimeText,
            formatBindingStatusLabel: formatBindingStatusLabel,
            formatExecutionModeLabel: formatExecutionModeLabel,
            formatTriggerTypeLabel: formatTriggerTypeLabel,
            formatRunStatusLabel: formatRunStatusLabel,
            getBindingProjectUrl: getBindingProjectUrl,
            buildBindingSubtitle: buildBindingSubtitle,
            buildAutoMergeSubtitle: buildAutoMergeSubtitle,
            buildLogSubtitle: buildLogSubtitle,
            autoMergeDialogTitle: autoMergeDialogTitle,
            loadAutoMergeLogs: loadAutoMergeLogs,
            handleBindingSearch: handleBindingSearch,
            handleBindingReset: handleBindingReset,
            handleBindingSizeChange: handleBindingSizeChange,
            handleBindingPrevPage: handleBindingPrevPage,
            handleBindingNextPage: handleBindingNextPage,
            handleAutoMergeSearch: handleAutoMergeSearch,
            handleAutoMergeReset: handleAutoMergeReset,
            handleAutoMergeSizeChange: handleAutoMergeSizeChange,
            handleAutoMergePrevPage: handleAutoMergePrevPage,
            handleAutoMergeNextPage: handleAutoMergeNextPage,
            handleLogSearch: handleLogSearch,
            handleLogReset: handleLogReset,
            handleLogSizeChange: handleLogSizeChange,
            handleLogPrevPage: handleLogPrevPage,
            handleLogNextPage: handleLogNextPage,
            handleCronTemplateChange: handleCronTemplateChange,
            getLogInitiatorDisplay: getLogInitiatorDisplay,
            openLogDetail: openLogDetail,
            handleTagBranchSearch: handleTagBranchSearch,
            openBindingCreateDialog: openBindingCreateDialog,
            openBindingEditDialog: openBindingEditDialog,
            handleBindingSubmit: handleBindingSubmit,
            handleBindingDelete: handleBindingDelete,
            handleBindingTest: handleBindingTest,
            openTagCreateDialog: openTagCreateDialog,
            handleTagSubmit: handleTagSubmit,
            openBindingMergeRequests: openBindingMergeRequests,
            openAutoMergeCreateDialog: openAutoMergeCreateDialog,
            openAutoMergeDetailDialog: openAutoMergeDetailDialog,
            openAutoMergeEditDialog: openAutoMergeEditDialog,
            handleAutoMergeSubmit: handleAutoMergeSubmit,
            handleAutoMergeDelete: handleAutoMergeDelete,
            handleAutoMergeTest: handleAutoMergeTest,
            openAutoMergeMergeRequests: openAutoMergeMergeRequests,
            handleAutoMergeRun: handleAutoMergeRun,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
//# sourceMappingURL=GitlabView.vue.js.map