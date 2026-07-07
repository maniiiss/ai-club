from __future__ import annotations

import base64
import binascii
import hashlib
import io
import mimetypes
import re
import uuid
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.parse import quote

from markitdown import MarkItDown
from minio import Minio
from minio.error import S3Error
from PIL import Image, UnidentifiedImageError
from pypdfium2 import PdfDocument
from pypdfium2 import raw as pdfium_c

from app.models import DocumentConvertResponse
from app.settings import settings


SUPPORTED_EXTENSIONS = {"pdf", "docx", "pptx", "xlsx"}
IMAGE_DATA_URI_PATTERN = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<src>data:image/[^)]+)\)")
MIN_IMAGE_EDGE = 32
MIN_IMAGE_AREA = 4096
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_IMAGE_COUNT = 40
MAX_PDF_IMAGE_COUNT = 20


@dataclass(frozen=True)
class ExtractedPdfImage:
    """PDF 图片提取结果，保留页面序号和基础尺寸信息用于后续过滤。"""

    page_number: int
    image_index: int
    image_bytes: bytes
    content_type: str
    width: int
    height: int


def convert_document_to_markdown(
    file_name: str,
    content: bytes,
    scene: str,
    max_chars: int | None,
    image_directory: str | None = None,
) -> DocumentConvertResponse:
    """把支持格式的文档转换为 Markdown，并按场景补充 Wiki 图片处理。"""
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
        result = converter.convert_stream(io.BytesIO(content), file_extension=f".{extension}", keep_data_uris=True)
    except Exception as exception:  # pragma: no cover - 依赖库异常统一包装
        raise RuntimeError(f"文档转换失败：{exception}") from exception

    markdown = getattr(result, "text_content", "") or ""
    suggested_title = getattr(result, "title", "") or Path(normalized_name).stem
    if not markdown.strip():
        raise RuntimeError("文档转换后没有可用 Markdown 内容")

    warnings: list[str] = []
    normalized_scene = (scene or "").strip().upper()
    normalized_image_directory = _normalize_image_directory(image_directory)
    if normalized_scene == "WIKI_IMPORT" and normalized_image_directory:
        markdown = _rewrite_markdown_data_uri_images(markdown, normalized_image_directory, warnings)
        if extension == "pdf":
            markdown = _insert_pdf_images_by_page(markdown, content, normalized_image_directory, warnings)
    elif normalized_scene == "HERMES_FILE_LIBRARY":
        markdown = _strip_markdown_data_uri_images(markdown, warnings)

    truncated = False
    if max_chars is not None and max_chars > 0 and len(markdown) > max_chars:
        markdown = _truncate_markdown(markdown, max_chars)
        truncated = True
        warnings.append(f"{normalized_scene or 'DEFAULT'} 场景内容已按 {max_chars} 字符上限截断")

    return DocumentConvertResponse(
        suggestedTitle=suggested_title.strip(),
        markdown=markdown,
        sourceFormat=extension.upper(),
        truncated=truncated,
        warnings=warnings,
    )


def _normalize_image_directory(image_directory: str | None) -> str:
    normalized = (image_directory or "").strip().replace("\\", "/")
    return normalized.strip("/")


