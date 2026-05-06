<template>
  <div class="apifox-page" v-loading="pageLoading">
    <section class="apifox-shell">
      <aside class="apifox-rail">
        <button type="button" class="apifox-rail-item active">
          <el-icon><Connection /></el-icon>
          <span>接口管理</span>
        </button>
        <button type="button" class="apifox-rail-item">
          <el-icon><Finished /></el-icon>
          <span>自动化测试</span>
        </button>
        <button type="button" class="apifox-rail-item">
          <el-icon><Document /></el-icon>
          <span>分享文档</span>
        </button>
        <button type="button" class="apifox-rail-item">
          <el-icon><Clock /></el-icon>
          <span>请求历史</span>
        </button>
        <button type="button" class="apifox-rail-item">
          <el-icon><Setting /></el-icon>
          <span>项目设置</span>
        </button>
      </aside>

      <section class="apifox-sidebar">
        <header class="apifox-sidebar-head">
          <div>
            <h1>接口管理</h1>
            <p>{{ currentScopeLabel }}</p>
          </div>
          <el-select v-model="scopeSelectorValue" class="apifox-scope-select" placeholder="选择 API 空间" @change="handleScopeChange">
            <el-option label="未关联项目" value="UNBOUND" />
            <el-option v-for="project in projectOptions" :key="project.id" :label="project.name" :value="project.id" />
          </el-select>
        </header>

        <div class="apifox-search-row">
          <div class="apifox-search-shell">
            <el-icon><Search /></el-icon>
            <input v-model="treeKeyword" type="text" class="apifox-search-input" placeholder="搜索目录、接口名或路径" />
          </div>
          <button type="button" class="apifox-plus-button" @click="openCreateEndpointDialog">+</button>
        </div>

        <div class="apifox-toolbar-row">
          <button type="button" class="apifox-toolbar-button" @click="openFolderDialog">新建目录</button>
          <button type="button" class="apifox-toolbar-button" @click="openImportDialog">导入</button>
          <button type="button" class="apifox-toolbar-button" @click="handleExport('json')">JSON</button>
          <button type="button" class="apifox-toolbar-button" @click="handleExport('yaml')">YAML</button>
        </div>

        <div class="apifox-tree-panel">
          <div class="apifox-tree-head">
            <strong>默认模块</strong>
            <span>{{ treeNodes.length }} 节点</span>
          </div>
          <el-tree
            ref="treeRef"
            class="apifox-tree"
            node-key="id"
            :data="treeNodes"
            :props="{ label: 'label', children: 'children' }"
            :filter-node-method="filterTreeNode"
            default-expand-all
            highlight-current
            @node-click="handleTreeNodeClick"
          >
            <template #default="{ data }">
              <div class="apifox-tree-row" :class="data.type">
                <template v-if="data.type === 'folder'">
                  <span class="apifox-folder-label">{{ data.label }}</span>
                </template>
                <template v-else>
                  <span class="apifox-method-pill" :class="data.method?.toLowerCase()">{{ data.method }}</span>
                  <span class="apifox-endpoint-copy">
                    <strong>{{ data.name }}</strong>
                    <small>{{ data.path }}</small>
                  </span>
                </template>
              </div>
            </template>
          </el-tree>
        </div>
      </section>

      <main class="apifox-main">
        <section class="apifox-header-card">
          <div class="apifox-header-copy">
            <div class="apifox-kicker">API Studio</div>
            <h2>{{ profileForm.title || `${currentScopeLabel} API 文档` }}</h2>
            <p>独立菜单维护接口文档、编辑、调试、环境与调试记录，支持关联项目与未关联项目两种空间。</p>
          </div>
          <div class="apifox-header-form">
            <div class="apifox-compact-grid">
              <el-input v-model="profileForm.title" maxlength="200" placeholder="API 文档标题" />
              <el-input v-model="profileForm.version" maxlength="60" placeholder="版本号" />
            </div>
            <el-input v-model="profileForm.description" type="textarea" :rows="2" placeholder="补充说明、适用范围或团队约定" />
            <div class="apifox-inline-actions">
              <el-button type="primary" :loading="profileSaving" @click="handleSaveProfile">保存文档</el-button>
              <el-button @click="openEnvironmentDrawer">环境管理</el-button>
            </div>
          </div>
        </section>

        <section class="apifox-tab-strip">
          <button type="button" class="apifox-tab-chip">列表</button>
          <button v-if="endpointDetail" type="button" class="apifox-tab-chip active">
            <span class="apifox-tab-method">{{ endpointDetail.method }}</span>
            <span>{{ endpointDetail.name }}</span>
          </button>
          <button type="button" class="apifox-tab-chip ghost">+</button>
        </section>

        <section v-if="endpointDetail" class="apifox-workbench">
          <header class="apifox-workbench-head">
            <div class="apifox-mode-tabs">
              <button type="button" class="apifox-mode-tab" :class="{ active: activeTab === 'doc' }" @click="activeTab = 'doc'">文档</button>
              <button type="button" class="apifox-mode-tab" :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">编辑</button>
              <button type="button" class="apifox-mode-tab" :class="{ active: activeTab === 'debug' }" @click="activeTab = 'debug'">调试</button>
            </div>
            <div class="apifox-head-actions">
              <span class="apifox-scope-caption">{{ currentScopeLabel }}</span>
              <el-button type="danger" plain @click="handleDeleteEndpoint">删除接口</el-button>
            </div>
          </header>

          <section class="apifox-request-bar">
            <span class="apifox-method-pill" :class="(activeTab === 'debug' ? debugForm.method : endpointDetail.method).toLowerCase()">
              {{ activeTab === 'debug' ? debugForm.method : endpointDetail.method }}
            </span>
            <el-input
              v-if="activeTab === 'debug'"
              v-model="debugForm.path"
              class="apifox-url-input"
              placeholder="/users/{id}"
            />
            <el-input
              v-else
              :model-value="endpointDetail.path"
              class="apifox-url-input"
              readonly
            />
            <el-select
              v-if="activeTab === 'debug'"
              v-model="debugForm.environmentId"
              clearable
              class="apifox-env-select"
              placeholder="选择环境"
            >
              <el-option v-for="environment in environments" :key="environment.id" :label="environment.name" :value="environment.id" />
            </el-select>
            <div class="apifox-request-actions">
              <el-button v-if="activeTab === 'debug'" type="primary" :loading="debugRunning" @click="handleExecuteDebug">发送</el-button>
              <el-button v-else-if="activeTab === 'edit'" type="primary" :loading="endpointSaving" @click="handleSaveEndpoint">保存</el-button>
              <el-button @click="openEnvironmentDrawer">环境</el-button>
            </div>
          </section>

          <div v-if="activeTab === 'doc'" class="apifox-doc-grid">
            <section class="apifox-panel">
              <div class="apifox-panel-head">
                <span>接口说明</span>
                <small>{{ endpointDetail.updatedAt || '未保存' }}</small>
              </div>
              <MdPreview
                :editor-id="`apifox-preview-${endpointDetail.id}`"
                language="zh-CN"
                preview-theme="github"
                :model-value="endpointDetail.descriptionMarkdown || '暂无说明'"
              />
            </section>

            <section class="apifox-panel">
              <div class="apifox-panel-head">
                <span>请求信息</span>
                <small>{{ endpointDetail.requestContentType }}</small>
              </div>
              <div class="apifox-meta-grid">
                <div><strong>名称：</strong>{{ endpointDetail.name }}</div>
                <div><strong>摘要：</strong>{{ endpointDetail.summary || '-' }}</div>
                <div><strong>路径：</strong>{{ endpointDetail.path }}</div>
              </div>
              <ParameterTable v-if="endpointDetail.pathParams.length" title="Path 参数" :items="endpointDetail.pathParams" />
              <ParameterTable v-if="endpointDetail.queryParams.length" title="Query 参数" :items="endpointDetail.queryParams" />
              <ParameterTable v-if="endpointDetail.headerParams.length" title="Header 参数" :items="endpointDetail.headerParams" />
              <div class="apifox-section" v-if="endpointDetail.requestContentType !== 'none'">
                <h4>请求体示例</h4>
                <pre class="apifox-code-block">{{ endpointDetail.bodyExampleText || '暂无请求体示例' }}</pre>
              </div>
            </section>

            <section class="apifox-panel apifox-panel-span-2">
              <div class="apifox-panel-head">
                <span>响应示例</span>
                <small>{{ endpointDetail.responseExamples.length }} 条</small>
              </div>
              <div v-if="endpointDetail.responseExamples.length" class="apifox-response-list">
                <article v-for="(example, index) in endpointDetail.responseExamples" :key="`response-${index}`" class="apifox-response-card">
                  <div class="apifox-response-top">
                    <strong>{{ example.name || `响应 ${index + 1}` }}</strong>
                    <span>{{ example.statusCode }} · {{ example.contentType || '未设置类型' }}</span>
                  </div>
                  <p>{{ example.description || '暂无说明' }}</p>
                  <div v-if="example.headers.length" class="apifox-section">
                    <h4>响应头</h4>
                    <table class="apifox-plain-table">
                      <thead>
                        <tr>
                          <th>名称</th>
                          <th>示例值</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="header in example.headers" :key="`${example.name}-${header.name}`">
                          <td>{{ header.name }}</td>
                          <td>{{ header.value || '-' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <pre class="apifox-code-block">{{ example.bodyExample || '暂无响应体示例' }}</pre>
                </article>
              </div>
              <el-empty v-else description="还没有配置响应示例" />
            </section>
          </div>

          <div v-else-if="activeTab === 'edit'" class="apifox-edit-grid">
            <section class="apifox-panel">
              <div class="apifox-panel-head">
                <span>基础信息</span>
                <small>{{ currentScopeLabel }}</small>
              </div>
              <el-form label-position="top">
                <el-form-item label="所属目录">
                  <el-select v-model="endpointForm.folderId" clearable placeholder="根层级">
                    <el-option v-for="folder in flatFolderOptions" :key="folder.id" :label="folder.label" :value="folder.id" />
                  </el-select>
                </el-form-item>
                <div class="apifox-compact-grid">
                  <el-form-item label="接口名称">
                    <el-input v-model="endpointForm.name" maxlength="160" />
                  </el-form-item>
                  <el-form-item label="HTTP 方法">
                    <el-select v-model="endpointForm.method">
                      <el-option v-for="method in httpMethods" :key="method" :label="method" :value="method" />
                    </el-select>
                  </el-form-item>
                </div>
                <el-form-item label="接口路径">
                  <el-input v-model="endpointForm.path" maxlength="500" placeholder="/users/{id}" />
                </el-form-item>
                <el-form-item label="接口摘要">
                  <el-input v-model="endpointForm.summary" maxlength="200" placeholder="一句话说明接口用途" />
                </el-form-item>
                <div class="apifox-compact-grid">
                  <el-form-item label="请求体类型">
                    <el-select v-model="endpointForm.requestContentType">
                      <el-option v-for="item in requestContentTypes" :key="item" :label="item" :value="item" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="默认调试环境">
                    <el-select v-model="endpointForm.debugConfig.defaultEnvironmentId" clearable placeholder="不指定">
                      <el-option v-for="environment in environments" :key="environment.id" :label="environment.name" :value="environment.id" />
                    </el-select>
                  </el-form-item>
                </div>
                <el-form-item label="接口说明">
                  <MarkdownEditor v-model="endpointForm.descriptionMarkdown" :preview="false" height="280px" />
                </el-form-item>
              </el-form>
            </section>

            <section class="apifox-panel">
              <div class="apifox-panel-head">
                <span>参数与示例</span>
                <small>参数表 + 示例文本</small>
              </div>
              <EditableParameterSection title="Path 参数" :items="endpointForm.pathParams" @add="endpointForm.pathParams.push(createParameterRow())" @remove="removeParameterRow(endpointForm.pathParams, $event)" />
              <EditableParameterSection title="Query 参数" :items="endpointForm.queryParams" @add="endpointForm.queryParams.push(createParameterRow())" @remove="removeParameterRow(endpointForm.queryParams, $event)" />
              <EditableParameterSection title="Header 参数" :items="endpointForm.headerParams" @add="endpointForm.headerParams.push(createParameterRow())" @remove="removeParameterRow(endpointForm.headerParams, $event)" />

              <div class="apifox-section" v-if="endpointForm.requestContentType !== 'none'">
                <div class="apifox-section-head">
                  <h3>请求体示例</h3>
                  <button type="button" class="apifox-mini-button" @click="formatBodyExample">格式化 JSON</button>
                </div>
                <el-input v-model="endpointForm.bodyExampleText" type="textarea" :rows="8" placeholder="JSON 或文本示例，表单类型建议使用 JSON 对象表示" />
              </div>

              <div class="apifox-section">
                <div class="apifox-section-head">
                  <h3>响应示例</h3>
                  <button type="button" class="apifox-mini-button" @click="endpointForm.responseExamples.push(createResponseExampleRow())">添加</button>
                </div>
                <div v-if="endpointForm.responseExamples.length" class="apifox-response-editor-list">
                  <article v-for="(example, index) in endpointForm.responseExamples" :key="`response-editor-${index}`" class="apifox-response-editor-card">
                    <div class="apifox-response-editor-grid">
                      <el-input v-model="example.name" placeholder="响应名称" />
                      <el-input v-model.number="example.statusCode" type="number" placeholder="状态码" />
                      <el-input v-model="example.contentType" placeholder="内容类型" />
                    </div>
                    <el-input v-model="example.description" placeholder="响应说明" />
                    <div class="apifox-section-head compact">
                      <h4>响应头</h4>
                      <button type="button" class="apifox-mini-button" @click="example.headers.push(createKeyValueRow())">添加响应头</button>
                    </div>
                    <div v-if="example.headers.length" class="apifox-form-list">
                      <div v-for="(header, headerIndex) in example.headers" :key="`header-editor-${index}-${headerIndex}`" class="apifox-form-row">
                        <el-input v-model="header.name" placeholder="Header 名称" />
                        <el-input v-model="header.value" placeholder="示例值" />
                        <button type="button" class="apifox-mini-button danger" @click="example.headers.splice(headerIndex, 1)">删除</button>
                      </div>
                    </div>
                    <el-input v-model="example.bodyExample" type="textarea" :rows="6" placeholder="响应体示例" />
                    <div class="apifox-response-editor-actions">
                      <button type="button" class="apifox-mini-button danger" @click="endpointForm.responseExamples.splice(index, 1)">删除响应示例</button>
                    </div>
                  </article>
                </div>
                <el-empty v-else description="暂无响应示例" />
              </div>
            </section>
          </div>

          <div v-else class="apifox-debug-stack">
            <section class="apifox-panel apifox-debug-request-card">
              <div class="apifox-panel-head">
                <span>调试请求</span>
                <small>{{ currentScopeLabel }}</small>
              </div>
              <div class="apifox-subtabs">
                <button type="button" class="apifox-subtab">Params</button>
                <button type="button" class="apifox-subtab active">Body</button>
                <button type="button" class="apifox-subtab">Headers</button>
                <button type="button" class="apifox-subtab">Cookies</button>
                <button type="button" class="apifox-subtab">Auth</button>
                <button type="button" class="apifox-subtab">设置</button>
              </div>

              <div class="apifox-content-types">
                <button
                  v-for="item in requestContentTypes"
                  :key="item"
                  type="button"
                  class="apifox-content-chip"
                  :class="{ active: debugForm.requestContentType === item }"
                  @click="debugForm.requestContentType = item"
                >
                  {{ item }}
                </button>
              </div>

              <div class="apifox-debug-grid">
                <div class="apifox-debug-side">
                  <div class="apifox-debug-side-block">
                    <div class="apifox-section-head compact"><h3>Path 参数</h3></div>
                    <EditableKeyValueSection title="Path 参数" :items="debugForm.pathParams" :addable="false" @remove="removeKeyValueRow(debugForm.pathParams, $event)" />
                  </div>
                  <div class="apifox-debug-side-block">
                    <div class="apifox-section-head compact"><h3>Query 参数</h3></div>
                    <EditableKeyValueSection title="Query 参数" :items="debugForm.queryParams" @add="debugForm.queryParams.push(createKeyValueRow())" @remove="removeKeyValueRow(debugForm.queryParams, $event)" />
                  </div>
                  <div class="apifox-debug-side-block">
                    <div class="apifox-section-head compact"><h3>Header 参数</h3></div>
                    <EditableKeyValueSection title="Header 参数" :items="debugForm.headerParams" @add="debugForm.headerParams.push(createKeyValueRow())" @remove="removeKeyValueRow(debugForm.headerParams, $event)" />
                  </div>
                </div>

                <div class="apifox-debug-editor-shell">
                  <div class="apifox-section-head">
                    <h3>请求体</h3>
                    <button type="button" class="apifox-mini-button" @click="formatDebugBody">格式化 JSON</button>
                  </div>
                  <el-input v-model="debugForm.bodyText" type="textarea" :rows="18" class="apifox-body-editor" placeholder="调试请求体，支持覆盖接口默认示例" />
                </div>
              </div>
            </section>

            <section class="apifox-panel apifox-response-shell">
              <div class="apifox-panel-head">
                <span>返回响应</span>
                <div class="apifox-inline-actions">
                  <span class="apifox-response-badge" :class="latestDebugRecord?.success ? 'success' : 'idle'">
                    {{ latestDebugRecord?.responseSnapshot.statusCode ?? '未执行' }}
                  </span>
                  <el-button @click="loadDebugRecords">刷新历史</el-button>
                </div>
              </div>
              <div v-if="latestDebugRecord" class="apifox-debug-result">
                <div class="apifox-debug-meta">
                  <div><strong>请求 URL：</strong>{{ latestDebugRecord.requestSnapshot.url }}</div>
                  <div><strong>状态：</strong>{{ latestDebugRecord.success ? '成功' : '失败' }} · {{ latestDebugRecord.durationMillis }} ms</div>
                  <div><strong>响应类型：</strong>{{ latestDebugRecord.responseSnapshot.contentType || '-' }}</div>
                </div>
                <div class="apifox-debug-snapshot">
                  <h4>响应体快照</h4>
                  <pre class="apifox-code-block">{{ latestDebugRecord.responseSnapshot.binary ? latestDebugRecord.responseSnapshot.bodyPreview : (latestDebugRecord.responseSnapshot.body || '无响应体') }}</pre>
                </div>
              </div>
              <el-empty v-else description="还没有调试结果" />

              <div class="apifox-history">
                <div class="apifox-section-head compact">
                  <h3>最近 20 条记录</h3>
                </div>
                <div v-if="debugRecords.length" class="apifox-history-list">
                  <button
                    v-for="record in debugRecords"
                    :key="record.id"
                    type="button"
                    class="apifox-history-card"
                    @click="latestDebugRecord = record"
                  >
                    <div class="apifox-history-top">
                      <strong>{{ record.createdAt }}</strong>
                      <span :class="record.success ? 'success' : 'danger'">{{ record.success ? '成功' : '失败' }}</span>
                    </div>
                    <div class="apifox-history-meta">{{ record.requestSnapshot.method }} {{ record.requestSnapshot.url }}</div>
                    <div class="apifox-history-meta">{{ record.responseSnapshot.statusCode ?? '-' }} · {{ record.durationMillis }} ms · {{ record.createdByName || '未知用户' }}</div>
                  </button>
                </div>
                <el-empty v-else description="暂无调试记录" />
              </div>
            </section>
          </div>
        </section>

        <section v-else class="apifox-empty-state">
          <el-empty description="从左侧集合树选择一个接口，或先创建目录与接口" />
          <div class="apifox-inline-actions">
            <el-button type="primary" @click="openCreateEndpointDialog">创建接口</el-button>
            <el-button @click="openImportDialog">导入 OpenAPI</el-button>
          </div>
        </section>
      </main>
    </section>

    <el-dialog v-model="folderDialogVisible" title="API 目录" width="520px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="父目录">
          <el-select v-model="folderForm.parentFolderId" clearable placeholder="根层级">
            <el-option v-for="folder in flatFolderOptions" :key="folder.id" :label="folder.label" :value="folder.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目录名称">
          <el-input v-model="folderForm.name" maxlength="120" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="folderSaving" @click="handleSaveFolder">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="endpointDialogVisible" title="创建接口" width="640px" destroy-on-close>
      <el-form label-position="top">
        <el-form-item label="所属目录">
          <el-select v-model="endpointCreateForm.folderId" clearable placeholder="根层级">
            <el-option v-for="folder in flatFolderOptions" :key="folder.id" :label="folder.label" :value="folder.id" />
          </el-select>
        </el-form-item>
        <div class="apifox-compact-grid">
          <el-form-item label="接口名称">
            <el-input v-model="endpointCreateForm.name" maxlength="160" />
          </el-form-item>
          <el-form-item label="HTTP 方法">
            <el-select v-model="endpointCreateForm.method">
              <el-option v-for="method in httpMethods" :key="method" :label="method" :value="method" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="接口路径">
          <el-input v-model="endpointCreateForm.path" placeholder="/orders/{id}" maxlength="500" />
        </el-form-item>
        <el-form-item label="接口摘要">
          <el-input v-model="endpointCreateForm.summary" maxlength="200" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="endpointDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="endpointCreating" @click="handleCreateEndpoint">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入 OpenAPI" width="720px" destroy-on-close>
      <div class="apifox-import-panel">
        <input type="file" accept=".json,.yaml,.yml" @change="handleImportFileChange" />
        <div class="apifox-compact-grid">
          <el-input v-model="importForm.fileName" placeholder="文件名" />
          <el-select v-model="importForm.format">
            <el-option label="JSON" value="json" />
            <el-option label="YAML" value="yaml" />
          </el-select>
        </div>
        <el-input v-model="importForm.content" type="textarea" :rows="16" placeholder="可直接粘贴 OpenAPI 内容，或先选择本地文件" />
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="handleImportOpenApi">开始导入</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="environmentDrawerVisible" title="API 环境管理" size="760px">
      <div class="apifox-environment-shell">
        <aside class="apifox-environment-list">
          <button type="button" class="apifox-toolbar-button primary" @click="handleCreateEnvironmentDraft">新建环境</button>
          <div class="apifox-tree-head">
            <strong>{{ currentScopeLabel }}</strong>
            <span>{{ environments.length }} 条环境</span>
          </div>
          <div v-if="environments.length" class="apifox-environment-items">
            <button
              v-for="environment in environments"
              :key="environment.id"
              type="button"
              class="apifox-environment-item"
              :class="{ active: activeEnvironmentId === environment.id }"
              @click="selectEnvironment(environment.id)"
            >
              <strong>{{ environment.name }}</strong>
              <span>{{ environment.baseUrl }}</span>
              <small>{{ environment.isDefault ? '默认环境' : environment.authType }}</small>
            </button>
          </div>
          <el-empty v-else description="暂无环境配置" />
        </aside>

        <section class="apifox-panel apifox-environment-editor">
          <div class="apifox-panel-head">
            <span>环境配置</span>
            <small>{{ currentScopeLabel }}</small>
          </div>
          <el-form label-position="top">
            <el-form-item label="环境名称">
              <el-input v-model="environmentForm.name" maxlength="120" />
            </el-form-item>
            <el-form-item label="基础地址">
              <el-input v-model="environmentForm.baseUrl" placeholder="https://api.example.com" maxlength="500" />
            </el-form-item>
            <div class="apifox-compact-grid">
              <el-form-item label="鉴权方式">
                <el-select v-model="environmentForm.authType">
                  <el-option label="NONE" value="NONE" />
                  <el-option label="BEARER" value="BEARER" />
                  <el-option label="BASIC" value="BASIC" />
                  <el-option label="API_KEY" value="API_KEY" />
                </el-select>
              </el-form-item>
              <el-form-item label="默认环境">
                <el-switch v-model="environmentForm.isDefault" />
              </el-form-item>
            </div>

            <div v-if="environmentForm.authType === 'BEARER'" class="apifox-auth-block">
              <el-form-item label="Bearer Token">
                <el-input v-model="environmentForm.authConfig.token" type="textarea" :rows="3" />
              </el-form-item>
            </div>
            <div v-else-if="environmentForm.authType === 'BASIC'" class="apifox-auth-block">
              <div class="apifox-compact-grid">
                <el-form-item label="用户名">
                  <el-input v-model="environmentForm.authConfig.username" />
                </el-form-item>
                <el-form-item label="密码">
                  <el-input v-model="environmentForm.authConfig.password" show-password />
                </el-form-item>
              </div>
            </div>
            <div v-else-if="environmentForm.authType === 'API_KEY'" class="apifox-auth-block">
              <div class="apifox-compact-grid">
                <el-form-item label="Key 名称">
                  <el-input v-model="environmentForm.authConfig.apiKeyName" />
                </el-form-item>
                <el-form-item label="放置位置">
                  <el-select v-model="environmentForm.authConfig.apiKeyLocation">
                    <el-option label="HEADER" value="HEADER" />
                    <el-option label="QUERY" value="QUERY" />
                  </el-select>
                </el-form-item>
              </div>
              <el-form-item label="Key 值">
                <el-input v-model="environmentForm.authConfig.apiKeyValue" type="textarea" :rows="3" />
              </el-form-item>
            </div>

            <div class="apifox-section">
              <div class="apifox-section-head">
                <h3>环境变量</h3>
                <button type="button" class="apifox-mini-button" @click="environmentVariablesRows.push(createVariableRow())">添加变量</button>
              </div>
              <div v-if="environmentVariablesRows.length" class="apifox-form-list">
                <div v-for="(item, index) in environmentVariablesRows" :key="`environment-var-${index}`" class="apifox-form-row">
                  <el-input v-model="item.name" placeholder="变量名" />
                  <el-input v-model="item.value" placeholder="变量值" />
                  <button type="button" class="apifox-mini-button danger" @click="environmentVariablesRows.splice(index, 1)">删除</button>
                </div>
              </div>
              <el-empty v-else description="暂无环境变量" />
            </div>

            <div class="apifox-inline-actions">
              <el-button type="primary" :loading="environmentSaving" @click="handleSaveEnvironment">保存环境</el-button>
              <el-button v-if="activeEnvironmentId" type="danger" @click="handleDeleteEnvironment">删除环境</el-button>
            </div>
          </el-form>
        </section>
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElEmpty, ElInput, ElMessage, ElMessageBox, ElSwitch } from 'element-plus'
import { Clock, Connection, Document, Finished, Search, Setting } from '@element-plus/icons-vue'
import { MdPreview } from 'md-editor-v3'
import MarkdownEditor from '@/components/MarkdownEditor.vue'
import {
  createProjectApiEndpoint,
  createProjectApiEnvironment,
  createProjectApiFolder,
  deleteProjectApiEndpoint,
  deleteProjectApiEnvironment,
  executeProjectApiDebug,
  exportProjectApiOpenApi,
  getProjectApiEndpoint,
  getProjectApiProfile,
  getProjectApiTree,
  importProjectApiOpenApi,
  listProjectApiDebugRecords,
  listProjectApiEnvironments,
  updateProjectApiEndpoint,
  updateProjectApiEnvironment,
  updateProjectApiProfile
} from '@/api/project-api'
import { listProjectOptions } from '@/api/platform'
import type { ProjectItem } from '@/types/platform'
import type {
  ProjectApiDebugRecordItem,
  ProjectApiEndpointDetailItem,
  ProjectApiEnvironmentAuthConfigItem,
  ProjectApiEnvironmentItem,
  ProjectApiFolderTreeNodeItem,
  ProjectApiKeyValueItem,
  ProjectApiParameterItem,
  ProjectApiResponseExampleItem
} from '@/types/project-api'

const ParameterTable = defineComponent({
  name: 'ParameterTable',
  props: {
    title: { type: String, required: true },
    items: { type: Array as () => ProjectApiParameterItem[], required: true }
  },
  setup(props) {
    return () => h('div', { class: 'apifox-section' }, [
      h('h4', props.title),
      h('table', { class: 'apifox-plain-table' }, [
        h('thead', [
          h('tr', [h('th', '名称'), h('th', '类型'), h('th', '必填'), h('th', '示例'), h('th', '说明')])
        ]),
        h('tbody', props.items.map((item) =>
          h('tr', { key: `${props.title}-${item.name}` }, [
            h('td', item.name),
            h('td', item.type),
            h('td', item.required ? '是' : '否'),
            h('td', item.example || '-'),
            h('td', item.description || '-')
          ])
        ))
      ])
    ])
  }
})

const EditableParameterSection = defineComponent({
  name: 'EditableParameterSection',
  props: {
    title: { type: String, required: true },
    items: { type: Array as () => ProjectApiParameterItem[], required: true }
  },
  emits: ['add', 'remove'],
  setup(props, { emit }) {
    return () => h('div', { class: 'apifox-section' }, [
      h('div', { class: 'apifox-section-head' }, [
        h('h3', props.title),
        h('button', { type: 'button', class: 'apifox-mini-button', onClick: () => emit('add') }, '添加')
      ]),
      props.items.length
        ? h('div', { class: 'apifox-form-list' }, props.items.map((item, index) =>
            h('div', { class: 'apifox-form-row', key: `${props.title}-${index}` }, [
              h(ElInput, { modelValue: item.name, 'onUpdate:modelValue': (value: string) => { item.name = value }, placeholder: '参数名' }),
              h(ElInput, { modelValue: item.type, 'onUpdate:modelValue': (value: string) => { item.type = value }, placeholder: '类型' }),
              h(ElInput, { modelValue: item.example, 'onUpdate:modelValue': (value: string) => { item.example = value }, placeholder: '示例值' }),
              h(ElInput, { modelValue: item.description, 'onUpdate:modelValue': (value: string) => { item.description = value }, placeholder: '说明' }),
              h(ElSwitch, { modelValue: item.required, 'onUpdate:modelValue': (value: string | number | boolean) => { item.required = Boolean(value) }, activeText: '必填' }),
              h('button', { type: 'button', class: 'apifox-mini-button danger', onClick: () => emit('remove', index) }, '删除')
            ])
          ))
        : h(ElEmpty, { description: `暂无${props.title}` })
    ])
  }
})

const EditableKeyValueSection = defineComponent({
  name: 'EditableKeyValueSection',
  props: {
    title: { type: String, required: true },
    items: { type: Array as () => ProjectApiKeyValueItem[], required: true },
    addable: { type: Boolean, default: true }
  },
  emits: ['add', 'remove'],
  setup(props, { emit }) {
    return () => h('div', { class: 'apifox-section' }, [
      props.addable
        ? h('div', { class: 'apifox-section-head compact' }, [
            h('h3', props.title),
            h('button', { type: 'button', class: 'apifox-mini-button', onClick: () => emit('add') }, '添加')
          ])
        : null,
      props.items.length
        ? h('div', { class: 'apifox-form-list' }, props.items.map((item, index) =>
            h('div', { class: 'apifox-form-row', key: `${props.title}-${index}` }, [
              h(ElInput, { modelValue: item.name, 'onUpdate:modelValue': (value: string) => { item.name = value }, placeholder: '名称' }),
              h(ElInput, { modelValue: item.value, 'onUpdate:modelValue': (value: string) => { item.value = value }, placeholder: '值' }),
              h(ElSwitch, { modelValue: item.enabled, 'onUpdate:modelValue': (value: string | number | boolean) => { item.enabled = Boolean(value) }, activeText: '启用' }),
              props.addable ? h('button', { type: 'button', class: 'apifox-mini-button danger', onClick: () => emit('remove', index) }, '删除') : null
            ])
          ))
        : h(ElEmpty, { description: `暂无${props.title}` })
    ])
  }
})

interface TreeNodeItem {
  id: string
  type: 'folder' | 'endpoint'
  label: string
  name: string
  path?: string
  method?: string
  rawId: number
  children: TreeNodeItem[]
}

const route = useRoute()
const router = useRouter()
const treeRef = ref()

const pageLoading = ref(false)
const profileSaving = ref(false)
const folderSaving = ref(false)
const endpointCreating = ref(false)
const endpointSaving = ref(false)
const importing = ref(false)
const environmentSaving = ref(false)
const debugRunning = ref(false)

const activeTab = ref<'doc' | 'edit' | 'debug'>('doc')
const treeKeyword = ref('')
const selectedFolderId = ref<number | null>(null)
const selectedEndpointId = ref<number | null>(null)
const latestDebugRecord = ref<ProjectApiDebugRecordItem | null>(null)

const projectOptions = ref<ProjectItem[]>([])
const scopeSelectorValue = ref<string | number>('UNBOUND')

const profileForm = reactive({
  title: '',
  description: '',
  version: '1.0.0'
})

const treeData = ref<{ folders: ProjectApiFolderTreeNodeItem[]; rootEndpoints: any[] }>({
  folders: [],
  rootEndpoints: []
})
const endpointDetail = ref<ProjectApiEndpointDetailItem | null>(null)
const environments = ref<ProjectApiEnvironmentItem[]>([])
const debugRecords = ref<ProjectApiDebugRecordItem[]>([])

const folderDialogVisible = ref(false)
const folderForm = reactive({
  parentFolderId: null as number | null,
  name: '',
  sortOrder: 0
})

const endpointDialogVisible = ref(false)
const endpointCreateForm = reactive({
  folderId: null as number | null,
  name: '',
  method: 'GET',
  path: '/',
  summary: ''
})

const importDialogVisible = ref(false)
const importForm = reactive({
  format: 'json',
  fileName: '',
  content: ''
})

const environmentDrawerVisible = ref(false)
const activeEnvironmentId = ref<number | null>(null)
const environmentForm = reactive({
  name: '',
  baseUrl: '',
  authType: 'NONE',
  authConfig: createEmptyEnvironmentAuthConfig(),
  isDefault: false
})
const environmentVariablesRows = ref<Array<{ name: string; value: string }>>([])

const endpointForm = reactive({
  folderId: null as number | null,
  name: '',
  method: 'GET',
  path: '/',
  summary: '',
  descriptionMarkdown: '',
  requestContentType: 'none',
  pathParams: [] as ProjectApiParameterItem[],
  queryParams: [] as ProjectApiParameterItem[],
  headerParams: [] as ProjectApiParameterItem[],
  bodyExampleText: '',
  responseExamples: [] as ProjectApiResponseExampleItem[],
  debugConfig: {
    defaultEnvironmentId: null as number | null
  }
})

const debugForm = reactive({
  environmentId: null as number | null,
  method: 'GET',
  path: '/',
  requestContentType: 'none',
  pathParams: [] as ProjectApiKeyValueItem[],
  queryParams: [] as ProjectApiKeyValueItem[],
  headerParams: [] as ProjectApiKeyValueItem[],
  bodyText: ''
})

const httpMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
const requestContentTypes = ['none', 'application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']

const currentProjectId = computed<number | null>(() => (scopeSelectorValue.value === 'UNBOUND' ? null : Number(scopeSelectorValue.value)))
const currentScopeLabel = computed(() => {
  if (currentProjectId.value == null) {
    return '未关联项目'
  }
  return projectOptions.value.find((item) => item.id === currentProjectId.value)?.name || '指定项目'
})

const treeNodes = computed<TreeNodeItem[]>(() => {
  const nodes: TreeNodeItem[] = []
  treeData.value.folders.forEach((folder) => nodes.push(mapFolderNode(folder)))
  treeData.value.rootEndpoints.forEach((endpoint) => nodes.push(mapEndpointNode(endpoint)))
  return nodes
})

const flatFolderOptions = computed(() => {
  const rows: Array<{ id: number; label: string }> = []
  const walk = (folders: ProjectApiFolderTreeNodeItem[], prefix: string) => {
    folders.forEach((folder) => {
      const label = prefix ? `${prefix} / ${folder.name}` : folder.name
      rows.push({ id: folder.id, label })
      walk(folder.children, label)
    })
  }
  walk(treeData.value.folders, '')
  return rows
})

watch(treeKeyword, (value) => {
  treeRef.value?.filter(value)
})

onMounted(async () => {
  await bootstrapPage()
})

async function bootstrapPage() {
  pageLoading.value = true
  try {
    await loadProjectOptions()
    restoreScopeFromRoute()
    await loadScopeData()
  } finally {
    pageLoading.value = false
  }
}

async function loadProjectOptions() {
  try {
    projectOptions.value = await listProjectOptions()
  } catch {
    projectOptions.value = []
  }
}

function restoreScopeFromRoute() {
  const queryProjectId = Number(route.query.projectId)
  if (!Number.isNaN(queryProjectId) && queryProjectId > 0 && projectOptions.value.some((item) => item.id === queryProjectId)) {
    scopeSelectorValue.value = queryProjectId
    return
  }
  scopeSelectorValue.value = 'UNBOUND'
}

async function handleScopeChange() {
  await router.replace({
    name: 'apis',
    query: currentProjectId.value == null ? undefined : { projectId: String(currentProjectId.value) }
  })
  await loadScopeData()
}

async function loadScopeData() {
  selectedFolderId.value = null
  selectedEndpointId.value = null
  endpointDetail.value = null
  debugRecords.value = []
  latestDebugRecord.value = null
  handleCreateEnvironmentDraft()
  await Promise.all([loadProfile(), loadTree(), loadEnvironments()])
  const firstEndpoint = findFirstEndpoint()
  if (firstEndpoint) {
    await selectEndpoint(firstEndpoint.id)
  }
}

async function loadProfile() {
  const profile = await getProjectApiProfile(currentProjectId.value)
  profileForm.title = profile.title
  profileForm.description = profile.description
  profileForm.version = profile.version
}

async function loadTree() {
  treeData.value = await getProjectApiTree(currentProjectId.value)
}

async function loadEnvironments() {
  environments.value = await listProjectApiEnvironments(currentProjectId.value)
  if (environments.value.length) {
    selectEnvironment(environments.value[0].id)
  }
}

async function loadDebugRecords() {
  if (!selectedEndpointId.value) {
    debugRecords.value = []
    latestDebugRecord.value = null
    return
  }
  debugRecords.value = await listProjectApiDebugRecords(currentProjectId.value, selectedEndpointId.value)
  latestDebugRecord.value = debugRecords.value[0] || null
}

function findFirstEndpoint() {
  const rootEndpoint = treeData.value.rootEndpoints[0]
  if (rootEndpoint) {
    return rootEndpoint
  }
  const walk = (folders: ProjectApiFolderTreeNodeItem[]): any | null => {
    for (const folder of folders) {
      if (folder.endpoints.length) {
        return folder.endpoints[0]
      }
      const child = walk(folder.children)
      if (child) {
        return child
      }
    }
    return null
  }
  return walk(treeData.value.folders)
}

async function selectEndpoint(endpointId: number) {
  selectedEndpointId.value = endpointId
  endpointDetail.value = await getProjectApiEndpoint(currentProjectId.value, endpointId)
  selectedFolderId.value = endpointDetail.value.folderId
  hydrateEndpointForms(endpointDetail.value)
  await loadDebugRecords()
}

function hydrateEndpointForms(detail: ProjectApiEndpointDetailItem) {
  endpointForm.folderId = detail.folderId
  endpointForm.name = detail.name
  endpointForm.method = detail.method
  endpointForm.path = detail.path
  endpointForm.summary = detail.summary
  endpointForm.descriptionMarkdown = detail.descriptionMarkdown
  endpointForm.requestContentType = detail.requestContentType
  endpointForm.pathParams = detail.pathParams.map((item) => ({ ...item }))
  endpointForm.queryParams = detail.queryParams.map((item) => ({ ...item }))
  endpointForm.headerParams = detail.headerParams.map((item) => ({ ...item }))
  endpointForm.bodyExampleText = detail.bodyExampleText
  endpointForm.responseExamples = detail.responseExamples.map((item) => ({ ...item, headers: item.headers.map((header) => ({ ...header })) }))
  endpointForm.debugConfig.defaultEnvironmentId = detail.debugConfig?.defaultEnvironmentId ?? null

  debugForm.environmentId = detail.debugConfig?.defaultEnvironmentId ?? findDefaultEnvironmentId()
  debugForm.method = detail.method
  debugForm.path = detail.path
  debugForm.requestContentType = detail.requestContentType
  debugForm.pathParams = detail.pathParams.map((item) => ({ name: item.name, value: item.example || '', enabled: true }))
  debugForm.queryParams = detail.queryParams.map((item) => ({ name: item.name, value: item.example || '', enabled: true }))
  debugForm.headerParams = detail.headerParams.map((item) => ({ name: item.name, value: item.example || '', enabled: true }))
  debugForm.bodyText = detail.bodyExampleText
}

async function handleSaveProfile() {
  profileSaving.value = true
  try {
    await updateProjectApiProfile(currentProjectId.value, { ...profileForm })
    ElMessage.success('文档信息已保存')
  } finally {
    profileSaving.value = false
  }
}

function openFolderDialog() {
  folderForm.parentFolderId = selectedFolderId.value
  folderForm.name = ''
  folderForm.sortOrder = 0
  folderDialogVisible.value = true
}

async function handleSaveFolder() {
  if (!folderForm.name.trim()) {
    ElMessage.warning('请输入目录名称')
    return
  }
  folderSaving.value = true
  try {
    await createProjectApiFolder(currentProjectId.value, { ...folderForm })
    folderDialogVisible.value = false
    await loadTree()
    ElMessage.success('目录已创建')
  } finally {
    folderSaving.value = false
  }
}

function openCreateEndpointDialog() {
  endpointCreateForm.folderId = selectedFolderId.value
  endpointCreateForm.name = ''
  endpointCreateForm.method = 'GET'
  endpointCreateForm.path = '/'
  endpointCreateForm.summary = ''
  endpointDialogVisible.value = true
}

async function handleCreateEndpoint() {
  if (!endpointCreateForm.name.trim() || !endpointCreateForm.path.trim()) {
    ElMessage.warning('请填写接口名称和路径')
    return
  }
  endpointCreating.value = true
  try {
    const detail = await createProjectApiEndpoint(currentProjectId.value, {
      folderId: endpointCreateForm.folderId,
      name: endpointCreateForm.name,
      method: endpointCreateForm.method,
      path: endpointCreateForm.path,
      summary: endpointCreateForm.summary,
      descriptionMarkdown: '',
      requestContentType: 'none',
      pathParams: [],
      queryParams: [],
      headerParams: [],
      bodyExampleText: '',
      responseExamples: [],
      debugConfig: { defaultEnvironmentId: null }
    })
    endpointDialogVisible.value = false
    await loadTree()
    await selectEndpoint(detail.id)
    ElMessage.success('接口已创建')
  } finally {
    endpointCreating.value = false
  }
}

async function handleSaveEndpoint() {
  if (!endpointDetail.value) {
    return
  }
  endpointSaving.value = true
  try {
    const detail = await updateProjectApiEndpoint(currentProjectId.value, endpointDetail.value.id, {
      folderId: endpointForm.folderId,
      name: endpointForm.name,
      method: endpointForm.method,
      path: endpointForm.path,
      summary: endpointForm.summary,
      descriptionMarkdown: endpointForm.descriptionMarkdown,
      requestContentType: endpointForm.requestContentType,
      pathParams: endpointForm.pathParams,
      queryParams: endpointForm.queryParams,
      headerParams: endpointForm.headerParams,
      bodyExampleText: endpointForm.bodyExampleText,
      responseExamples: endpointForm.responseExamples,
      debugConfig: endpointForm.debugConfig
    })
    endpointDetail.value = detail
    hydrateEndpointForms(detail)
    await loadTree()
    ElMessage.success('接口已保存')
  } finally {
    endpointSaving.value = false
  }
}

async function handleDeleteEndpoint() {
  if (!endpointDetail.value) {
    return
  }
  await ElMessageBox.confirm(`确认删除接口「${endpointDetail.value.name}」吗？`, '删除接口', { type: 'warning' })
  await deleteProjectApiEndpoint(currentProjectId.value, endpointDetail.value.id)
  ElMessage.success('接口已删除')
  await loadScopeData()
}

function openImportDialog() {
  importForm.format = 'json'
  importForm.fileName = ''
  importForm.content = ''
  importDialogVisible.value = true
}

async function handleImportFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) {
    return
  }
  importForm.fileName = file.name
  importForm.format = file.name.endsWith('.yaml') || file.name.endsWith('.yml') ? 'yaml' : 'json'
  importForm.content = await file.text()
}

