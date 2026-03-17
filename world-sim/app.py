from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

from flask import Flask, jsonify, request

app = Flask(__name__)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def require_api_key() -> tuple[bool, tuple[dict[str, Any], int] | None]:
    expected = os.environ.get("WORLDSIM_API_KEY", "").strip()
    if not expected:
        return True, None

    received = request.headers.get("X-WorldSim-Key", "").strip()
    if received == expected:
        return True, None

    return False, ({"error": "Invalid WorldSim API key."}, 401)


def safe_text(value: Any, fallback: str = "") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def clamp01(value: Any, fallback: float = 0.5) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return fallback
    if num > 1:
        num = num / 100
    return max(0.0, min(1.0, num))


def normalize_horizon(query_plan: dict[str, Any]) -> str:
    horizons = query_plan.get("horizons") or []
    if horizons and isinstance(horizons[0], dict):
        return safe_text(horizons[0].get("horizon_id"), "30d")
    return "30d"


def build_graph_pack(query: str, query_plan: dict[str, Any]) -> dict[str, Any]:
    entities = []
    for entity in query_plan.get("entities") or []:
        label = safe_text(entity.get("label") or entity.get("entity_id"))
        if label:
            entities.append(label)

    if not entities:
        query_tokens = [token.strip(",. ") for token in query.split() if len(token) > 4]
        entities = list(dict.fromkeys(query_tokens[:4]))

    domain = safe_text(query_plan.get("domain_id") or query_plan.get("domain"), "A.11.geopolitics.trade_tensions")
    horizon = normalize_horizon(query_plan)
    tensions = [
        "Incentivi divergenti tra governi, blocchi commerciali e opinione pubblica",
        "Shock mediatici e timeline politica possono comprimere le finestre decisionali",
        "Le mosse simboliche possono cambiare il sentiment prima dei dati hard",
    ]
    communities = [
        "Coalizione governativa e attori istituzionali",
        "Mercati, imprese e catene di fornitura",
        "Media, opinione pubblica e alleati esterni",
    ]
    relations = [f"{entities[i]} <-> {entities[i + 1]}" for i in range(0, max(0, len(entities) - 1))]

    graph_id = hashlib.sha1(f"{query}|{domain}|{horizon}".encode("utf-8")).hexdigest()[:12]

    return {
        "graph_id": f"mirofish-lite-{graph_id}",
        "domain": domain,
        "horizon": horizon,
        "graph_summary": f"World graph focalizzato su {domain} con attenzione a {', '.join(entities[:3]) or 'driver geopolitici'}",
        "entities": entities,
        "relations": relations,
        "community_summaries": communities,
        "timeline_events": [
            "Shock iniziale di narrative e pricing",
            "Reazione di coalizioni, istituzioni e media",
            "Assestamento o escalation entro l'orizzonte richiesto",
        ],
        "tensions": tensions,
        "source_set": ["mirofish-sidecar", "query-plan", "world-sim-heuristic"],
    }


def build_prediction_market_frame(query: str, graph_pack: dict[str, Any]) -> dict[str, Any]:
    horizon = graph_pack.get("horizon", "30d")
    outcome = f"Scenario dominante per: {query[:120]}"
    resolution = "Si considera risolto se entro l'orizzonte l'evento principale descritto supera chiaramente i contro-scenari."
    return {
        "outcome": outcome,
        "horizon": horizon,
        "resolution_criteria": resolution,
        "reference_market": "",
        "prior_probability": None,
    }


