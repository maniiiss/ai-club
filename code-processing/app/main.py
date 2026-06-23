import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import document_router, execution_workspace_router, repo_scan_router, router
from app.api.lightrag_routes import router as lightrag_router
from app.mcp_server import mcp_lifespan, mcp_server
from app.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="AI Agent Code Processing Service", version="0.1.0", lifespan=mcp_lifespan)
app.include_router(router)
app.include_router(repo_scan_router)
app.include_router(document_router)
app.include_router(execution_workspace_router)
app.include_router(lightrag_router)
mcp_http_app = mcp_server.streamable_http_app()
app.mount("/mcp", mcp_http_app)


@app.middleware("http")
async def authenticate_mcp_bridge(request: Request, call_next):
    """
    只对 `/mcp` 开头的请求校验 Hermes 与 bridge 之间的共享 Bearer Token。
    普通代码处理接口仍保持现有行为，不受 MCP 专用鉴权影响。
    """
    if request.url.path.startswith("/mcp"):
        expected_header = f"Bearer {settings.hermes_mcp_shared_token}"
        actual_header = request.headers.get("Authorization", "").strip()
        if actual_header != expected_header:
            return JSONResponse(status_code=401, content={"detail": "Hermes MCP 鉴权失败"})
        if request.scope.get("path") == "/mcp":
            request.scope["path"] = "/mcp/"
            request.scope["raw_path"] = b"/mcp/"
    return await call_next(request)


@app.get("/health")
def health() -> dict:
    return {"status": "UP"}
