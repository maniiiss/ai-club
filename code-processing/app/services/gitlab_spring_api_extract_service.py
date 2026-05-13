import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

from app.models import (
    GitlabSpringApiEndpoint,
    GitlabSpringApiExtractRequest,
    GitlabSpringApiExtractResponse,
    GitlabSpringApiParameter,
)
from app.services.gitlab_code_structure_service import (
    _current_head_commit,
    _ensure_workspace_root,
    _reclone_repository,
    _workspace_for,
)

JAVA_SOURCE_PATTERN = "*.java"
SPRING_MAPPING_ANNOTATIONS = {
    "GetMapping": "GET",
    "PostMapping": "POST",
    "PutMapping": "PUT",
    "DeleteMapping": "DELETE",
    "PatchMapping": "PATCH",
}
REQUEST_METHODS = {"GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"}


@dataclass(frozen=True)
class JavaFieldDoc:
    """Java DTO 字段或枚举值的说明。"""

    name: str
    type: str
    description: str
    enum_values: list[str]


@dataclass(frozen=True)
class JavaMethodDoc:
    """Spring Controller 方法解析后的中间结构。"""

    name: str
    signature: str
    comment: str
    annotations: str
    line_no: int


def extract_gitlab_spring_apis(request: GitlabSpringApiExtractRequest) -> GitlabSpringApiExtractResponse:
    """拉取 GitLab 仓库并抽取 Spring REST 接口说明。"""
    workspace = _workspace_for(request.repository.bindingId, request.repository.targetBranch)
    _ensure_workspace_root(workspace)
    repo_dir = _reclone_repository(request.repository, workspace)
    commit_sha = _current_head_commit(repo_dir)
    warnings: list[str] = []
    java_files = _list_java_files(repo_dir)
    dto_fields, enum_values = _collect_type_docs(repo_dir, java_files, warnings)
    endpoints: list[GitlabSpringApiEndpoint] = []
    seen_keys: set[str] = set()
    for java_file in java_files:
        try:
            extracted = _extract_controller_file(repo_dir, java_file, dto_fields, enum_values)
            for endpoint in extracted:
                key = f"{endpoint.method.upper()} {endpoint.path}"
                if key in seen_keys:
                    warnings.append(f"接口重复，已跳过后续定义：{key} / {endpoint.sourceFile}:{endpoint.sourceLine or '-'}")
                    continue
                seen_keys.add(key)
                endpoints.append(endpoint)
        except Exception as exception:  # noqa: BLE001
            warnings.append(f"解析 Java 文件失败：{_relative_path(repo_dir, java_file)}，原因：{exception}")
    return GitlabSpringApiExtractResponse(
        branchName=request.repository.targetBranch,
        commitSha=commit_sha,
        scannedCount=len(java_files),
        endpoints=endpoints,
        warnings=warnings,
    )


def _list_java_files(repo_dir: Path) -> list[Path]:
    """列出仓库内可扫描的 Java 源文件，跳过构建产物目录。"""
    ignored_parts = {".git", "target", "build", "out", ".gradle", ".idea"}
    result: list[Path] = []
    for path in repo_dir.rglob(JAVA_SOURCE_PATTERN):
        if any(part in ignored_parts for part in path.parts):
            continue
        result.append(path)
    return sorted(result)


def _collect_type_docs(repo_dir: Path,
                       java_files: list[Path],
                       warnings: list[str]) -> tuple[dict[str, list[JavaFieldDoc]], dict[str, list[str]]]:
    """收集 DTO 字段和枚举常量注释，供 Controller 参数描述复用。"""
    dto_fields: dict[str, list[JavaFieldDoc]] = {}
    enum_values: dict[str, list[str]] = {}
    for java_file in java_files:
        try:
            text = java_file.read_text(encoding="utf-8", errors="replace")
            enum_values.update(_extract_enum_values(text))
            dto_fields.update(_extract_class_fields(text))
            dto_fields.update(_extract_record_components(text))
        except Exception as exception:  # noqa: BLE001
            warnings.append(f"读取 Java 类型说明失败：{_relative_path(repo_dir, java_file)}，原因：{exception}")
    for class_name, fields in list(dto_fields.items()):
        enriched: list[JavaFieldDoc] = []
        for field in fields:
            enriched.append(JavaFieldDoc(
                name=field.name,
                type=field.type,
                description=field.description,
                enum_values=enum_values.get(_simple_type(field.type), field.enum_values),
            ))
        dto_fields[class_name] = enriched
    return dto_fields, enum_values


