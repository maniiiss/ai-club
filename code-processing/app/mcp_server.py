from contextlib import AsyncExitStack, asynccontextmanager
from typing import Annotated

from fastapi import FastAPI
from mcp.server.fastmcp import Context, FastMCP
from mcp.server.transport_security import TransportSecuritySettings
from pydantic import Field

from app.services.hermes_internal_client import hermes_internal_client


mcp_server = FastMCP(
    "git_ai_club",
    host="0.0.0.0",
    transport_security=TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[
            "127.0.0.1:*",
            "localhost:*",
            "host.docker.internal:*",
        ],
        allowed_origins=[
            "http://127.0.0.1:*",
            "http://localhost:*",
            "http://host.docker.internal:*",
        ],
    ),
)
# 平台工具本身不依赖 MCP 传输层会话态，启用无状态 HTTP 可避免 Hermes 客户端因 session 生命周期问题报
# “Session terminated”，也能减少连接协商带来的额外波动。
mcp_server.settings.stateless_http = True
mcp_server.settings.streamable_http_path = "/"
SessionToken = Annotated[
    str,
    Field(
        title="System Session Token",
        description="系统注入的 MCP 会话令牌。必须原样使用当前提示词中提供的 hcs_ 开头值；不要从用户输入提取、不要改写、不要解释。",
        pattern="^hcs_[a-f0-9]{16}$",
        min_length=20,
        examples=["hcs_0123456789abcdef"],
    ),
]


async def _execute_platform_tool(
    tool_code: str,
    session_token: str,
    arguments: dict[str, object],
) -> str:
    """统一转发平台工具请求到 backend 内部接口。"""
    response = await hermes_internal_client.execute_tool(
        session_token=session_token,
        tool_code=tool_code,
        arguments=arguments,
    )
    return response.message


@mcp_server.tool()
async def project_search(system_session_token: SessionToken, keyword: str = "", ctx: Context | None = None) -> str:
    """按名称或状态搜索当前用户可见项目。"""
    return await _execute_platform_tool("project.search", system_session_token, {"keyword": keyword})


@mcp_server.tool()
async def project_get_detail(system_session_token: SessionToken, projectId: int, ctx: Context | None = None) -> str:
    """读取项目摘要与成员信息。"""
    return await _execute_platform_tool("project.get_detail", system_session_token, {"projectId": projectId})


@mcp_server.tool()
async def project_list_iterations(system_session_token: SessionToken, projectId: int, ctx: Context | None = None) -> str:
    """读取项目迭代列表。"""
    return await _execute_platform_tool("project.list_iterations", system_session_token, {"projectId": projectId})


@mcp_server.tool()
async def user_resolve_project_member(
    system_session_token: SessionToken,
    projectId: int,
    keyword: str = "",
    ctx: Context | None = None,
) -> str:
    """按昵称或用户名解析项目成员。"""
    return await _execute_platform_tool(
        "user.resolve_project_member",
        system_session_token,
        {"projectId": projectId, "keyword": keyword},
    )


@mcp_server.tool()
async def user_list_project_members(system_session_token: SessionToken, projectId: int, ctx: Context | None = None) -> str:
    """列出项目负责人、创建人和成员。"""
    return await _execute_platform_tool("user.list_project_members", system_session_token, {"projectId": projectId})


@mcp_server.tool()
async def work_item_search(
    system_session_token: SessionToken,
    keyword: str = "",
    projectId: int | None = None,
    ctx: Context | None = None,
) -> str:
    """按标题、编号或说明搜索需求、任务、缺陷。"""
    arguments: dict[str, object] = {"keyword": keyword}
    if projectId is not None:
        arguments["projectId"] = projectId
    return await _execute_platform_tool("work_item.search", system_session_token, arguments)


@mcp_server.tool()
async def work_item_get_detail(system_session_token: SessionToken, workItemId: int, ctx: Context | None = None) -> str:
    """读取工作项详情和评论摘要。"""
    return await _execute_platform_tool("work_item.get_detail", system_session_token, {"workItemId": workItemId})


@mcp_server.tool()
async def agent_list_available(system_session_token: SessionToken, projectId: int | None = None, ctx: Context | None = None) -> str:
    """查询全局和项目可用 Agent。"""
    arguments: dict[str, object] = {}
    if projectId is not None:
        arguments["projectId"] = projectId
    return await _execute_platform_tool("agent.list_available", system_session_token, arguments)


@mcp_server.tool()
async def agent_get_detail(system_session_token: SessionToken, agentId: int, ctx: Context | None = None) -> str:
    """读取 Agent 类型、接入方式和能力。"""
    return await _execute_platform_tool("agent.get_detail", system_session_token, {"agentId": agentId})


@mcp_server.tool()
async def gitlab_binding_search(
    system_session_token: SessionToken,
    keyword: str = "",
    projectId: int | None = None,
    ctx: Context | None = None,
) -> str:
    """按项目名或仓库路径搜索 GitLab 绑定仓库。"""
    arguments: dict[str, object] = {"keyword": keyword}
    if projectId is not None:
        arguments["projectId"] = projectId
    return await _execute_platform_tool("gitlab_binding.search", system_session_token, arguments)


