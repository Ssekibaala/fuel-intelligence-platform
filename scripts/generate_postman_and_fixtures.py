from __future__ import annotations

import json
import re
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
from http import HTTPStatus
from pathlib import Path
from typing import Any

import yaml


ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "docs" / "openapi.frontend-contract.yaml"
POSTMAN_PATH = ROOT / "docs" / "postman.frontend-contract.collection.json"
FIXTURES_DIR = ROOT / "docs" / "fixtures"


@dataclass
class OperationInfo:
    method: str
    path: str
    summary: str
    tags: list[str]
    secure: bool
    path_params: dict[str, Any]
    query_params: dict[str, Any]
    headers: dict[str, str]
    request_body: Any | None
    response_status: int
    response_content_type: str
    response_body: Any


def load_spec(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def deref_schema(spec: dict[str, Any], schema: dict[str, Any] | None) -> dict[str, Any]:
    if not schema:
        return {}

    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return {}
        parts = ref[2:].split("/")
        target: Any = spec
        for part in parts:
            target = target.get(part)
            if target is None:
                return {}
        return deref_schema(spec, deepcopy(target))

    if "allOf" in schema:
        merged: dict[str, Any] = {"type": "object", "properties": {}, "required": []}
        for part in schema["allOf"]:
            resolved = deref_schema(spec, part)
            if resolved.get("type") == "object" or "properties" in resolved:
                merged["properties"].update(resolved.get("properties", {}))
                merged["required"].extend(resolved.get("required", []))
            else:
                merged.update(resolved)
        merged["required"] = list(dict.fromkeys(merged["required"]))
        if not merged["properties"]:
            merged.pop("properties", None)
        if not merged["required"]:
            merged.pop("required", None)
        return merged

    if "oneOf" in schema:
        return deref_schema(spec, schema["oneOf"][0])

    if "anyOf" in schema:
        return deref_schema(spec, schema["anyOf"][0])

    return deepcopy(schema)


def example_for_schema(spec: dict[str, Any], schema: dict[str, Any] | None, depth: int = 0) -> Any:
    if depth > 7:
        return None

    resolved = deref_schema(spec, schema)
    if not resolved:
        return {}

    if "example" in resolved:
        return deepcopy(resolved["example"])

    if "enum" in resolved and resolved["enum"]:
        return deepcopy(resolved["enum"][0])

    schema_type = resolved.get("type")

    if schema_type == "object" or "properties" in resolved:
        props: dict[str, Any] = resolved.get("properties", {})
        result: dict[str, Any] = {}
        for key, prop_schema in props.items():
            result[key] = example_for_schema(spec, prop_schema, depth + 1)
        if not props and resolved.get("additionalProperties"):
            result["key"] = "value"
        return result

    if schema_type == "array":
        item_schema = resolved.get("items", {})
        return [example_for_schema(spec, item_schema, depth + 1)]

    if schema_type == "integer":
        if resolved.get("format") == "int64":
            return 1
        return 1

    if schema_type == "number":
        return 123.45

    if schema_type == "boolean":
        return True

    if schema_type == "string" or schema_type is None:
        fmt = resolved.get("format")
        if fmt == "uuid":
            return "11111111-1111-1111-1111-111111111111"
        if fmt == "date-time":
            return "2026-02-22T12:00:00Z"
        if fmt == "date":
            return "2026-02-22"
        if fmt == "email":
            return "user@example.com"
        if fmt == "binary":
            return "<binary>"
        return "string"

    return {}


def choose_response(operation: dict[str, Any]) -> tuple[int, str, Any]:
    responses = operation.get("responses", {})
    preferred_codes = ["200", "201", "202", "204", "default"]
    code = None
    for c in preferred_codes:
        if c in responses:
            code = c
            break
    if code is None and responses:
        code = sorted(responses.keys())[0]
    if code is None:
        return 200, "application/json", {}

    response_obj = responses.get(code, {})
    content = response_obj.get("content", {})
    if not content:
        try:
            status_int = int(code) if code.isdigit() else 200
        except Exception:
            status_int = 200
        return status_int, "text/plain", ""

    if "application/json" in content:
        content_type = "application/json"
    else:
        content_type = next(iter(content.keys()))

    schema = content[content_type].get("schema")
    try:
        status_int = int(code) if code.isdigit() else 200
    except Exception:
        status_int = 200

    if content_type == "application/json":
        body_example = example_for_schema(SPEC, schema)
    elif "binary" in str(schema):
        body_example = "<binary>"
    else:
        body_example = "<non-json response>"

    return status_int, content_type, body_example


def is_operation_secure(spec: dict[str, Any], operation: dict[str, Any]) -> bool:
    if "security" in operation:
        return bool(operation["security"])
    return bool(spec.get("security"))


def sanitize_slug(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "_", value)
    return value.strip("_")


def operation_slug(method: str, path: str) -> str:
    return sanitize_slug(f"{method}_{path}")


def extract_operation_info(spec: dict[str, Any], method: str, path: str, operation: dict[str, Any]) -> OperationInfo:
    summary = operation.get("summary") or operation.get("operationId") or f"{method.upper()} {path}"
    tags = operation.get("tags") or ["General"]
    secure = is_operation_secure(spec, operation)

    path_params: dict[str, Any] = {}
    query_params: dict[str, Any] = {}
    headers: dict[str, str] = {}

    params = []
    params.extend(spec.get("paths", {}).get(path, {}).get("parameters", []))
    params.extend(operation.get("parameters", []))

    for param in params:
        if "$ref" in param:
            continue
        location = param.get("in")
        name = param.get("name")
        if not name:
            continue
        sample = example_for_schema(spec, param.get("schema", {}))
        if location == "path":
            path_params[name] = sample
        elif location == "query":
            query_params[name] = sample
        elif location == "header":
            headers[name] = str(sample)

    if secure:
        headers["Authorization"] = "Bearer <token>"

    body_example = None
    request_body = operation.get("requestBody", {})
    content = request_body.get("content", {})
    if "application/json" in content:
        schema = content["application/json"].get("schema")
        body_example = example_for_schema(spec, schema)
        headers.setdefault("Content-Type", "application/json")

    resp_status, resp_content_type, resp_body = choose_response(operation)

    return OperationInfo(
        method=method.upper(),
        path=path,
        summary=summary,
        tags=tags,
        secure=secure,
        path_params=path_params,
        query_params=query_params,
        headers=headers,
        request_body=body_example,
        response_status=resp_status,
        response_content_type=resp_content_type,
        response_body=resp_body,
    )


def postman_url(path: str, path_params: dict[str, Any], query_params: dict[str, Any]) -> dict[str, Any]:
    raw_path = path
    for key in path_params:
        raw_path = raw_path.replace("{" + key + "}", "{{" + key + "}}")

    raw = "{{baseUrl}}" + raw_path
    if query_params:
        pairs = [f"{k}={{{{{k}}}}}" for k in query_params]
        raw = raw + "?" + "&".join(pairs)

    path_parts = [p for p in path.strip("/").split("/") if p]

    url_obj: dict[str, Any] = {
        "raw": raw,
        "host": ["{{baseUrl}}"],
        "path": path_parts,
    }
    if query_params:
        url_obj["query"] = [{"key": k, "value": str(v)} for k, v in query_params.items()]
    if path_params:
        url_obj["variable"] = [{"key": k, "value": str(v)} for k, v in path_params.items()]
    return url_obj


def make_postman_item(op: OperationInfo) -> dict[str, Any]:
    request_obj: dict[str, Any] = {
        "method": op.method,
        "header": [{"key": k, "value": str(v)} for k, v in op.headers.items()],
        "url": postman_url(op.path, op.path_params, op.query_params),
        "description": op.summary,
    }

    if op.request_body is not None:
        request_obj["body"] = {
            "mode": "raw",
            "raw": json.dumps(op.request_body, indent=2),
            "options": {"raw": {"language": "json"}},
        }

    response_headers = [{"key": "Content-Type", "value": op.response_content_type}]
    if op.response_content_type == "application/json":
        body_text = json.dumps(op.response_body, indent=2)
        preview_lang = "json"
    else:
        body_text = str(op.response_body)
        preview_lang = "text"

    try:
        status_text = HTTPStatus(op.response_status).phrase
    except Exception:
        status_text = "OK"

    response_example = {
        "name": f"{op.response_status} example",
        "originalRequest": request_obj,
        "status": status_text,
        "code": op.response_status,
        "header": response_headers,
        "body": body_text,
        "_postman_previewlanguage": preview_lang,
    }

    return {
        "name": f"{op.method} {op.path}",
        "request": request_obj,
        "response": [response_example],
    }


def write_fixtures(op: OperationInfo) -> None:
    slug = operation_slug(op.method, op.path)
    request_fixture = {
        "operation": f"{op.method} {op.path}",
        "summary": op.summary,
        "method": op.method,
        "path": op.path,
        "pathParams": op.path_params,
        "query": op.query_params,
        "headers": op.headers,
        "body": op.request_body,
    }
    response_fixture = {
        "operation": f"{op.method} {op.path}",
        "status": op.response_status,
        "contentType": op.response_content_type,
        "body": op.response_body,
    }

    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)
    (FIXTURES_DIR / f"{slug}.request.json").write_text(
        json.dumps(request_fixture, indent=2), encoding="utf-8"
    )
    (FIXTURES_DIR / f"{slug}.response.json").write_text(
        json.dumps(response_fixture, indent=2), encoding="utf-8"
    )


