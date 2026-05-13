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

    def test_should_extract_controller_comments_params_body_and_enum_values(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            source_dir = repo_dir / "src" / "main" / "java" / "com" / "demo"
            source_dir.mkdir(parents=True, exist_ok=True)
            (source_dir / "UserController.java").write_text(
                """
                package com.demo;

                import org.springframework.web.bind.annotation.*;

                @RestController
                @RequestMapping("/api/users")
                public class UserController {
                    /**
                     * 查询用户详情。
                     * @param id 用户ID
                     * @param keyword 搜索关键词
                     */
                    @GetMapping("/{id}")
                    public UserRequest detail(@PathVariable Long id,
                                              @RequestParam(required = false) String keyword,
                                              @RequestHeader(name = "X-Tenant", required = false) String tenant) {
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
            (source_dir / "UserRequest.java").write_text(
                """
                package com.demo;

                public class UserRequest {
                    /** 用户姓名 */
                    private String name;

                    /** 用户状态 */
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
        self.assertEqual(3, response.scannedCount)
        self.assertEqual(2, len(response.endpoints))
        detail = next(item for item in response.endpoints if item.method == "GET")
        self.assertEqual("/api/users/{id}", detail.path)
        self.assertEqual("查询用户详情", detail.name)
        self.assertEqual("id", detail.pathParams[0].name)
        self.assertEqual("keyword", detail.queryParams[0].name)
        self.assertFalse(detail.queryParams[0].required)
        self.assertEqual("X-Tenant", detail.headers[0].name)
        create = next(item for item in response.endpoints if item.method == "POST")
        body = json.loads(create.bodyExample)
        self.assertEqual("", body["name"])
        self.assertEqual("ENABLED", body["status"])
        self.assertTrue(any("接口重复" in warning for warning in response.warnings))


if __name__ == "__main__":
    unittest.main()
