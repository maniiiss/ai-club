<template>
  <el-dialog
    v-if="!embedded"
    :model-value="modelValue"
    width="1080px"
    align-center
    destroy-on-close
    class="requirement-ai-dialog"
    @close="emit('update:modelValue', false)"
  >
    <template #header>
      <div class="requirement-ai-header">
        <div class="requirement-ai-title">需求 AI 助手</div>
        <div class="requirement-ai-subtitle">{{ task?.name || '-' }}</div>
      </div>
    </template>

    <template v-if="task">
      <div class="requirement-ai-toolbar">
        <el-select
          v-model="selectedModelConfigId"
          clearable
          filterable
          placeholder="选择模型，不选则使用第一个启用模型"
          style="width: 320px"
        >
          <el-option v-for="item in modelOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-space wrap>
          <el-button :loading="runningAction === 'STANDARDIZE'" @click="runAction('STANDARDIZE')">标准化需求</el-button>
          <el-button :loading="runningAction === 'BREAKDOWN'" @click="runAction('BREAKDOWN')">拆解子任务</el-button>
          <el-button :loading="runningAction === 'TEST_CASES'" @click="runAction('TEST_CASES')">生成测试用例</el-button>
          <el-button
            v-if="prdReady"
            :loading="runningAction === 'GAP_CHECK'"
            @click="runPrdAction('GAP_CHECK')"
          >
            检查 PRD 缺口
          </el-button>
          <el-button
            v-if="prdReady"
            plain
            :loading="runningAction === 'SUGGEST_UPDATE'"
            @click="runPrdAction('SUGGEST_UPDATE')"
          >
            生成 PRD 建议
          </el-button>
          <el-button v-if="prdReady" plain @click="openPrdPage">打开 PRD</el-button>
        </el-space>
      </div>

      <div class="requirement-ai-body">
        <div class="requirement-ai-preview">
          <div class="requirement-ai-section-head">
            <div>
              <div class="requirement-ai-section-title">{{ result?.title || 'AI 结果预览' }}</div>
              <div class="requirement-ai-section-subtitle">
                {{ result?.modelConfigName ? `模型：${result.modelConfigName}` : '尚未生成内容' }}
              </div>
            </div>
            <el-space v-if="result">
              <el-button @click="postAsComment">发到评论</el-button>
              <el-button v-if="canManage && !isRequirementTask" @click="appendToDescription">追加到描述</el-button>
              <el-button v-if="canManage && result.action === 'STANDARDIZE'" type="primary" @click="replaceDescription">替换描述</el-button>
              <el-button
                v-if="canManage && result.action === 'SUGGEST_UPDATE' && result.suggestionMarkdown"
                type="primary"
                :loading="applyingPrdSuggestion"
                @click="applyPrdSuggestion"
              >
                写入 PRD
              </el-button>
            </el-space>
          </div>
          <div class="requirement-ai-markdown" v-html="renderMarkdownToHtml(result?.markdown)"></div>
        </div>

        <div class="requirement-ai-side">
          <div v-if="result && (result.action === 'GAP_CHECK' || result.action === 'SUGGEST_UPDATE')" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">PRD 上下文</div>
                <div class="requirement-ai-section-subtitle">
                  {{ prdDetail?.prdWikiPageTitle || '当前尚未绑定 PRD 页面' }}
                </div>
              </div>
            </div>

            <div class="requirement-ai-meta-card">
              <div class="requirement-ai-meta-row">
                <span>状态</span>
                <strong>{{ prdStatusText }}</strong>
              </div>
              <div class="requirement-ai-meta-row">
                <span>模块</span>
                <strong>{{ prdDetail?.moduleName || props.task?.moduleName || '未分类' }}</strong>
              </div>
              <div v-if="prdDetail?.prdWikiPageUpdatedAt" class="requirement-ai-meta-row">
                <span>最近更新</span>
                <strong>{{ prdDetail.prdWikiPageUpdatedAt }}</strong>
              </div>
              <p v-if="prdDetail?.statusMessage" class="requirement-ai-meta-tip">{{ prdDetail.statusMessage }}</p>
            </div>

            <div v-if="result.gaps?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">缺口列表</div>
              <ul class="requirement-ai-reference-list">
                <li v-for="(item, index) in result.gaps" :key="`gap-${index}`">{{ item }}</li>
              </ul>
            </div>

            <div v-if="result.questions?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">待确认问题</div>
              <ul class="requirement-ai-reference-list">
                <li v-for="(item, index) in result.questions" :key="`question-${index}`">{{ item }}</li>
              </ul>
            </div>

            <div v-if="result.references?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">召回参考</div>
              <div class="requirement-ai-reference-cards">
                <button
                  v-for="item in result.references"
                  :key="`${item.spaceId}-${item.pageId}`"
                  class="requirement-ai-reference-card"
                  type="button"
                  @click="openReferencePage(item.spaceId, item.pageId)"
                >
                  <div class="requirement-ai-reference-card-title">{{ item.title }}</div>
                  <div class="requirement-ai-reference-card-meta">{{ item.directoryName }}<span v-if="item.score != null"> · {{ item.score.toFixed(2) }}</span></div>
                  <div class="requirement-ai-reference-card-snippet">{{ item.snippet }}</div>
                </button>
              </div>
            </div>
          </div>
          <div v-if="result?.action === 'BREAKDOWN'" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">拆解建议</div>
                <div class="requirement-ai-section-subtitle">支持编辑、删除后再创建任务</div>
              </div>
              <el-button
                v-if="canManage && editableTaskSuggestions.length"
                type="primary"
                :loading="creatingTasks"
                @click="createSuggestedTasks"
              >
                创建任务
              </el-button>
            </div>

            <el-empty v-if="!editableTaskSuggestions.length" description="暂无拆解任务" />
            <div v-else class="requirement-ai-suggestions">
              <div
                v-for="(item, index) in editableTaskSuggestions"
                :key="`${item.name}-${index}`"
                class="requirement-ai-suggestion editable"
              >
                <div class="requirement-ai-card-head">
                  <span class="requirement-ai-card-index">子任务 {{ index + 1 }}</span>
                  <span class="requirement-ai-card-type">{{ item.category }} / {{ item.priority }}</span>
                </div>
                <div class="requirement-ai-suggestion-actions">
                  <el-button text type="primary" @click="openTaskSuggestionDrawer(index)">展开编辑</el-button>
                  <el-button text type="danger" @click="removeTaskSuggestion(index)">删除</el-button>
                </div>
                <el-input v-model="item.name" placeholder="任务标题" />
                <div class="requirement-ai-suggestion-grid">
                  <el-select v-model="item.category">
                    <el-option v-for="option in taskCategoryOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                  <el-select v-model="item.priority">
                    <el-option v-for="option in taskPriorityOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                </div>
                <div class="requirement-ai-suggestion-desc" v-html="renderMarkdownToHtml(item.description)"></div>
              </div>
            </div>
          </div>

          <div v-else-if="result?.action === 'TEST_CASES'" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">测试用例建议</div>
                <div class="requirement-ai-section-subtitle">可导入现有测试计划，或新建计划后导入</div>
              </div>
            </div>

            <div class="requirement-ai-plan-toolbar">
              <el-select
                v-model="selectedPlanId"
                clearable
                filterable
                placeholder="选择已有测试计划"
                style="width: 100%"
              >
                <el-option v-for="item in testPlanOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
              <el-space wrap>
                <el-button
                  v-if="canManage && editableTestCaseSuggestions.length && selectedPlanId"
                  :loading="importingTestCases"
                  @click="appendToExistingPlan"
                >
                  导入现有计划
                </el-button>
                <el-button
                  v-if="canManage && editableTestCaseSuggestions.length"
                  type="primary"
                  :loading="creatingTestPlan"
                  @click="createNewPlanWithCases"
                >
                  新建测试计划
                </el-button>
              </el-space>
            </div>

            <el-empty v-if="!editableTestCaseSuggestions.length" description="暂无测试用例" />
            <div v-else class="requirement-ai-suggestions">
              <div
                v-for="(item, index) in editableTestCaseSuggestions"
                :key="`${item.title}-${index}`"
                class="requirement-ai-suggestion editable"
              >
                <div class="requirement-ai-card-head">
                  <span class="requirement-ai-card-index">用例 {{ index + 1 }}</span>
                  <span class="requirement-ai-card-type">{{ item.caseType }} / {{ item.priority }}</span>
                </div>
                <div class="requirement-ai-suggestion-actions">
                  <el-button text type="danger" @click="removeTestCaseSuggestion(index)">删除</el-button>
                </div>
                <el-input v-model="item.title" placeholder="用例标题" />
                <div class="requirement-ai-suggestion-grid triple">
                  <el-input v-model="item.moduleName" placeholder="功能模块" />
                  <el-select v-model="item.caseType">
                    <el-option v-for="option in caseTypeOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                  <el-select v-model="item.priority">
                    <el-option v-for="option in casePriorityOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                </div>
                <el-input v-model="item.precondition" type="textarea" :rows="2" placeholder="前置条件" />
                <el-input v-model="item.remarks" type="textarea" :rows="2" placeholder="备注" />
                <div class="requirement-ai-steps">
                  <div class="requirement-ai-steps-head">
                    <span>步骤</span>
                    <el-button text type="primary" @click="appendStep(item)">新增步骤</el-button>
                  </div>
                  <div v-for="(step, stepIndex) in item.steps" :key="stepIndex" class="requirement-ai-step">
                    <div class="requirement-ai-step-head">
                      <span>步骤 {{ step.stepNo }}</span>
                      <el-button text type="danger" @click="removeStep(item, stepIndex)">删除</el-button>
                    </div>
                    <el-input v-model="step.action" type="textarea" :rows="2" placeholder="执行步骤" />
                    <el-input v-model="step.expectedResult" type="textarea" :rows="2" placeholder="预期结果" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">结果操作</div>
                <div class="requirement-ai-section-subtitle">生成后可发布评论或更新需求描述</div>
              </div>
            </div>
            <el-empty description="当前动作没有侧边操作项" />
          </div>
        </div>
      </div>
    </template>
  </el-dialog>

  <template v-else-if="task">
    <div class="requirement-ai-embedded-shell">
      <div class="requirement-ai-toolbar">
        <el-select
          v-model="selectedModelConfigId"
          clearable
          filterable
          placeholder="选择模型，不选则使用第一个启用模型"
          style="width: 320px"
        >
          <el-option v-for="item in modelOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-space wrap>
          <el-button :loading="runningAction === 'STANDARDIZE'" @click="runAction('STANDARDIZE')">标准化需求</el-button>
          <el-button :loading="runningAction === 'BREAKDOWN'" @click="runAction('BREAKDOWN')">拆解子任务</el-button>
          <el-button :loading="runningAction === 'TEST_CASES'" @click="runAction('TEST_CASES')">生成测试用例</el-button>
          <el-button
            v-if="prdReady"
            :loading="runningAction === 'GAP_CHECK'"
            @click="runPrdAction('GAP_CHECK')"
          >
            检查 PRD 缺口
          </el-button>
          <el-button
            v-if="prdReady"
            plain
            :loading="runningAction === 'SUGGEST_UPDATE'"
            @click="runPrdAction('SUGGEST_UPDATE')"
          >
            生成 PRD 建议
          </el-button>
          <el-button v-if="prdReady" plain @click="openPrdPage">打开 PRD</el-button>
        </el-space>
      </div>

      <div class="requirement-ai-body">
        <div class="requirement-ai-preview">
          <div class="requirement-ai-section-head">
            <div>
              <div class="requirement-ai-section-title">{{ result?.title || 'AI 结果预览' }}</div>
              <div class="requirement-ai-section-subtitle">
                {{ result?.modelConfigName ? `模型：${result.modelConfigName}` : '尚未生成内容' }}
              </div>
            </div>
            <el-space v-if="result">
              <el-button @click="postAsComment">发到评论</el-button>
              <el-button v-if="canManage && !isRequirementTask" @click="appendToDescription">追加到描述</el-button>
              <el-button v-if="canManage && result.action === 'STANDARDIZE'" type="primary" @click="replaceDescription">替换描述</el-button>
              <el-button
                v-if="canManage && result.action === 'SUGGEST_UPDATE' && result.suggestionMarkdown"
                type="primary"
                :loading="applyingPrdSuggestion"
                @click="applyPrdSuggestion"
              >
                写入 PRD
              </el-button>
            </el-space>
          </div>
          <div class="requirement-ai-markdown" v-html="renderMarkdownToHtml(result?.markdown)"></div>
        </div>

        <div class="requirement-ai-side">
          <div v-if="result && (result.action === 'GAP_CHECK' || result.action === 'SUGGEST_UPDATE')" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">PRD 上下文</div>
                <div class="requirement-ai-section-subtitle">
                  {{ prdDetail?.prdWikiPageTitle || '当前尚未绑定 PRD 页面' }}
                </div>
              </div>
            </div>

            <div class="requirement-ai-meta-card">
              <div class="requirement-ai-meta-row">
                <span>状态</span>
                <strong>{{ prdStatusText }}</strong>
              </div>
              <div class="requirement-ai-meta-row">
                <span>模块</span>
                <strong>{{ prdDetail?.moduleName || props.task?.moduleName || '未分类' }}</strong>
              </div>
              <div v-if="prdDetail?.prdWikiPageUpdatedAt" class="requirement-ai-meta-row">
                <span>最近更新</span>
                <strong>{{ prdDetail.prdWikiPageUpdatedAt }}</strong>
              </div>
              <p v-if="prdDetail?.statusMessage" class="requirement-ai-meta-tip">{{ prdDetail.statusMessage }}</p>
            </div>

            <div v-if="result.gaps?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">缺口列表</div>
              <ul class="requirement-ai-reference-list">
                <li v-for="(item, index) in result.gaps" :key="`gap-${index}`">{{ item }}</li>
              </ul>
            </div>

            <div v-if="result.questions?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">待确认问题</div>
              <ul class="requirement-ai-reference-list">
                <li v-for="(item, index) in result.questions" :key="`question-${index}`">{{ item }}</li>
              </ul>
            </div>

            <div v-if="result.references?.length" class="requirement-ai-reference-block">
              <div class="requirement-ai-reference-title">召回参考</div>
              <div class="requirement-ai-reference-cards">
                <button
                  v-for="item in result.references"
                  :key="`${item.spaceId}-${item.pageId}`"
                  class="requirement-ai-reference-card"
                  type="button"
                  @click="openReferencePage(item.spaceId, item.pageId)"
                >
                  <div class="requirement-ai-reference-card-title">{{ item.title }}</div>
                  <div class="requirement-ai-reference-card-meta">{{ item.directoryName }}<span v-if="item.score != null"> · {{ item.score.toFixed(2) }}</span></div>
                  <div class="requirement-ai-reference-card-snippet">{{ item.snippet }}</div>
                </button>
              </div>
            </div>
          </div>
          <div v-if="result?.action === 'BREAKDOWN'" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">拆解建议</div>
                <div class="requirement-ai-section-subtitle">支持编辑、删除后再创建任务</div>
              </div>
              <el-button
                v-if="canManage && editableTaskSuggestions.length"
                type="primary"
                :loading="creatingTasks"
                @click="createSuggestedTasks"
              >
                创建任务
              </el-button>
            </div>

            <el-empty v-if="!editableTaskSuggestions.length" description="暂无拆解任务" />
            <div v-else class="requirement-ai-suggestions">
              <div
                v-for="(item, index) in editableTaskSuggestions"
                :key="`${item.name}-${index}`"
                class="requirement-ai-suggestion editable"
              >
                <div class="requirement-ai-card-head">
                  <span class="requirement-ai-card-index">子任务 {{ index + 1 }}</span>
                  <span class="requirement-ai-card-type">{{ item.category }} / {{ item.priority }}</span>
                </div>
                <div class="requirement-ai-suggestion-actions">
                  <el-button text type="primary" @click="openTaskSuggestionDrawer(index)">展开编辑</el-button>
                  <el-button text type="danger" @click="removeTaskSuggestion(index)">删除</el-button>
                </div>
                <el-input v-model="item.name" placeholder="任务标题" />
                <div class="requirement-ai-suggestion-grid">
                  <el-select v-model="item.category">
                    <el-option v-for="option in taskCategoryOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                  <el-select v-model="item.priority">
                    <el-option v-for="option in taskPriorityOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                </div>
                <div class="requirement-ai-suggestion-desc" v-html="renderMarkdownToHtml(item.description)"></div>
              </div>
            </div>
          </div>

          <div v-else-if="result?.action === 'TEST_CASES'" class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">测试用例建议</div>
                <div class="requirement-ai-section-subtitle">可导入现有测试计划，或新建计划后导入</div>
              </div>
            </div>

            <div class="requirement-ai-plan-toolbar">
              <el-select
                v-model="selectedPlanId"
                clearable
                filterable
                placeholder="选择已有测试计划"
                style="width: 100%"
              >
                <el-option v-for="item in testPlanOptions" :key="item.id" :label="item.name" :value="item.id" />
              </el-select>
              <el-space wrap>
                <el-button
                  v-if="canManage && editableTestCaseSuggestions.length && selectedPlanId"
                  :loading="importingTestCases"
                  @click="appendToExistingPlan"
                >
                  导入现有计划
                </el-button>
                <el-button
                  v-if="canManage && editableTestCaseSuggestions.length"
                  type="primary"
                  :loading="creatingTestPlan"
                  @click="createNewPlanWithCases"
                >
                  新建测试计划
                </el-button>
              </el-space>
            </div>

            <el-empty v-if="!editableTestCaseSuggestions.length" description="暂无测试用例" />
            <div v-else class="requirement-ai-suggestions">
              <div
                v-for="(item, index) in editableTestCaseSuggestions"
                :key="`${item.title}-${index}`"
                class="requirement-ai-suggestion editable"
              >
                <div class="requirement-ai-card-head">
                  <span class="requirement-ai-card-index">用例 {{ index + 1 }}</span>
                  <span class="requirement-ai-card-type">{{ item.caseType }} / {{ item.priority }}</span>
                </div>
                <div class="requirement-ai-suggestion-actions">
                  <el-button text type="danger" @click="removeTestCaseSuggestion(index)">删除</el-button>
                </div>
                <el-input v-model="item.title" placeholder="用例标题" />
                <div class="requirement-ai-suggestion-grid triple">
                  <el-input v-model="item.moduleName" placeholder="功能模块" />
                  <el-select v-model="item.caseType">
                    <el-option v-for="option in caseTypeOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                  <el-select v-model="item.priority">
                    <el-option v-for="option in casePriorityOptions" :key="option" :label="option" :value="option" />
                  </el-select>
                </div>
                <el-input v-model="item.precondition" type="textarea" :rows="2" placeholder="前置条件" />
                <el-input v-model="item.remarks" type="textarea" :rows="2" placeholder="备注" />
                <div class="requirement-ai-steps">
                  <div class="requirement-ai-steps-head">
                    <span>步骤</span>
                    <el-button text type="primary" @click="appendStep(item)">新增步骤</el-button>
                  </div>
                  <div v-for="(step, stepIndex) in item.steps" :key="stepIndex" class="requirement-ai-step">
                    <div class="requirement-ai-step-head">
                      <span>步骤 {{ step.stepNo }}</span>
                      <el-button text type="danger" @click="removeStep(item, stepIndex)">删除</el-button>
                    </div>
                    <el-input v-model="step.action" type="textarea" :rows="2" placeholder="执行步骤" />
                    <el-input v-model="step.expectedResult" type="textarea" :rows="2" placeholder="预期结果" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="requirement-ai-panel">
            <div class="requirement-ai-section-head compact">
              <div>
                <div class="requirement-ai-section-title">结果操作</div>
                <div class="requirement-ai-section-subtitle">生成后可发布评论或更新需求描述</div>
              </div>
            </div>
            <el-empty description="当前动作没有侧边操作项" />
          </div>
        </div>
      </div>
    </div>
  </template>

  <el-drawer
    v-model="taskSuggestionDrawerVisible"
    size="56%"
    destroy-on-close
    class="requirement-ai-drawer"
  >
    <template #header>
      <div class="requirement-ai-drawer-title">编辑拆解建议</div>
    </template>

    <template v-if="currentTaskSuggestion">
      <div class="requirement-ai-drawer-body">
        <el-input v-model="currentTaskSuggestion.name" placeholder="任务标题" />
        <div class="requirement-ai-suggestion-grid">
          <el-select v-model="currentTaskSuggestion.category">
            <el-option v-for="option in taskCategoryOptions" :key="option" :label="option" :value="option" />
          </el-select>
          <el-select v-model="currentTaskSuggestion.priority">
            <el-option v-for="option in taskPriorityOptions" :key="option" :label="option" :value="option" />
          </el-select>
        </div>
        <MarkdownEditor v-model="currentTaskSuggestion.description" :height="520" placeholder="任务说明（Markdown）" />
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  analyzeTaskPrd,
  applyTaskPrdSuggestion,
  createTask,
  createTaskComment,
  createTestPlan,
  generateTaskRequirementAi,
  getTaskPrdDetail,
  getTestPlanDetail,
  pageTestPlans,
  updateTask,
  updateTestPlan
} from '@/api/platform'
import { listModelConfigOptions } from '@/api/models'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import { renderMarkdownToHtml } from '@/utils/markdown'
import type {
  AiModelConfigItem,
  TaskItem,
  TaskPrdAnalyzeResultItem,
  TaskPrdDetailItem,
  TaskRequirementAiResultItem,
  TaskRequirementAiSuggestionItem,
  TaskRequirementAiTestCaseSuggestionItem,
  TestPlanItem
} from '@/types/platform'