def _rewrite_markdown_data_uri_images(markdown: str, image_directory: str, warnings: list[str]) -> str:
    """把 Markdown 中的 data URI 图片上传到 MinIO，并替换为平台可访问 URL。"""
    uploaded_urls_by_hash: dict[str, str] = {}
    replaced_count = 0
    over_limit_warned = False

    def replace(match: re.Match[str]) -> str:
        nonlocal replaced_count, over_limit_warned
        alt_text = (match.group("alt") or "图片").strip() or "图片"
        data_uri = match.group("src") or ""
        if replaced_count >= MAX_TOTAL_IMAGE_COUNT:
            if not over_limit_warned:
                warnings.append(f"文档内图片数量超过 {MAX_TOTAL_IMAGE_COUNT} 张，超出部分已跳过")
                over_limit_warned = True
            return f"[图片已跳过：{alt_text}]"
        try:
            image_bytes, content_type = _decode_data_uri_image(data_uri)
            _validate_image_payload(image_bytes, content_type)
        except ValueError as exception:
            warnings.append(f"检测到 1 张内嵌图片无法处理：{exception}")
            return f"[图片已跳过：{alt_text}]"

        digest = hashlib.sha256(image_bytes).hexdigest()
        if digest in uploaded_urls_by_hash:
            return f"![{alt_text}]({uploaded_urls_by_hash[digest]})"
        replaced_count += 1
        image_url = _upload_public_image(image_bytes, image_directory, content_type=content_type)
        uploaded_urls_by_hash[digest] = image_url
        return f"![{alt_text}]({image_url})"

    return IMAGE_DATA_URI_PATTERN.sub(replace, markdown)


def _strip_markdown_data_uri_images(markdown: str, warnings: list[str]) -> str:
    """个人文件库只索引 MarkItDown 文本内容，避免内嵌图片 data URI 污染向量切片。"""
    removed_count = 0

    def replace(match: re.Match[str]) -> str:
        nonlocal removed_count
        removed_count += 1
        return ""

    cleaned = IMAGE_DATA_URI_PATTERN.sub(replace, markdown)
    if removed_count > 0:
        warnings.append(f"HERMES_FILE_LIBRARY 场景有 {removed_count} 张内嵌图片已从索引 Markdown 中移除")
    return cleaned


def _insert_pdf_images_by_page(markdown: str, pdf_bytes: bytes, image_directory: str, warnings: list[str]) -> str:
    """按页把 PDF 提取图片插回正文，尽量贴近原文对应页面。"""
    extracted_images = _extract_pdf_images(pdf_bytes)
    if not extracted_images:
        return markdown

    page_sections: dict[int, list[str]] = {}
    seen_hashes: set[str] = set()
    kept_count = 0
    skipped_small_count = 0
    skipped_oversize_count = 0
    skipped_duplicate_count = 0

    for item in extracted_images:
        if kept_count >= MAX_PDF_IMAGE_COUNT:
            warnings.append(f"PDF 提取图片数量超过 {MAX_PDF_IMAGE_COUNT} 张，超出部分已跳过")
            break
        if item.width < MIN_IMAGE_EDGE or item.height < MIN_IMAGE_EDGE or item.width * item.height < MIN_IMAGE_AREA:
            skipped_small_count += 1
            continue
        if len(item.image_bytes) > MAX_IMAGE_SIZE_BYTES:
            skipped_oversize_count += 1
            continue
        digest = hashlib.sha256(item.image_bytes).hexdigest()
        if digest in seen_hashes:
            skipped_duplicate_count += 1
            continue
        seen_hashes.add(digest)
        image_url = _upload_public_image(item.image_bytes, image_directory, content_type=item.content_type)
        page_sections.setdefault(item.page_number, []).append(
            f"### 第 {item.page_number} 页图片 {item.image_index}\n\n![第 {item.page_number} 页图片 {item.image_index}]({image_url})"
        )
        kept_count += 1

    if skipped_small_count > 0:
        warnings.append(f"PDF 中有 {skipped_small_count} 张过小图片已跳过")
    if skipped_oversize_count > 0:
        warnings.append(f"PDF 中有 {skipped_oversize_count} 张图片超过 {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB，已跳过")
    if skipped_duplicate_count > 0:
        warnings.append(f"PDF 中有 {skipped_duplicate_count} 张重复图片已跳过")
    if not page_sections:
        return markdown

    page_markdown_segments = _extract_pdf_page_markdown_segments(pdf_bytes)
    if not page_markdown_segments:
        page_markdown_segments = _split_pdf_markdown_pages(markdown)
    if not page_markdown_segments:
        warnings.append("PDF 未识别出稳定分页，提取图片已追加到文末")
        appendix = "\n\n## PDF 提取图片\n\n" + "\n\n".join(
            section
            for page_number in sorted(page_sections)
            for section in page_sections[page_number]
        )
        return markdown.rstrip() + appendix

    rendered_pages: list[str] = []
    total_pages = max(len(page_markdown_segments), max(page_sections))
    for page_number in range(1, total_pages + 1):
        page_body = page_markdown_segments[page_number - 1].strip() if page_number <= len(page_markdown_segments) else ""
        page_images = "\n\n".join(page_sections.get(page_number, []))
        if page_body and page_images:
            rendered_pages.append(f"{page_body}\n\n{page_images}")
        elif page_body:
            rendered_pages.append(page_body)
        elif page_images:
            rendered_pages.append(page_images)
    return "\n\n".join(section.rstrip() for section in rendered_pages if section.strip()).rstrip()


