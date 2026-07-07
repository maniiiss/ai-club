import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.document_service import ExtractedPdfImage
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
    @patch("app.services.document_service._upload_public_image")
    @patch("app.services.document_service._validate_image_payload")
    @patch("app.services.document_service._decode_data_uri_image")
    def test_should_replace_data_uri_image_with_public_url(
        self,
        decode_data_uri_image,
        validate_image_payload,
        upload_public_image,
        markitdown_cls,
    ):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult(
            "![导入图片](data:image/png;base64,ZmFrZS1pbWFnZQ==)",
            "带图文档",
        )
        decode_data_uri_image.return_value = (b"fake-image", "image/png")
        upload_public_image.return_value = "http://localhost:8080/comment-images?key=wiki-image"

        result = convert_document_to_markdown(
            "demo.docx",
            b"fake",
            "WIKI_IMPORT",
            200000,
            "wiki-spaces/space-1/imports/asset-1",
        )

        self.assertIn("http://localhost:8080/comment-images?key=wiki-image", result.markdown)
        self.assertNotIn("data:image/png;base64", result.markdown)
        decode_data_uri_image.assert_called_once()
        validate_image_payload.assert_called_once()
        upload_public_image.assert_called_once()

    @patch("app.services.document_service.MarkItDown")
    def test_should_strip_data_uri_images_for_hermes_file_library_before_indexing(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult(
            "# 述职报告\n\n![](data:image/png;base64,ZmFrZS1pbWFnZQ==)\n\n主导AI配价智能体从0到1开发。",
            "述职报告",
        )

        result = convert_document_to_markdown("demo.pptx", b"fake", "HERMES_FILE_LIBRARY", 200000)

        self.assertIn("主导AI配价智能体从0到1开发", result.markdown)
        self.assertNotIn("data:image/png;base64", result.markdown)
        self.assertNotIn("![](", result.markdown)
        self.assertTrue(any("图片已从索引 Markdown 中移除" in item for item in result.warnings))

    @patch("app.services.document_service.MarkItDown")
    @patch("app.services.document_service._upload_public_image")
    @patch("app.services.document_service._extract_pdf_images")
    @patch("app.services.document_service._extract_pdf_page_markdown_segments")
    def test_should_insert_pdf_images_back_to_page_sections_and_warn_for_skipped_items(
        self,
        extract_pdf_page_markdown_segments,
        extract_pdf_images,
        upload_public_image,
        markitdown_cls,
    ):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult("# PDF 标题\n\n正文", "PDF 标题")
        extract_pdf_page_markdown_segments.return_value = [
            "# 第 1 页\n\n第一页正文",
            "# 第 2 页\n\n第二页正文",
        ]
        extract_pdf_images.return_value = [
            ExtractedPdfImage(1, 1, b"image-1", "image/png", 300, 200),
            ExtractedPdfImage(1, 2, b"image-1", "image/png", 300, 200),
            ExtractedPdfImage(2, 1, b"tiny-image", "image/png", 12, 12),
        ]
        upload_public_image.return_value = "http://localhost:8080/comment-images?key=pdf-image"

        result = convert_document_to_markdown(
            "demo.pdf",
            b"fake",
            "WIKI_IMPORT",
            200000,
            "wiki-spaces/space-1/imports/asset-2",
        )

        self.assertIn("# 第 1 页\n\n第一页正文\n\n### 第 1 页图片 1", result.markdown)
        self.assertIn("# 第 2 页\n\n第二页正文", result.markdown)
        self.assertLess(result.markdown.index("### 第 1 页图片 1"), result.markdown.index("# 第 2 页"))
        self.assertIn("第 1 页图片 1", result.markdown)
        self.assertIn("http://localhost:8080/comment-images?key=pdf-image", result.markdown)
        self.assertTrue(any("重复图片" in item for item in result.warnings))
        self.assertTrue(any("过小图片" in item for item in result.warnings))
        upload_public_image.assert_called_once()

    @patch("app.services.document_service.MarkItDown")
    def test_should_truncate_without_breaking_image_line_when_line_boundary_available(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult(
            "# 标题\n![图片](http://example.com/very/long/image/url)\n正文",
            "",
        )
        result = convert_document_to_markdown("demo.pdf", b"fake", "HERMES_ATTACHMENT", 10)

        self.assertTrue(result.truncated)
        self.assertEqual("# 标题", result.markdown)
        self.assertTrue(result.warnings)

    @patch("app.services.document_service.MarkItDown")
    def test_should_fail_when_markdown_empty(self, markitdown_cls):
        markitdown_cls.return_value.convert_stream.return_value = _FakeMarkItDownResult("", "空文档")

        with self.assertRaisesRegex(RuntimeError, "没有可用 Markdown 内容"):
            convert_document_to_markdown("demo.pptx", b"fake", "WIKI_IMPORT", 100)


if __name__ == "__main__":
    unittest.main()
