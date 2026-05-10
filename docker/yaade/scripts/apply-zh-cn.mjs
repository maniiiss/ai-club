import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = process.argv[2]

if (!sourceRoot) {
  console.error('Usage: node apply-zh-cn.mjs <yaade-source-root>')
  process.exit(1)
}

const fileReplacements = [
  {
    file: 'client/src/App.tsx',
    replacements: [
      ['description: `No connection to server. Logout in ${counter}`', 'description: `无法连接服务端，将在 ${counter} 秒后退出登录`'],
      ['description: `No connection to server. Logout in ${logoutCounter}`', 'description: `无法连接服务端，将在 ${logoutCounter} 秒后退出登录`'],
      ['description: `Connection to server restored`', 'description: `服务端连接已恢复`'],
      ['throw new Error(\'No connection to server...\');', 'throw new Error(\'无法连接服务端...\');']
    ]
  },
  {
    file: 'client/src/components/basicModal/BasicModal.tsx',
    replacements: [
      ['const secondaryBtnText = secondaryButtonText ?? \'Close\';', 'const secondaryBtnText = secondaryButtonText ?? \'关闭\';']
    ]
  },
  {
    file: 'client/src/pages/login/Login.tsx',
    replacements: [
      ['successToast(\'You are successfully logged in.\', toast);', 'successToast(\'登录成功。\', toast);'],
      ['errorToast(\'Login was not successful.\', toast);', 'errorToast(\'登录失败。\', toast);'],
      ['placeholder="Username"', 'placeholder="用户名"'],
      ['placeholder="Password"', 'placeholder="密码"'],
      ['              LOGIN', '              登录'],
      ['<Text padding="2">OR</Text>', '<Text padding="2">或者</Text>'],
      ['{provider.label ?? `Signin with ${provider.id}`}', '{provider.label ?? `使用 ${provider.id} 登录`}']
    ]
  },
  {
    file: 'client/src/components/sidebar/Sidebar.tsx',
    replacements: [
      ['placeholder="Search..."', 'placeholder="搜索集合或接口..."'],
      ['heading="Create a new collection"', 'heading="新建接口集合"'],
      ['buttonText="Create"', 'buttonText="创建"'],
      ['<Tab>Basic</Tab>', '<Tab>基础信息</Tab>'],
      ['<Tab>Import</Tab>', '<Tab>导入</Tab>'],
      ['placeholder="Name"', 'placeholder="集合名称"'],
      ['placeholder="Base Path"', 'placeholder="基础路径"'],
      ['successToast(\'A new collection was created and saved\', toast);', 'successToast(\'新集合已创建并保存。\', toast);'],
      ['errorToast(\'The collection could be not created\', toast);', 'errorToast(\'集合创建失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/collectionView/MoveableHeader.tsx',
    replacements: [
      ['successToast(\'A new request was created.\', toast);', 'successToast(\'新请求已创建。\', toast);'],
      ['errorToast(\'The request could be not created\', toast);', 'errorToast(\'创建失败。\', toast);'],
      ['successToast(\'A new collection was created and saved\', toast);', 'successToast(\'新集合已创建并保存。\', toast);'],
      ['errorToast(\'The collection could be not created\', toast);', 'errorToast(\'集合创建失败。\', toast);'],
      ['successToast(\'Collection was deleted.\', toast);', 'successToast(\'集合已删除。\', toast);'],
      ['errorToast(\'Could not delete collection.\', toast);', 'errorToast(\'删除集合失败。\', toast);'],
      ['successToast(\'Link copied to clipboard.\', toast);', 'successToast(\'链接已复制到剪贴板。\', toast);'],
      ['heading="Create a new request"', 'heading="新建请求"'],
      ['heading="Create a new Script"', 'heading="新建脚本"'],
      ['heading="Create a new collection"', 'heading="新建集合"'],
      ['heading={`Duplicate "${collection.name}"`}', 'heading={`复制“${collection.name}”`}'],
      ['buttonText="Create"', 'buttonText="创建"'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['heading={`Delete "${collection.name}"`}', 'heading={`删除“${collection.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['<Tab>Basic</Tab>', '<Tab>基础信息</Tab>'],
      ['<Tab>Import</Tab>', '<Tab>导入</Tab>'],
      ['placeholder="Name"', 'placeholder="名称"'],
      ['placeholder="Base Path"', 'placeholder="基础路径"'],
      ['Are you sure you want to delete this collection?', '确定要删除这个集合吗？'],
      ['The collection cannot be recovered!', '删除后将无法恢复！'],
      ['                    New Request', '                    新建请求'],
      ['                    New Websocket Request', '                    新建 WebSocket 请求'],
      ['                    New Collection', '                    新建集合'],
      ['                    New Job Script', '                    新建任务脚本'],
      ['                    Copy Link', '                    复制链接'],
      ['                    Duplicate', '                    复制'],
      ['                    Delete', '                    删除']
    ]
  },
  {
    file: 'client/src/components/collectionRequest/CollectionRequest.tsx',
    replacements: [
      ['successToast(\'Link copied to clipboard.\', toast);', 'successToast(\'链接已复制到剪贴板。\', toast);'],
      ['successToast(\'Request ID copied to clipboard.\', toast);', 'successToast(\'请求 ID 已复制到剪贴板。\', toast);'],
      ['heading={`Rename ${request.name}`}', 'heading={`重命名“${request.name}”`}'],
      ['buttonText="Rename"', 'buttonText="重命名"'],
      ['heading={`Delete "${request.name}"`}', 'heading={`删除“${request.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['Are you sure you want to delete this request?', '确定要删除这个请求吗？'],
      ['The request cannot be recovered!', '删除后将无法恢复！'],
      ['heading={`Duplicate "${request.name}"`}', 'heading={`复制“${request.name}”`}'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['placeholder="Name"', 'placeholder="请求名称"'],
      ['                  Rename', '                  重命名'],
      ['                  Duplicate', '                  复制'],
      ['                  Copy Link', '                  复制链接'],
      ['                  Copy ID', '                  复制 ID'],
      ['                  Delete', '                  删除']
    ]
  },
  {
    file: 'client/src/components/collectionScript/CollectionScript.tsx',
    replacements: [
      ['successToast(\'Link copied to clipboard.\', toast);', 'successToast(\'链接已复制到剪贴板。\', toast);'],
      ['successToast(\'Script ID copied to clipboard.\', toast);', 'successToast(\'脚本 ID 已复制到剪贴板。\', toast);'],
      ['heading={`Delete "${script.name}"`}', 'heading={`删除“${script.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['Are you sure you want to delete this script?', '确定要删除这个脚本吗？'],
      ['The script cannot be recovered!', '删除后将无法恢复！'],
      ['heading={`Duplicate "${script.name}"`}', 'heading={`复制“${script.name}”`}'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['heading={`Take ownership of "${script.name}"`}', 'heading={`接管“${script.name}”`}'],
      ['buttonText="Take Ownership"', 'buttonText="接管"'],
      ['Are you sure you want to take ownership of this script?', '确定要接管这个脚本吗？'],
      ['Every subsequent Cron run will be executed by your user.', '后续每次 Cron 运行都会使用你的账号执行。'],
      ['placeholder="Name"', 'placeholder="脚本名称"'],
      ['                  Rename', '                  重命名'],
      ['                  Duplicate', '                  复制'],
      ['                  Take Ownership', '                  接管'],
      ['                  Copy Link', '                  复制链接'],
      ['                  Copy ID', '                  复制 ID'],
      ['                  Delete', '                  删除']
    ]
  },
  {
    file: 'client/src/components/uriBar/UriBar.tsx',
    replacements: [
      ['placeholder: \'URL\'', 'placeholder: \'请求地址 / URL\''],
      ['{isLoading ? <Spinner size="sm" /> : \'SEND\'}', '{isLoading ? <Spinner size="sm" /> : \'发送\'}']
    ]
  },
  {
    file: 'client/src/components/collectionPanel/CollectionPanel.tsx',
    replacements: [
      ['placeholder="Name"', 'placeholder="集合名称"'],
      ['<Tab>Description</Tab>', '<Tab>说明</Tab>'],
      ['<Tab>Environments</Tab>', '<Tab>环境</Tab>'],
      ['<Tab>Headers</Tab>', '<Tab>请求头</Tab>'],
      ['<Tab>Auth</Tab>', '<Tab>鉴权</Tab>'],
      ['<Tab>Request Script</Tab>', '<Tab>请求脚本</Tab>'],
      ['<Tab>Response Script</Tab>', '<Tab>响应脚本</Tab>'],
      ['<Tab>Settings</Tab>', '<Tab>设置</Tab>'],
      ['successToast(\'Collection was saved.\', toast);', 'successToast(\'集合已保存。\', toast);'],
      ['errorToast(\'The collection could not be saved.\', toast);', 'errorToast(\'集合保存失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/collectionPanel/CollectionSettingsTab/CollectionSettingsTab.tsx',
    replacements: [
      ['<div>Groups</div>', '<div>可见组</div>'],
      ['<p>Extension Options</p>', '<p>浏览器扩展选项</p>'],
      ['placeholder="Timeout (seconds)"', 'placeholder="超时（秒）"'],
      ['<p>Timeout (Seconds)</p>', '<p>超时（秒）</p>'],
      ['<p>Server Proxy Options</p>', '<p>服务端代理选项</p>'],
      ['Verify Host', '校验证书主机名'],
      ['Trust All', '信任所有证书']
    ]
  },
  {
    file: 'client/src/components/collectionPanel/EnvironmentsTab/EnvironmentsTab.tsx',
    replacements: [
      ['successToast(\'Environment created.\', toast);', 'successToast(\'环境已创建。\', toast);'],
      ['errorToast(\'Could not create environment\', toast);', 'errorToast(\'环境创建失败。\', toast);'],
      ['successToast(\'Environment deleted\', toast);', 'successToast(\'环境已删除。\', toast);'],
      ['errorToast(\'Could not delete environment\', toast);', 'errorToast(\'环境删除失败。\', toast);'],
      ['successToast(\'Secret created\', toast);', 'successToast(\'密钥已创建。\', toast);'],
      ['errorToast(\'Failed to create secret\', toast);', 'errorToast(\'密钥创建失败。\', toast);'],
      ['successToast(\'Secret saved\', toast);', 'successToast(\'密钥已保存。\', toast);'],
      ['errorToast(\'Failed to set secret\', toast);', 'errorToast(\'密钥保存失败。\', toast);'],
      ['successToast(\'Secret deleted\', toast);', 'successToast(\'密钥已删除。\', toast);'],
      ['errorToast(\'Failed to delete secret\', toast);', 'errorToast(\'密钥删除失败。\', toast);'],
      ['placeholder="Name"', 'placeholder="环境名称"'],
      ['aria-label="Create new environment"', 'aria-label="创建新环境"'],
      ['aria-label="Close form to create new environment"', 'aria-label="关闭新建环境表单"'],
      ['aria-label="Open form to create new environment"', 'aria-label="打开新建环境表单"'],
      ['            Proxy', '            代理'],
      ['<option value="ext">Extension</option>', '<option value="ext">浏览器扩展</option>'],
      ['<option value="server">Server</option>', '<option value="server">服务端</option>'],
      ['            Inherit from', '            继承自'],
      ['<option value="">None</option>', '<option value="">无</option>'],
      ['            Variables', '            变量'],
      ['                  Secrets', '                  密钥']
    ]
  },
  {
    file: 'client/src/components/requestPanel/RequestPanel.tsx',
    replacements: [
      ['<Tab>Description</Tab>', '<Tab>说明</Tab>'],
      ['<Tab>Parameters</Tab>', '<Tab>参数</Tab>'],
      ['<Tab>Headers</Tab>', '<Tab>请求头</Tab>'],
      ['<Tab>Body</Tab>', '<Tab>请求体</Tab>'],
      ['<Tab>Auth</Tab>', '<Tab>鉴权</Tab>'],
      ['<Tab>Request Script</Tab>', '<Tab>请求脚本</Tab>'],
      ['<Tab>Response Script</Tab>', '<Tab>响应脚本</Tab>'],
      ['<Tab>Code</Tab>', '<Tab>代码示例</Tab>']
    ]
  },
  {
    file: 'client/src/components/requestPanel/RequestSender.tsx',
    replacements: [
      ['successToast(\'The request was successfully saved.\', toast);', 'successToast(\'请求已保存。\', toast);'],
      ['errorToast(\'The request could not be saved.\', toast);', 'errorToast(\'请求保存失败。\', toast);'],
      ['successToast(\'A new request was created.\', toast);', 'successToast(\'新请求已创建。\', toast);'],
      ['errorToast(\'The request could be not created\', toast);', 'errorToast(\'请求创建失败。\', toast);'],
      ['heading="Save a new request"', 'heading="保存为新请求"'],
      ['buttonText="Save"', 'buttonText="保存"'],
      ['placeholder="Name"', 'placeholder="请求名称"']
    ]
  },
  {
    file: 'client/src/components/responsePanel/ResponsePanel.tsx',
    replacements: [
      ['successToast(\'Copied to clipboard\', toast);', 'successToast(\'已复制到剪贴板。\', toast);'],
      ['<Tab>Body</Tab>', '<Tab>响应体</Tab>'],
      ['<Tab>Headers</Tab>', '<Tab>响应头</Tab>'],
      ['<Tab>Tests</Tab>', '<Tab>测试</Tab>'],
      ['              Status', '              状态'],
      ['              Time', '              耗时'],
      ['              Size', '              大小'],
      ['                  Date', '                  时间'],
      ['<Text>Push send to get a response...</Text>', '<Text>点击发送后即可查看响应...</Text>']
    ]
  },
  {
    file: 'client/src/components/authTab/AuthTab.tsx',
    replacements: [
      ['errorToast(\'Auth data is missing.\', toast);', 'errorToast(\'缺少鉴权配置。\', toast);'],
      ['errorToast(\'OAuth2 data is missing.\', toast);', 'errorToast(\'缺少 OAuth2 配置。\', toast);'],
      ['errorToast(\'Failed to interpolate auth data.\', toast);', 'errorToast(\'鉴权变量插值失败。\', toast);'],
      ['errorToast(\'Auth URL is missing for authCode grant type.\', toast);', 'errorToast(\'Authorization Code 模式缺少授权地址。\', toast);'],
      ['successToast(\'Token was successfully generated.\', toast);', 'successToast(\'Token 已成功生成。\', toast);'],
      ['errorToast(\'Failed to fetch token: \' + e, toast);', 'errorToast(\'获取 Token 失败：\' + e, toast);'],
      ['successToast(\'Copied to clipboard\', toast);', 'successToast(\'已复制到剪贴板。\', toast);'],
      ['errorToast(\'Data is missing.\', toast);', 'errorToast(\'缺少必要参数。\', toast);'],
      ['<Text fontSize="sm">Username</Text>', '<Text fontSize="sm">用户名</Text>'],
      ['<Text fontSize="sm">Password</Text>', '<Text fontSize="sm">密码</Text>'],
      ['<Text fontSize="sm">Auth URL</Text>', '<Text fontSize="sm">授权地址</Text>'],
      ['<Text fontSize="sm">Token URL</Text>', '<Text fontSize="sm">Token 地址</Text>'],
      ['<Text fontSize="sm">Client ID</Text>', '<Text fontSize="sm">Client ID</Text>'],
      ['<Text fontSize="sm">Client Secret</Text>', '<Text fontSize="sm">Client Secret</Text>'],
      ['<Text fontSize="sm">Current Token</Text>', '<Text fontSize="sm">当前 Token</Text>'],
      ['<Text fontSize="sm">Grant Type</Text>', '<Text fontSize="sm">授权方式</Text>'],
      ['<option value="authorization_code">Authorization Code</option>', '<option value="authorization_code">Authorization Code</option>'],
      ['<option value="client_credentials">Client Credentials</option>', '<option value="client_credentials">Client Credentials</option>'],
      ['<Text fontSize="sm">Scope</Text>', '<Text fontSize="sm">Scope</Text>'],
      ['return \'When enabled, the request will be sent with an additional "Authorization: Basic <credentials>" header.\';', 'return \'启用后，请求会自动附带额外的 "Authorization: Basic <credentials>" 请求头。\';'],
      ['return \'When enabled, the request will be sent with an additional "Authorization: Bearer <token>" header. Note that the token needs to be generated first, by pushing the "Generate Token" button.\';', 'return \'启用后，请求会自动附带额外的 "Authorization: Bearer <token>" 请求头。请先点击“生成 Token”完成授权。\';'],
      ['              Generate Token', '              生成 Token'],
      ['            Type', '            类型'],
      ['            <option value="basic">Basic</option>', '            <option value="basic">Basic</option>'],
      ['            <option value="oauth2">OAuth 2.0</option>', '            <option value="oauth2">OAuth 2.0</option>'],
      ['            Enabled', '            启用']
    ]
  },
  {
    file: 'client/src/components/bodyEditor/BodyEditor.tsx',
    replacements: [
      ['errorToast(\'Could not format body.\', toast);', 'errorToast(\'请求体格式化失败。\', toast);'],
      ['          Set Header', '          设置 Header']
    ]
  },
  {
    file: 'client/src/components/editor/Editor.tsx',
    replacements: [
      ['errorToast(\'Could not format content.\', toast);', 'errorToast(\'内容格式化失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/generateCodeTab/GenerateCodeTab.tsx',
    replacements: [
      ['title: \'Failed to generate code snippet\'', 'title: \'生成代码片段失败\''],
      ['successToast(\'Copied to clipboard\', toast);', 'successToast(\'已复制到剪贴板。\', toast);']
    ]
  },
  {
    file: 'client/src/components/groupsInput/GroupsInput.tsx',
    replacements: [
      ['placeholder="Groups"', 'placeholder="分组"']
    ]
  },
  {
    file: 'client/src/components/kvEditor/KVEditorRow.tsx',
    replacements: [
      ['                <option value="kv">Text</option>', '                <option value="kv">文本</option>'],
      ['                <option value="file">File</option>', '                <option value="file">文件</option>'],
      ["{file?.name ?? 'Select a File...'}", "{file?.name ?? '选择文件...'}"]
    ]
  },
  {
    file: 'client/src/components/collectionView/CollectionView.tsx',
    replacements: [
      ['successToast(\'Request was moved.\', toast);', 'successToast(\'请求已移动。\', toast);'],
      ['errorToast(\'Could not move request.\', toast);', 'errorToast(\'请求移动失败。\', toast);'],
      ['successToast(\'Script was moved.\', toast);', 'successToast(\'脚本已移动。\', toast);'],
      ['errorToast(\'Could not move script.\', toast);', 'errorToast(\'脚本移动失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/collections/Collections.tsx',
    replacements: [
      ['successToast(\'Collection was moved.\', toast);', 'successToast(\'集合已移动。\', toast);'],
      ['errorToast(\'Could not move collection.\', toast);', 'errorToast(\'集合移动失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/cmdPalette/CmdPalette.tsx',
    replacements: [
      ['name: \'Open Current Collection\'', 'name: \'打开当前集合\''],
      ['name: \'Open Current Environment\'', 'name: \'打开当前环境\''],
      ['name: \'Open Collection Headers\'', 'name: \'打开集合请求头\'']
    ]
  },
  {
    file: 'client/src/pages/dashboard/Dashboard.tsx',
    replacements: [
      ['errorToast(\'Could not retrieve collections\', toast);', 'errorToast(\'集合列表获取失败。\', toast);'],
      ['errorToast(\'Failed to interpolate auth data.\', toast);', 'errorToast(\'鉴权变量插值失败。\', toast);'],
      ['errorToast(\'Auth data not found for request.\', toast);', 'errorToast(\'未找到请求鉴权配置。\', toast);'],
      ['errorToast(\'Auth data not found for collection.\', toast);', 'errorToast(\'未找到集合鉴权配置。\', toast);'],
      ['successToast(\'Token was successfully generated.\', toast);', 'successToast(\'Token 已成功生成。\', toast);'],
      ['errorToast(\'Failed to fetch token: \' + e, toast);', 'errorToast(\'获取 Token 失败：\' + e, toast);'],
      ['successToast(\'Request was saved.\', toast);', 'successToast(\'请求已保存。\', toast);'],
      ['errorToast(\'Could not save request\', toast);', 'errorToast(\'请求保存失败。\', toast);'],
      ['successToast(\'Collection was saved.\', toast);', 'successToast(\'集合已保存。\', toast);'],
      ['errorToast(\'Could not save Collection\', toast);', 'errorToast(\'集合保存失败。\', toast);'],
      ['successToast(\'Script was saved.\', toast);', 'successToast(\'脚本已保存。\', toast);'],
      ['errorToast(\'Could not save script\', toast);', 'errorToast(\'脚本保存失败。\', toast);'],
      ['errorToast(\'Could not select request\', toast);', 'errorToast(\'请求选择失败。\', toast);'],
      ['errorToast(\'Could not select collection\', toast);', 'errorToast(\'集合选择失败。\', toast);'],
      ['errorToast(\'Could not select script\', toast);', 'errorToast(\'脚本选择失败。\', toast);'],
      ['successToast(\'Request was renamed.\', toast);', 'successToast(\'请求已重命名。\', toast);'],
      ['errorToast(\'Could not rename request\', toast);', 'errorToast(\'请求重命名失败。\', toast);'],
      ['successToast(\'Request was deleted.\', toast);', 'successToast(\'请求已删除。\', toast);'],
      ['errorToast(\'Could not delete request\', toast);', 'errorToast(\'请求删除失败。\', toast);'],
      ['successToast(\'Request was duplicated.\', toast);', 'successToast(\'请求已复制。\', toast);'],
      ['errorToast(\'Could not duplicate request\', toast);', 'errorToast(\'请求复制失败。\', toast);'],
      ['successToast(\'Collection was duplicated.\', toast);', 'successToast(\'集合已复制。\', toast);'],
      ['errorToast(\'Could not duplicate collection\', toast);', 'errorToast(\'集合复制失败。\', toast);'],
      ['successToast(\'Script was duplicated.\', toast);', 'successToast(\'脚本已复制。\', toast);'],
      ['errorToast(\'Could not duplicate script\', toast);', 'errorToast(\'脚本复制失败。\', toast);'],
      ['successToast(\'Script was deleted.\', toast);', 'successToast(\'脚本已删除。\', toast);'],
      ['errorToast(\'Could not delete script\', toast);', 'errorToast(\'脚本删除失败。\', toast);'],
      ['successToast(\'You are now the owner of this script.\', toast);', 'successToast(\'你已接管这个脚本。\', toast);'],
      ['errorToast(\'Could not take ownership of script\', toast);', 'errorToast(\'脚本接管失败。\', toast);'],
      ['errorToast(\'Could not fetch script\', toast);', 'errorToast(\'脚本获取失败。\', toast);'],
      ['successToast(\'Refreshed\', toast);', 'successToast(\'已刷新。\', toast);'],
      ['errorToast(\'Could not refresh results\', toast);', 'errorToast(\'结果刷新失败。\', toast);'],
      ['let panel = <div>Select a Request or Collection</div>;', 'let panel = <div>请选择请求或集合</div>;'],
      ['          <ModalHeader>Failed to connect to extension</ModalHeader>', '          <ModalHeader>浏览器扩展连接失败</ModalHeader>'],
      ['            The extension could not be connected or needs to be updated. Please install{\' \'}', '            浏览器扩展无法连接，或需要更新。请安装{\' \'}'],
      ['                the extension', '                Yaade 扩展'],
      ['            and copy the URL of this window into the host field of the extension. Then', '            并把当前窗口 URL 复制到扩展的 host 字段，'],
      ['            click retry.', '            再点击重试。'],
      ['            Alternatively change the proxy of your current environment to', '            也可以把当前环境的代理切换为'],
      ['              Dismiss', '              关闭'],
      ['              Retry', '              重试'],
      ['heading={`Request not saved`}', 'heading={`请求尚未保存`}'],
      ['heading={`Collection not saved`}', 'heading={`集合尚未保存`}'],
      ['buttonText="Save"', 'buttonText="保存"'],
      ['secondaryButtonText="Discard"', 'secondaryButtonText="放弃"'],
      ['        The request has unsaved changes which will be lost if you choose to change the tab', '        当前请求有未保存的修改，如果现在切换标签页，这些修改会丢失。'],
      ['        now.', '        '],
      ['        The collection has unsaved changes which will be lost if you choose to change the', '        当前集合有未保存的修改，如果现在切换标签页，这些修改会丢失。'],
      ['        tab now.', '        '],
      ['        Do you want to save the changes now?', '        是否现在保存这些修改？']
    ]
  },
  {
    file: 'client/src/components/websocketPanel/WebsocketPanel.tsx',
    replacements: [
      ['successToast(\'The request was successfully saved.\', toast);', 'successToast(\'请求已保存。\', toast);'],
      ['errorToast(\'The request could not be saved.\', toast);', 'errorToast(\'请求保存失败。\', toast);'],
      ['errorToast(\'Could not format body.\', toast);', 'errorToast(\'消息内容格式化失败。\', toast);'],
      ['placeholder: \'URL\'', 'placeholder: \'请求地址 / URL\''],
      ['              \'CONNECT\'', '              \'连接\''],
      ['              \'DISCONNECT\'', '              \'断开\''],
      ['          <Tab>Description</Tab>', '          <Tab>说明</Tab>'],
      ['          <Tab>Parameters</Tab>', '          <Tab>参数</Tab>'],
      ['          <Tab>Headers</Tab>', '          <Tab>请求头</Tab>'],
      ['          <Tab>Message</Tab>', '          <Tab>消息</Tab>'],
      ['              Send', '              发送']
    ]
  },
  {
    file: 'client/src/components/websocketPanel/WebsocketHandler.tsx',
    replacements: [
      ['errorToast(\'WebSocket error: \' + msg.result.error, toast);', 'errorToast(\'WebSocket 错误：\' + msg.result.error, toast);'],
      ['errorToast(\'WebSocket closed unexpectedly\', toast);', 'errorToast(\'WebSocket 意外断开。\', toast);'],
      ['errorToast(\'Failed to connect: \' + err, toast);', 'errorToast(\'连接失败：\' + err, toast);'],
      ['errorToast(\'Failed to disconnect: \' + err, toast);', 'errorToast(\'断开连接失败：\' + err, toast);']
    ]
  },
  {
    file: 'client/src/components/websocketResponsePanel/WebsocketResponsePanel.tsx',
    replacements: [
      ['              <Tab>Messages</Tab>', '              <Tab>消息</Tab>'],
      ['                  Date', '                  时间'],
      ['                          Timestamp', '                          时间戳'],
      ['                          Message', '                          消息'],
      ['          <Text>Push connect to start...</Text>', '          <Text>点击连接后即可查看消息...</Text>']
    ]
  },
  {
    file: 'client/src/components/kvEditor/FileSelectorModal.tsx',
    replacements: [
      ['successToast(\'File deleted\', toast);', 'successToast(\'文件已删除。\', toast);'],
      ['errorToast(\'Could not delete file\', toast);', 'errorToast(\'文件删除失败。\', toast);'],
      ['successToast(\'File uploaded\', toast);', 'successToast(\'文件已上传。\', toast);'],
      ['errorToast(\'Could not upload file\', toast);', 'errorToast(\'文件上传失败。\', toast);'],
      ['<ModalHeader>Files</ModalHeader>', '<ModalHeader>文件</ModalHeader>'],
      ['<Text mb="4">Click on a filename to select it or upload a new one.</Text>', '<Text mb="4">点击文件名即可选择，或上传一个新文件。</Text>'],
      ['                    File', '                    文件'],
      ['                    Groups', '                    分组'],
      ['                    <span>No Files...</span>', '                    <span>暂无文件...</span>'],
      ['              Upload a new File', '              上传新文件'],
      ['              Upload', '              上传']
    ]
  },
  {
    file: 'client/src/components/scriptPanel/ScriptPanel.tsx',
    replacements: [
      ['successToast(\'Run finished\', toast);', 'successToast(\'运行完成。\', toast);'],
      ['errorToast(\'Failed to run script. Check the console for errors.\', toast);', 'errorToast(\'脚本运行失败，请查看控制台错误。\', toast);'],
      ['successToast(\'Script was saved.\', toast);', 'successToast(\'脚本已保存。\', toast);'],
      ['errorToast(\'The script could not be saved. \' + e.message, toast);', 'errorToast(\'脚本保存失败：\' + e.message, toast);'],
      ['placeholder="Name"', 'placeholder="脚本名称"'],
      ["{isRunning ? <Spinner size=\"sm\" /> : 'RUN'}", "{isRunning ? <Spinner size=\"sm\" /> : '运行'}"],
      ['          <Tab>Description</Tab>', '          <Tab>说明</Tab>'],
      ['          <Tab>Script</Tab>', '          <Tab>脚本</Tab>'],
      ['          <Tab>Settings</Tab>', '          <Tab>设置</Tab>']
    ]
  },
  {
    file: 'client/src/components/scriptPanel/SettingsTab.tsx',
    replacements: [
      ['            Cron Configuration', '            Cron 配置'],
      ['label="Configure the script as a cron job to run periodically on the server. Visit the docs for more information."', 'label="把脚本配置为 Cron 任务，在服务端周期执行。更多信息请查看文档。"'],
      ['              NO_ENV', '              NO_ENV'],
      ['<option value="">No Envs</option>', '<option value="">暂无环境</option>']
    ]
  },
  {
    file: 'client/src/components/scriptPanel/ScriptTab.tsx',
    replacements: [
      ['errorToast(\'Could not format script.\', toast);', 'errorToast(\'脚本格式化失败。\', toast);']
    ]
  },
  {
    file: 'client/src/components/scriptResultsPanel/ScriptResultsPanel.tsx',
    replacements: [
      ['              <div>Runs</div>', '              <div>运行记录</div>'],
      ['                <Tab>Tests</Tab>', '                <Tab>测试</Tab>'],
      ['                <Tab>Logs</Tab>', '                <Tab>日志</Tab>'],
      ['          <Text>Push run to get a result...</Text>', '          <Text>点击运行后即可查看结果...</Text>']
    ]
  },
  {
    file: 'client/src/components/scriptResultsPanel/logsTab/LogsTab.tsx',
    replacements: [
      ['                Timestamp', '                时间戳'],
      ['              <Th p="5px">Message</Th>', '              <Th p="5px">消息</Th>']
    ]
  },
  {
    file: 'client/src/components/settings/Settings.tsx',
    replacements: [
      ['              General', '              常规'],
      ['              Account', '              账号'],
      ['              Tokens', '              Token'],
      ['                  Backup', '                  备份'],
      ['                  Users', '                  用户'],
      ['              Certificates', '              证书'],
      ['              About', '              关于'],
      ['              From Munich with ❤️', '              来自慕尼黑的问候 ❤️'],
      ['              Created by Jonathan Rösner at EsperoTech.', '              由 EsperoTech 的 Jonathan Rösner 创建。']
    ]
  },
  {
    file: 'client/src/components/settings/accountSettings/AccountSettings.tsx',
    replacements: [
      ['successToast(\'Password changed.\', toast);', 'successToast(\'密码已修改。\', toast);'],
      ['errorToast(\'Password could not be changed.\', toast);', 'errorToast(\'密码修改失败。\', toast);'],
      ['errorToast(\'Failed to logout\', toast);', 'errorToast(\'退出登录失败。\', toast);'],
      ['<SettingsTab name="Account">', '<SettingsTab name="账号">'],
      ['        User', '        用户'],
      ['        <p>Logged in as</p>', '        <p>当前登录用户</p>'],
      ['          Logout', '          退出登录'],
      ['        Groups', '        所属分组'],
      ['            Password', '            密码'],
      ['placeholder="Current Password..."', 'placeholder="当前密码..."'],
      ['placeholder="New Password..."', 'placeholder="新密码..."'],
      ['placeholder="Repeat Password..."', 'placeholder="重复新密码..."'],
      ['              Change password', '              修改密码']
    ]
  },
  {
    file: 'client/src/components/settings/generalSettings/GeneralSettings.tsx',
    replacements: [
      ['successToast(\'Settings saved.\', toast);', 'successToast(\'设置已保存。\', toast);'],
      ['errorToast(\'Setting could not be changed.\', toast);', 'errorToast(\'设置修改失败。\', toast);'],
      ['<SettingsTab name="General">', '<SettingsTab name="常规">'],
      ['        Theme ({colorMode})', '        主题（{colorMode}）'],
      ['        Behavior', '        行为'],
      ['        <Text w="200px">Save after successful send</Text>', '        <Text w="200px">发送成功后自动保存</Text>'],
      ['          {user?.data?.settings?.saveOnSend ? \'ON\' : \'OFF\'}', '          {user?.data?.settings?.saveOnSend ? \'开\' : \'关\'}'],
      ['        <Text w="200px">Save on close</Text>', '        <Text w="200px">关闭前自动保存</Text>'],
      ['          {user?.data?.settings?.saveOnClose ? \'ON\' : \'OFF\'}', '          {user?.data?.settings?.saveOnClose ? \'开\' : \'关\'}']
    ]
  },
  {
    file: 'client/src/components/settings/accessTokensSettings/AccessTokenSettings.tsx',
    replacements: [
      ['errorToast(\'Access Token could not be fetched.\', toast);', 'errorToast(\'Access Token 获取失败。\', toast);'],
      ['successToast(\'Access Token created\', toast);', 'successToast(\'Access Token 已创建。\', toast);'],
      ['errorToast(\'Access Token already exists\', toast);', 'errorToast(\'Access Token 已存在。\', toast);'],
      ['errorToast(\'Access Token could not be created\', toast);', 'errorToast(\'Access Token 创建失败。\', toast);'],
      ['successToast(\'Access Token deleted\', toast);', 'successToast(\'Access Token 已删除。\', toast);'],
      ['errorToast(\'Access Token could not be deleted.\', toast);', 'errorToast(\'Access Token 删除失败。\', toast);'],
      ['successToast(\'Token copied to clipboard\', toast);', 'successToast(\'Token 已复制到剪贴板。\', toast);'],
      ['<SettingsTab name="Access Tokens">', '<SettingsTab name="Access Token">'],
      ['        Generate an access token that can be used to authenticate against the API.', '        生成可用于调用 API 的访问令牌。'],
      ['                Name', '                名称'],
      ['                Created At', '                创建时间'],
      ['                <span> No Access Tokens...</span>', '                <span> 暂无 Access Token...</span>'],
      ['          Create a new Access Token', '          新建 Access Token'],
      ['          placeholder="Name"', '          placeholder="名称"'],
      ['          Add', '          新增'],
      ['            Your new Access Token', '            新生成的 Access Token'],
      ['            Save your access token! You are not able to access it again.', '            请立即保存这个 Access Token，后续将无法再次查看明文。']
    ]
  },
  {
    file: 'client/src/components/settings/certificateSettings/CertificateSettings.tsx',
    replacements: [
      ['errorToast(\'Certificate could not be fetched.\', toast);', 'errorToast(\'证书列表获取失败。\', toast);'],
      ['successToast(\'Certificate created\', toast);', 'successToast(\'证书已创建。\', toast);'],
      ['errorToast(\'Certificate already exists\', toast);', 'errorToast(\'证书已存在。\', toast);'],
      ['errorToast(\'Certificate could not be created\', toast);', 'errorToast(\'证书创建失败。\', toast);'],
      ['successToast(\'Certificate deleted\', toast);', 'successToast(\'证书已删除。\', toast);'],
      ['errorToast(\'Certificate could not be deleted.\', toast);', 'errorToast(\'证书删除失败。\', toast);'],
      ['<SettingsTab name="Certificates">', '<SettingsTab name="证书">'],
      ['        Upload SSL certificates to be used by the server proxy for matching hostnames.', '        上传服务端代理可用的 SSL 证书，用于匹配目标主机名。'],
      ['        Limit access to certificates via groups.', '        你也可以通过分组限制证书的可见范围。'],
      ['                Host', '                主机'],
      ['                Groups', '                分组'],
      ['                <span> No certificates</span>', '                <span> 暂无证书</span>'],
      ['          Add a new Certificate', '          新增证书'],
      ['          placeholder="Host"', '          placeholder="主机名"'],
      ['            Pem Certificate', '            PEM 证书'],
      ['            Pem Key', '            PEM 私钥'],
      ['          Add', '          新增']
    ]
  },
  {
    file: 'client/src/components/settings/userSettings/UserSettings.tsx',
    replacements: [
      ['errorToast(\'Users could not be fetched.\', toast);', 'errorToast(\'用户列表获取失败。\', toast);'],
      ['<SettingsTab name="Users">', '<SettingsTab name="用户">'],
      ['          <Tab>Local</Tab>', '          <Tab>本地账号</Tab>'],
      ['          <Tab>External</Tab>', '          <Tab>外部认证</Tab>']
    ]
  },
  {
    file: 'client/src/components/settings/userSettings/providerTabs/LocalProviderTab.tsx',
    replacements: [
      ['successToast(\'User created\', toast);', 'successToast(\'用户已创建。\', toast);'],
      ['errorToast(\'User already exists\', toast);', 'errorToast(\'用户已存在。\', toast);'],
      ['errorToast(\'User could not be created\', toast);', 'errorToast(\'用户创建失败。\', toast);'],
      ['errorToast(\'Failed to save\', toast);', 'errorToast(\'保存失败。\', toast);'],
      ['successToast(\'User deleted\', toast);', 'successToast(\'用户已删除。\', toast);'],
      ['errorToast(\'Could not delete user\', toast);', 'errorToast(\'删除用户失败。\', toast);'],
      ['        Add a new user', '        新增用户'],
      ['          placeholder="Username"', '          placeholder="用户名"'],
      ['                Username', '                用户名'],
      ['                Groups', '                分组'],
      ['heading={`Delete "${editRowForm.deleteUser?.username}"`}', 'heading={`删除“${editRowForm.deleteUser?.username}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['Are you sure you want to delete this user?', '确定要删除这个用户吗？']
    ]
  },
  {
    file: 'client/src/components/settings/userSettings/providerTabs/ExternalProviderTab.tsx',
    replacements: [
      ['errorToast(\'Auth providers could not be fetched.\', toast);', 'errorToast(\'外部认证配置获取失败。\', toast);'],
      ['throw Error(error.message ?? \'An unknown error occured\');', 'throw Error(error.message ?? \'发生未知错误\');'],
      ['successToast(\'Saved auth config. Server will now restart!\', toast);', 'successToast(\'认证配置已保存，服务即将重启。\', toast);'],
      ['errorToast(`${e}`, toast, 4000);', 'errorToast(`保存认证配置失败：${e}`, toast, 4000);'],
      ['      <Button onClick={handleSaveAuthConfigClicked}>Save</Button>', '      <Button onClick={handleSaveAuthConfigClicked}>保存</Button>']
    ]
  },
  {
    file: 'client/src/components/settings/adminSettings/AdminSettings.tsx',
    replacements: [
      ['errorToast(\'Failed to import backup\', toast);', 'errorToast(\'导入备份失败。\', toast);'],
      ['errorToast(\'Data could not be exported.\', toast);', 'errorToast(\'导出备份失败。\', toast);'],
      ['      <Heading as="h4" size="md" mb="2" mt="2">', '      <Heading as="h4" size="md" mb="2" mt="2">'],
      ['        Export Backup', '        导出备份'],
      ['        Export your entire Yaade data into a single file that can be used to restore your', '        把整个 Yaade 数据导出成一个备份文件，后续可用于恢复。'],
      ['        data.', '        '],
      ['        Export', '        导出'],
      ['        Import Backup', '        导入备份'],
      ['        Import a backup file. Make sure to backup your data before importing or else data', '        导入备份文件。请先自行备份当前数据，否则现有数据可能会被覆盖。'],
      ['        could be lost.', '        '],
      ['          I acknowledge that importing a backup file will result in a complete loss of my', '          我已知晓：导入备份会完全覆盖当前数据，且无法恢复。'],
      ['          current data with no way of recovery.', '          '],
      ['        Import', '        导入']
    ]
  }
]

function patchFile(rootDir, { file, replacements }) {
  const fullPath = path.join(rootDir, file)
  let content = fs.readFileSync(fullPath, 'utf8')
  for (const [from, to] of replacements) {
    if (!content.includes(from)) {
      throw new Error(`Expected snippet not found in ${file}: ${from}`)
    }
    content = content.replaceAll(from, to)
  }
  fs.writeFileSync(fullPath, content, 'utf8')
  console.log(`patched ${file}`)
}

for (const entry of fileReplacements) {
  patchFile(sourceRoot, entry)
}
