<template>
  <!--
    项目新建/编辑表单主体。
    抽离自 ProjectView.vue 内联的 el-form，目的是让桌面端 el-dialog 与
    移动端 MobileFormDrawer 共用同一份表单模板，避免双份模板漂移。
    类名继续沿用 platform-form-* / project-dialog-* / project-form-layout，
    样式由 ProjectView.vue 中的现有规则负责，本组件不再重复声明。
  -->
  <el-form
    ref="formRef"
    :model="form"
    :rules="rules"
    label-position="top"
    class="platform-form-layout project-form-layout"
  >
    <section class="platform-form-section">
      <div class="platform-form-section-head">
        <div class="platform-form-section-title">基础设置</div>
      </div>
      <div class="project-dialog-form-grid">
        <el-form-item label="项目名称" prop="name" class="project-dialog-span-2">
          <el-input
            v-model="form.name"
            :disabled="!canEditProjectFields"
            placeholder="例如：智能代码评审平台"
          />
        </el-form-item>
        <el-form-item label="负责人" prop="ownerUserId">
          <el-select
            v-model="form.ownerUserId"
            :disabled="!canEditProjectFields"
            filterable
            placeholder="请选择负责人"
            style="width: 100%"
            @change="emitOwnerChange"
          >
            <el-option
              v-for="item in userOptions"
              :key="item.id"
              :label="buildUserLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select
            v-model="form.status"
            :disabled="!canEditProjectFields"
            placeholder="请选择状态"
            style="width: 100%"
          >
            <el-option label="进行中" value="进行中" />
            <el-option label="规划中" value="规划中" />
            <el-option label="已立项" value="已立项" />
            <el-option label="已完成" value="已完成" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目成员" class="project-dialog-span-2">
          <el-select
            v-model="form.memberUserIds"
            :disabled="!canEditProjectFields"
            multiple
            filterable
            collapse-tags
            placeholder="请选择项目成员"
            style="width: 100%"
          >
            <el-option
              v-for="item in memberSelectableUsers"
              :key="item.id"
              :label="buildUserLabel(item)"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="项目说明" prop="description" class="project-dialog-span-2">
          <el-input
            v-model="form.description"
            :disabled="!canEditProjectFields"
            type="textarea"
            :rows="4"
            placeholder="请输入项目目标、协作范围或当前阶段说明"
          />
        </el-form-item>
      </div>
    </section>

    <section v-if="showGiteeBindingSection" class="platform-form-section">
      <div class="platform-form-section-head">
        <div class="platform-form-section-title">Gitee 绑定</div>
        <div class="platform-form-section-subtitle">
          企业 ID 与 Access Token 统一由系统设置中的环境变量管理维护，这里只选择 Gitee 项目和启用状态。
        </div>
      </div>
      <div v-loading="giteeBindingLoading" class="project-dialog-form-grid">
        <el-form-item label="Gitee 项目" class="project-dialog-span-2">
          <el-select
            v-model="form.giteeProgramId"
            filterable
            :disabled="!canEditGiteeBindingFields || giteeProgramLoading"
            placeholder="请选择 Gitee 项目"
            :no-data-text="giteeProgramLoading ? 'Gitee 项目加载中...' : '未查询到可见的 Gitee 项目'"
            style="width: 100%"
          >
            <el-option
              v-for="item in giteeProgramOptions"
              :key="item.id"
              :label="item.ident ? `${item.name}（${item.ident}）` : item.name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="启用状态">
          <el-switch
            v-model="form.giteeBindingEnabled"
            :disabled="!canEditGiteeBindingFields || !form.giteeProgramId"
          />
        </el-form-item>
      </div>
    </section>
  </el-form>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { GiteeProgramItem, UserOptionItem } from '@/types/platform'

/**
 * 项目表单的字段约定，与 ProjectView.vue 内的 ProjectForm 接口保持一致。
 */
export interface ProjectEditorForm {
  /** 项目名称。 */
  name: string
  /** 负责人名称。 */
  owner: string
  /** 负责人用户 ID。 */
  ownerUserId: number | null
  /** 项目成员 ID 列表。 */
  memberUserIds: number[]
  /** 项目状态。 */
  status: string
  /** 项目说明。 */
  description: string
  /** 当前项目绑定的 Gitee program，留空表示暂不绑定。 */
  giteeProgramId: number | null
  /** Gitee 绑定是否启用。 */
  giteeBindingEnabled: boolean
}

interface Props {
  /** 表单数据，使用 reactive 注入即可保持双向。 */
  form: ProjectEditorForm
  /** 校验规则。 */
  rules: FormRules<ProjectEditorForm>
  /** 是否允许编辑项目基础信息。 */
  canEditProjectFields: boolean
  /** 是否允许编辑 Gitee 绑定字段。 */
  canEditGiteeBindingFields: boolean
  /** 是否展示 Gitee 绑定区块。 */
  showGiteeBindingSection: boolean
  /** Gitee 绑定接口整体加载态。 */
  giteeBindingLoading: boolean
  /** Gitee 项目下拉加载态。 */
  giteeProgramLoading: boolean
  /** Gitee 项目候选列表。 */
  giteeProgramOptions: GiteeProgramItem[]
  /** 用户候选列表。 */
  userOptions: UserOptionItem[]
  /** 项目成员可选列表（已剔除当前负责人）。 */
  memberSelectableUsers: UserOptionItem[]
  /** 用户标签生成器，统一负责人/成员的展示格式。 */
  buildUserLabel: (item: UserOptionItem) => string
}

defineProps<Props>()

const emit = defineEmits<{
  (event: 'owner-change'): void
}>()

const formRef = ref<FormInstance>()

const emitOwnerChange = () => {
  emit('owner-change')
}

/**
 * 透出表单实例的常用方法，父组件可继续以 formRef.value.validate() 的形式调用，
 * 保持与原 ProjectView.vue 内联表单一致的使用习惯。
 * 这里统一返回 Promise.resolve()，避免父组件在调用链上再处理 undefined 情况。
 */
defineExpose({
  validate: (...args: Parameters<NonNullable<FormInstance['validate']>>) =>
    formRef.value ? formRef.value.validate(...args) : Promise.resolve(false),
  validateField: (...args: Parameters<NonNullable<FormInstance['validateField']>>) =>
    formRef.value ? formRef.value.validateField(...args) : Promise.resolve(),
  resetFields: (...args: Parameters<NonNullable<FormInstance['resetFields']>>) =>
    formRef.value?.resetFields(...args),
  clearValidate: (...args: Parameters<NonNullable<FormInstance['clearValidate']>>) =>
    formRef.value?.clearValidate(...args),
  scrollToField: (...args: Parameters<NonNullable<FormInstance['scrollToField']>>) =>
    formRef.value?.scrollToField(...args)
})
</script>
