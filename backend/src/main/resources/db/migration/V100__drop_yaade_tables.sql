-- Yaade 清栈：删除 V66 migration 创建的 platform_yaade_* 绑定表。
-- 业务侧 Yaade 集成已经迁移到原生 API Studio（V98 + V99），
-- 详见设计文档 docs/api-studio-native-technical-design-v1.md。

DROP TABLE IF EXISTS platform_yaade_user_binding;
DROP TABLE IF EXISTS platform_yaade_project_binding;