@mcp_server.tool()
async def repo_scan_list_rulesets(system_session_token: SessionToken, ctx: Context | None = None) -> str:
    """列出可用于仓库规范扫描的规则集。"""
    return await _execute_platform_tool("repo_scan.list_rulesets", system_session_token, {})


@mcp_server.tool()
async def repo_scan_start(
    system_session_token: SessionToken,
    bindingId: int,
    rulesetCode: str,
    branch: str = "",
    ctx: Context | None = None,
) -> str:
    """发起仓库规范扫描提案；这是代码扫描唯一正确的写工具，不要用 execution_task_create 代替。"""
    arguments: dict[str, object] = {
        "bindingId": bindingId,
        "rulesetCode": rulesetCode,
    }
    if branch.strip():
        arguments["branch"] = branch.strip()
    return await _execute_platform_tool("repo_scan.start", system_session_token, arguments)


@mcp_server.tool()
async def repo_scan_search(
    system_session_token: SessionToken,
    bindingId: int | None = None,
    status: str = "",
    ctx: Context | None = None,
) -> str:
    """查询最近的仓库规范扫描任务。"""
    arguments: dict[str, object] = {}
    if bindingId is not None:
        arguments["bindingId"] = bindingId
    if status.strip():
        arguments["status"] = status.strip()
    return await _execute_platform_tool("repo_scan.search", system_session_token, arguments)


@mcp_server.tool()
async def execution_task_search(system_session_token: SessionToken, keyword: str = "", ctx: Context | None = None) -> str:
    """按项目、工作项、状态或场景搜索执行任务。"""
    return await _execute_platform_tool("execution_task.search", system_session_token, {"keyword": keyword})


@mcp_server.tool()
async def execution_task_get_detail(system_session_token: SessionToken, executionTaskId: int, ctx: Context | None = None) -> str:
    """读取执行任务、运行、步骤和产物。"""
    return await _execute_platform_tool(
        "execution_task.get_detail",
        system_session_token,
        {"executionTaskId": executionTaskId},
    )


@mcp_server.tool()
async def test_plan_search(system_session_token: SessionToken, keyword: str = "", ctx: Context | None = None) -> str:
    """按项目、迭代、状态或关键词查询测试计划。"""
    return await _execute_platform_tool("test_plan.search", system_session_token, {"keyword": keyword})


@mcp_server.tool()
async def test_plan_get_detail(system_session_token: SessionToken, testPlanId: int, ctx: Context | None = None) -> str:
    """读取测试计划和测试用例。"""
    return await _execute_platform_tool("test_plan.get_detail", system_session_token, {"testPlanId": testPlanId})


@mcp_server.tool()
async def work_item_create_draft(
    system_session_token: SessionToken,
    projectId: int,
    workItemType: str = "需求",
    name: str = "",
    content: str = "",
    iterationId: int | None = None,
    assigneeUserId: int | None = None,
    ctx: Context | None = None,
) -> str:
    """创建工作项草稿提案，不直接落库。"""
    arguments: dict[str, object] = {
        "projectId": projectId,
        "workItemType": workItemType,
        "name": name,
        "content": content,
    }
    if iterationId is not None:
        arguments["iterationId"] = iterationId
    if assigneeUserId is not None:
        arguments["assigneeUserId"] = assigneeUserId
    return await _execute_platform_tool("work_item.create_draft", system_session_token, arguments)


@mcp_server.tool()
async def execution_task_create(
    system_session_token: SessionToken,
    projectId: int | None = None,
    workItemId: int | None = None,
    scenarioCode: str = "",
    ctx: Context | None = None,
) -> str:
    """创建基于已有工作项的执行任务提案；不用于仓库代码扫描，代码扫描请改用 repo_scan_start。"""
    arguments: dict[str, object] = {"scenarioCode": scenarioCode}
    if projectId is not None:
        arguments["projectId"] = projectId
    if workItemId is not None:
        arguments["workItemId"] = workItemId
    return await _execute_platform_tool("execution_task.create", system_session_token, arguments)


@mcp_server.tool()
async def test_plan_create_draft(
    system_session_token: SessionToken,
    projectId: int,
    iterationId: int,
    name: str = "",
    description: str = "",
    ctx: Context | None = None,
) -> str:
    """创建测试计划草稿提案，不直接落库。"""
    return await _execute_platform_tool(
        "test_plan.create_draft",
        system_session_token,
        {
            "projectId": projectId,
            "iterationId": iterationId,
            "name": name,
            "description": description,
        },
    )


@asynccontextmanager
async def mcp_lifespan(_: FastAPI):
    """确保 FastMCP 的 session manager 与 FastAPI 生命周期保持一致。"""
    async with AsyncExitStack() as stack:
        await stack.enter_async_context(mcp_server.session_manager.run())
        yield