def run_simulation(query: str, query_plan: dict[str, Any], graph_pack: dict[str, Any], simulation_mode: str) -> dict[str, Any]:
    lowered = query.lower()
    escalation_bias = 0.03 if any(keyword in lowered for keyword in ["war", "conflitto", "sanction", "sanzion", "tariff", "dazi"]) else 0.0
    deescalation_bias = -0.02 if any(keyword in lowered for keyword in ["ceasefire", "accordo", "negoziat", "coalizione stabile"]) else 0.0
    probability_delta = max(-0.05, min(0.05, escalation_bias + deescalation_bias))

    scenarios = [
        {"label": "Escalation controllata", "probability": 0.43 + probability_delta},
        {"label": "Stallo frammentato", "probability": 0.34 - probability_delta / 2},
        {"label": "De-escalation negoziata", "probability": 0.23 - probability_delta / 2},
    ]
    total = sum(item["probability"] for item in scenarios)
    scenarios = [{**item, "probability": max(0.05, item["probability"] / total)} for item in scenarios]
    total = sum(item["probability"] for item in scenarios)
    scenarios = [{**item, "probability": item["probability"] / total} for item in scenarios]

    entities = graph_pack.get("entities") or ["coalition", "market", "media"]
    pivotal_actors = entities[:3]
    intervention_points = [
        "Segui dichiarazioni ufficiali e smentite delle prossime 72 ore",
        "Monitora misure economiche o restrittive che cambiano il payoff degli attori",
        "Traccia il cambio di sentiment tra media, alleati e operatori economici",
    ]

    quality_score = 0.72 if len(entities) >= 2 else 0.58
    graph_coverage = 0.7 if len(entities) >= 3 else 0.55
    agent_convergence = 0.68 if simulation_mode != "full_rebuild" else 0.63
    confidence_delta = 0.05 if quality_score >= 0.7 else 0.0

    narrative_arc = (
        "Il sistema converge su una fase iniziale di pressione narrativa e diplomatica, "
        "seguita da un assestamento in cui pochi attori pivot possono spostare l'equilibrio."
    )

    return {
        "enabled": True,
        "simulation_mode": simulation_mode,
        "quality_score": quality_score,
        "graph_coverage": graph_coverage,
        "agent_convergence": agent_convergence,
        "graph_age_hours": 6 if simulation_mode != "cache_hit" else 1,
        "narrative_arc": narrative_arc,
        "pivotal_actors": pivotal_actors,
        "intervention_points": intervention_points,
        "counterfactuals": [
            {
                "label": "Rottura della disciplina di coalizione",
                "outcome": "Aumenta la probabilita di stallo e volatilita narrativa.",
            },
            {
                "label": "Segnale coordinato di de-escalation",
                "outcome": "Riduce il rischio percepito e alza il peso dello scenario negoziale.",
            },
        ],
        "source_set": graph_pack.get("source_set", []),
        "scenario_frequencies": scenarios,
        "prediction_market_frame": build_prediction_market_frame(query, graph_pack),
        "probability_delta": probability_delta,
        "confidence_delta": confidence_delta,
        "graph_summary": graph_pack.get("graph_summary", ""),
        "community_summaries": graph_pack.get("community_summaries", []),
        "tensions": graph_pack.get("tensions", []),
        "simulation_id": graph_pack.get("graph_id"),
        "cache_status": "computed",
        "generated_at": utc_now_iso(),
        "notes": [
            "MiroFish-style heuristic sidecar: replace with full graph memory + agent runtime for production.",
        ],
    }


def generate_report(query: str, digest: dict[str, Any]) -> dict[str, Any]:
    top_scenario = (digest.get("scenario_frequencies") or [{}])[0]
    title = f"WorldSim report: {query[:80]}"
    summary = (
        f"Scenario dominante: {safe_text(top_scenario.get('label'), 'N/A')} "
        f"({round(clamp01(top_scenario.get('probability'), 0) * 100)}%). "
        f"Attori pivot: {', '.join(digest.get('pivotal_actors') or []) or 'n/a'}."
    )
    return {
        "title": title,
        "summary": summary,
    }


@app.get("/health")
def health() -> tuple[dict[str, Any], int]:
    return {
        "ok": True,
        "service": "crystal-world-sim-sidecar",
        "timestamp": utc_now_iso(),
    }, 200


@app.post("/graph/build")
def graph_build() -> tuple[dict[str, Any], int]:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or {}
    return {"success": True, "data": build_graph_pack(query, query_plan)}, 200


@app.post("/simulation/run")
def simulation_run() -> tuple[dict[str, Any], int]:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or {}
    graph_pack = payload.get("graph_pack") or build_graph_pack(query, query_plan)
    simulation_mode = safe_text(payload.get("simulation_mode"), "delta_simulation")
    return {"success": True, "data": run_simulation(query, query_plan, graph_pack, simulation_mode)}, 200


@app.post("/report/generate")
def report_generate() -> tuple[dict[str, Any], int]:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    digest = payload.get("digest") or {}
    return {"success": True, "data": generate_report(query, digest)}, 200


@app.post("/simulate")
def simulate() -> tuple[dict[str, Any], int]:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or {}
    simulation_mode = safe_text(payload.get("simulation_mode"), "delta_simulation")

    graph_pack = build_graph_pack(query, query_plan)
    digest = run_simulation(query, query_plan, graph_pack, simulation_mode)
    report = generate_report(query, digest)

    return {
        **digest,
        "report": report,
    }, 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8081"))
    app.run(host="0.0.0.0", port=port, debug=False)
