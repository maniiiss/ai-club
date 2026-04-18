from __future__ import annotations

from io import BytesIO
from pathlib import Path

from markitdown import MarkItDown

from app.models import DocumentConvertResponse


SUPPORTED_EXTENSIONS = {"pdf", "docx", "pptx", "xlsx"}


def convert_document_to_markdown(file_name: str, content: bytes, scene: str, max_chars: int | None) -> DocumentConvertResponse:
    """把支持格式的文档转换为 Markdown，并按场景做最小裁剪。"""
    normalized_name = (file_name or "").strip()
    if not normalized_name:
        raise ValueError("上传文档缺少文件名")
    extension = Path(normalized_name).suffix.lower().lstrip(".")
    if extension not in SUPPORTED_EXTENSIONS:
        raise ValueError("当前仅支持 PDF、DOCX、PPTX、XLSX 文档")
    if content is None or len(content) == 0:
        raise ValueError("上传文档内容为空")

    converter = MarkItDown()
    try:
        result = converter.convert_stream(BytesIO(content), file_extension=f".{extension}")
    except Exception as exception:  # pragma: no cover - 依赖库异常统一包装
        raise RuntimeError(f"文档转换失败：{exception}") from exception

    markdown = getattr(result, "text_content", "") or ""
    suggested_title = getattr(result, "title", "") or Path(normalized_name).stem
    if not markdown.strip():
        raise RuntimeError("文档转换后没有可用 Markdown 内容")

    warnings: list[str] = []
    normalized_scene = (scene or "").strip().upper()
    truncated = False
    if max_chars is not None and max_chars > 0 and len(markdown) > max_chars:
        markdown = markdown[:max_chars]
        truncated = True
        warnings.append(f"{normalized_scene or 'DEFAULT'} 场景内容已按 {max_chars} 字符上限截断")

    return DocumentConvertResponse(
        suggestedTitle=suggested_title.strip(),
        markdown=markdown,
        sourceFormat=extension.upper(),
        truncated=truncated,
        warnings=warnings,
    )