const props = defineProps<{
  modelValue: boolean
  task: TaskItem | null
  canManage: boolean
  embedded?: boolean
}>()

const embedded = computed(() => Boolean(props.embedded))

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  changed: []
}>()

const taskCategoryOptions = ['需求设计', 'UI设计', '技术设计', '开发', '测试', '部署']
const taskPriorityOptions = ['高', '中', '低']
const caseTypeOptions = ['功能测试', '接口测试', '回归测试', '异常测试', '兼容性测试', '性能测试']
const casePriorityOptions = ['P0', 'P1', 'P2', 'P3']
const router = useRouter()

interface RequirementAiDialogResult {
  action: string
  title: string
  markdown: string
  modelConfigId: number | null
  modelConfigName: string | null
  taskSuggestions: TaskRequirementAiSuggestionItem[]
  testCaseSuggestions: TaskRequirementAiTestCaseSuggestionItem[]
  suggestionMarkdown: string
  gaps: string[]
  questions: string[]
  references: TaskPrdAnalyzeResultItem['references']
}

const modelOptions = ref<AiModelConfigItem[]>([])
const selectedModelConfigId = ref<number | undefined>()
const runningAction = ref<string | null>(null)
const creatingTasks = ref(false)
const importingTestCases = ref(false)
const creatingTestPlan = ref(false)
const prdLoading = ref(false)
const applyingPrdSuggestion = ref(false)
const selectedPlanId = ref<number | undefined>()
const testPlanOptions = ref<TestPlanItem[]>([])
const result = ref<RequirementAiDialogResult | null>(null)
const prdDetail = ref<TaskPrdDetailItem | null>(null)
const editableTaskSuggestions = ref<TaskRequirementAiSuggestionItem[]>([])
const editableTestCaseSuggestions = ref<TaskRequirementAiTestCaseSuggestionItem[]>([])
const taskSuggestionDrawerVisible = ref(false)
const currentTaskSuggestionIndex = ref<number | null>(null)