def _extract_controller_file(repo_dir: Path,
                             java_file: Path,
                             dto_fields: dict[str, list[JavaFieldDoc]],
                             enum_values: dict[str, list[str]]) -> list[GitlabSpringApiEndpoint]:
    """抽取单个 Controller 文件中的 Spring REST 接口。"""
    text = java_file.read_text(encoding="utf-8", errors="replace")
    if "@RestController" not in text:
        return []
    package_prefix = _detect_package(text)
    endpoints: list[GitlabSpringApiEndpoint] = []
    for class_match in re.finditer(r"\b(?:public\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{", text):
        class_name = class_match.group(1)
        class_start = class_match.start()
        class_open = text.find("{", class_match.start())
        class_close = _find_matching(text, class_open, "{", "}")
        if class_close <= class_open:
            continue
        class_prefixes = _parse_mapping_paths(_nearby_annotations(text, class_start), default_path="")
        class_prefixes = class_prefixes or [""]
        class_body = text[class_open + 1:class_close]
        body_line_offset = text[:class_open + 1].count("\n")
        for method_doc in _extract_controller_methods(class_body, body_line_offset):
            mappings = _parse_method_mappings(method_doc.annotations)
            if not mappings:
                continue
            comment_text = _clean_comment(method_doc.comment)
            summary = _first_non_blank(
                _extract_annotation_attr(method_doc.annotations, "summary"),
                _extract_annotation_attr(method_doc.annotations, "value") if "@ApiOperation" in method_doc.annotations else "",
                _first_sentence(comment_text),
                _humanize_name(method_doc.name),
            )
            description = _first_non_blank(
                _extract_annotation_attr(method_doc.annotations, "description"),
                _extract_annotation_attr(method_doc.annotations, "notes") if "@ApiOperation" in method_doc.annotations else "",
                comment_text,
                summary,
            )
            param_docs = _extract_javadoc_params(method_doc.comment)
            params, header_params, body_type = _extract_method_parameters(method_doc.signature, param_docs, enum_values)
            body_example = _build_body_example(body_type, dto_fields, enum_values)
            source_file = _relative_path(repo_dir, java_file)
            for http_method, method_path in mappings:
                for class_prefix in class_prefixes:
                    path = _join_paths(class_prefix, method_path)
                    path_names = _path_variable_names(path)
                    endpoint = GitlabSpringApiEndpoint(
                        method=http_method,
                        path=path,
                        name=summary,
                        description=description,
                        headers=header_params,
                        queryParams=[item for item in params if item.name not in path_names],
                        pathParams=[item for item in params if item.name in path_names],
                        requestContentType="application/json" if body_type else "none",
                        bodyExample=body_example,
                        sourceFile=source_file,
                        sourceLine=method_doc.line_no,
                        sourceSignature=_source_signature(package_prefix, class_name, method_doc.name, http_method, path),
                    )
                    endpoints.append(endpoint)
    return endpoints


def _extract_controller_methods(class_body: str, body_line_offset: int) -> list[JavaMethodDoc]:
    """按注释、注解、方法签名三段抽取 Controller 方法。"""
    methods: list[JavaMethodDoc] = []
    lines = class_body.splitlines()
    pending_comment: list[str] = []
    pending_annotations: list[str] = []
    index = 0
    while index < len(lines):
        raw_line = lines[index]
        stripped = raw_line.strip()
        if not stripped:
            pending_comment = []
            index += 1
            continue
        if stripped.startswith("/**"):
            block = [raw_line]
            while "*/" not in lines[index] and index + 1 < len(lines):
                index += 1
                block.append(lines[index])
            pending_comment = block
            index += 1
            continue
        if stripped.startswith("//"):
            pending_comment.append(raw_line)
            index += 1
            continue
        if stripped.startswith("@") or (pending_annotations and _annotation_continues(pending_annotations)):
            pending_annotations.append(raw_line)
            index += 1
            continue
        if pending_annotations and _contains_mapping_annotation("\n".join(pending_annotations)):
            signature_lines = [raw_line]
            signature_index = index
            while "{" not in "\n".join(signature_lines) and ";" not in "\n".join(signature_lines) and index + 1 < len(lines):
                index += 1
                signature_lines.append(lines[index])
            signature = "\n".join(signature_lines)
            method_name = _extract_method_name(signature)
            if method_name:
                methods.append(JavaMethodDoc(
                    name=method_name,
                    signature=signature,
                    comment="\n".join(pending_comment),
                    annotations="\n".join(pending_annotations),
                    line_no=body_line_offset + signature_index + 1,
                ))
            pending_comment = []
            pending_annotations = []
            index += 1
            continue
        pending_comment = []
        pending_annotations = []
        index += 1
    return methods