async function handleImportOpenApi() {
  if (!importForm.content.trim()) {
    ElMessage.warning('请先选择文件或粘贴 OpenAPI 内容')
    return
  }
  importing.value = true
  try {
    const result = await importProjectApiOpenApi(currentProjectId.value, { ...importForm })
    importDialogVisible.value = false
    await loadScopeData()
    ElMessage.success(`导入完成：目录 ${result.folderCount}，接口 ${result.endpointCount}，环境 ${result.environmentCount}`)
  } finally {
    importing.value = false
  }
}

async function handleExport(format: string) {
  const document = await exportProjectApiOpenApi(currentProjectId.value, format)
  const blob = new Blob([document.content], {
    type: document.format === 'yaml' ? 'text/yaml;charset=utf-8' : 'application/json;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = document.fileName
  window.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${document.fileName}`)
}

function openEnvironmentDrawer() {
  environmentDrawerVisible.value = true
  if (!environments.value.length) {
    handleCreateEnvironmentDraft()
  }
}

function handleCreateEnvironmentDraft() {
  activeEnvironmentId.value = null
  environmentForm.name = ''
  environmentForm.baseUrl = ''
  environmentForm.authType = 'NONE'
  environmentForm.authConfig = createEmptyEnvironmentAuthConfig()
  environmentForm.isDefault = environments.value.length === 0
  environmentVariablesRows.value = []
}

function selectEnvironment(environmentId: number) {
  const environment = environments.value.find((item) => item.id === environmentId)
  if (!environment) {
    return
  }
  activeEnvironmentId.value = environment.id
  environmentForm.name = environment.name
  environmentForm.baseUrl = environment.baseUrl
  environmentForm.authType = environment.authType
  environmentForm.authConfig = { ...environment.authConfig }
  environmentForm.isDefault = environment.isDefault
  environmentVariablesRows.value = Object.entries(environment.variables || {}).map(([name, value]) => ({ name, value }))
}

async function handleSaveEnvironment() {
  if (!environmentForm.name.trim() || !environmentForm.baseUrl.trim()) {
    ElMessage.warning('请填写环境名称和基础地址')
    return
  }
  environmentSaving.value = true
  try {
    const payload = {
      name: environmentForm.name,
      baseUrl: environmentForm.baseUrl,
      authType: environmentForm.authType,
      authConfig: environmentForm.authConfig,
      isDefault: environmentForm.isDefault,
      variables: Object.fromEntries(environmentVariablesRows.value.filter((item) => item.name.trim()).map((item) => [item.name.trim(), item.value]))
    }
    const saved = activeEnvironmentId.value
      ? await updateProjectApiEnvironment(currentProjectId.value, activeEnvironmentId.value, payload)
      : await createProjectApiEnvironment(currentProjectId.value, payload)
    await loadEnvironments()
    selectEnvironment(saved.id)
    ElMessage.success('环境已保存')
  } finally {
    environmentSaving.value = false
  }
}

async function handleDeleteEnvironment() {
  if (!activeEnvironmentId.value) {
    return
  }
  await ElMessageBox.confirm('确认删除当前环境吗？', '删除环境', { type: 'warning' })
  await deleteProjectApiEnvironment(currentProjectId.value, activeEnvironmentId.value)
  await loadEnvironments()
  if (environments.value.length) {
    selectEnvironment(environments.value[0].id)
  } else {
    handleCreateEnvironmentDraft()
  }
  ElMessage.success('环境已删除')
}

async function handleExecuteDebug() {
  if (!selectedEndpointId.value) {
    ElMessage.warning('请先选择接口')
    return
  }
  debugRunning.value = true
  try {
    latestDebugRecord.value = await executeProjectApiDebug(currentProjectId.value, selectedEndpointId.value, {
      environmentId: debugForm.environmentId,
      method: debugForm.method,
      path: debugForm.path,
      requestContentType: debugForm.requestContentType,
      pathParams: debugForm.pathParams,
      queryParams: debugForm.queryParams,
      headerParams: debugForm.headerParams,
      bodyText: debugForm.bodyText
    })
    await loadDebugRecords()
    ElMessage.success('调试请求已完成')
  } finally {
    debugRunning.value = false
  }
}

function formatBodyExample() {
  endpointForm.bodyExampleText = tryFormatJson(endpointForm.bodyExampleText)
}

function formatDebugBody() {
  debugForm.bodyText = tryFormatJson(debugForm.bodyText)
}

function tryFormatJson(value: string) {
  if (!value.trim()) {
    return value
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2)
  } catch {
    ElMessage.warning('当前内容不是合法 JSON，无法格式化')
    return value
  }
}

function handleTreeNodeClick(node: TreeNodeItem) {
  if (node.type === 'folder') {
    selectedFolderId.value = node.rawId
    return
  }
  void selectEndpoint(node.rawId)
}

function filterTreeNode(value: string, data: TreeNodeItem) {
  if (!value.trim()) {
    return true
  }
  const keyword = value.trim().toLowerCase()
  return [data.label, data.name, data.path, data.method].some((item) => (item || '').toLowerCase().includes(keyword))
}

function mapFolderNode(folder: ProjectApiFolderTreeNodeItem): TreeNodeItem {
  return {
    id: `folder-${folder.id}`,
    type: 'folder',
    label: folder.name,
    name: folder.name,
    rawId: folder.id,
    children: [
      ...folder.children.map((child) => mapFolderNode(child)),
      ...folder.endpoints.map((endpoint) => mapEndpointNode(endpoint))
    ]
  }
}

function mapEndpointNode(endpoint: { id: number; name: string; method: string; path: string }): TreeNodeItem {
  return {
    id: `endpoint-${endpoint.id}`,
    type: 'endpoint',
    label: `${endpoint.method} ${endpoint.name}`,
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    rawId: endpoint.id,
    children: []
  }
}

function createParameterRow(): ProjectApiParameterItem {
  return { name: '', required: false, type: 'string', example: '', description: '' }
}

function createKeyValueRow(): ProjectApiKeyValueItem {
  return { name: '', value: '', enabled: true }
}

function createResponseExampleRow(): ProjectApiResponseExampleItem {
  return { name: '', statusCode: 200, contentType: 'application/json', headers: [], bodyExample: '', description: '' }
}

function createVariableRow() {
  return { name: '', value: '' }
}

function createEmptyEnvironmentAuthConfig(): ProjectApiEnvironmentAuthConfigItem {
  return {
    token: '',
    username: '',
    password: '',
    apiKeyName: '',
    apiKeyValue: '',
    apiKeyLocation: 'HEADER'
  }
}

function removeParameterRow(items: ProjectApiParameterItem[], index: number) {
  items.splice(index, 1)
}

function removeKeyValueRow(items: ProjectApiKeyValueItem[], index: number) {
  items.splice(index, 1)
}

function findDefaultEnvironmentId() {
  return environments.value.find((item) => item.isDefault)?.id ?? environments.value[0]?.id ?? null
}
</script>

<style scoped>
.apifox-page {
  min-height: calc(100vh - 120px);
  background:
    radial-gradient(circle at top right, rgba(255, 236, 219, 0.88), transparent 26%),
    linear-gradient(180deg, #f8f6ff 0%, #f4f5fb 34%, #f7f7fb 100%);
  border-radius: 28px;
  padding: 18px;
}

.apifox-shell {
  display: grid;
  grid-template-columns: 72px 420px minmax(0, 1fr);
  gap: 14px;
  min-height: calc(100vh - 156px);
}

.apifox-rail,
.apifox-sidebar,
.apifox-header-card,
.apifox-workbench,
.apifox-empty-state {
  border: 1px solid rgba(137, 122, 179, 0.12);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 18px 42px rgba(66, 48, 110, 0.08);
}

.apifox-rail {
  border-radius: 20px;
  padding: 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.apifox-rail-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 82px;
  border: 0;
  border-radius: 18px;
  background: transparent;
  color: #7d6ca0;
  font-size: 12px;
  cursor: pointer;
}

.apifox-rail-item.active {
  background: linear-gradient(180deg, rgba(246, 114, 183, 0.14), rgba(140, 106, 255, 0.12));
  color: #8d62f4;
}

.apifox-rail-item :deep(svg) {
  width: 20px;
  height: 20px;
}

.apifox-sidebar {
  border-radius: 24px;
  padding: 20px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow: hidden;
}

.apifox-sidebar-head {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.apifox-sidebar-head h1 {
  margin: 0;
  font-size: 34px;
  line-height: 1;
  color: #2d2542;
}

.apifox-sidebar-head p {
  margin: 6px 0 0;
  font-size: 13px;
  color: #8a7da8;
}

.apifox-scope-select {
  width: 100%;
}

.apifox-search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  gap: 10px;
}

.apifox-search-shell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid rgba(137, 122, 179, 0.16);
  background: #fbfbff;
}

.apifox-search-input {
  flex: 1 1 auto;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: #43375f;
}

.apifox-plus-button,
.apifox-toolbar-button,
.apifox-mini-button,
.apifox-tab-chip,
.apifox-content-chip,
.apifox-history-card,
.apifox-environment-item,
.apifox-subtab {
  border: 1px solid rgba(137, 122, 179, 0.14);
  background: #ffffff;
  color: #55487a;
}

.apifox-plus-button {
  border-radius: 14px;
  background: linear-gradient(135deg, #8c6aff, #a873ff);
  color: #fff;
  font-size: 24px;
  cursor: pointer;
}

.apifox-toolbar-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.apifox-toolbar-button,
.apifox-mini-button {
  min-height: 38px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.apifox-toolbar-button.primary,
.apifox-mini-button {
  background: linear-gradient(135deg, #8c6aff, #a873ff);
  color: #fff;
  border-color: transparent;
}

.apifox-tree-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-tree-head,
.apifox-panel-head,
.apifox-section-head,
.apifox-response-top,
.apifox-history-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.apifox-tree-head strong,
.apifox-panel-head span,
.apifox-section-head h3,
.apifox-section h4 {
  color: #2f2646;
  margin: 0;
  font-weight: 700;
}

.apifox-tree-head span,
.apifox-panel-head small,
.apifox-scope-caption,
.apifox-history-meta,
.apifox-environment-item span,
.apifox-environment-item small {
  color: #8a7da8;
  font-size: 12px;
}

.apifox-tree {
  flex: 1 1 auto;
  overflow: auto;
  padding-right: 4px;
}

.apifox-tree-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  width: 100%;
  padding: 6px 0;
}

.apifox-folder-label {
  font-weight: 700;
  color: #5a4d7d;
}

.apifox-endpoint-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.apifox-endpoint-copy strong,
.apifox-endpoint-copy small {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.apifox-endpoint-copy small {
  color: #8e82ad;
}

.apifox-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.apifox-header-card,
.apifox-workbench,
.apifox-empty-state {
  border-radius: 24px;
  padding: 20px;
}

.apifox-header-card {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(280px, 1fr);
  gap: 18px;
  background:
    radial-gradient(circle at top left, rgba(254, 240, 219, 0.95), transparent 30%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(249, 247, 255, 0.94));
}

.apifox-kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8c6aff;
}

.apifox-header-copy h2 {
  margin: 10px 0 10px;
  font-size: 34px;
  line-height: 1.08;
  color: #2d2542;
}

.apifox-header-copy p {
  margin: 0;
  color: #6d6288;
  line-height: 1.7;
}

.apifox-header-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-inline-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.apifox-compact-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.apifox-tab-strip {
  display: flex;
  gap: 10px;
  overflow: auto;
  padding-bottom: 2px;
}

.apifox-tab-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.apifox-tab-chip.active {
  color: #8c6aff;
  box-shadow: inset 0 -2px 0 #8c6aff;
}

.apifox-tab-chip.ghost {
  width: 40px;
  justify-content: center;
}

.apifox-tab-method {
  color: #ff7d45;
}

.apifox-workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.apifox-workbench-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.apifox-mode-tabs,
.apifox-request-actions,
.apifox-head-actions {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.apifox-mode-tab {
  border: 0;
  background: transparent;
  color: #766997;
  font-size: 15px;
  font-weight: 600;
  padding: 8px 2px;
  cursor: pointer;
  box-shadow: inset 0 -2px 0 transparent;
}

.apifox-mode-tab.active {
  color: #8c6aff;
  box-shadow: inset 0 -2px 0 #8c6aff;
}

.apifox-request-bar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 180px auto;
  gap: 12px;
  align-items: center;
}

.apifox-url-input,
.apifox-env-select {
  width: 100%;
}

.apifox-method-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 32px;
  border-radius: 999px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  background: rgba(126, 89, 44, 0.1);
  color: #7e592c;
}

.apifox-method-pill.get {
  background: rgba(52, 168, 83, 0.14);
  color: #257845;
}

.apifox-method-pill.post {
  background: rgba(255, 125, 69, 0.14);
  color: #f26d2f;
}

.apifox-method-pill.put,
.apifox-method-pill.patch {
  background: rgba(38, 132, 255, 0.14);
  color: #2b6fd1;
}

.apifox-method-pill.delete {
  background: rgba(215, 58, 73, 0.14);
  color: #c03749;
}

.apifox-doc-grid,
.apifox-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.apifox-panel {
  border-radius: 18px;
  border: 1px solid rgba(137, 122, 179, 0.12);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(250, 249, 255, 0.96));
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.apifox-panel-span-2 {
  grid-column: 1 / -1;
}

.apifox-panel-head {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(137, 122, 179, 0.1);
}

.apifox-meta-grid {
  display: grid;
  gap: 8px;
  color: #5f5577;
}

.apifox-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.apifox-section-head.compact h3,
.apifox-section h4 {
  font-size: 13px;
}

.apifox-code-block {
  margin: 0;
  padding: 14px;
  border-radius: 14px;
  background: #1f1d29;
  color: #f7f2ff;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
  font-size: 13px;
  line-height: 1.65;
}

.apifox-plain-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.apifox-plain-table th,
.apifox-plain-table td {
  padding: 10px 8px;
  border-bottom: 1px solid rgba(137, 122, 179, 0.1);
  text-align: left;
  vertical-align: top;
}

.apifox-response-list,
.apifox-response-editor-list,
.apifox-history-list,
.apifox-environment-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-response-card,
.apifox-response-editor-card {
  border-radius: 16px;
  border: 1px solid rgba(137, 122, 179, 0.1);
  background: rgba(251, 250, 255, 0.9);
  padding: 14px;
}

.apifox-form-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.apifox-form-row,
.apifox-response-editor-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  align-items: center;
}

.apifox-response-editor-grid {
  grid-template-columns: 1.2fr 0.6fr 1fr;
}

.apifox-mini-button {
  min-height: 34px;
  border-radius: 12px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.apifox-mini-button.danger,
.apifox-history-card .danger {
  background: rgba(255, 241, 244, 0.94);
  color: #c03749;
  border-color: rgba(192, 55, 73, 0.16);
}

.apifox-debug-stack {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  gap: 14px;
}

.apifox-debug-request-card,
.apifox-response-shell {
  min-height: 0;
}

.apifox-subtabs,
.apifox-content-types {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.apifox-subtab {
  min-height: 34px;
  padding: 0 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.apifox-subtab.active {
  color: #8c6aff;
  box-shadow: inset 0 -2px 0 #8c6aff;
}

.apifox-content-chip {
  min-height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  cursor: pointer;
}

.apifox-content-chip.active {
  background: #3c8cff;
  color: #fff;
  border-color: transparent;
}

.apifox-debug-grid {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 14px;
}

.apifox-debug-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-debug-side-block {
  border-radius: 14px;
  border: 1px solid rgba(137, 122, 179, 0.08);
  background: rgba(250, 249, 255, 0.92);
  padding: 12px;
}

.apifox-debug-editor-shell {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-body-editor :deep(.el-textarea__inner) {
  min-height: 420px !important;
  font-family: Consolas, Monaco, monospace;
  font-size: 13px;
  line-height: 1.65;
}

.apifox-response-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 64px;
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.apifox-response-badge.success,
.apifox-history-card .success {
  background: rgba(52, 168, 83, 0.14);
  color: #257845;
}

.apifox-response-badge.idle {
  background: rgba(140, 106, 255, 0.1);
  color: #8c6aff;
}

.apifox-debug-result,
.apifox-debug-snapshot,
.apifox-history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-debug-meta {
  display: grid;
  gap: 8px;
  color: #61577b;
}

.apifox-history-card,
.apifox-environment-item {
  width: 100%;
  text-align: left;
  padding: 14px;
  border-radius: 14px;
  cursor: pointer;
}

.apifox-history-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.apifox-environment-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  min-height: 100%;
}

.apifox-environment-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.apifox-environment-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.apifox-environment-item.active {
  border-color: rgba(140, 106, 255, 0.24);
  box-shadow: 0 0 0 1px rgba(140, 106, 255, 0.12);
}

.apifox-environment-editor {
  min-width: 0;
}

.apifox-auth-block {
  border-radius: 14px;
  border: 1px dashed rgba(137, 122, 179, 0.18);
  padding: 14px;
}

.apifox-import-panel {
  display: grid;
  gap: 14px;
}

.apifox-empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  min-height: 520px;
}

:deep(.el-tree-node__content) {
  height: auto;
  padding: 4px 0;
}

:deep(.el-input__wrapper),
:deep(.el-textarea__inner),
:deep(.el-select__wrapper) {
  border-radius: 12px;
}

@media (max-width: 1400px) {
  .apifox-shell {
    grid-template-columns: 72px 340px minmax(0, 1fr);
  }

  .apifox-request-bar {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .apifox-env-select,
  .apifox-request-actions {
    grid-column: span 1;
  }
}

@media (max-width: 1180px) {
  .apifox-shell,
  .apifox-header-card,
  .apifox-doc-grid,
  .apifox-edit-grid,
  .apifox-debug-stack,
  .apifox-debug-grid,
  .apifox-environment-shell {
    grid-template-columns: 1fr;
  }

  .apifox-rail {
    flex-direction: row;
    overflow: auto;
  }

  .apifox-rail-item {
    min-width: 92px;
  }
}

@media (max-width: 768px) {
  .apifox-page {
    padding: 12px;
  }

  .apifox-shell {
    gap: 12px;
  }

  .apifox-sidebar,
  .apifox-header-card,
  .apifox-workbench,
  .apifox-empty-state {
    padding: 16px;
  }

  .apifox-toolbar-row,
  .apifox-compact-grid,
  .apifox-form-row,
  .apifox-response-editor-grid,
  .apifox-request-bar {
    grid-template-columns: 1fr;
  }
}
</style>