const currentTaskSuggestion = computed(() => {
  if (currentTaskSuggestionIndex.value === null) {
    return null
  }
  return editableTaskSuggestions.value[currentTaskSuggestionIndex.value] || null
})
const isRequirementTask = computed(() => props.task?.workItemType === '需求')
const prdReady = computed(() => prdDetail.value?.status === 'READY' && !!prdDetail.value?.prdWikiPageId && !!prdDetail.value?.wikiSpaceId)
const prdStatusText = computed(() => {
  if (!prdDetail.value) return '未初始化'
  if (prdDetail.value.status === 'READY') return '已就绪'
  if (prdDetail.value.status === 'PENDING') return '初始化中'
  if (prdDetail.value.status === 'FAILED') return '初始化失败'
  return '未初始化'
})

const loadModelOptions = async () => {
  modelOptions.value = await listModelConfigOptions()
  if (!selectedModelConfigId.value && modelOptions.value.length === 1) {
    selectedModelConfigId.value = modelOptions.value[0].id
  }
}

const loadTestPlanOptions = async () => {
  if (!props.task) {
    testPlanOptions.value = []
    return
  }
  const pageData = await pageTestPlans({
    page: 1,
    size: 100,
    projectId: props.task.projectId,
    iterationId: props.task.iterationId || undefined
  })
  testPlanOptions.value = pageData.records
}