def _extract_method_parameters(signature: str,
                               param_docs: dict[str, str],
                               enum_values: dict[str, list[str]]) -> tuple[list[GitlabSpringApiParameter], list[GitlabSpringApiParameter], str]:
    """解析方法参数，识别路径、查询、请求头和请求体。"""
    parameter_text = _between_matching(signature, "(", ")")
    if not parameter_text:
        return [], [], ""
    params: list[GitlabSpringApiParameter] = []
    header_params: list[GitlabSpringApiParameter] = []
    body_type = ""
    for raw_param in _split_top_level(parameter_text, ","):
        param = raw_param.strip()
        if not param:
            continue
        annotations = "\n".join(re.findall(r"@\w+(?:\([^)]*\))?", param, flags=re.DOTALL))
        declaration = re.sub(r"@\w+(?:\([^)]*\))?", " ", param, flags=re.DOTALL)
        declaration = re.sub(r"\bfinal\b", " ", declaration).strip()
        parts = declaration.split()
        if len(parts) < 2:
            continue
        name = parts[-1].replace("...", "").strip()
        java_type = " ".join(parts[:-1]).strip()
        resolved_name = _first_non_blank(
            _extract_annotation_attr(annotations, "name"),
            _extract_annotation_attr(annotations, "value"),
            name,
        )
        required = not _annotation_has_required_false(annotations)
        default_value = _extract_annotation_attr(annotations, "defaultValue")
        if default_value:
            required = False
        description = _first_non_blank(
            _extract_annotation_attr(annotations, "description"),
            _extract_annotation_attr(annotations, "value") if "@ApiParam" in annotations else "",
            param_docs.get(name),
            param_docs.get(resolved_name),
            _enum_description(java_type, enum_values),
            "",
        )
        if "@RequestBody" in annotations:
            body_type = _simple_type(java_type)
        elif "@RequestHeader" in annotations:
            header_params.append(GitlabSpringApiParameter(
                name=resolved_name,
                type=java_type,
                required=required,
                defaultValue=default_value,
                description=description,
            ))
        elif "@PathVariable" in annotations or "@RequestParam" in annotations:
            params.append(GitlabSpringApiParameter(
                name=resolved_name,
                type=java_type,
                required=required,
                defaultValue=default_value,
                description=description,
            ))
    return params, header_params, body_type


def _extract_enum_values(text: str) -> dict[str, list[str]]:
    """抽取 enum 常量和常量前的注释。"""
    result: dict[str, list[str]] = {}
    for match in re.finditer(r"\benum\s+([A-Za-z_$][\w$]*)[^{]*\{", text):
        enum_name = match.group(1)
        open_index = text.find("{", match.start())
        close_index = _find_matching(text, open_index, "{", "}")
        if close_index <= open_index:
            continue
        body = text[open_index + 1:close_index].split(";", 1)[0]
        values: list[str] = []
        pending_comment: list[str] = []
        for raw_line in body.splitlines():
            stripped = raw_line.strip()
            if not stripped:
                continue
            if stripped.startswith("/**") or stripped.startswith("*") or stripped.startswith("//"):
                pending_comment.append(raw_line)
                continue
            for item in _split_top_level(stripped.rstrip(","), ","):
                constant_match = re.match(r"([A-Z][A-Z0-9_]*)\b", item.strip())
                if not constant_match:
                    continue
                comment = _clean_comment("\n".join(pending_comment))
                label = constant_match.group(1)
                values.append(f"{label}：{comment}" if comment else label)
                pending_comment = []
        if values:
            result[enum_name] = values
    return result


