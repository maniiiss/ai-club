#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
探测本地 Hindsight 的记忆事实图相关接口。

用途：
1. 快速确认 Hindsight 是否已启动；
2. 检查图骨架、实体详情、事实 recall 接口是否可用；
3. 输出一份归一化样例，便于后端 DTO 与解析逻辑对照真实返回。

示例：
  python scripts/probe_hindsight_memory_fact_graph.py --bank-id git-ai-club:wiki:project:12 --tag project:12 --query 发布说明
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def build_url(base_url: str, path: str, params: dict[str, Any] | None = None) -> str:
    base = base_url.rstrip("/")
    query = urllib.parse.urlencode(
        [(key, value) for key, raw in (params or {}).items() for value in (raw if isinstance(raw, list) else [raw]) if value not in (None, "")]
    )
    return f"{base}{path}" + (f"?{query}" if query else "")


def request_json(method: str, url: str, api_key: str, payload: dict[str, Any] | None, timeout: int) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    body = None
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url=url, data=body, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = response.read().decode("utf-8")
        return {
            "status": response.status,
            "json": json.loads(text) if text else None,
            "text": text[:1000],
        }


def try_request(method: str, url: str, api_key: str, payload: dict[str, Any] | None, timeout: int) -> dict[str, Any]:
    try:
        return request_json(method, url, api_key, payload, timeout)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return {"status": exc.code, "error": body[:1000]}
    except Exception as exc:  # noqa: BLE001
        return {"status": None, "error": str(exc)}


def normalize_entity_graph(payload: dict[str, Any] | None) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload or {}
    nodes = []
    for item in data.get("nodes", [])[:5]:
        source = item.get("data") if isinstance(item, dict) and isinstance(item.get("data"), dict) else item
        nodes.append(
            {
                "id": source.get("id") or item.get("id"),
                "label": source.get("label") or source.get("name"),
                "mentionCount": source.get("mentionCount") or source.get("mention_count"),
                "type": source.get("type"),
            }
        )
    edges = []
    for item in data.get("edges", [])[:5]:
        source = item.get("data") if isinstance(item, dict) and isinstance(item.get("data"), dict) else item
        edges.append(
            {
                "id": source.get("id") or item.get("id"),
                "source": source.get("source") or item.get("source"),
                "target": source.get("target") or item.get("target"),
                "relationType": source.get("linkType") or source.get("relationType") or source.get("type"),
                "weight": source.get("weight"),
            }
        )
    return {"nodes": nodes, "edges": edges}


def normalize_entity_detail(payload: dict[str, Any] | None) -> dict[str, Any]:
    data = payload.get("data") if isinstance(payload, dict) and isinstance(payload.get("data"), dict) else payload or {}
    observations = []
    for item in data.get("observations", [])[:5]:
        observations.append(
            {
                "text": item.get("observation") or item.get("summary") or item.get("text"),
                "createdAt": item.get("notedAt") or item.get("date") or item.get("createdAt"),
            }
        )
    return {
        "id": data.get("id"),
        "canonicalName": data.get("canonicalName") or data.get("canonical_name") or data.get("label"),
        "aliases": data.get("aliases") or [],
        "mentionCount": data.get("mentionCount") or data.get("mention_count"),
        "observations": observations,
    }


def normalize_recall(payload: dict[str, Any] | None) -> dict[str, Any]:
    results = []
    for item in (payload or {}).get("results", [])[:5]:
        results.append(
            {
                "id": item.get("id") or item.get("document_id"),
                "type": item.get("type"),
                "text": item.get("text") or item.get("snippet") or item.get("content"),
                "score": item.get("score"),
                "tags": item.get("tags") or [],
                "entities": item.get("entities") or [],
            }
        )
    return {"results": results}


def main() -> int:
    parser = argparse.ArgumentParser(description="探测 Hindsight 记忆事实图相关接口")
    parser.add_argument("--base-url", default="http://localhost:18888", help="Hindsight API 基础地址")
    parser.add_argument("--api-key", default="", help="可选 API Key")
    parser.add_argument("--bank-id", default="git-ai-club:wiki:project:1", help="待探测 bank")
    parser.add_argument("--entity-id", default="", help="可选实体 ID；为空时会尝试从实体图里取第一项")
    parser.add_argument("--query", default="项目风险", help="事实 recall 查询词")
    parser.add_argument("--tag", action="append", default=[], help="追加 recall tags，可多次传入")
    parser.add_argument("--limit", type=int, default=10, help="查询上限")
    parser.add_argument("--timeout", type=int, default=8, help="请求超时秒数")
    args = parser.parse_args()

    entity_graph_url = build_url(
        args.base_url,
        f"/v1/default/banks/{urllib.parse.quote(args.bank_id, safe='')}/graph",
        {"limit": max(1, min(args.limit, 200))},
    )
    recall_url = build_url(
        args.base_url,
        f"/v1/default/banks/{urllib.parse.quote(args.bank_id, safe='')}/memories/recall",
    )

    result: dict[str, Any] = {
        "baseUrl": args.base_url,
        "bankId": args.bank_id,
        "health": try_request("GET", build_url(args.base_url, "/health"), args.api_key, None, args.timeout),
        "entityGraph": try_request("GET", entity_graph_url, args.api_key, None, args.timeout),
    }

    entity_graph_json = result["entityGraph"].get("json") if isinstance(result["entityGraph"], dict) else None
    result["entityGraphNormalized"] = normalize_entity_graph(entity_graph_json if isinstance(entity_graph_json, dict) else None)

    entity_id = args.entity_id
    if not entity_id:
        normalized_nodes = result["entityGraphNormalized"].get("nodes", [])
        if normalized_nodes:
            entity_id = normalized_nodes[0].get("id") or ""
    if entity_id:
        entity_detail_url = build_url(
            args.base_url,
            f"/v1/default/banks/{urllib.parse.quote(args.bank_id, safe='')}/entities/{urllib.parse.quote(entity_id, safe='')}",
        )
        result["entityDetail"] = try_request("GET", entity_detail_url, args.api_key, None, args.timeout)
        entity_detail_json = result["entityDetail"].get("json") if isinstance(result["entityDetail"], dict) else None
        result["entityDetailNormalized"] = normalize_entity_detail(entity_detail_json if isinstance(entity_detail_json, dict) else None)

    recall_payload = {
        "query": args.query,
        "limit": max(1, min(args.limit, 30)),
        "budget": "mid",
        "tags": args.tag,
        "types": ["world"],
    }
    result["recall"] = try_request("POST", recall_url, args.api_key, recall_payload, args.timeout)
    recall_json = result["recall"].get("json") if isinstance(result["recall"], dict) else None
    result["recallNormalized"] = normalize_recall(recall_json if isinstance(recall_json, dict) else None)

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
