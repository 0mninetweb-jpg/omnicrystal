#!/usr/bin/env python3
"""Patch the original MiroFish runtime for OpenRouter-first stage support."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def ensure_contains(text: str, snippet: str, anchor: str) -> str:
    if snippet in text:
        return text
    if anchor not in text:
        raise RuntimeError(f"Could not find anchor: {anchor!r}")
    return text.replace(anchor, f"{anchor}{snippet}", 1)


def replace_regex(text: str, pattern: str, replacement: str, *, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.MULTILINE | re.DOTALL)
    if count == 0:
        if replacement in text:
            return text
        raise RuntimeError(f"Could not apply patch '{label}'")
    return updated


def patch_config(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    text = replace_regex(
        text,
        r"LLM_BASE_URL = os\.environ\.get\('LLM_BASE_URL', 'https://[^']+'\)",
        "LLM_BASE_URL = os.environ.get('LLM_BASE_URL', 'https://openrouter.ai/api/v1')",
        label="config-base-url",
    )
    text = replace_regex(
        text,
        r"LLM_MODEL_NAME = os\.environ\.get\('LLM_MODEL_NAME', '[^']+'\)",
        "LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'openai/gpt-4.1-mini')",
        label="config-default-model",
    )
    text = ensure_contains(
        text,
        "    OPENROUTER_SITE_URL = os.environ.get('OPENROUTER_SITE_URL', '')\n"
        "    OPENROUTER_APP_TITLE = os.environ.get('OPENROUTER_APP_TITLE', 'Crystal')\n"
        "    MIROFISH_GRAPH_MODEL = os.environ.get('MIROFISH_GRAPH_MODEL', LLM_MODEL_NAME)\n"
        "    MIROFISH_SIM_MODEL = os.environ.get('MIROFISH_SIM_MODEL', LLM_MODEL_NAME)\n"
        "    MIROFISH_REPORT_MODEL = os.environ.get('MIROFISH_REPORT_MODEL', 'openai/gpt-4.1')\n"
        "    MIROFISH_GRAPH_MAX_TOKENS = int(os.environ.get('MIROFISH_GRAPH_MAX_TOKENS', '800'))\n"
        "    MIROFISH_SIM_MAX_TOKENS = int(os.environ.get('MIROFISH_SIM_MAX_TOKENS', '720'))\n"
        "    MIROFISH_REPORT_MAX_TOKENS = int(os.environ.get('MIROFISH_REPORT_MAX_TOKENS', '720'))\n"
        "    MIROFISH_JSON_REPAIR_MAX_TOKENS = int(os.environ.get('MIROFISH_JSON_REPAIR_MAX_TOKENS', '256'))\n",
        "    LLM_MODEL_NAME = os.environ.get('LLM_MODEL_NAME', 'openai/gpt-4.1-mini')\n",
    )

    llm_helper_block = """\
    @classmethod
    def llm_model_for_stage(cls, stage: str | None = None) -> str:
        stage_key = (stage or '').strip().lower()
        if stage_key in {'graph', 'ontology', 'build'}:
            return cls.MIROFISH_GRAPH_MODEL or cls.LLM_MODEL_NAME
        if stage_key in {'simulation', 'sim', 'prepare', 'oasis'}:
            return cls.MIROFISH_SIM_MODEL or cls.LLM_MODEL_NAME
        if stage_key in {'report', 'reporting'}:
            return cls.MIROFISH_REPORT_MODEL or cls.LLM_MODEL_NAME
        return cls.LLM_MODEL_NAME

    @classmethod
    def llm_max_tokens_for_stage(cls, stage: str | None = None, *, json_mode: bool = False) -> int:
        stage_key = (stage or '').strip().lower()
        if stage_key in {'graph', 'ontology', 'build'}:
            return cls.MIROFISH_GRAPH_MAX_TOKENS
        if stage_key in {'simulation', 'sim', 'prepare', 'oasis'}:
            return cls.MIROFISH_SIM_MAX_TOKENS
        if stage_key in {'report', 'reporting'}:
            return cls.MIROFISH_REPORT_MAX_TOKENS
        return cls.MIROFISH_GRAPH_MAX_TOKENS if json_mode else cls.MIROFISH_REPORT_MAX_TOKENS

    @classmethod
    def openrouter_headers(cls) -> dict[str, str]:
        if 'openrouter.ai' not in (cls.LLM_BASE_URL or '').lower():
            return {}
        headers: dict[str, str] = {}
        if cls.OPENROUTER_SITE_URL:
            headers['HTTP-Referer'] = cls.OPENROUTER_SITE_URL
        if cls.OPENROUTER_APP_TITLE:
            headers['X-OpenRouter-Title'] = cls.OPENROUTER_APP_TITLE
        return headers