def build_collection(spec: dict[str, Any], operations: list[OperationInfo]) -> dict[str, Any]:
    server_url = spec.get("servers", [{}])[0].get("url", "http://localhost:3000")

    items_by_tag: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for op in operations:
        tag = op.tags[0] if op.tags else "General"
        items_by_tag[tag].append(make_postman_item(op))

    folder_items = []
    for tag in sorted(items_by_tag.keys()):
        folder_items.append({"name": tag, "item": items_by_tag[tag]})

    return {
        "info": {
            "name": "Fuel Platform Frontend Contract",
            "description": "Generated from docs/openapi.frontend-contract.yaml",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": folder_items,
        "variable": [
            {
                "key": "baseUrl",
                "value": server_url,
            }
        ],
    }


def iter_operations(spec: dict[str, Any]) -> list[OperationInfo]:
    operations: list[OperationInfo] = []
    methods = {"get", "post", "put", "patch", "delete", "head", "options"}
    for path, path_item in spec.get("paths", {}).items():
        for method, operation in path_item.items():
            if method.lower() not in methods:
                continue
            operations.append(extract_operation_info(spec, method, path, operation))
    return operations


def write_fixtures_readme(operation_count: int) -> None:
    content = (
        "# Fixtures\n\n"
        "Auto-generated from `docs/openapi.frontend-contract.yaml`.\n\n"
        "For each operation there are two files:\n"
        "- `<slug>.request.json`\n"
        "- `<slug>.response.json`\n\n"
        f"Total operations generated: **{operation_count}**\n"
    )
    (FIXTURES_DIR / "README.md").write_text(content, encoding="utf-8")


def main() -> None:
    global SPEC
    SPEC = load_spec(SPEC_PATH)

    operations = iter_operations(SPEC)

    if FIXTURES_DIR.exists():
        for file in FIXTURES_DIR.glob("*.json"):
            file.unlink()
    FIXTURES_DIR.mkdir(parents=True, exist_ok=True)

    for op in operations:
        write_fixtures(op)

    write_fixtures_readme(len(operations))

    collection = build_collection(SPEC, operations)
    POSTMAN_PATH.write_text(json.dumps(collection, indent=2), encoding="utf-8")

    print(f"Generated {len(operations)} operation fixtures")
    print(f"Wrote Postman collection: {POSTMAN_PATH.relative_to(ROOT)}")
    print(f"Wrote fixtures directory: {FIXTURES_DIR.relative_to(ROOT)}")


if __name__ == "__main__":
    SPEC: dict[str, Any] = {}
    main()
