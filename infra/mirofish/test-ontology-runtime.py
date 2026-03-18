#!/usr/bin/env python3
"""Smoke-test the live MiroFish ontology endpoint on the VM itself."""

from __future__ import annotations

import json

import requests


TEST_DOCUMENT = """
Italy is debating a new energy marketing campaign while European utilities, consumer groups,
regulators, journalists, and political actors react online. The discussion includes price
pressure, trust, messaging, and possible backlash across social platforms.
""".strip()


def main() -> None:
    response = requests.post(
        "http://127.0.0.1:5001/api/graph/ontology/generate",
        data={
            "simulation_requirement": "Build a compact social simulation ontology for the public debate around this campaign.",
            "project_name": "Crystal Ontology Test",
        },
        files={
            "files": ("ontology-test.md", TEST_DOCUMENT.encode("utf-8"), "text/markdown"),
        },
        timeout=180,
    )
    payload = response.json()
    data = payload.get("data") or {}
    ontology = data.get("ontology") or {}
    print(
        json.dumps(
            {
                "http_status": response.status_code,
                "success": payload.get("success"),
                "error": payload.get("error"),
                "project_id": data.get("project_id"),
                "entity_count": len(ontology.get("entity_types") or []),
                "edge_count": len(ontology.get("edge_types") or []),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