def _extract_class_fields(text: str) -> dict[str, list[JavaFieldDoc]]:
    """抽取普通 Java 类字段注释。"""
    result: dict[str, list[JavaFieldDoc]] = {}
    for class_match in re.finditer(r"\b(?:class|static\s+class)\s+([A-Za-z_$][\w$]*)[^{]*\{", text):
        class_name = class_match.group(1)
        open_index = text.find("{", class_match.start())
        close_index = _find_matching(text, open_index, "{", "}")
        if close_index <= open_index:
            continue
        fields: list[JavaFieldDoc] = []
        pending_comment: list[str] = []
        pending_annotations: list[str] = []
        for raw_line in text[open_index + 1:close_index].splitlines():
            stripped = raw_line.strip()
            if not stripped:
                pending_comment = []
                pending_annotations = []
                continue
            if stripped.startswith("/**"):
                pending_comment = [raw_line]
                if "*/" not in stripped:
                    continue
            elif pending_comment and "*/" not in "\n".join(pending_comment):
                pending_comment.append(raw_line)
                continue
            elif stripped.startswith("//"):
                pending_comment.append(raw_line)
                continue
            elif stripped.startswith("@"):
                pending_annotations.append(raw_line)
                continue
            if "(" in stripped or not stripped.endswith(";"):
                pending_comment = []
                pending_annotations = []
                continue
            field_match = re.search(
                r"(?:private|protected|public)?\s*(?:static\s+)?(?:final\s+)?([A-Za-z_$][\w$<>, ?.\[\]]+)\s+([A-Za-z_$][\w$]*)\s*(?:=.*)?;",
                stripped,
            )
            if not field_match:
                continue
            description = _first_non_blank(
                _clean_comment("\n".join(pending_comment)),
                _extract_annotation_attr("\n".join(pending_annotations), "description"),
                _extract_annotation_attr("\n".join(pending_annotations), "value"),
                "",
            )
            fields.append(JavaFieldDoc(field_match.group(2), field_match.group(1).strip(), description, []))
            pending_comment = []
            pending_annotations = []
        if fields:
            result[class_name] = fields
    return result


def _extract_record_components(text: str) -> dict[str, list[JavaFieldDoc]]:
    """抽取 Java record 组件说明。"""
    result: dict[str, list[JavaFieldDoc]] = {}
    for match in re.finditer(r"\brecord\s+([A-Za-z_$][\w$]*)\s*\(", text):
        record_name = match.group(1)
        open_index = text.find("(", match.start())
        close_index = _find_matching(text, open_index, "(", ")")
        if close_index <= open_index:
            continue
        components: list[JavaFieldDoc] = []
        for component in _split_top_level(text[open_index + 1:close_index], ","):
            cleaned = re.sub(r"@\w+(?:\([^)]*\))?", " ", component, flags=re.DOTALL).strip()
            parts = cleaned.split()
            if len(parts) >= 2:
                components.append(JavaFieldDoc(parts[-1], " ".join(parts[:-1]), "", []))
        if components:
            result[record_name] = components
    return result


def _parse_method_mappings(annotations: str) -> list[tuple[str, str]]:
    """解析方法级 Spring Mapping 注解。"""
    mappings: list[tuple[str, str]] = []
    for name, segment in _annotation_segments(annotations):
        if name in SPRING_MAPPING_ANNOTATIONS:
            for path in _parse_mapping_paths(segment, default_path=""):
                mappings.append((SPRING_MAPPING_ANNOTATIONS[name], path))
        elif name == "RequestMapping":
            methods = re.findall(r"RequestMethod\.([A-Z]+)", segment)
            http_methods = [method for method in methods if method in REQUEST_METHODS] or ["GET"]
            for path in _parse_mapping_paths(segment, default_path=""):
                for http_method in http_methods:
                    mappings.append((http_method, path))
    return mappings


