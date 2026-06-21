import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import APIRouter
from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CodeChange
from app.models import ReviewRequest
from app.models import ReviewResponse
import app.services.review_service as review_service_module
from app.services.review_service import ReviewProviderError
from app.services.review_service import _build_prompt
from app.services.review_service import review_code


class ReviewServiceTests(unittest.TestCase):
    """验证代码审查提示词和降级 Markdown 文案不会输出乱码。"""

    def _build_request(self) -> ReviewRequest:
        return ReviewRequest(
            provider="OPENAI",
            apiBaseUrl="https://api.example.com",
            apiKey="sk-test",
            model="gpt-test",
            prompt="请执行代码审查",
            mergeRequestTitle="修复空指针",
            mergeRequestDescription="补充空值判断",
            changes=[
                CodeChange(
                    oldPath="service.py",
                    newPath="service.py",
                    diff="+ if value is None:\n+     return None",
                )
            ],
        )

    def test_should_build_prompt_with_chinese_review_markdown_example(self):
        prompt = _build_prompt(self._build_request())

        self.assertIn('"reviewMarkdown": "# 代码审查', prompt)
        self.assertIn("resolvedPreviousIssues", prompt)
        self.assertIn("## 历史问题修复情况", prompt)
        self.assertIn("## 修改建议", prompt)
        self.assertNotIn("????", prompt)

    def test_should_include_previous_issues_in_prompt_when_history_exists(self):
        request = self._build_request().model_copy(update={
            "previousIssues": ["补充空值判断", "补充鉴权校验"],
        })

        prompt = _build_prompt(request)

        self.assertIn("Previous Issues From Last Rejected Review", prompt)
        self.assertIn("- 补充空值判断", prompt)
        self.assertIn("- 补充鉴权校验", prompt)

    def test_should_include_default_medium_review_strictness_rules_in_prompt(self):
        prompt = _build_prompt(self._build_request())

        self.assertIn("Platform Final Auto-Merge Gate", prompt)
        self.assertIn("当前严格度：中（MEDIUM）", prompt)
        self.assertIn("严重风险或中等风险", prompt)
        self.assertIn("历史问题未修复", prompt)

    def test_should_include_high_review_strictness_rules_in_prompt(self):
        request = self._build_request().model_copy(update={
            "reviewStrictness": "HIGH",
        })

        prompt = _build_prompt(request)

        self.assertIn("当前严格度：高（HIGH）", prompt)
        self.assertIn("明确不规范", prompt)
        self.assertIn("缺少必要测试", prompt)

    def test_should_include_low_review_strictness_rules_in_prompt(self):
        request = self._build_request().model_copy(update={
            "reviewStrictness": "LOW",
        })

        prompt = _build_prompt(request)

        self.assertIn("当前严格度：低（LOW）", prompt)
        self.assertIn("仅当问题会导致线上故障", prompt)
        self.assertIn("纯风格", prompt)

    @patch("app.services.review_service._call_provider")
    def test_should_build_chinese_fallback_markdown_when_review_markdown_missing(self, call_provider):
        call_provider.return_value = """
        {
          "approved": false,
          "summary": "存在空指针风险",
          "issues": ["缺少空值判断"],
          "resolvedPreviousIssues": [],
          "unresolvedPreviousIssues": ["缺少空值判断"]
        }
        """

        result = review_code(self._build_request().model_copy(update={
            "previousIssues": ["缺少空值判断"]
        }))

        self.assertFalse(result.approved)
        self.assertEqual("存在空指针风险", result.summary)
        self.assertIn("# 代码审查", result.reviewMarkdown)
        self.assertIn("审查结论：建议暂不合并", result.reviewMarkdown)
        self.assertIn("历史问题修复情况", result.reviewMarkdown)
        self.assertIn("缺少空值判断", result.reviewMarkdown)
        self.assertIn("请结合上述问题补充修复或说明", result.reviewMarkdown)
        self.assertNotIn("????", result.reviewMarkdown)
        self.assertEqual(["缺少空值判断"], result.unresolvedPreviousIssues)

    @patch("app.services.review_service.httpx.Client")
    def test_should_fallback_to_chat_completions_when_ark_responses_returns_400(self, client_class):
        client = client_class.return_value.__enter__.return_value

        responses_call = self._build_httpx_response(
            400,
            "https://ark.cn-beijing.volces.com/api/coding/v3/responses",
            {"message": "unsupported endpoint"},
        )
        fallback_call = self._build_httpx_response(
            200,
            "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"approved": true, "summary": "可以合并", "issues": [], "reviewMarkdown": "# 代码审查\\n- 审查结论：建议合并"}'
                        }
                    }
                ]
            },
        )
        client.post.side_effect = [responses_call, fallback_call]

        request = self._build_request().model_copy(update={
            "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
            "model": "ark-code-latest",
        })
        result = review_code(request)

        self.assertTrue(result.approved)
        self.assertEqual("可以合并", result.summary)
        self.assertEqual(2, client.post.call_count)
        first_url = client.post.call_args_list[0].args[0]
        second_url = client.post.call_args_list[1].args[0]
        self.assertTrue(first_url.endswith("/responses"))
        self.assertTrue(second_url.endswith("/chat/completions"))
        second_payload = client.post.call_args_list[1].kwargs["json"]
        self.assertEqual({"type": "json_object"}, second_payload["response_format"])

    @patch("app.services.review_service.httpx.Client")
    def test_should_retry_chat_completions_without_response_format_when_model_does_not_support_it(self, client_class):
        client = client_class.return_value.__enter__.return_value

        responses_call = self._build_httpx_response(
            400,
            "https://ark.cn-beijing.volces.com/api/coding/v3/responses",
            {"message": "unsupported endpoint"},
        )
        structured_chat_call = self._build_httpx_response(
            400,
            "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
            {"message": "The parameter `response_format.type` specified in the request are not valid: `json_object` is not supported by this model."},
        )
        plain_chat_call = self._build_httpx_response(
            200,
            "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
            {
                "choices": [
                    {
                        "message": {
                            "content": '{"approved": false, "summary": "存在风险", "issues": ["缺少边界处理"], "reviewMarkdown": "# 代码审查\\n- 审查结论：建议暂不合并"}'
                        }
                    }
                ]
            },
        )
        client.post.side_effect = [responses_call, structured_chat_call, plain_chat_call]

        request = self._build_request().model_copy(update={
            "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
            "model": "ark-code-latest",
        })
        result = review_code(request)

        self.assertFalse(result.approved)
        self.assertEqual("存在风险", result.summary)
        self.assertEqual(3, client.post.call_count)
        second_payload = client.post.call_args_list[1].kwargs["json"]
        third_payload = client.post.call_args_list[2].kwargs["json"]
        self.assertEqual({"type": "json_object"}, second_payload["response_format"])
        self.assertNotIn("response_format", third_payload)

    @patch("app.services.review_service._call_provider")
    def test_should_parse_history_resolution_fields_when_provider_returns_them(self, call_provider):
        call_provider.return_value = """
        {
          "approved": false,
          "summary": "仍有历史问题未修复",
          "issues": ["缺少空值判断", "新增鉴权校验"],
          "resolvedPreviousIssues": ["补充单元测试"],
          "unresolvedPreviousIssues": ["缺少空值判断"],
          "reviewMarkdown": "# 代码审查\\n## 历史问题修复情况\\n### 未修复\\n- 缺少空值判断"
        }
        """

        result = review_code(self._build_request().model_copy(update={
            "previousIssues": ["缺少空值判断", "补充单元测试"]
        }))

        self.assertFalse(result.approved)
        self.assertEqual(["补充单元测试"], result.resolvedPreviousIssues)
        self.assertEqual(["缺少空值判断"], result.unresolvedPreviousIssues)
        self.assertEqual(["缺少空值判断", "新增鉴权校验"], result.issues)

    def test_should_return_review_provider_error_detail_when_upstream_call_fails(self):
        self.assertEqual("OPENAI responses 调用失败，HTTP 400：模型不支持该接口", str(
            ReviewProviderError("OPENAI responses 调用失败，HTTP 400：模型不支持该接口")
        ))

    @classmethod
    def _build_httpx_response(cls, status_code: int, url: str, body: dict[str, object] | str):
        import httpx

        request = httpx.Request("POST", url)
        if isinstance(body, str):
            return httpx.Response(status_code, request=request, text=body)
        return httpx.Response(status_code, request=request, json=body)