"""

    text = replace_regex(
        text,
        r"\n\s*@classmethod\s+def llm_model_for_stage\(.*?\n\s*@classmethod\s+def validate\(cls\):",
        f"\n{llm_helper_block}    @classmethod\n    def validate(cls):",
        label="config-helpers",
    ) if "def llm_model_for_stage" in text else ensure_contains(text, llm_helper_block, "    REPORT_AGENT_TEMPERATURE = float(os.environ.get('REPORT_AGENT_TEMPERATURE', '0.5'))\n\n")

    if text != original:
        path.write_text(text, encoding="utf-8")


LLM_CLIENT_TEMPLATE = '''"""
LLM客户端封装
统一使用OpenAI格式调用
"""

import json
import logging
import re
from typing import Optional, Dict, Any, List

from openai import OpenAI

from ..config import Config

logger = logging.getLogger(__name__)


def _resolve_model(stage: Optional[str], explicit_model: Optional[str]) -> str:
    if explicit_model:
        return explicit_model
    return Config.llm_model_for_stage(stage)


def _client_kwargs(api_key: str, base_url: str) -> Dict[str, Any]:
    kwargs: Dict[str, Any] = {
        "api_key": api_key,
        "base_url": base_url,
    }
    headers = Config.openrouter_headers()
    if headers:
        kwargs["default_headers"] = headers
    return kwargs


class LLMClient:
    """LLM客户端"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        stage: Optional[str] = None
    ):
        self.api_key = api_key or Config.LLM_API_KEY
        self.base_url = base_url or Config.LLM_BASE_URL
        self.stage = stage
        self.model = _resolve_model(stage, model)

        if not self.api_key:
            raise ValueError("LLM_API_KEY 未配置")

        self.client = OpenAI(**_client_kwargs(self.api_key, self.base_url))

    def chat(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        response_format: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        发送聊天请求

        Args:
            messages: 消息列表
            temperature: 温度参数
            max_tokens: 最大token数
            response_format: 响应格式（如JSON模式）

        Returns:
            模型响应文本
        """
        resolved_max_tokens = max_tokens or Config.llm_max_tokens_for_stage(self.stage, json_mode=False)
        kwargs: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": resolved_max_tokens,
        }

        if response_format:
            kwargs["response_format"] = response_format

        response = self.client.chat.completions.create(**kwargs)
        content = response.choices[0].message.content or ""
        content = re.sub(r"<think>[\\s\\S]*?</think>", "", content).strip()
        return content

    def _repair_json_once(self, cleaned_response: str, error: json.JSONDecodeError) -> Dict[str, Any] | None:
        truncated = cleaned_response[:5000]
        if not truncated:
            return None

        logger.warning(
            "LLM JSON decode failed for stage=%s model=%s error=%s excerpt=%r",
            self.stage or "default",
            self.model,
            error.msg,
            cleaned_response[:240],
        )

        repair_messages = [
            {
                "role": "system",
                "content": (
                    "You repair malformed JSON. Return only one valid JSON object that preserves the original schema. "
                    "Do not add markdown, comments, or explanations."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"The previous model returned malformed JSON for stage '{self.stage or 'default'}'.\\n"
                    f"Decoder error: {error.msg} at line {error.lineno}, column {error.colno}.\\n"
                    "Repair it and return valid compact JSON only.\\n\\n"
                    f"Malformed JSON:\\n{truncated}"
                ),
            },
        ]

        repaired = self.chat(
            messages=repair_messages,
            temperature=0.0,
            max_tokens=Config.MIROFISH_JSON_REPAIR_MAX_TOKENS,
            response_format={"type": "json_object"},
        )
        repaired = repaired.strip()
        repaired = re.sub(r"^```(?:json)?\\s*\\n?", "", repaired, flags=re.IGNORECASE)
        repaired = re.sub(r"\\n?```\\s*$", "", repaired)
        repaired = repaired.strip()

        if not repaired:
            return None

        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            logger.error(
                "JSON repair also failed for stage=%s model=%s excerpt=%r",
                self.stage or "default",
                self.model,
                repaired[:240],
            )
            return None

    def chat_json(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.3,
        max_tokens: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        发送聊天请求并返回JSON

        Args:
            messages: 消息列表
            temperature: 温度参数
            max_tokens: 最大token数

        Returns:
            解析后的JSON对象
        """
        resolved_max_tokens = max_tokens or Config.llm_max_tokens_for_stage(self.stage, json_mode=True)
        response = self.chat(
            messages=messages,
            temperature=temperature,
            max_tokens=resolved_max_tokens,
            response_format={"type": "json_object"}
        )
        cleaned_response = response.strip()
        cleaned_response = re.sub(r"^```(?:json)?\\s*\\n?", "", cleaned_response, flags=re.IGNORECASE)
        cleaned_response = re.sub(r"\\n?```\\s*$", "", cleaned_response)
        cleaned_response = cleaned_response.strip()

        try:
            return json.loads(cleaned_response)
        except json.JSONDecodeError as error:
            repaired = self._repair_json_once(cleaned_response, error)
            if repaired is not None:
                return repaired
            raise ValueError(
                f"LLM返回的JSON格式无效({error.msg})，片段: {cleaned_response[:240]}"
            ) from error
'''


def patch_llm_client(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    if text != LLM_CLIENT_TEMPLATE:
        path.write_text(LLM_CLIENT_TEMPLATE, encoding="utf-8")


def patch_ontology_generator(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    text = ensure_contains(text, "from ..config import Config\n", "from ..utils.llm_client import LLMClient\n")
    text = replace_regex(
        text,
        r"MAX_TEXT_LENGTH_FOR_LLM = \d+",
        "MAX_TEXT_LENGTH_FOR_LLM = 8000",
        label="ontology-max-text",
    )
    text = replace_regex(
        text,
        r"max_tokens=1536",
        "max_tokens=Config.llm_max_tokens_for_stage(\"graph\", json_mode=True)",
        label="ontology-max-tokens",
    )
    text = replace_regex(
        text,
        r"temperature=0\.3,",
        "temperature=0.1,",
        label="ontology-temperature",
    )
    text = replace_regex(
        text,
        r"\*\*必须遵守的规则\*\*：\n1\. 必须正好输出10个实体类型\n2\. 最后2个必须是兜底类型：Person（个人兜底）和 Organization（组织兜底）\n3\. 前8个是根据文本内容设计的具体类型\n4\. 所有实体类型必须是现实中可以发声的主体，不能是抽象概念\n5\. 属性名不能使用 name、uuid、group_id 等保留字，用 full_name、org_name 等替代\n(?:6\..*?\n)?(?:7\..*?\n)?(?:8\..*?\n)?(?:9\..*?\n)?(?:10\..*?\n)?",
        "**必须遵守的规则**：\n"
        "1. 必须正好输出10个实体类型\n"
        "2. 最后2个必须是兜底类型：Person 和 Organization\n"
        "3. 前8个是根据文本内容设计的具体类型\n"
        "4. 必须只使用真实可发声主体，不能是抽象概念\n"
        "5. 每个实体类型只保留1个属性，且属性名不能使用 name、uuid、group_id\n"
        "6. 每个实体类型只保留1个 example\n"
        "7. 关系类型固定为6个，且每个关系只保留1个 source_target\n"
        "8. 所有 description 必须极短，尽量不超过6个英文单词\n"
        "9. analysis_summary 控制在24个汉字以内\n"
        "10. 返回单行紧凑 JSON，不要缩进，不要 markdown\n",
        label="ontology-rules",
    )

    if text != original:
        path.write_text(text, encoding="utf-8")


def patch_graph_api(path: Path) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    if "logger.exception(\"Ontology generation failed: %s\", e)" not in text:
        text = text.replace(
            "    except Exception as e:\n"
            "        return jsonify({\n"
            "            \"success\": False,\n"
            "            \"error\": str(e),\n"
            "            \"traceback\": traceback.format_exc()\n"
            "        }), 500\n",
            "    except Exception as e:\n"
            "        logger.exception(\"Ontology generation failed: %s\", e)\n"
            "        return jsonify({\n"
            "            \"success\": False,\n"
            "            \"error\": str(e),\n"
            "            \"traceback\": traceback.format_exc()\n"
            "        }), 500\n",
            1,
        )

    if text != original:
        path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", required=True, help="Path to the cloned MiroFish repo root")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    backend_app = repo_root / "backend" / "app"
    if not backend_app.exists():
        raise SystemExit(f"Could not find backend/app under {repo_root}")

    patch_config(backend_app / "config.py")
    patch_llm_client(backend_app / "utils" / "llm_client.py")
    patch_ontology_generator(backend_app / "services" / "ontology_generator.py")
    patch_graph_api(backend_app / "api" / "graph.py")
    print(f"Applied OpenRouter runtime patches to {repo_root}")


if __name__ == "__main__":
    main()