def _parse_mapping_paths(annotation_text: str, default_path: str) -> list[str]:
    """从 Mapping 注解中解析 path/value。"""
    paths: list[str] = []
    attr_match = re.search(r"(?:value|path)\s*=\s*(\{[^}]*\}|\"[^\"]*\")", annotation_text, flags=re.DOTALL)
    candidate = attr_match.group(1) if attr_match else annotation_text
    for item in re.findall(r"\"([^\"]*)\"", candidate):
        paths.append(item)
    if not paths:
        paths.append(default_path)
    return list(dict.fromkeys(paths))


def _annotation_segments(text: str) -> list[tuple[str, str]]:
    """按注解名称切分注解文本，避免多行注解互相干扰。"""
    result: list[tuple[str, str]] = []
    for match in re.finditer(r"@([A-Za-z_$][\w$]*)", text):
        name = match.group(1)
        start = match.start()
        paren_start = text.find("(", match.end())
        if paren_start < 0:
            result.append((name, text[start:match.end()]))
            continue
        next_annotation = text.find("@", match.end())
        if next_annotation >= 0 and next_annotation < paren_start:
            result.append((name, text[start:next_annotation]))
            continue
        paren_end = _find_matching(text, paren_start, "(", ")")
        end = paren_end + 1 if paren_end > paren_start else match.end()
        result.append((name, text[start:end]))
    return result


