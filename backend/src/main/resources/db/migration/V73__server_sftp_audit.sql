-- SFTP 功能：更新 server:terminal 权限描述，涵盖 SFTP 文件管理
UPDATE permission_info
SET description = '通过页面 SSH 终端连接服务器执行操作，以及通过 SFTP 管理远程文件'
WHERE code = 'server:terminal';