const cloneTaskSuggestions = (suggestions: TaskRequirementAiSuggestionItem[] = []) =>
  suggestions.map((item) => ({
    name: item.name,
    category: item.category,
    priority: item.priority,
    description: item.description
  }))

const cloneTestCaseSuggestions = (suggestions: TaskRequirementAiTestCaseSuggestionItem[] = []) =>
  suggestions.map((item) => ({
    title: item.title,
    moduleName: item.moduleName,
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition,
    remarks: item.remarks,
    steps: item.steps.map((step) => ({
      stepNo: step.stepNo,
      action: step.action,
      expectedResult: step.expectedResult
    }))
  }))

const normalizeRequirementAiResult = (payload: TaskRequirementAiResultItem): RequirementAiDialogResult => ({
  action: payload.action,
  title: payload.title,
  markdown: payload.markdown,
  modelConfigId: payload.modelConfigId,
  modelConfigName: payload.modelConfigName,
  taskSuggestions: cloneTaskSuggestions(payload.taskSuggestions),
  testCaseSuggestions: cloneTestCaseSuggestions(payload.testCaseSuggestions),
  suggestionMarkdown: '',
  gaps: [],
  questions: [],
  references: []
})

const normalizePrdAnalyzeResult = (payload: TaskPrdAnalyzeResultItem): RequirementAiDialogResult => ({
  action: payload.action,
  title: payload.title,
  markdown: payload.markdown,
  modelConfigId: payload.modelConfigId,
  modelConfigName: payload.modelConfigName,
  taskSuggestions: [],
  testCaseSuggestions: [],
  suggestionMarkdown: payload.suggestionMarkdown,
  gaps: [...payload.gaps],
  questions: [...payload.questions],
  references: [...payload.references]
})