def _extract_annotation_attr(annotations: str, attr_name: str) -> str:
    """读取注解里的字符串属性。"""
    pattern = rf"\b{re.escape(attr_name)}\s*=\s*\"([^\"]*)\""
    match = re.search(pattern, annotations, flags=re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


def _annotation_has_required_false(annotations: str) -> bool:
    return re.search(r"\brequired\s*=\s*false\b", annotations, flags=re.IGNORECASE) is not None


def _extract_javadoc_params(comment: str) -> dict[str, str]:
    """从 JavaDoc 中读取 @param 参数说明。"""
    result: dict[str, str] = {}
    for line in _clean_comment(comment).splitlines():
        match = re.match(r"@param\s+([A-Za-z_$][\w$]*)\s+(.+)", line.strip())
        if match:
            result[match.group(1)] = match.group(2).strip()
    return result


def _build_body_example(body_type: str,
                        dto_fields: dict[str, list[JavaFieldDoc]],
                        enum_values: dict[str, list[str]]) -> str:
    """基于 DTO 字段生成保守 JSON 请求体示例。"""
    simple_type = _simple_type(body_type)
    if not simple_type:
        return ""
    if simple_type in dto_fields:
        payload: dict[str, object] = {}
        for field in dto_fields[simple_type]:
            payload[field.name] = _example_value(field.type, field.enum_values or enum_values.get(_simple_type(field.type), []))
        return json.dumps(payload, ensure_ascii=False, indent=2)
    return json.dumps(_example_value(simple_type, enum_values.get(simple_type, [])), ensure_ascii=False, indent=2)


def _example_value(java_type: str, enum_values: list[str]) -> object:
    """为 Java 类型生成示例值。"""
    normalized = _simple_type(java_type)
    if enum_values:
        return enum_values[0].split("：", 1)[0]
    if normalized in {"Integer", "Long", "Short", "Byte", "int", "long", "short", "byte"}:
        return 0
    if normalized in {"BigDecimal", "Double", "Float", "double", "float"}:
        return 0.0
    if normalized in {"Boolean", "boolean"}:
        return True
    if normalized in {"List", "Set", "Collection"} or java_type.strip().startswith(("List<", "Set<", "Collection<")):
        return []
    if normalized in {"Map"} or java_type.strip().startswith("Map<"):
        return {}
    return ""


def _source_signature(package_prefix: str, class_name: str, method_name: str, http_method: str, path: str) -> str:
    raw = f"{package_prefix}.{class_name}#{method_name}:{http_method}:{path}"
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{raw}:{digest}"


def _nearby_annotations(text: str, position: int) -> str:
    """读取类声明前紧邻的注解文本。"""
    prefix = text[:position].splitlines()
    annotations: list[str] = []
    for line in reversed(prefix):
        stripped = line.strip()
        if not stripped:
            if annotations:
                break
            continue
        if stripped.startswith("@") or stripped.startswith(")") or stripped.startswith("\""):
            annotations.append(line)
            continue
        if stripped.startswith("*") or stripped.startswith("/"):
            continue
        break
    return "\n".join(reversed(annotations))


def _contains_mapping_annotation(annotations: str) -> bool:
    return any(f"@{name}" in annotations for name in [*SPRING_MAPPING_ANNOTATIONS.keys(), "RequestMapping"])


def _annotation_continues(lines: list[str]) -> bool:
    text = "\n".join(lines)
    return text.count("(") > text.count(")")


def _extract_method_name(signature: str) -> str:
    before_params = signature.split("(", 1)[0]
    match = re.search(r"([A-Za-z_$][\w$]*)\s*$", before_params.strip())
    if not match:
        return ""
    name = match.group(1)
    return "" if name in {"if", "for", "while", "switch", "catch"} else name


def _between_matching(text: str, open_char: str, close_char: str) -> str:
    start = text.find(open_char)
    end = _find_matching(text, start, open_char, close_char)
    if start < 0 or end <= start:
        return ""
    return text[start + 1:end]


def _find_matching(text: str, start: int, open_char: str, close_char: str) -> int:
    if start < 0 or start >= len(text) or text[start] != open_char:
        return -1
    depth = 0
    in_string = False
    escape = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == open_char:
            depth += 1
        elif char == close_char:
            depth -= 1
            if depth == 0:
                return index
    return -1


def _split_top_level(text: str, separator: str) -> list[str]:
    """按顶层分隔符切分文本，跳过括号和泛型内部。"""
    result: list[str] = []
    current: list[str] = []
    angle_depth = 0
    paren_depth = 0
    brace_depth = 0
    in_string = False
    escape = False
    for char in text:
        if in_string:
            current.append(char)
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            current.append(char)
            continue
        if char == "<":
            angle_depth += 1
        elif char == ">" and angle_depth:
            angle_depth -= 1
        elif char == "(":
            paren_depth += 1
        elif char == ")" and paren_depth:
            paren_depth -= 1
        elif char == "{":
            brace_depth += 1
        elif char == "}" and brace_depth:
            brace_depth -= 1
        if char == separator and angle_depth == 0 and paren_depth == 0 and brace_depth == 0:
            result.append("".join(current))
            current = []
        else:
            current.append(char)
    result.append("".join(current))
    return result


def _join_paths(prefix: str, path: str) -> str:
    parts = [item.strip("/") for item in [prefix or "", path or ""] if item is not None and item.strip("/") != ""]
    joined = "/" + "/".join(parts)
    return re.sub(r"/+", "/", joined)


def _path_variable_names(path: str) -> set[str]:
    return set(re.findall(r"\{([^}/:]+)(?::[^}]*)?}", path or ""))


def _enum_description(java_type: str, enum_values: dict[str, list[str]]) -> str:
    values = enum_values.get(_simple_type(java_type), [])
    return "可选值：" + "；".join(values) if values else ""


def _simple_type(java_type: str) -> str:
    normalized = re.sub(r"[\[\]?]", "", java_type or "").strip()
    if "<" in normalized:
        normalized = normalized.split("<", 1)[0]
    if "." in normalized:
        normalized = normalized.rsplit(".", 1)[-1]
    return normalized.strip()


def _clean_comment(comment: str) -> str:
    lines: list[str] = []
    for line in (comment or "").splitlines():
        cleaned = line.strip()
        cleaned = re.sub(r"^/\*\*", "", cleaned)
        cleaned = re.sub(r"\*/$", "", cleaned)
        cleaned = re.sub(r"^\*", "", cleaned).strip()
        cleaned = re.sub(r"^//", "", cleaned).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines).strip()


def _first_sentence(text: str) -> str:
    normalized = (text or "").strip()
    if not normalized:
        return ""
    first_line = normalized.splitlines()[0].strip()
    return re.split(r"[。.!！?？]", first_line, 1)[0].strip() or first_line


def _humanize_name(name: str) -> str:
    words = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", name or "").replace("_", " ").strip()
    return words or "未命名接口"


def _detect_package(text: str) -> str:
    match = re.search(r"\bpackage\s+([A-Za-z_$][\w$.]*)\s*;", text)
    return match.group(1) if match else ""


def _relative_path(repo_dir: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo_dir)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def _first_non_blank(*values: str | None) -> str:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""