def _extract_pdf_page_markdown_segments(pdf_bytes: bytes) -> list[str]:
    """按页提取 PDF Markdown 片段，供图片按页插回正文时复用。"""
    try:
        import pdfminer.high_level
        import pdfplumber
        from markitdown.converters._pdf_converter import _extract_form_content_from_words
        from markitdown.converters._pdf_converter import _merge_partial_numbering_lines
    except ImportError:
        return []

    page_segments: list[str] = []
    form_pages = 0
    plain_pages = 0
    pdf_bytes_stream = io.BytesIO(pdf_bytes)

    try:
        with pdfplumber.open(pdf_bytes_stream) as pdf:
            for page in pdf.pages:
                page_content = _extract_form_content_from_words(page)
                if page_content is None:
                    plain_pages += 1
                    text = page.extract_text() or ""
                    page_segments.append(text.strip())
                else:
                    form_pages += 1
                    page_segments.append(page_content.strip())
    except Exception:
        page_segments = []

    if plain_pages > form_pages and plain_pages > 0:
        page_segments = []
        document = PdfDocument(io.BytesIO(pdf_bytes))
        try:
            for page_index in range(len(document)):
                page_stream = io.BytesIO(pdf_bytes)
                extracted = pdfminer.high_level.extract_text(page_stream, page_numbers=[page_index]) or ""
                page_segments.append(extracted.strip("\x0c\r\n "))
        finally:
            document.close()

    normalized_segments: list[str] = []
    for segment in page_segments:
        normalized = segment.strip()
        if not normalized:
            normalized_segments.append("")
            continue
        normalized_segments.append(_merge_partial_numbering_lines(normalized).strip())
    return normalized_segments


def _split_pdf_markdown_pages(markdown: str) -> list[str]:
    """优先识别 pdfminer 产出的换页符，作为 PDF 重新插图时的回退分页方案。"""
    if "\x0c" not in markdown:
        return []
    return [segment.strip() for segment in markdown.split("\x0c") if segment.strip()]


def _extract_pdf_images(pdf_bytes: bytes) -> list[ExtractedPdfImage]:
    """提取 PDF 内嵌图片，为 Wiki 导入生成可访问图片链接。"""
    document = PdfDocument(io.BytesIO(pdf_bytes))
    images: list[ExtractedPdfImage] = []
    try:
        for page_index in range(len(document)):
            page = document[page_index]
            try:
                image_index = 0
                for image_object in page.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE]):
                    image_index += 1
                    try:
                        buffer = io.BytesIO()
                        image_object.extract(buffer)
                        image_bytes = buffer.getvalue()
                        content_type = _guess_content_type(image_bytes, None)
                        width, height = _guess_image_size(image_bytes)
                        images.append(
                            ExtractedPdfImage(
                                page_number=page_index + 1,
                                image_index=image_index,
                                image_bytes=image_bytes,
                                content_type=content_type,
                                width=width,
                                height=height,
                            )
                        )
                    except Exception:
                        continue
            finally:
                page.close()
    finally:
        document.close()
    return images