const loadPrdDetail = async () => {
  if (!props.task || props.task.workItemType !== '需求') {
    prdDetail.value = null
    return
  }
  prdLoading.value = true
  try {
    prdDetail.value = await getTaskPrdDetail(props.task.id)
  } catch (error: any) {
    prdDetail.value = null
    ElMessage.error(error?.response?.data?.message || '读取 PRD 详情失败')
  } finally {
    prdLoading.value = false
  }
}

const runAction = async (action: string) => {
  if (!props.task) {
    return
  }
  runningAction.value = action
  try {
    const response = await generateTaskRequirementAi(props.task.id, {
      action,
      modelConfigId: selectedModelConfigId.value
    })
    result.value = normalizeRequirementAiResult(response)
    editableTaskSuggestions.value = cloneTaskSuggestions(response.taskSuggestions)
    editableTestCaseSuggestions.value = cloneTestCaseSuggestions(response.testCaseSuggestions)
    if (action === 'TEST_CASES') {
      await loadTestPlanOptions()
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || 'AI 生成失败')
  } finally {
    runningAction.value = null
  }
}

const runPrdAction = async (action: 'GAP_CHECK' | 'SUGGEST_UPDATE') => {
  if (!props.task) {
    return
  }
  if (!prdReady.value) {
    ElMessage.warning(prdDetail.value?.statusMessage || '请先初始化 PRD')
    return
  }
  runningAction.value = action
  try {
    const response = await analyzeTaskPrd(props.task.id, {
      action,
      modelConfigId: selectedModelConfigId.value
    })
    result.value = normalizePrdAnalyzeResult(response)
    editableTaskSuggestions.value = []
    editableTestCaseSuggestions.value = []
    await loadPrdDetail()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || 'PRD 分析失败')
  } finally {
    runningAction.value = null
  }
}

