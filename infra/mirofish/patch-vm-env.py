#!/usr/bin/env python3
"""Ensure the MiroFish VM .env contains the current OpenRouter runtime knobs."""

from __future__ import annotations

from pathlib import Path


UPDATES = {
    "MIROFISH_GRAPH_MAX_TOKENS": "800",
    "MIROFISH_SIM_MAX_TOKENS": "720",
    "MIROFISH_REPORT_MAX_TOKENS": "720",
    "MIROFISH_JSON_REPAIR_MAX_TOKENS": "256",
}


def main() -> None:
    path = Path("/opt/mirofish/.env")
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    found: set[str] = set()
    next_lines: list[str] = []

    for line in lines:
        if "=" not in line:
            next_lines.append(line)
            continue

        key, _ = line.split("=", 1)
        if key in UPDATES:
            next_lines.append(f"{key}={UPDATES[key]}")
            found.add(key)
        else:
            next_lines.append(line)

    for key, value in UPDATES.items():
        if key not in found:
            next_lines.append(f"{key}={value}")

    path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")
    print(f"Updated {path}")


if __name__ == "__main__":
    main()
