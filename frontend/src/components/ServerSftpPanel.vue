<template>
  <div class="server-sftp-panel">
    <!-- 工具栏：路径输入 + 操作按钮 -->
    <div class="sftp-toolbar">
      <div class="sftp-path-bar">
        <el-input
          v-model="pathInput"
          size="small"
          class="sftp-path-input"
          placeholder="输入远程目录路径，例如 /var/log"
          @keyup.enter="jumpToInputPath"
        >
          <template #prepend>路径</template>
          <template #append>
            <el-button :disabled="loading" @click="jumpToInputPath">跳转</el-button>
          </template>
        </el-input>
      </div>
      <div class="sftp-toolbar-actions">
        <el-button size="small" :disabled="currentPath === '/'" @click="loadDirectory('/')">根目录</el-button>
        <el-button size="small" :icon="Refresh" :loading="loading" @click="refreshList">刷新</el-button>
        <el-button size="small" :icon="FolderAdd" :disabled="!canOperate" @click="showMkdirDialog">创建目录</el-button>
        <el-button size="small" type="primary" :icon="Upload" :disabled="!canOperate" @click="triggerFileInput">
          上传文件
        </el-button>
        <input ref="fileInputRef" type="file" style="display: none" @change="handleFileSelected" />
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="sftp-file-table-shell">
      <el-table
        v-loading="loading"
        :data="fileList"
        class="sftp-file-table"
        height="100%"
        @row-dblclick="handleRowDblClick"
      >
        <el-table-column label="名称" min-width="280">
          <template #default="{ row }">
            <div class="sftp-file-name" :class="{ directory: row.isDirectory }">
              <el-icon v-if="row.isDirectory" class="sftp-file-icon"><Folder /></el-icon>
              <el-icon v-else class="sftp-file-icon"><Document /></el-icon>
              <span>{{ row.name }}</span>
              <span v-if="row.symbolicLink && row.linkTarget" class="sftp-link-target">-> {{ row.linkTarget }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="120">
          <template #default="{ row }">
            <span v-if="row.isDirectory">-</span>
            <span v-else>{{ formatFileSize(row.size) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="修改时间" width="180">
          <template #default="{ row }">
            <span>{{ row.lastModified || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="权限" width="120">
          <template #default="{ row }">
            <span class="sftp-permissions">{{ row.permissions || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="132" fixed="right">
          <template #default="{ row }">
            <div class="sftp-row-actions">
              <el-button
                v-if="!row.isDirectory"
                size="small"
                link
                :icon="Download"
                @click.stop="handleDownload(row)"
              />
              <el-button
                v-if="canOperate && row.name !== '..'"
                size="small"
                link
                type="danger"
                :icon="Delete"
                @click.stop="handleDelete(row)"
              />
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 拖拽上传区域 -->
    <div
      v-if="canOperate"
      class="sftp-drop-zone"
      :class="{ 'drag-over': isDragOver }"
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <el-icon class="sftp-drop-icon"><Upload /></el-icon>
      <span>拖拽文件到此处上传</span>
    </div>

    <!-- 上传进度列表 -->
    <div v-if="uploadQueue.length > 0" class="sftp-upload-progress">
      <div v-for="item in uploadQueue" :key="item.id" class="sftp-upload-item">
        <span class="sftp-upload-name">{{ item.fileName }}</span>
        <el-progress
          :percentage="item.percent"
          :status="item.status === 'done' ? 'success' : item.status === 'error' ? 'exception' : undefined"
          :stroke-width="6"
          style="flex: 1; margin-left: 12px"
        />
        <el-icon v-if="item.status === 'done'" class="sftp-upload-check"><CircleCheck /></el-icon>
        <el-icon v-if="item.status === 'error'" class="sftp-upload-error"><CircleClose /></el-icon>
      </div>
    </div>

    <!-- 创建目录对话框 -->
    <el-dialog v-model="mkdirDialogVisible" title="创建目录" width="420px" destroy-on-close align-center>
      <el-input v-model="newDirName" placeholder="请输入目录名称" @keyup.enter="handleMkdir" />
      <template #footer>
        <el-button @click="mkdirDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="mkdirLoading" @click="handleMkdir">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  CircleCheck,
  CircleClose,
  Delete,
  Document,
  Download,
  Folder,
  FolderAdd,
  Refresh,
  Upload
} from '@element-plus/icons-vue'
import { sftpDelete, sftpDownload, sftpLs, sftpMkdir, sftpUpload } from '@/api/servers'
import type { SftpFileItem } from '@/types/platform'

const props = defineProps<{
  serverId: number
  canOperate: boolean
}>()

interface UploadQueueItem {
  id: number
  fileName: string
  percent: number
  status: 'uploading' | 'done' | 'error'
}

let uploadIdCounter = 0

const currentPath = ref('/')
const pathInput = ref('/')
const fileList = ref<SftpFileItem[]>([])
const loading = ref(false)
const isDragOver = ref(false)
const uploadQueue = ref<UploadQueueItem[]>([])

// 创建目录
const mkdirDialogVisible = ref(false)
const newDirName = ref('')
const mkdirLoading = ref(false)

// 文件上传 input
const fileInputRef = ref<HTMLInputElement | null>(null)

/** 加载目录列表 */
async function loadDirectory(path: string) {
  loading.value = true
  try {
    const result = await sftpLs(props.serverId, normalizeInputPath(path))
    currentPath.value = result.path
    pathInput.value = result.path
    fileList.value = result.files
  } catch (err: any) {
    ElMessage.error('加载目录失败：' + (err.response?.data?.message || err.message))
  } finally {
    loading.value = false
  }
}

/** 刷新当前目录 */
function refreshList() {
  loadDirectory(currentPath.value)
}

/** 按路径输入框跳转目录 */
function jumpToInputPath() {
  loadDirectory(pathInput.value)
}

/** 规范化用户输入的远程路径 */
function normalizeInputPath(path: string) {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  return trimmed.startsWith('/') ? trimmed : '/' + trimmed
}

/** 双击行进入目录或上级 */
function handleRowDblClick(row: SftpFileItem) {
  if (row.isDirectory) {
    if (row.name === '..') {
      // 返回上级目录
      const parts = currentPath.value.split('/').filter(Boolean)
      parts.pop()
      const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/')
      loadDirectory(parentPath)
    } else {
      loadDirectory(row.path)
    }
  }
}

/** 下载文件 */
async function handleDownload(row: SftpFileItem) {
  try {
    await sftpDownload(props.serverId, row.path)
    ElMessage.success('下载已开始')
  } catch (err: any) {
    ElMessage.error('下载失败：' + (err.response?.data?.message || err.message))
  }
}

/** 删除文件或目录 */
async function handleDelete(row: SftpFileItem) {
  const isDir = row.isDirectory
  const typeText = isDir ? '目录' : '文件'
  try {
    await ElMessageBox.confirm(
      `确定要删除${typeText} "${row.name}" 吗？${isDir ? '目录必须为空才能删除。' : ''}`,
      '确认删除',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch {
    return
  }
  try {
    await sftpDelete(props.serverId, row.path, false)
    ElMessage.success(`${typeText}已删除`)
    refreshList()
  } catch (err: any) {
    ElMessage.error('删除失败：' + (err.response?.data?.message || err.message))
  }
}

/** 触发文件选择 */
function triggerFileInput() {
  fileInputRef.value?.click()
}

/** 文件选择后上传 */
function handleFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    uploadFile(input.files[0])
    input.value = ''
  }
}

/** 拖拽上传 */
function handleDrop(event: DragEvent) {
  isDragOver.value = false
  const files = event.dataTransfer?.files
  if (files && files.length > 0) {
    uploadFile(files[0])
  }
}

/** 上传单个文件 */
async function uploadFile(file: File) {
  const remotePath = currentPath.value === '/'
    ? '/' + file.name
    : currentPath.value + '/' + file.name

  const queueItem: UploadQueueItem = {
    id: ++uploadIdCounter,
    fileName: file.name,
    percent: 0,
    status: 'uploading'
  }
  uploadQueue.value.push(queueItem)

  try {
    await sftpUpload(props.serverId, remotePath, file, (percent) => {
      queueItem.percent = percent
    })
    queueItem.status = 'done'
    queueItem.percent = 100
    refreshList()
  } catch (err: any) {
    queueItem.status = 'error'
    ElMessage.error('上传失败：' + (err.response?.data?.message || err.message))
  } finally {
    // 5秒后从列表中移除
    setTimeout(() => {
      const idx = uploadQueue.value.findIndex(i => i.id === queueItem.id)
      if (idx >= 0) uploadQueue.value.splice(idx, 1)
    }, 5000)
  }
}

/** 显示创建目录对话框 */
function showMkdirDialog() {
  newDirName.value = ''
  mkdirDialogVisible.value = true
}

/** 创建目录 */
async function handleMkdir() {
  const name = newDirName.value.trim()
  if (!name) {
    ElMessage.warning('请输入目录名称')
    return
  }
  const dirPath = currentPath.value === '/'
    ? '/' + name
    : currentPath.value + '/' + name

  mkdirLoading.value = true
  try {
    await sftpMkdir(props.serverId, dirPath)
    ElMessage.success('目录已创建')
    mkdirDialogVisible.value = false
    refreshList()
  } catch (err: any) {
    ElMessage.error('创建目录失败：' + (err.response?.data?.message || err.message))
  } finally {
    mkdirLoading.value = false
  }
}

/** 格式化文件大小 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const size = bytes / Math.pow(k, i)
  return size.toFixed(i === 0 ? 0 : 1) + ' ' + units[i]
}

onMounted(() => {
  loadDirectory('/')
})
</script>

<style scoped>
.server-sftp-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.sftp-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding-right: 10px;
  overflow: visible;
}

.sftp-path-bar {
  flex: 1 1 420px;
  min-width: 260px;
}

.sftp-path-input {
  width: 100%;
}

.sftp-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  overflow: visible;
  padding-right: 4px;
}

.sftp-toolbar-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.sftp-toolbar :deep(.el-button),
.sftp-toolbar :deep(.el-button:hover) {
  transform: none;
}

.sftp-file-table-shell {
  flex: 1 1 auto;
  min-height: 240px;
}

.sftp-file-table {
  width: 100%;
  height: 100%;
}

.sftp-file-name {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: default;
}

.sftp-file-name.directory {
  color: var(--el-color-primary);
  cursor: pointer;
}

.sftp-file-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.sftp-link-target {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sftp-permissions {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.sftp-row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 0;
}

.sftp-drop-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border: 2px dashed var(--el-border-color);
  border-radius: 8px;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
  transition: border-color 0.2s, background-color 0.2s;
}

.sftp-drop-zone.drag-over {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.sftp-drop-icon {
  font-size: 20px;
}

.sftp-upload-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}

.sftp-upload-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sftp-upload-name {
  font-size: 13px;
  color: var(--el-text-color-regular);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.sftp-upload-check {
  color: var(--el-color-success);
  font-size: 16px;
  flex-shrink: 0;
}

.sftp-upload-error {
  color: var(--el-color-danger);
  font-size: 16px;
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .sftp-toolbar {
    align-items: stretch;
    padding-right: 0;
  }

  .sftp-path-bar {
    flex: 1 1 100%;
  }

  .sftp-toolbar-actions {
    justify-content: flex-start;
  }
  .server-sftp-panel {
    height: auto;
  }
  .sftp-file-table-shell {
    height: min(62vh, 520px);
    flex: 0 0 auto;
  }
}

@media (max-width: 560px) {
  .sftp-toolbar-actions :deep(.el-button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
