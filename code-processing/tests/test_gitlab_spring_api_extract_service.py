import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import GitlabCodeStructureRepository, GitlabSpringApiExtractRequest
from app.services.gitlab_code_structure_service import GitlabCodeStructureWorkspace
from app.services.gitlab_spring_api_extract_service import extract_gitlab_spring_apis


class GitlabSpringApiExtractServiceTests(unittest.TestCase):
    """验证 GitLab Spring API 抽取服务的核心注释和参数解析能力。"""

    def _build_repository(self) -> GitlabCodeStructureRepository:
        return GitlabCodeStructureRepository(
            bindingId="7",
            displayName="group/backend-demo",
            projectRef="group/backend-demo",
            projectPath="group/backend-demo",
            repoUrl="http://gitlab.example.com/group/backend-demo.git",
            targetBranch="main",
            apiBaseUrl="http://gitlab.example.com/api/v4",
            authToken="token-1",
        )

    def test_should_extract_controller_comments_params_body_enum_values_and_controller_metadata(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            source_dir = repo_dir / "src" / "main" / "java" / "com" / "demo"
            source_dir.mkdir(parents=True, exist_ok=True)
            (source_dir / "UserController.java").write_text(
                """
                package com.demo;

                import io.swagger.v3.oas.annotations.Parameter;
                import io.swagger.v3.oas.annotations.media.Schema;
                import io.swagger.v3.oas.annotations.tags.Tag;
                import org.springframework.web.bind.annotation.*;

                /**
                 * 用户管理控制器。
                 */
                @RestController
                @Tag(name = "用户管理")
                @RequestMapping("/api/users")
                public class UserController {
                    /**
                     * 查询用户详情。
                     * @param id 用户ID
                     * @param keyword 搜索关键词
                     */
                    @GetMapping("/{id}")
                    public UserRequest detail(@Parameter(description = "用户主键") @PathVariable Long id,
                                              @Parameter(description = "关键字检索词") @RequestParam(required = false) String keyword,
                                              @Parameter(description = "租户编码", schema = @Schema(description = "租户编码枚举")) @RequestHeader(name = "X-Tenant", required = false) String tenant) {
                        return null;
                    }

                    /** 创建用户。 */
                    @PostMapping
                    public void create(@RequestBody UserRequest request) {
                    }

                    /** 重复接口。 */
                    @GetMapping("/{id}")
                    public UserRequest duplicated(@PathVariable Long id) {
                        return null;
                    }
                }
                """,
                encoding="utf-8",
            )
            (source_dir / "OrderController.java").write_text(
                """
                package com.demo;

                import io.swagger.annotations.Api;
                import org.springframework.web.bind.annotation.*;

                @RestController
                @Api(tags = {"订单中心"})
                @RequestMapping("/api/orders")
                public class OrderController {
                    /** 查询订单详情。 */
                    @GetMapping("/{id}")
                    public void detail(@PathVariable Long id) {
                    }
                }
                """,
                encoding="utf-8",
            )
            (source_dir / "AuditController.java").write_text(
                """
                package com.demo;

                import org.springframework.web.bind.annotation.*;

                /**
                 * 审计日志
                 * 用于追踪关键事件。
                 */
                @RestController
                @RequestMapping("/api/audits")
                public class AuditController {
                    @GetMapping
                    public void page() {
                    }
                }
                """,
                encoding="utf-8",
            )
            (source_dir / "PlainController.java").write_text(
                """
                package com.demo;

                import org.springframework.web.bind.annotation.*;

                @RestController
                @RequestMapping("/api/plain")
                public class PlainController {
                    @GetMapping
                    public void page() {
                    }
                }
                """,
                encoding="utf-8",
            )
            (source_dir / "UserRequest.java").write_text(
                """
                package com.demo;

                import io.swagger.v3.oas.annotations.media.Schema;

                public class UserRequest {
                    @Schema(description = "用户姓名")
                    private String name;

                    @Schema(description = "用户状态")
                    private UserStatus status;
                }
                """,
                encoding="utf-8",
            )
            (source_dir / "UserStatus.java").write_text(
                """
                package com.demo;

                public enum UserStatus {
                    /** 启用 */
                    ENABLED,
                    /** 停用 */
                    DISABLED
                }
                """,
                encoding="utf-8",
            )
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=repo_dir,
                log_file=Path(temp_dir) / "code-structure.log",
            )

            with patch("app.services.gitlab_spring_api_extract_service._workspace_for", return_value=workspace), \
                    patch("app.services.gitlab_spring_api_extract_service._reclone_repository", return_value=repo_dir), \
                    patch("app.services.gitlab_spring_api_extract_service._current_head_commit", return_value="fixed-sha"):
                response = extract_gitlab_spring_apis(GitlabSpringApiExtractRequest(repository=self._build_repository()))

        self.assertEqual("main", response.branchName)
        self.assertEqual("fixed-sha", response.commitSha)
        self.assertEqual(6, response.scannedCount)
        self.assertEqual(5, len(response.endpoints))
        detail = next(item for item in response.endpoints if item.path == "/api/users/{id}")
        self.assertEqual("/api/users/{id}", detail.path)
        self.assertEqual("查询用户详情", detail.name)
        self.assertEqual("id", detail.pathParams[0].name)
        self.assertEqual("用户主键", detail.pathParams[0].description)
        self.assertEqual("keyword", detail.queryParams[0].name)
        self.assertFalse(detail.queryParams[0].required)
        self.assertEqual("关键字检索词", detail.queryParams[0].description)
        self.assertEqual("X-Tenant", detail.headers[0].name)
        self.assertEqual("租户编码", detail.headers[0].description)
        self.assertEqual("com.demo.UserController", detail.controllerSignature)
        self.assertEqual("UserController", detail.controllerClassName)
        self.assertEqual("用户管理", detail.controllerDisplayName)
        create = next(item for item in response.endpoints if item.path == "/api/users")
        body = json.loads(create.bodyExample)
        self.assertEqual("", body["name"])
        self.assertEqual("ENABLED", body["status"])
        self.assertEqual("name", create.bodyFields[0].name)
        self.assertEqual("用户姓名", create.bodyFields[0].description)
        self.assertEqual("用户状态", create.bodyFields[1].description)
        self.assertEqual(detail.controllerSignature, create.controllerSignature)
        order = next(item for item in response.endpoints if item.path == "/api/orders/{id}")
        self.assertEqual("订单中心", order.controllerDisplayName)
        audit = next(item for item in response.endpoints if item.path == "/api/audits")
        self.assertEqual("审计日志", audit.controllerDisplayName)
        plain = next(item for item in response.endpoints if item.path == "/api/plain")
        self.assertEqual("PlainController", plain.controllerDisplayName)
        self.assertTrue(any("接口重复" in warning for warning in response.warnings))


if __name__ == "__main__":
    unittest.main()
