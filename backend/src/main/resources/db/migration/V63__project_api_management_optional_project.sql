-- API 管理调整为独立菜单后，允许接口资产不绑定项目。

ALTER TABLE project_api_profile
    ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_api_folder
    ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_api_endpoint
    ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_api_environment
    ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE project_api_debug_record
    ALTER COLUMN project_id DROP NOT NULL;