class ReviewRouteTests(unittest.TestCase):
    """验证代码审查接口能把上游错误转换为可读 400，而不是裸 500。"""

    def setUp(self):
        app = FastAPI()
        router = APIRouter(prefix="/api/code")

        @router.post("/review", response_model=ReviewResponse)
        def review(request: ReviewRequest) -> ReviewResponse:
            try:
                return review_service_module.review_code(request)
            except ValueError as exception:
                raise HTTPException(status_code=400, detail=str(exception)) from exception
            except ReviewProviderError as exception:
                raise HTTPException(status_code=400, detail=str(exception)) from exception

        app.include_router(router)
        self.client = TestClient(app)

    @patch("app.services.review_service.review_code")
    def test_should_return_bad_request_when_provider_call_fails(self, review_code_mock):
        review_code_mock.side_effect = ReviewProviderError("OPENAI responses 调用失败，HTTP 400：模型不支持该接口")

        response = self.client.post("/api/code/review", json={
            "provider": "OPENAI",
            "apiBaseUrl": "https://ark.cn-beijing.volces.com/api/coding/v3",
            "apiKey": "sk-test",
            "model": "ark-code-latest",
            "prompt": "请执行代码审查",
            "mergeRequestTitle": "修复空指针",
            "mergeRequestDescription": "补充空值判断",
            "changes": [],
            "previousIssues": [],
        })

        self.assertEqual(400, response.status_code)
        self.assertEqual("OPENAI responses 调用失败，HTTP 400：模型不支持该接口", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()