/**
 * 统一构建工作项更新载荷，避免需求模板字段在 AI 更新时被清空。
 */
const buildTaskUpdatePayload = (nextDescription: string, nextRequirementMarkdown?: string) => {
  if (!props.task) {
    return null
  }
  return {
    name: props.task.name,
    workItemType: props.task.workItemType,
    status: props.task.status,
    priority: props.task.priority,
    assignee: props.task.assignee,
    assigneeUserId: props.task.assigneeUserId,
    collaboratorUserIds: props.task.collaboratorUserIds,
    planStartDate: props.task.planStartDate,
    planEndDate: props.task.planEndDate,
    description: nextDescription,
    requirementMarkdown: isRequirementTask.value ? nextRequirementMarkdown || nextDescription : '',
    prototypeUrl: isRequirementTask.value ? props.task.prototypeUrl : '',
    moduleName: isRequirementTask.value ? (props.task.moduleName || '') : '',
    projectId: props.task.projectId,
    agentId: props.task.agentId,
    iterationId: props.task.iterationId,
    requirementTaskId: props.task.requirementTaskId
  }
}

const replaceDescription = async () => {
  if (!props.task || !result.value || !props.canManage) {
    return
  }
  try {
    const payload = buildTaskUpdatePayload(result.value.markdown, result.value.markdown)
    if (!payload) {
      return
    }
    await updateTask(props.task.id, payload)
    ElMessage.success('需求描述已更新')
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新描述失败')
  }
}

const appendToDescription = async () => {
  if (!props.task || !result.value || !props.canManage) {
    return
  }
  const nextDescription = [props.task.description?.trim(), result.value.markdown?.trim()].filter(Boolean).join('\n\n')
  try {
    const payload = buildTaskUpdatePayload(nextDescription, nextDescription)
    if (!payload) {
      return
    }
    await updateTask(props.task.id, payload)
    ElMessage.success('AI 结果已追加到描述')
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '更新描述失败')
  }
}

const postAsComment = async () => {
  if (!props.task || !result.value) {
    return
  }
  try {
    await createTaskComment(props.task.id, `## ${result.value.title}\n\n${result.value.markdown}`)
    ElMessage.success('AI 结果已发布到评论')
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '发布评论失败')
  }
}

const applyPrdSuggestion = async () => {
  if (!props.task || !props.canManage || !result.value?.suggestionMarkdown) {
    return
  }
  applyingPrdSuggestion.value = true
  try {
    await applyTaskPrdSuggestion(props.task.id, {
      suggestionMarkdown: result.value.suggestionMarkdown,
      changeSummary: '应用 AI PRD 建议'
    })
    ElMessage.success('PRD 建议已写入')
    await loadPrdDetail()
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '写入 PRD 失败')
  } finally {
    applyingPrdSuggestion.value = false
  }
}