def _decode_data_uri_image(data_uri: str) -> tuple[bytes, str]:
    header, separator, encoded = data_uri.partition(",")
    if separator != "," or not header.startswith("data:image/") or ";base64" not in header:
        raise ValueError("仅支持 base64 图片 data URI")
    content_type = header[5:].split(";", 1)[0].strip().lower()
    try:
        return base64.b64decode(encoded, validate=True), content_type
    except (binascii.Error, ValueError) as exception:
        raise ValueError("图片内容不是有效 base64") from exception


def _validate_image_payload(image_bytes: bytes, content_type: str) -> None:
    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise ValueError(f"图片超过 {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB")
    width, height = _guess_image_size(image_bytes)
    if width < MIN_IMAGE_EDGE or height < MIN_IMAGE_EDGE or width * height < MIN_IMAGE_AREA:
        raise ValueError("图片尺寸过小")
    if not content_type.startswith("image/"):
        raise ValueError("图片类型不受支持")


def _guess_image_size(image_bytes: bytes) -> tuple[int, int]:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            return image.size
    except (UnidentifiedImageError, OSError) as exception:
        raise ValueError("图片内容无法识别") from exception


def _upload_public_image(image_bytes: bytes, image_directory: str, content_type: str | None = None) -> str:
    """上传图片到 MinIO，并返回浏览器可直接访问的图片 URL。"""
    normalized_directory = _normalize_image_directory(image_directory)
    if not normalized_directory:
        raise ValueError("图片保存目录不能为空")
    normalized_content_type = _guess_content_type(image_bytes, content_type)
    extension = _guess_extension(normalized_content_type)
    object_key = (
        f"{normalized_directory}/{date.today().strftime('%Y/%m/%d')}/"
        f"{uuid.uuid4().hex}.{extension}"
    )
    client = _build_minio_client()
    _ensure_bucket(client)
    try:
        client.put_object(
            settings.minio_bucket,
            object_key,
            io.BytesIO(image_bytes),
            len(image_bytes),
            content_type=normalized_content_type,
        )
    except Exception as exception:
        raise RuntimeError(f"上传导入图片失败：{exception}") from exception
    return f"{settings.backend_internal_base_url}/comment-images?key={quote(object_key, safe='')}"


def _build_minio_client() -> Minio:
    secure = settings.minio_endpoint.lower().startswith("https://")
    endpoint = settings.minio_endpoint.replace("https://", "").replace("http://", "")
    return Minio(endpoint, access_key=settings.minio_access_key, secret_key=settings.minio_secret_key, secure=secure)


def _ensure_bucket(client: Minio) -> None:
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error as exception:
        raise RuntimeError(f"初始化对象存储失败：{exception}") from exception


def _guess_content_type(image_bytes: bytes, content_type: str | None) -> str:
    normalized = (content_type or "").strip().lower()
    if normalized.startswith("image/"):
        return normalized
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            guessed = Image.MIME.get(image.format or "")
            if guessed:
                return guessed.lower()
    except (UnidentifiedImageError, OSError):
        pass
    return "image/png"


def _guess_extension(content_type: str) -> str:
    guessed_extension = mimetypes.guess_extension(content_type, strict=False)
    if guessed_extension:
        normalized = guessed_extension.lstrip(".").lower()
        return "jpg" if normalized == "jpeg" else normalized
    if content_type == "image/jpeg":
        return "jpg"
    if content_type == "image/png":
        return "png"
    if content_type == "image/gif":
        return "gif"
    if content_type == "image/webp":
        return "webp"
    return "png"


def _truncate_markdown(markdown: str, max_chars: int) -> str:
    """按行裁剪 Markdown，尽量避免把图片语法截断在半行。"""
    if len(markdown) <= max_chars:
        return markdown
    consumed = 0
    kept_lines: list[str] = []
    for line in markdown.splitlines(keepends=True):
        if consumed + len(line) > max_chars:
            break
        kept_lines.append(line)
        consumed += len(line)
    if kept_lines:
        return "".join(kept_lines).rstrip("\r\n")
    return markdown[:max_chars]
