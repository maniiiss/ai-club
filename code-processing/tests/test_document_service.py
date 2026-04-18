import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.document_service import convert_document_to_markdown


class _FakeMarkItDownResult:
    def __init__(self, text_content: str, title: str = ""):
        self.text_content = text_content
        self.title = title


class DocumentServiceTests(unittest.TestCase):
    """验证文档转 Markdown 服务的基础约束和截断行为。"""

    @patch("app.services.document_service.MarkItDown")
    def test_should_convert_supported_document(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult("# 标题\n\n内容", "建议标题")

        result = convert_document_to_markdown("demo.docx", b"fake", "WIKI_IMPORT", 200000)

        self.assertEqual("建议标题", result.suggestedTitle)
        self.assertEqual("DOCX", result.sourceFormat)
        self.assertFalse(result.truncated)
        self.assertEqual("# 标题\n\n内容", result.markdown)

    def test_should_reject_unsupported_extension(self):
        with self.assertRaisesRegex(ValueError, "仅支持 PDF、DOCX、PPTX、XLSX"):
            convert_document_to_markdown("demo.txt", b"fake", "WIKI_IMPORT", 100)

    @patch("app.services.document_service.MarkItDown")
    def test_should_truncate_when_exceeds_limit(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult("A" * 20, "")

        result = convert_document_to_markdown("demo.pdf", b"fake", "HERMES_ATTACHMENT", 10)

        self.assertTrue(result.truncated)
        self.assertEqual("A" * 10, result.markdown)
        self.assertTrue(result.warnings)

    @patch("app.services.document_service.MarkItDown")
    def test_should_fail_when_markdown_empty(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult("", "空文档")

        with self.assertRaisesRegex(RuntimeError, "没有可用 Markdown 内容"):
            convert_document_to_markdown("demo.pptx", b"fake", "WIKI_IMPORT", 100)


if __name__ == "__main__":
    unittest.main()