const openPrdPage = async () => {
  if (!prdDetail.value?.wikiSpaceId || !prdDetail.value?.prdWikiPageId) {
    return
  }
  await router.push({ name: 'wiki-space-page', params: { spaceId: prdDetail.value.wikiSpaceId, pageId: prdDetail.value.prdWikiPageId } })
  emit('update:modelValue', false)
}

const openReferencePage = async (spaceId: number, pageId: number) => {
  await router.push({ name: 'wiki-space-page', params: { spaceId, pageId } })
  emit('update:modelValue', false)
}

const removeTaskSuggestion = (index: number) => {
  if (currentTaskSuggestionIndex.value === index) {
    taskSuggestionDrawerVisible.value = false
    currentTaskSuggestionIndex.value = null
  } else if (currentTaskSuggestionIndex.value !== null && currentTaskSuggestionIndex.value > index) {
    currentTaskSuggestionIndex.value -= 1
  }
  editableTaskSuggestions.value.splice(index, 1)
}

const openTaskSuggestionDrawer = (index: number) => {
  currentTaskSuggestionIndex.value = index
  taskSuggestionDrawerVisible.value = true
}

const createSuggestedTasks = async () => {
  if (!props.task || !props.canManage || !editableTaskSuggestions.value.length) {
    return
  }
  creatingTasks.value = true
  try {
    for (const item of editableTaskSuggestions.value) {
      await createTask({
        name: item.name.trim(),
        workItemType: '任务',
        status: '草稿',
        priority: item.priority,
        assignee: '',
        assigneeUserId: null,
        collaboratorUserIds: [],
        description: item.description,
        projectId: props.task.projectId,
        agentId: null,
        iterationId: props.task.iterationId,
        requirementTaskId: props.task.id
      })
    }
    ElMessage.success(`已创建 ${editableTaskSuggestions.value.length} 个任务`)
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建任务失败')
  } finally {
    creatingTasks.value = false
  }
}

const removeTestCaseSuggestion = (index: number) => {
  editableTestCaseSuggestions.value.splice(index, 1)
}

const appendStep = (testCase: TaskRequirementAiTestCaseSuggestionItem) => {
  testCase.steps.push({
    stepNo: testCase.steps.length + 1,
    action: '',
    expectedResult: ''
  })
}

const removeStep = (testCase: TaskRequirementAiTestCaseSuggestionItem, index: number) => {
  testCase.steps.splice(index, 1)
  testCase.steps.forEach((step, stepIndex) => {
    step.stepNo = stepIndex + 1
  })
}

const buildCasePayload = (cases: TaskRequirementAiTestCaseSuggestionItem[]) =>
  cases.map((item, caseIndex) => ({
    title: item.title.trim(),
    moduleName: item.moduleName.trim(),
    caseType: item.caseType,
    priority: item.priority,
    precondition: item.precondition.trim(),
    remarks: item.remarks.trim(),
    sortOrder: caseIndex,
    steps: item.steps
      .filter((step) => step.action.trim() && step.expectedResult.trim())
      .map((step, stepIndex) => ({
        stepNo: step.stepNo || stepIndex + 1,
        action: step.action.trim(),
        expectedResult: step.expectedResult.trim()
      }))
  }))

const appendToExistingPlan = async () => {
  if (!selectedPlanId.value || !editableTestCaseSuggestions.value.length) {
    return
  }
  importingTestCases.value = true
  try {
    const detail = await getTestPlanDetail(selectedPlanId.value)
    await updateTestPlan(selectedPlanId.value, {
      name: detail.name,
      projectId: detail.projectId,
      iterationId: detail.iterationId as number,
      status: detail.status,
      description: detail.description,
      cases: [...detail.cases, ...buildCasePayload(editableTestCaseSuggestions.value)].map((item, index) => ({
        ...item,
        sortOrder: index
      }))
    })
    ElMessage.success(`已导入 ${editableTestCaseSuggestions.value.length} 条测试用例`)
    emit('changed')
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '导入测试计划失败')
  } finally {
    importingTestCases.value = false
  }
}

const createNewPlanWithCases = async () => {
  if (!props.task || !editableTestCaseSuggestions.value.length) {
    return
  }
  if (!props.task.iterationId) {
    ElMessage.warning('当前需求未分配迭代，无法直接创建测试计划')
    return
  }
  creatingTestPlan.value = true
  try {
    await createTestPlan({
      name: `${props.task.name}-测试计划`,
      projectId: props.task.projectId,
      iterationId: props.task.iterationId,
      status: '草稿',
      description: `由需求《${props.task.name}》AI 生成`,
      cases: buildCasePayload(editableTestCaseSuggestions.value)
    })
    ElMessage.success(`已创建测试计划并导入 ${editableTestCaseSuggestions.value.length} 条测试用例`)
    emit('changed')
    await loadTestPlanOptions()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || '创建测试计划失败')
  } finally {
    creatingTestPlan.value = false
  }
}

watch(
  () => props.modelValue,
  (visible) => {
    if (!visible) {
      result.value = null
      editableTaskSuggestions.value = []
      editableTestCaseSuggestions.value = []
      selectedPlanId.value = undefined
      taskSuggestionDrawerVisible.value = false
      currentTaskSuggestionIndex.value = null
      runningAction.value = null
      creatingTasks.value = false
      importingTestCases.value = false
      creatingTestPlan.value = false
      applyingPrdSuggestion.value = false
    }
  }
)

