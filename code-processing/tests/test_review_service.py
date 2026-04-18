import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CodeChange
from app.models import ReviewRequest
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
        self.assertIn("## 发现的问题", prompt)
        self.assertIn("## 修改建议", prompt)
        self.assertNotIn("????", prompt)

    @patch("app.services.review_service._call_provider")
    def test_should_build_chinese_fallback_markdown_when_review_markdown_missing(self, call_provider):
        call_provider.return_value = """
        {
          "approved": false,
          "summary": "存在空指针风险",
          "issues": ["缺少空值判断"]
        }
        """

        result = review_code(self._build_request())

        self.assertFalse(result.approved)
        self.assertEqual("存在空指针风险", result.summary)
        self.assertIn("# 代码审查", result.reviewMarkdown)
        self.assertIn("审查结论：建议暂不合并", result.reviewMarkdown)
        self.assertIn("缺少空值判断", result.reviewMarkdown)
        self.assertIn("请结合上述问题补充修复或说明", result.reviewMarkdown)
        self.assertNotIn("????", result.reviewMarkdown)


if __name__ == "__main__":
    unittest.main()
