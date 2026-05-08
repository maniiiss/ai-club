import fs from 'node:fs'
import path from 'node:path'

const sourceRoot = process.argv[2]

if (!sourceRoot) {
  console.error('Usage: node apply-zh-cn.mjs <yaade-source-root>')
  process.exit(1)
}

const fileReplacements = [
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
      ['successToast(\'A new collection was created and saved\', toast);', 'successToast(\'新集合已创建并保存。\', toast);'],
      ['successToast(\'Collection was deleted.\', toast);', 'successToast(\'集合已删除。\', toast);'],
      ['errorToast(\'Could not delete collection.\', toast);', 'errorToast(\'删除集合失败。\', toast);'],
      ['heading="Create a new request"', 'heading="新建请求"'],
      ['heading="Create a new collection"', 'heading="新建集合"'],
      ['heading={`Duplicate "${collection.name}"`}', 'heading={`复制“${collection.name}”`}'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['heading={`Delete "${collection.name}"`}', 'heading={`删除“${collection.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
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
      ['heading={`Delete "${request.name}"`}', 'heading={`删除“${request.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['Are you sure you want to delete this request?', '确定要删除这个请求吗？'],
      ['The request cannot be recovered!', '删除后将无法恢复！'],
      ['heading={`Duplicate "${request.name}"`}', 'heading={`复制“${request.name}”`}'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['                  Duplicate', '                  复制'],
      ['                  Copy Link', '                  复制链接'],
      ['                  Delete', '                  删除']
    ]
  },
  {
    file: 'client/src/components/collectionScript/CollectionScript.tsx',
    replacements: [
      ['heading={`Delete "${script.name}"`}', 'heading={`删除“${script.name}”`}'],
      ['buttonText="Delete"', 'buttonText="删除"'],
      ['Are you sure you want to delete this script?', '确定要删除这个脚本吗？'],
      ['The script cannot be recovered!', '删除后将无法恢复！'],
      ['heading={`Duplicate "${script.name}"`}', 'heading={`复制“${script.name}”`}'],
      ['buttonText="Duplicate"', 'buttonText="复制"'],
      ['                  Duplicate', '                  复制'],
      ['                  Copy Link', '                  复制链接'],
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
    file: 'client/src/components/responsePanel/ResponsePanel.tsx',
    replacements: [
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
      ['                Groups', '                分组']
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