watch(
  () => props.task?.id,
  () => {
    result.value = null
    editableTaskSuggestions.value = []
    editableTestCaseSuggestions.value = []
    selectedPlanId.value = undefined
    taskSuggestionDrawerVisible.value = false
    currentTaskSuggestionIndex.value = null
    void loadPrdDetail()
  }
)

onMounted(async () => {
  await loadModelOptions()
  if (props.task?.workItemType === '需求') {
    await loadPrdDetail()
  }
})
</script>

<style scoped>
.requirement-ai-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.requirement-ai-title {
  font-size: 18px;
  font-weight: 700;
}

.requirement-ai-subtitle {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.requirement-ai-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.requirement-ai-toolbar :deep(.el-button) {
  --el-button-hover-text-color: var(--app-primary);
  --el-button-hover-border-color: rgba(var(--app-primary-rgb), 0.3);
  --el-button-hover-bg-color: rgba(var(--app-primary-rgb), 0.08);
  --el-button-active-text-color: var(--app-primary);
  --el-button-active-border-color: rgba(var(--app-primary-rgb), 0.36);
  --el-button-active-bg-color: rgba(var(--app-primary-rgb), 0.12);
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}

.requirement-ai-toolbar :deep(.el-button:hover),
.requirement-ai-toolbar :deep(.el-button:focus-visible),
.requirement-ai-toolbar :deep(.el-button:active) {
  transform: none;
}

.requirement-ai-embedded-shell {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.requirement-ai-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 0.92fr);
  gap: 16px;
  min-height: 0;
  height: 100%;
}

.requirement-ai-preview,
.requirement-ai-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  width: 100%;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 18px;
  padding: 16px;
  background: #fff;
  min-height: 0;
  min-width: 0;
}

.requirement-ai-side {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.requirement-ai-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.requirement-ai-section-head.compact {
  margin-bottom: 10px;
}

.requirement-ai-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.requirement-ai-section-subtitle {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.requirement-ai-markdown {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  line-height: 1.7;
  color: var(--el-text-color-primary);
}

.requirement-ai-markdown :deep(p),
.requirement-ai-markdown :deep(ul),
.requirement-ai-markdown :deep(ol),
.requirement-ai-markdown :deep(blockquote),
.requirement-ai-markdown :deep(pre) {
  margin: 0;
}

.requirement-ai-markdown :deep(p + p),
.requirement-ai-markdown :deep(p + ul),
.requirement-ai-markdown :deep(p + ol),
.requirement-ai-markdown :deep(ul + p),
.requirement-ai-markdown :deep(ol + p),
.requirement-ai-markdown :deep(blockquote + p),
.requirement-ai-markdown :deep(pre + p) {
  margin-top: 10px;
}

.requirement-ai-markdown :deep(ul),
.requirement-ai-markdown :deep(ol) {
  padding-left: 20px;
}

.requirement-ai-markdown :deep(pre) {
  overflow: auto;
  padding: 12px 14px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
}

.requirement-ai-suggestions {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 18px;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.requirement-ai-suggestion {
  border: 1px solid #d8e4ef;
  border-radius: 18px;
  padding: 14px 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
}

.requirement-ai-suggestion.editable {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.requirement-ai-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #d7e2ec;
}

.requirement-ai-card-index {
  font-size: 12px;
  font-weight: 800;
  color: #0f3b66;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.requirement-ai-card-type {
  font-size: 12px;
  color: #6b7f93;
  white-space: nowrap;
}

.requirement-ai-suggestion-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

.requirement-ai-suggestion-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.requirement-ai-suggestion-grid.triple {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.requirement-ai-suggestion-desc {
  padding: 10px 12px;
  border: 1px solid #e1e8ef;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  line-height: 1.7;
}

.requirement-ai-plan-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.requirement-ai-meta-card {
  padding: 12px 14px;
  border: 1px solid #dbe6ef;
  border-radius: 14px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.requirement-ai-meta-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.requirement-ai-meta-tip {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.requirement-ai-reference-block {
  margin-top: 14px;
}

.requirement-ai-reference-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.requirement-ai-reference-list {
  margin: 0;
  padding-left: 18px;
  color: var(--el-text-color-regular);
  line-height: 1.7;
}

.requirement-ai-reference-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.requirement-ai-reference-card {
  border: 1px solid #dbe5ee;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
  text-align: left;
  cursor: pointer;
}

.requirement-ai-reference-card-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.requirement-ai-reference-card-meta {
  margin-top: 4px;
  font-size: 12px;
  color: #64748b;
}

.requirement-ai-reference-card-snippet {
  margin-top: 8px;
  font-size: 12px;
  line-height: 1.7;
  color: #475569;
}

.requirement-ai-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.requirement-ai-steps-head,
.requirement-ai-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.requirement-ai-step {
  padding: 10px;
  border: 1px solid #dbe5ee;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.requirement-ai-drawer-title {
  font-size: 16px;
  font-weight: 700;
}

.requirement-ai-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

@media (max-width: 1120px) {
  .requirement-ai-body {
    grid-template-columns: 1fr;
  }

  .requirement-ai-suggestion-grid,
  .requirement-ai-suggestion-grid.triple {
    grid-template-columns: 1fr;
  }
}
</style>
