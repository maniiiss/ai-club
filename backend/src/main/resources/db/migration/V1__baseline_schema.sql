-- AI 代理工程管理平台基线表结构。

CREATE TABLE permission_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL,
    path VARCHAR(200),
    component VARCHAR(200),
    icon VARCHAR(50) NOT NULL DEFAULT '',
    parent_id BIGINT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    built_in BOOLEAN NOT NULL DEFAULT FALSE,
    description VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE role_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(100) NOT NULL UNIQUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    built_in BOOLEAN NOT NULL DEFAULT FALSE,
    description VARCHAR(500) NOT NULL DEFAULT ''
);

CREATE TABLE role_permission_rel (
    role_id BIGINT NOT NULL,
    permission_id BIGINT NOT NULL,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES role_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES permission_info(id) ON DELETE CASCADE
);

CREATE TABLE user_info (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    gitlab_username VARCHAR(100) NOT NULL DEFAULT '',
    avatar_url VARCHAR(255) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    built_in BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMP
);

CREATE TABLE user_role_rel (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES role_info(id) ON DELETE CASCADE
);

CREATE TABLE project_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner VARCHAR(50) NOT NULL,
    owner_user_id BIGINT,
    status VARCHAR(30) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    CONSTRAINT fk_project_owner_user FOREIGN KEY (owner_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE project_member_rel (
    project_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT fk_project_member_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_member_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE TABLE ai_model_config (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    provider VARCHAR(30) NOT NULL,
    api_base_url VARCHAR(255) NOT NULL,
    model_name VARCHAR(120) NOT NULL,
    api_key_ciphertext TEXT NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE agent_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    access_type VARCHAR(20) NOT NULL DEFAULT 'BUILT_IN',
    builtin_code VARCHAR(50),
    category VARCHAR(30) NOT NULL,
    status VARCHAR(30) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    capability VARCHAR(500) NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    ai_model_config_id BIGINT,
    system_prompt TEXT,
    user_prompt_template TEXT,
    endpoint_url VARCHAR(500),
    runtime_type VARCHAR(30),
    runtime_agent_ref VARCHAR(100),
    runtime_session_key_template VARCHAR(500),
    http_method VARCHAR(10),
    http_headers TEXT,
    http_auth_type VARCHAR(20),
    http_auth_token_ciphertext TEXT,
    http_request_template TEXT,
    http_response_path VARCHAR(255),
    timeout_seconds INTEGER,
    project_id BIGINT,
    CONSTRAINT fk_agent_ai_model FOREIGN KEY (ai_model_config_id) REFERENCES ai_model_config(id) ON DELETE SET NULL,
    CONSTRAINT fk_agent_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE SET NULL
);

CREATE TABLE iteration_info (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    goal VARCHAR(500) NOT NULL DEFAULT '',
    status VARCHAR(30) NOT NULL,
    start_date DATE,
    end_date DATE,
    description VARCHAR(1000) NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_iteration_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
);

CREATE TABLE task_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(30) NOT NULL,
    work_item_type VARCHAR(20) NOT NULL DEFAULT '任务',
    status VARCHAR(30) NOT NULL,
    priority VARCHAR(30) NOT NULL,
    assignee VARCHAR(50) NOT NULL,
    assignee_user_id BIGINT,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    description TEXT NOT NULL DEFAULT '',
    project_id BIGINT NOT NULL,
    agent_id BIGINT,
    iteration_id BIGINT,
    requirement_task_id BIGINT,
    CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_agent FOREIGN KEY (agent_id) REFERENCES agent_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_iteration FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_requirement FOREIGN KEY (requirement_task_id) REFERENCES task_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_assignee_user FOREIGN KEY (assignee_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE task_collaborator_rel (
    task_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (task_id, user_id),
    CONSTRAINT fk_task_collaborator_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_collaborator_user FOREIGN KEY (user_id) REFERENCES user_info(id) ON DELETE CASCADE
);

CREATE TABLE task_comment (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    author_user_id BIGINT,
    author_name VARCHAR(100) NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_comment_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_comment_author FOREIGN KEY (author_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE task_agent_run_log (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL,
    agent_id BIGINT,
    requester_user_id BIGINT,
    status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
    input_text TEXT NOT NULL DEFAULT '',
    output_text TEXT,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_task_agent_run_task FOREIGN KEY (task_id) REFERENCES task_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_agent_run_agent FOREIGN KEY (agent_id) REFERENCES agent_info(id) ON DELETE SET NULL,
    CONSTRAINT fk_task_agent_run_requester FOREIGN KEY (requester_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE test_plan_info (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT '草稿',
    description VARCHAR(2000) NOT NULL DEFAULT '',
    project_id BIGINT NOT NULL,
    iteration_id BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_test_plan_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_test_plan_iteration FOREIGN KEY (iteration_id) REFERENCES iteration_info(id) ON DELETE SET NULL
);

CREATE TABLE test_case_info (
    id BIGSERIAL PRIMARY KEY,
    test_plan_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    module_name VARCHAR(120) NOT NULL DEFAULT '',
    case_type VARCHAR(30) NOT NULL DEFAULT '功能测试',
    priority VARCHAR(20) NOT NULL DEFAULT 'P2',
    precondition TEXT NOT NULL DEFAULT '',
    remarks TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_test_case_plan FOREIGN KEY (test_plan_id) REFERENCES test_plan_info(id) ON DELETE CASCADE
);

CREATE TABLE test_case_step_info (
    id BIGSERIAL PRIMARY KEY,
    test_case_id BIGINT NOT NULL,
    step_no INTEGER NOT NULL DEFAULT 1,
    action TEXT NOT NULL DEFAULT '',
    expected_result TEXT NOT NULL DEFAULT '',
    CONSTRAINT fk_test_case_step_case FOREIGN KEY (test_case_id) REFERENCES test_case_info(id) ON DELETE CASCADE
);

CREATE TABLE notification_message (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id BIGINT NOT NULL,
    sender_user_id BIGINT,
    sender_name VARCHAR(100) NOT NULL DEFAULT '',
    type VARCHAR(30) NOT NULL,
    level VARCHAR(20) NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    biz_type VARCHAR(40),
    biz_id BIGINT,
    action_url VARCHAR(300),
    read_flag BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    CONSTRAINT fk_notification_recipient FOREIGN KEY (recipient_user_id) REFERENCES user_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_notification_sender FOREIGN KEY (sender_user_id) REFERENCES user_info(id) ON DELETE SET NULL
);

CREATE TABLE project_gitlab_binding (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE,
    api_base_url VARCHAR(255) NOT NULL,
    gitlab_project_ref VARCHAR(255) NOT NULL,
    gitlab_project_id VARCHAR(100),
    gitlab_project_name VARCHAR(200),
    gitlab_project_path VARCHAR(255),
    gitlab_project_web_url VARCHAR(255),
    default_target_branch VARCHAR(100),
    token_ciphertext TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_test_status VARCHAR(30),
    last_test_message VARCHAR(500),
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_gitlab_binding_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE
);

CREATE TABLE jenkins_server_config (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    username VARCHAR(100) NOT NULL,
    token_ciphertext TEXT NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_test_status VARCHAR(30),
    last_test_message VARCHAR(500),
    last_tested_at TIMESTAMP,
    last_job_count INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_pipeline_binding (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE,
    jenkins_server_id BIGINT NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    job_url VARCHAR(500),
    default_branch VARCHAR(100),
    build_parameters_json TEXT,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    last_trigger_status VARCHAR(30),
    last_trigger_message VARCHAR(500),
    last_triggered_at TIMESTAMP,
    last_trigger_url VARCHAR(500),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_project_pipeline_binding_project FOREIGN KEY (project_id) REFERENCES project_info(id) ON DELETE CASCADE,
    CONSTRAINT fk_project_pipeline_binding_server FOREIGN KEY (jenkins_server_id) REFERENCES jenkins_server_config(id) ON DELETE RESTRICT
);

CREATE TABLE gitlab_auto_merge_config (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    execution_mode VARCHAR(20) NOT NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    binding_id BIGINT,
    api_base_url VARCHAR(255),
    gitlab_project_ref VARCHAR(255),
    token_ciphertext TEXT,
    source_branch VARCHAR(100),
    target_branch VARCHAR(100),
    title_keyword VARCHAR(120),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    auto_merge BOOLEAN NOT NULL DEFAULT TRUE,
    squash_on_merge BOOLEAN NOT NULL DEFAULT FALSE,
    remove_source_branch BOOLEAN NOT NULL DEFAULT TRUE,
    trigger_pipeline_after_merge BOOLEAN NOT NULL DEFAULT FALSE,
    require_pipeline_success BOOLEAN NOT NULL DEFAULT TRUE,
    ai_model_config_id BIGINT,
    review_agent_id BIGINT,
    ai_review_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ai_review_prompt TEXT,
    scheduler_cron VARCHAR(100),
    scheduler_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_run_status VARCHAR(30),
    last_run_message VARCHAR(500),
    last_run_at TIMESTAMP,
    last_scheduled_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auto_merge_binding FOREIGN KEY (binding_id) REFERENCES project_gitlab_binding(id) ON DELETE SET NULL,
    CONSTRAINT fk_auto_merge_model FOREIGN KEY (ai_model_config_id) REFERENCES ai_model_config(id) ON DELETE SET NULL,
    CONSTRAINT fk_auto_merge_agent FOREIGN KEY (review_agent_id) REFERENCES agent_info(id) ON DELETE SET NULL
);

CREATE TABLE gitlab_auto_merge_log (
    id BIGSERIAL PRIMARY KEY,
    config_id BIGINT,
    config_name VARCHAR(120) NOT NULL,
    trigger_type VARCHAR(20) NOT NULL,
    merge_request_iid BIGINT,
    merge_request_title VARCHAR(255),
    merge_request_author_name VARCHAR(255),
    merge_request_author_username VARCHAR(100),
    result VARCHAR(30) NOT NULL,
    reason TEXT NOT NULL,
    detail_markdown TEXT,
    web_url VARCHAR(500),
    executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_auto_merge_log_config FOREIGN KEY (config_id) REFERENCES gitlab_auto_merge_config(id) ON DELETE SET NULL
);

CREATE TABLE kg_node (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    node_type VARCHAR(40) NOT NULL,
    biz_id BIGINT NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE kg_edge (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT NOT NULL,
    from_node_id BIGINT NOT NULL,
    to_node_id BIGINT NOT NULL,
    edge_type VARCHAR(50) NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
    confidence NUMERIC(5, 4) NOT NULL DEFAULT 1.0000,
    status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED',
    evidence_text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_kg_edge_from_node FOREIGN KEY (from_node_id) REFERENCES kg_node(id) ON DELETE CASCADE,
    CONSTRAINT fk_kg_edge_to_node FOREIGN KEY (to_node_id) REFERENCES kg_node(id) ON DELETE CASCADE
);

CREATE INDEX idx_project_owner_user_id ON project_info(owner_user_id);
CREATE INDEX idx_agent_project_id ON agent_info(project_id);
CREATE INDEX idx_agent_ai_model_config_id ON agent_info(ai_model_config_id);
CREATE INDEX idx_iteration_project_id ON iteration_info(project_id);
CREATE INDEX idx_task_project_id ON task_info(project_id);
CREATE INDEX idx_task_agent_id ON task_info(agent_id);
CREATE INDEX idx_task_iteration_id ON task_info(iteration_id);
CREATE INDEX idx_task_requirement_task_id ON task_info(requirement_task_id);
CREATE INDEX idx_task_assignee_user_id ON task_info(assignee_user_id);
CREATE INDEX idx_task_comment_task_id ON task_comment(task_id);
CREATE INDEX idx_task_agent_run_task_id ON task_agent_run_log(task_id);
CREATE INDEX idx_test_plan_project_id ON test_plan_info(project_id);
CREATE INDEX idx_test_plan_iteration_id ON test_plan_info(iteration_id);
CREATE INDEX idx_test_case_test_plan_id ON test_case_info(test_plan_id);
CREATE INDEX idx_notification_recipient_user_id ON notification_message(recipient_user_id);
CREATE INDEX idx_project_pipeline_binding_server_id ON project_pipeline_binding(jenkins_server_id);
CREATE INDEX idx_auto_merge_binding_id ON gitlab_auto_merge_config(binding_id);
CREATE INDEX idx_auto_merge_review_agent_id ON gitlab_auto_merge_config(review_agent_id);
CREATE INDEX idx_auto_merge_log_config_id ON gitlab_auto_merge_log(config_id);
CREATE INDEX idx_kg_node_project_id ON kg_node(project_id);
CREATE INDEX idx_kg_node_project_biz ON kg_node(project_id, node_type, biz_id);
CREATE INDEX idx_kg_edge_project_id ON kg_edge(project_id);

INSERT INTO permission_info (id, name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description) VALUES
    (1, '首页看板', 'dashboard:view', 'MENU', '/dashboard', 'DashboardView', 'House', NULL, 10, TRUE, TRUE, '查看首页看板'),
    (2, '项目管理', 'project:view', 'MENU', '/projects', 'ProjectView', 'FolderOpened', NULL, 20, TRUE, TRUE, '查看项目管理页面'),
    (3, '项目维护', 'project:manage', 'ACTION', NULL, NULL, '', NULL, 21, TRUE, TRUE, '维护项目、迭代与知识图谱'),
    (4, 'Agent管理', 'agent:view', 'MENU', '/agents', 'AgentView', 'Cpu', NULL, 30, TRUE, TRUE, '查看 Agent 管理页面'),
    (5, 'Agent维护', 'agent:manage', 'ACTION', NULL, NULL, '', NULL, 31, TRUE, TRUE, '维护 Agent 配置'),
    (6, '任务管理', 'task:view', 'MENU', '/tasks', 'TaskView', 'Tickets', NULL, 40, TRUE, TRUE, '查看任务管理页面'),
    (7, '任务维护', 'task:manage', 'ACTION', NULL, NULL, '', NULL, 41, TRUE, TRUE, '维护任务、工作项与流程操作'),
    (8, '测试管理', 'test:view', 'MENU', '/tests', 'TestPlanView', 'DocumentChecked', NULL, 50, TRUE, TRUE, '查看测试计划页面'),
    (9, '测试维护', 'test:manage', 'ACTION', NULL, NULL, '', NULL, 51, TRUE, TRUE, '维护测试计划和测试用例'),
    (10, '模型管理', 'model:view', 'MENU', '/models', 'ModelView', 'Monitor', NULL, 60, TRUE, TRUE, '查看模型配置页面'),
    (11, '模型维护', 'model:manage', 'ACTION', NULL, NULL, '', NULL, 61, TRUE, TRUE, '维护模型配置'),
    (12, 'GitLab管理', 'gitlab:view', 'MENU', '/gitlab', 'GitlabView', 'Connection', NULL, 70, TRUE, TRUE, '查看 GitLab 管理页面'),
    (13, 'GitLab维护', 'gitlab:manage', 'ACTION', NULL, NULL, '', NULL, 71, TRUE, TRUE, '维护 GitLab 绑定与自动合并'),
    (14, 'CI/CD管理', 'cicd:view', 'MENU', '/cicd', 'CicdView', 'Promotion', NULL, 80, TRUE, TRUE, '查看 CI/CD 管理页面'),
    (15, 'CI/CD维护', 'cicd:manage', 'ACTION', NULL, NULL, '', NULL, 81, TRUE, TRUE, '维护 Jenkins 与流水线'),
    (16, '用户管理', 'system:user:view', 'MENU', '/users', 'UserView', 'User', NULL, 90, TRUE, TRUE, '查看用户管理页面'),
    (17, '用户维护', 'system:user:manage', 'ACTION', NULL, NULL, '', NULL, 91, TRUE, TRUE, '维护用户并发布系统公告'),
    (18, '角色管理', 'system:role:view', 'MENU', '/roles', 'RoleView', 'Avatar', NULL, 100, TRUE, TRUE, '查看角色管理页面'),
    (19, '角色维护', 'system:role:manage', 'ACTION', NULL, NULL, '', NULL, 101, TRUE, TRUE, '维护角色配置'),
    (20, '权限管理', 'system:permission:view', 'MENU', '/permissions', 'PermissionView', 'Lock', NULL, 110, TRUE, TRUE, '查看权限管理页面'),
    (21, '权限维护', 'system:permission:manage', 'ACTION', NULL, NULL, '', NULL, 111, TRUE, TRUE, '维护功能权限');

INSERT INTO role_info (id, name, code, enabled, built_in, description) VALUES
    (1, '超级管理员', 'SUPER_ADMIN', TRUE, TRUE, '拥有平台全部功能权限');

INSERT INTO role_permission_rel (role_id, permission_id)
SELECT 1, id FROM permission_info;

INSERT INTO user_info (id, username, password_hash, nickname, email, phone, gitlab_username, enabled, built_in)
VALUES
    (1, 'admin', '$2b$12$TilGx3ZtM6Hsy8lOeoFue.o8/2XKVw9mHgC1AejUTpMTTG8Is2W4e', '管理员', 'admin@example.com', '', 'admin', TRUE, TRUE);

INSERT INTO user_role_rel (user_id, role_id) VALUES
    (1, 1);

INSERT INTO project_info (id, name, owner, owner_user_id, status, description) VALUES
    (1, 'Agent Ops', '张三', NULL, '进行中', 'AI代理工程编排平台'),
    (2, 'Code Insight', '李四', NULL, '规划中', '代码处理与上下文分析能力'),
    (3, 'Prompt Hub', '王五', NULL, '已立项', 'Prompt模板与工具链管理');

INSERT INTO agent_info (id, name, type, access_type, builtin_code, category, status, enabled, capability, description, timeout_seconds, project_id) VALUES
    (1, 'Planner Agent', '规划', 'BUILT_IN', 'REQUIREMENT_BREAKDOWN', '需求设计', '在线', TRUE, '任务拆解 / 路线规划', '负责辅助拆解需求与规划任务', 60, 1),
    (2, 'Coder Agent', '开发', 'BUILT_IN', NULL, '开发', '在线', TRUE, '代码生成 / 改造', '负责辅助编码与工程改造', 60, 1),
    (3, 'Reviewer Agent', '评审', 'BUILT_IN', 'CODE_REVIEW', '测试', '空闲', TRUE, '代码 Review / 质量检查', '负责辅助代码审查与测试建议', 60, 2);

INSERT INTO task_info (id, name, category, work_item_type, status, priority, assignee, updated_at, description, project_id, agent_id) VALUES
    (1, '完成项目首页框架', 'UI设计', '任务', '处理中', '高', 'Coder Agent', CURRENT_TIMESTAMP, '完成管理后台首页和基础布局', 1, 2),
    (2, '设计 Agent 任务流', '技术设计', '任务', '待开始', '中', 'Planner Agent', CURRENT_TIMESTAMP, '梳理任务拆解与执行编排流程', 1, 1),
    (3, '建立代码扫描服务', '开发', '任务', '已完成', '高', 'Reviewer Agent', CURRENT_TIMESTAMP, '搭建仓库扫描和文件统计能力', 2, 3);

SELECT setval(pg_get_serial_sequence('permission_info', 'id'), (SELECT MAX(id) FROM permission_info), TRUE);
SELECT setval(pg_get_serial_sequence('role_info', 'id'), (SELECT MAX(id) FROM role_info), TRUE);
SELECT setval(pg_get_serial_sequence('user_info', 'id'), (SELECT MAX(id) FROM user_info), TRUE);
SELECT setval(pg_get_serial_sequence('project_info', 'id'), (SELECT MAX(id) FROM project_info), TRUE);
SELECT setval(pg_get_serial_sequence('agent_info', 'id'), (SELECT MAX(id) FROM agent_info), TRUE);
SELECT setval(pg_get_serial_sequence('task_info', 'id'), (SELECT MAX(id) FROM task_info), TRUE);
