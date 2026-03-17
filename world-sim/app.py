from __future__ import annotations

import hashlib
import json
import os
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

TERMINAL_JOB_STATUSES = {"completed", "failed", "canceled"}
JOB_THREADS: dict[str, threading.Thread] = {}
JOB_LOCK = threading.RLock()
DEFAULT_RUNTIME_DIR = Path(__file__).resolve().parent / ".runtime" / "jobs"


class JobCanceledError(RuntimeError):
    pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_iso(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        normalized = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def safe_text(value: Any, fallback: str = "") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def clamp01(value: Any, fallback: float = 0.5) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        return fallback

    if num > 1:
        num = num / 100.0

    return max(0.0, min(1.0, num))


def normalize_horizon(query_plan: dict[str, Any]) -> str:
    horizons = query_plan.get("horizons") or []
    if horizons and isinstance(horizons[0], dict):
        return safe_text(horizons[0].get("horizon_id"), "30d")
    return "30d"


def sanitize_list(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    return [str(item).strip() for item in values if str(item).strip()]


def sanitize_intervention_payload(payload: Any) -> dict[str, Any]:
    payload = payload if isinstance(payload, dict) else {}
    return {
        "cardId": safe_text(payload.get("cardId") or payload.get("card_id"), "matrix-custom"),
        "category": safe_text(payload.get("category"), "marketing_attention"),
        "label": safe_text(payload.get("label"), "Matrix intervention"),
        "intent": safe_text(
            payload.get("intent"),
            "Inject a structured intervention and observe how the world state reacts.",
        ),
        "intensity": clamp01(payload.get("intensity"), 0.42),
        "geography": safe_text(payload.get("geography"), "Global"),
        "duration": safe_text(payload.get("duration"), "30d"),
        "targetAudience": safe_text(
            payload.get("targetAudience") or payload.get("target_audience"),
            "Exposed communities",
        ),
        "timing": safe_text(payload.get("timing"), "Immediately"),
        "safetyNote": safe_text(
            payload.get("safetyNote") or payload.get("safety_note"),
            "Simulation only. This is not operational guidance or a certain forecast.",
        ),
    }


def ensure_runtime_dir() -> Path:
    raw_path = safe_text(os.environ.get("MIROFISH_JOB_DATA_DIR"))
    base_dir = Path(raw_path) if raw_path else DEFAULT_RUNTIME_DIR
    if not base_dir.is_absolute():
        base_dir = Path(__file__).resolve().parent / base_dir
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir


def job_path(job_id: str) -> Path:
    return ensure_runtime_dir() / f"{job_id}.json"


def read_job(job_id: str) -> dict[str, Any] | None:
    path = job_path(job_id)
    if not path.exists():
        return None

    with JOB_LOCK:
        return json.loads(path.read_text(encoding="utf-8"))


def write_job(job: dict[str, Any]) -> dict[str, Any]:
    job_id = safe_text(job.get("jobId"))
    if not job_id:
        raise ValueError("WorldSim job is missing jobId.")

    payload = {**job, "lastUpdatedAt": safe_text(job.get("lastUpdatedAt"), utc_now_iso())}
    path = job_path(job_id)
    tmp_path = path.with_suffix(".tmp")

    with JOB_LOCK:
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp_path.replace(path)

    return payload


def patch_job(job_id: str, **patch: Any) -> dict[str, Any]:
    job = read_job(job_id)
    if not job:
        raise FileNotFoundError(f"WorldSim job not found: {job_id}")

    next_job = {**job, **patch, "lastUpdatedAt": utc_now_iso()}
    return write_job(next_job)


def job_public_view(job: dict[str, Any]) -> dict[str, Any]:
    return {
        "jobId": safe_text(job.get("jobId")),
        "kind": safe_text(job.get("jobType"), "observe"),
        "status": safe_text(job.get("status"), "created"),
        "progress": clamp01(job.get("progress"), 0.0),
        "phase": safe_text(job.get("phase"), "created"),
        "statusMessage": safe_text(job.get("statusMessage")),
        "createdAt": safe_text(job.get("createdAt"), utc_now_iso()),
        "lastUpdatedAt": safe_text(job.get("lastUpdatedAt"), utc_now_iso()),
        "source": safe_text(job.get("source"), "manual"),
        "sourceRef": safe_text(job.get("sourceRef")),
        "template": safe_text(job.get("template"), "public-discourse"),
        "runtime": safe_text(job.get("runtime"), "mirofish-original"),
        "adapterMode": safe_text(job.get("adapterMode"), "fallback"),
        "agentCount": safe_int(job.get("agentCount"), 120),
        "depth": safe_text(job.get("depth"), "lite"),
        "queue": safe_text(job.get("queue"), "shared"),
        "branchId": safe_text(job.get("branchId")) or None,
        "branchParentId": safe_text(job.get("branchParentId")) or None,
        "reportAvailable": bool(job.get("report")),
        "resultAvailable": bool(job.get("digest")),
        "external": {
            "projectId": safe_text(job.get("projectId")),
            "graphId": safe_text(job.get("graphId")),
            "simulationId": safe_text(job.get("simulationId")),
            "reportId": safe_text(job.get("reportId")),
        },
        "error": safe_text(job.get("error")),
    }


def require_api_key() -> tuple[bool, tuple[Any, int] | None]:
    expected = os.environ.get("WORLDSIM_API_KEY", "").strip()
    if not expected:
        return True, None

    received = request.headers.get("X-WorldSim-Key", "").strip()
    if received == expected:
        return True, None

    return False, (jsonify({"error": "Invalid WorldSim API key."}), 401)


def adapter_is_configured() -> bool:
    return bool(safe_text(os.environ.get("MIROFISH_BACKEND_URL")))


def adapter_allows_fallback() -> bool:
    return safe_text(os.environ.get("MIROFISH_ALLOW_FALLBACK"), "true").lower() not in {"0", "false", "no"}


def outbound_headers() -> dict[str, str]:
    headers: dict[str, str] = {}

    backend_key = safe_text(os.environ.get("MIROFISH_BACKEND_API_KEY"))
    bearer = safe_text(os.environ.get("MIROFISH_BEARER_TOKEN"))

    if backend_key:
        headers["X-API-Key"] = backend_key
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"

    return headers


def mirofish_request(
    method: str,
    path: str,
    *,
    json_body: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    files: Any = None,
    timeout_sec: int | None = None,
) -> dict[str, Any]:
    base_url = safe_text(os.environ.get("MIROFISH_BACKEND_URL")).rstrip("/")
    if not base_url:
        raise RuntimeError("MIROFISH_BACKEND_URL is not configured.")

    timeout = timeout_sec or safe_int(os.environ.get("MIROFISH_HTTP_TIMEOUT_SEC"), 180)
    response = requests.request(
        method.upper(),
        f"{base_url}{path}",
        headers=outbound_headers(),
        json=json_body,
        data=data,
        files=files,
        timeout=timeout,
    )
    response.raise_for_status()

    payload = response.json()
    if isinstance(payload, dict) and payload.get("success") is False:
        raise RuntimeError(safe_text(payload.get("error"), f"MiroFish request failed: {path}"))

    if isinstance(payload, dict) and "data" in payload:
        data_payload = payload.get("data")
        return data_payload if isinstance(data_payload, dict) else {"value": data_payload}

    return payload if isinstance(payload, dict) else {"value": payload}


def build_graph_pack(query: str, query_plan: dict[str, Any]) -> dict[str, Any]:
    entities: list[str] = []
    for entity in query_plan.get("entities") or []:
        if isinstance(entity, dict):
            label = safe_text(entity.get("label") or entity.get("entity_id"))
        else:
            label = safe_text(entity)
        if label:
            entities.append(label)

    if not entities:
        query_tokens = [token.strip(",. ") for token in query.split() if len(token) > 4]
        entities = list(dict.fromkeys(query_tokens[:4]))

    domain = safe_text(query_plan.get("domain_id") or query_plan.get("domain"), "A.11.geopolitics.trade_tensions")
    horizon = normalize_horizon(query_plan)
    tensions = [
        "Competing incentives between institutions, communities, and markets.",
        "Narrative shocks can move behavior before hard data catches up.",
        "Symbolic actions may change perceived payoffs faster than formal policy.",
    ]
    communities = [
        "Institutions and decision-makers",
        "Markets, operators, and supply chains",
        "Media, audiences, and networked communities",
    ]
    relations = [f"{entities[i]} <-> {entities[i + 1]}" for i in range(0, max(0, len(entities) - 1))]

    graph_id = hashlib.sha1(f"{query}|{domain}|{horizon}".encode("utf-8")).hexdigest()[:12]

    return {
        "graph_id": f"mirofish-lite-{graph_id}",
        "domain": domain,
        "horizon": horizon,
        "graph_summary": f"World graph focused on {domain} with emphasis on {', '.join(entities[:3]) or 'macro social drivers'}",
        "entities": entities,
        "relations": relations,
        "community_summaries": communities,
        "timeline_events": [
            "Initial narrative and market shock",
            "Institutional and coalition response",
            "Stabilization, escalation, or regime shift within the selected horizon",
        ],
        "tensions": tensions,
        "source_set": ["mirofish-adapter", "query-plan", "world-sim-fallback"],
    }


def build_prediction_market_frame(query: str, graph_pack: dict[str, Any]) -> dict[str, Any]:
    horizon = graph_pack.get("horizon", "30d")
    outcome = f"Dominant scenario for: {query[:120]}"
    resolution = "Resolved when the described outcome clearly dominates alternative scenarios within the horizon."
    return {
        "outcome": outcome,
        "horizon": horizon,
        "resolution_criteria": resolution,
        "reference_market": "",
        "prior_probability": None,
    }


def run_simulation(query: str, query_plan: dict[str, Any], graph_pack: dict[str, Any], simulation_mode: str) -> dict[str, Any]:
    lowered = query.lower()
    escalation_bias = 0.03 if any(keyword in lowered for keyword in ["war", "conflict", "sanction", "tariff", "dazi", "sanzion"]) else 0.0
    deescalation_bias = -0.02 if any(keyword in lowered for keyword in ["ceasefire", "deal", "agreement", "negoziat", "accordo"]) else 0.0
    probability_delta = max(-0.05, min(0.05, escalation_bias + deescalation_bias))

    scenarios = [
        {"label": "Managed escalation", "probability": 0.43 + probability_delta},
        {"label": "Fragmented stalemate", "probability": 0.34 - probability_delta / 2},
        {"label": "Negotiated de-escalation", "probability": 0.23 - probability_delta / 2},
    ]

    total = sum(item["probability"] for item in scenarios)
    normalized = []
    for item in scenarios:
        probability = max(0.05, item["probability"] / total)
        normalized.append({**item, "probability": probability})

    total = sum(item["probability"] for item in normalized)
    scenarios = [{**item, "probability": item["probability"] / total} for item in normalized]

    entities = graph_pack.get("entities") or ["coalition", "market", "media"]
    pivotal_actors = entities[:3]
    intervention_points = [
        "Watch the next 72 hours of official messaging and reversals.",
        "Track economic or restrictive measures that shift actor incentives.",
        "Monitor sentiment changes across media, allies, and operators.",
    ]

    quality_score = 0.72 if len(entities) >= 2 else 0.58
    graph_coverage = 0.7 if len(entities) >= 3 else 0.55
    agent_convergence = 0.68 if simulation_mode != "full_rebuild" else 0.63
    confidence_delta = 0.05 if quality_score >= 0.7 else 0.0

    return {
        "enabled": True,
        "simulation_mode": simulation_mode,
        "quality_score": quality_score,
        "graph_coverage": graph_coverage,
        "agent_convergence": agent_convergence,
        "graph_age_hours": 6 if simulation_mode != "cache_hit" else 1,
        "narrative_arc": (
            "The system converges on an initial wave of narrative and institutional pressure, "
            "followed by a phase where a few pivotal actors can change the equilibrium."
        ),
        "pivotal_actors": pivotal_actors,
        "intervention_points": intervention_points,
        "counterfactuals": [
            {
                "label": "Coalition discipline breaks",
                "outcome": "Raises the probability of stalemate and narrative volatility.",
            },
            {
                "label": "Coordinated signal of de-escalation",
                "outcome": "Reduces perceived risk and lifts the negotiated scenario.",
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
            "Fallback WorldSim digest generated inside the Crystal adapter.",
        ],
    }


def generate_report(query: str, digest: dict[str, Any]) -> dict[str, Any]:
    top_scenario = (digest.get("scenario_frequencies") or [{}])[0]
    title = f"WorldSim report: {query[:80]}"
    summary = (
        f"Dominant scenario: {safe_text(top_scenario.get('label'), 'N/A')} "
        f"({round(clamp01(top_scenario.get('probability'), 0) * 100)}%). "
        f"Pivotal actors: {', '.join(digest.get('pivotal_actors') or []) or 'n/a'}."
    )
    return {
        "title": title,
        "summary": summary,
    }


def build_matrix_result(job: dict[str, Any], baseline_digest: dict[str, Any]) -> dict[str, Any]:
    payload = sanitize_intervention_payload(job.get("interventionPayload"))
    category = payload.get("category")
    narrative_map = {
        "marketing_attention": (
            "Attention compresses quickly around a visible launch, then fragments into intent, curiosity, and rejection.",
            "Audience response starts with curiosity, then splits between early adopters and skeptical observers.",
            "Low systemic stress, but high volatility in attention.",
        ),
        "media_narrative": (
            "A narrative frame moves faster than facts and changes which actors look credible in the public conversation.",
            "Narrative alignment triggers amplification among already primed communities.",
            "Moderate systemic stress through framing and reputational pressure.",
        ),
        "policy_regulation": (
            "Institutions respond first, operators second, and households only later see the real downstream tradeoffs.",
            "Institutional compliance rises before public clarity catches up.",
            "Moderate-to-high stress where incentives and compliance diverge.",
        ),
        "pricing_product": (
            "Perceived fairness becomes the hinge and churn stories can spread faster than product wins.",
            "Users compare alternatives publicly and create fast narrative loops.",
            "Medium stress concentrated on loyalty and switching behavior.",
        ),
        "social_shock": (
            "A broad social shock redistributes trust quickly across communities with different coping capacity.",
            "Communities adapt unevenly, creating visible pressure pockets before macro data reacts.",
            "High social stress with uneven local resilience.",
        ),
        "conflict_systemic_shock": (
            "Coalitions harden, logistics become fragile, and the system reallocates attention to containment.",
            "Public reactions swing between demand for stability and rapid narrative escalation.",
            "High systemic stress with visible spillover risk.",
        ),
        "health_disruption_shock": (
            "Service capacity and trust become the key bottlenecks, and perception can move faster than formal alerts.",
            "Communities change routines before institutions fully normalize the signal.",
            "High stress on services, coordination, and public trust.",
        ),
    }
    narrative_shift, social_response, system_stress = narrative_map.get(
        category,
        (
            "The system absorbs the intervention, then redistributes pressure along the most exposed relationships.",
            "Communities respond in waves rather than all at once.",
            "Mixed stress across the network.",
        ),
    )

    duration_factor = 0.07 if any(x in payload["duration"].lower() for x in ["60d", "90d"]) else 0.05 if any(x in payload["duration"].lower() for x in ["30d", "45d"]) else 0.03
    geography_factor = 0.02 if any(x in payload["geography"].lower() for x in ["global", "regional", "eu", "europe"]) else 0.015 if any(x in payload["geography"].lower() for x in ["metro", "city", "urban"]) else 0.01
    category_factor = {
        "marketing_attention": 0.025,
        "media_narrative": 0.03,
        "policy_regulation": 0.04,
        "pricing_product": 0.022,
        "social_shock": 0.045,
        "conflict_systemic_shock": 0.05,
        "health_disruption_shock": 0.048,
    }.get(category, 0.02)
    delta_probability = max(-0.18, min(0.18, payload["intensity"] * 0.08 + duration_factor + geography_factor + category_factor - 0.04))

    scenarios = baseline_digest.get("scenario_frequencies") or []
    shifted = []
    for index, scenario in enumerate(scenarios):
        delta = delta_probability if index == 0 else -delta_probability / 2 if index == 1 else abs(delta_probability) / 2
        shifted.append(
            {
                "label": safe_text(scenario.get("label"), f"Scenario {index + 1}"),
                "probability": clamp01(safe_float(scenario.get("probability"), 0.33) + delta, 0.33),
            }
        )
    if not shifted:
        shifted = [
            {"label": "Higher momentum", "probability": clamp01(0.5 + delta_probability, 0.55)},
            {"label": "Contained response", "probability": clamp01(0.3 - delta_probability / 2, 0.25)},
            {"label": "Backlash and reversal", "probability": clamp01(0.2 + abs(delta_probability) / 2, 0.2)},
        ]
    total = sum(item["probability"] for item in shifted) or 1
    shifted = [{**item, "probability": item["probability"] / total} for item in shifted]

    intervention_digest = {
        **baseline_digest,
        "simulation_mode": "matrix_fallback_async",
        "narrative_arc": f"{narrative_shift} Timing: {payload['timing']}. Target: {payload['targetAudience']}.",
        "scenario_frequencies": shifted,
        "probability_delta": delta_probability,
        "confidence_delta": 0.02,
        "community_summaries": [
            social_response,
            f"The first visible reaction is concentrated in {payload['targetAudience'].lower()}.",
            f"Durability depends on whether the system can absorb the move over {payload['duration']}.",
        ],
        "tensions": [
            f"Intervention pressure vs resilience in {payload['geography']}.",
            f"Narrative coherence vs backlash among {payload['targetAudience'].lower()}.",
        ],
        "notes": [payload["safetyNote"]],
        "matrix_mode": "intervene",
        "matrix_branch_id": safe_text(job.get("jobId")),
    }

    return {
        "branchId": safe_text(job.get("jobId")),
        "baselineDigest": baseline_digest,
        "interventionDigest": intervention_digest,
        "deltaDigest": {
            "headline": f"{payload['label']} changes the shape of the system, not just the top-line probability.",
            "summary": f"{narrative_shift} The main effect is a {'higher' if delta_probability >= 0 else 'lower'} probability path with visible redistribution of attention and stress.",
            "deltaProbability": delta_probability,
            "socialResponse": social_response,
            "narrativeShift": narrative_shift,
            "systemStress": system_stress,
            "dominantReactions": [
                f"Early response concentrates in {payload['targetAudience'].lower()}.",
                f"Actors react faster when the intervention lasts {payload['duration'].lower()}.",
                f"Narrative loops grow strongest in {payload['geography'].lower()}.",
            ],
            "secondOrderEffects": [
                "Secondary actors adjust after seeing the first reputational or behavioral move.",
                "Backlash risk rises if the intervention intensity outruns perceived legitimacy.",
                "The system can overreact in adjacent communities even when the direct target is narrow.",
            ],
            "riskOfBackfire": "High. Strong interventions create faster visibility but also sharper backlash." if payload["intensity"] >= 0.65 else "Medium. The system has room to absorb the move, but backlash rises if legitimacy looks weak.",
            "interventionEffectiveness": "High enough to move the system, but only if target audience and timing stay aligned." if payload["intensity"] >= 0.5 else "Useful for testing sensitivity, not yet strong enough to force a regime shift on its own.",
            "amplificationFactors": [
                f"A clearer message among {payload['targetAudience'].lower()}.",
                f"Alignment between timing ({payload['timing'].lower()}) and public attention.",
            ],
            "dampeningFactors": [
                "Low credibility, weak distribution, or fast institutional pushback.",
                "Signal fatigue if the intervention lasts too long without a reinforcing event.",
            ],
            "metrics": [
                {"label": "Delta probability", "before": clamp01((baseline_digest.get("scenario_frequencies") or [{}])[0].get("probability"), 0.5), "after": clamp01((shifted or [{}])[0].get("probability"), 0.5), "delta": delta_probability, "unit": "probability"},
                {"label": "Social response", "before": 0.42, "after": max(0.0, min(1.0, 0.42 + payload["intensity"] * 0.25)), "delta": payload["intensity"] * 0.25, "unit": "response"},
                {"label": "Narrative shift", "before": 0.4, "after": max(0.0, min(1.0, 0.4 + payload["intensity"] * 0.22)), "delta": payload["intensity"] * 0.22, "unit": "sentiment"},
                {"label": "System stress", "before": 0.36, "after": max(0.0, min(1.0, 0.36 + payload["intensity"] * 0.3)), "delta": payload["intensity"] * 0.3, "unit": "stress"},
            ],
        },
        "dominantReactions": [
            f"Early response concentrates in {payload['targetAudience'].lower()}.",
            f"Time horizon {payload['duration'].lower()} amplifies visible reaction loops.",
        ],
        "narrativeShift": narrative_shift,
        "secondOrderEffects": [
            "Secondary actors adjust after observing the first move.",
            "The system may create backlash pockets outside the primary target audience.",
        ],
        "riskOfBackfire": "High. Strong interventions create faster backlash." if payload["intensity"] >= 0.65 else "Medium. The system may still resist if legitimacy looks weak.",
        "interventionEffectiveness": "High enough to move the system." if payload["intensity"] >= 0.5 else "Good for sensitivity testing, not for regime change.",
        "branchLabel": payload["label"],
        "sourceMode": "preview" if safe_text(job.get("adapterMode")) == "fallback" else "live",
    }


def build_job(job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    now = utc_now_iso()
    query = safe_text(payload.get("query") or payload.get("queryText"))
    query_plan = payload.get("queryPlan") or payload.get("query_plan") or {}
    template = safe_text(payload.get("template"), "public-discourse")
    job_type = safe_text(payload.get("jobType"), "observe")
    adapter_mode = "original-runtime" if adapter_is_configured() else "fallback"

    return {
        "jobId": job_id,
        "jobType": job_type,
        "status": "created",
        "progress": 0.08,
        "phase": "created",
        "statusMessage": "Job queued. Crystal is preparing the world seed.",
        "createdAt": now,
        "lastUpdatedAt": now,
        "completedAt": None,
        "canceledAt": None,
        "error": None,
        "query": query,
        "queryPlan": query_plan,
        "userContext": payload.get("userContext") or payload.get("user_context") or {},
        "source": safe_text(payload.get("source"), "manual"),
        "sourceRef": safe_text(payload.get("sourceRef")),
        "template": template,
        "runtime": safe_text(payload.get("runtime"), "mirofish-original"),
        "mode": safe_text(payload.get("mode"), "async"),
        "adapterMode": adapter_mode,
        "agentCount": safe_int(payload.get("agentCount"), 120),
        "depth": safe_text(payload.get("depth"), "lite"),
        "queue": safe_text(payload.get("queue"), "shared"),
        "branchId": safe_text(payload.get("branchId"), job_id if job_type == "matrix_intervention" else ""),
        "branchParentId": safe_text(payload.get("branchParentId")),
        "interventionPayload": sanitize_intervention_payload(payload.get("intervention")),
        "digest": None,
        "world_sim": None,
        "report": None,
        "matrix": None,
        "cancelRequested": False,
        "projectId": None,
        "graphId": None,
        "simulationId": None,
        "reportId": None,
        "graphTaskId": None,
        "prepareTaskId": None,
        "reportTaskId": None,
        "runStatus": None,
    }


def ensure_job_can_run(job_id: str) -> dict[str, Any]:
    job = read_job(job_id)
    if not job:
        raise FileNotFoundError(f"WorldSim job not found: {job_id}")

    if job.get("cancelRequested") or job.get("status") == "canceled":
        raise JobCanceledError("WorldSim job canceled.")

    return job


def start_job_thread(job_id: str) -> None:
    with JOB_LOCK:
        thread = JOB_THREADS.get(job_id)
        if thread and thread.is_alive():
            return

        worker = threading.Thread(target=process_job, args=(job_id,), daemon=True)
        JOB_THREADS[job_id] = worker
        worker.start()


def finish_job(job_id: str, *, digest: dict[str, Any], report: dict[str, Any], matrix: dict[str, Any] | None = None) -> dict[str, Any]:
    return patch_job(
        job_id,
        status="completed",
        progress=1.0,
        phase="completed",
        statusMessage="World simulation completed.",
        completedAt=utc_now_iso(),
        digest=digest,
        world_sim=digest,
        report=report,
        matrix=matrix,
        error=None,
        runStatus="completed",
    )


def fail_job(job_id: str, message: str) -> dict[str, Any]:
    return patch_job(
        job_id,
        status="failed",
        phase="failed",
        statusMessage=safe_text(message, "World simulation failed."),
        error=safe_text(message, "World simulation failed."),
    )


def cancel_job(job_id: str, message: str = "World simulation canceled.") -> dict[str, Any]:
    return patch_job(
        job_id,
        status="canceled",
        phase="canceled",
        statusMessage=message,
        canceledAt=utc_now_iso(),
        cancelRequested=True,
        runStatus="canceled",
    )


def process_job(job_id: str) -> None:
    try:
        job = ensure_job_can_run(job_id)
        if adapter_is_configured():
            try:
                run_original_mirofish_job(job)
            except Exception as error:
                if adapter_allows_fallback():
                    patch_job(
                        job_id,
                        status="preparing",
                        phase="fallback",
                        progress=0.3,
                        statusMessage=(
                            "Original MiroFish runtime is unavailable. Crystal is switching to the local fallback adapter."
                        ),
                        error=safe_text(str(error)),
                    )
                    run_fallback_job(ensure_job_can_run(job_id), note=str(error))
                else:
                    raise
        else:
            run_fallback_job(job)
    except JobCanceledError:
        cancel_job(job_id)
    except Exception as error:
        fail_job(job_id, str(error))
    finally:
        with JOB_LOCK:
            JOB_THREADS.pop(job_id, None)


def run_fallback_job(job: dict[str, Any], note: str = "") -> None:
    job_id = safe_text(job.get("jobId"))
    steps = [
        ("preparing", 0.18, "graph_build", "Building a fallback graph pack."),
        ("ready", 0.42, "environment_setup", "Preparing the simulated social environment."),
        ("running", 0.76, "simulation_run", "Running the fallback WorldSim job."),
    ]

    for status, progress, phase, message in steps:
        ensure_job_can_run(job_id)
        patch_job(job_id, status=status, progress=progress, phase=phase, statusMessage=message)
        time.sleep(0.9)

    ensure_job_can_run(job_id)
    graph_pack = build_graph_pack(safe_text(job.get("query")), job.get("queryPlan") or {})
    digest = run_simulation(safe_text(job.get("query")), job.get("queryPlan") or {}, graph_pack, "mirofish_fallback_async")
    if note:
        digest["notes"] = [*digest.get("notes", []), f"Original runtime fallback reason: {note}"]

    if safe_text(job.get("jobType")) == "matrix_intervention":
        matrix = build_matrix_result(job, digest)
        finish_job(job_id, digest=matrix.get("interventionDigest") or digest, report=generate_report(safe_text(job.get("query")), matrix.get("interventionDigest") or digest), matrix=matrix)
        return

    report = generate_report(safe_text(job.get("query")), digest)
    finish_job(job_id, digest=digest, report=report)


def build_simulation_requirement(job: dict[str, Any]) -> str:
    query = safe_text(job.get("query"), "the selected scenario")
    horizon = normalize_horizon(job.get("queryPlan") or {})
    template = safe_text(job.get("template"), "public-discourse")
    agent_count = safe_int(job.get("agentCount"), 120)
    depth = safe_text(job.get("depth"), "lite")
    intervention = sanitize_intervention_payload(job.get("interventionPayload"))
    intervention_clause = ""
    if safe_text(job.get("jobType")) == "matrix_intervention":
        intervention_clause = (
            f" Inject a structured intervention named '{intervention['label']}' "
            f"with intensity {round(intervention['intensity'] * 100)}%, geography '{intervention['geography']}', "
            f"duration '{intervention['duration']}', target audience '{intervention['targetAudience']}', "
            f"and timing '{intervention['timing']}'. Return the baseline world, intervention world, and delta."
        )

    return (
        f"Simulate how '{query}' may evolve over the next {horizon}. "
        f"Use the {template} template, target approximately {agent_count} socially diverse agents, "
        f"and surface pivotal actors, narrative shifts, intervention points, and second-order effects. "
        f"Favor grounded causality over spectacle. Depth: {depth}.{intervention_clause}"
    )


def build_input_markdown(job: dict[str, Any]) -> str:
    query_plan = job.get("queryPlan") or {}
    user_context = job.get("userContext") or {}
    entities = []
    for entity in query_plan.get("entities") or []:
        if isinstance(entity, dict):
            label = safe_text(entity.get("label") or entity.get("entity_id"))
        else:
            label = safe_text(entity)
        if label:
            entities.append(label)

    payload = {
        "query": safe_text(job.get("query")),
        "template": safe_text(job.get("template")),
        "horizon": normalize_horizon(query_plan),
        "domain": safe_text(query_plan.get("domain_id") or query_plan.get("domain")),
        "entities": entities,
        "filters": query_plan.get("filters") or query_plan.get("constraints") or {},
        "userContext": {
            "location": safe_text(user_context.get("location")),
            "profession": safe_text(user_context.get("profession")),
            "interests": sanitize_list(user_context.get("interests")),
        },
        "agentBudget": safe_int(job.get("agentCount"), 120),
        "depth": safe_text(job.get("depth")),
        "queue": safe_text(job.get("queue")),
        "jobType": safe_text(job.get("jobType"), "observe"),
    }

    if safe_text(job.get("jobType")) == "matrix_intervention":
        payload["intervention"] = sanitize_intervention_payload(job.get("interventionPayload"))
        payload["branchParentId"] = safe_text(job.get("branchParentId")) or None

    return "\n".join(
        [
            "# Crystal WorldSim brief",
            "",
            "## Goal",
            build_simulation_requirement(job),
            "",
            "## Structured context",
            "```json",
            json.dumps(payload, ensure_ascii=False, indent=2),
            "```",
            "",
            "## Expected output",
            "- Narrative arc",
            "- Pivotal actors",
            "- Intervention points",
            "- Scenario frequencies",
            "- Counterfactuals",
        ]
    )


def project_name_for_job(job: dict[str, Any]) -> str:
    template = safe_text(job.get("template"), "world")
    return f"Crystal {template} {safe_text(job.get('jobId'))[:8]}"


def parallel_profile_count(job: dict[str, Any]) -> int:
    depth = safe_text(job.get("depth"), "lite")
    if depth == "deep":
        return 12
    if depth == "expanded":
        return 8
    return 5


def max_rounds(job: dict[str, Any]) -> int:
    depth = safe_text(job.get("depth"), "lite")
    if depth == "deep":
        return 144
    if depth == "expanded":
        return 96
    return 48


def poll_interval_sec() -> float:
    return max(1.0, safe_float(os.environ.get("MIROFISH_POLL_INTERVAL_SEC"), 5.0))


def poll_timeout_sec() -> int:
    return max(60, safe_int(os.environ.get("MIROFISH_STAGE_TIMEOUT_SEC"), 3600))


def update_progress(job_id: str, *, status: str, progress: float, phase: str, message: str, **extra: Any) -> dict[str, Any]:
    return patch_job(
        job_id,
        status=status,
        progress=clamp01(progress, 0.0),
        phase=phase,
        statusMessage=message,
        **extra,
    )


def wait_for_graph_build(job_id: str, project_id: str, task_id: str) -> tuple[dict[str, Any], str]:
    deadline = time.monotonic() + poll_timeout_sec()

    while time.monotonic() < deadline:
        ensure_job_can_run(job_id)
        task = mirofish_request("GET", f"/api/graph/task/{task_id}")
        task_status = safe_text(task.get("status"), "processing").lower()
        task_message = safe_text(task.get("message"), "Building graph from the Crystal brief.")
        task_progress = clamp01(task.get("progress"), 0.2)

        update_progress(
            job_id,
            status="preparing",
            progress=0.18 + 0.2 * task_progress,
            phase="graph_build",
            message=task_message,
            graphTaskId=task_id,
        )

        if task_status in {"completed", "success"}:
            project = mirofish_request("GET", f"/api/graph/project/{project_id}")
            graph_id = safe_text(project.get("graph_id"))
            if not graph_id:
                raise RuntimeError("MiroFish graph build completed but graph_id is missing.")
            return project, graph_id

        if task_status in {"failed", "error", "canceled"}:
            raise RuntimeError(safe_text(task.get("error") or task.get("message"), "MiroFish graph build failed."))

        time.sleep(poll_interval_sec())

    raise RuntimeError("Timed out while waiting for MiroFish graph build.")


def wait_for_prepare(job_id: str, simulation_id: str, task_id: str | None) -> None:
    if not task_id:
        return

    deadline = time.monotonic() + poll_timeout_sec()

    while time.monotonic() < deadline:
        ensure_job_can_run(job_id)
        payload = mirofish_request(
            "POST",
            "/api/simulation/prepare/status",
            json_body={"task_id": task_id, "simulation_id": simulation_id},
        )
        task_status = safe_text(payload.get("status"), "processing").lower()
        task_message = safe_text(payload.get("message"), "Preparing OASIS agents and memory.")
        task_progress = clamp01(payload.get("progress"), 0.3)

        update_progress(
            job_id,
            status="preparing",
            progress=0.45 + 0.2 * task_progress,
            phase="simulation_prepare",
            message=task_message,
            prepareTaskId=task_id,
        )

        if task_status in {"ready", "completed", "success"} or payload.get("already_prepared"):
            update_progress(
                job_id,
                status="ready",
                progress=0.66,
                phase="ready",
                message="OASIS environment is ready. Crystal can now run the world simulation.",
                prepareTaskId=task_id,
            )
            return

        if task_status in {"failed", "error", "canceled"}:
            raise RuntimeError(safe_text(payload.get("error") or payload.get("message"), "MiroFish preparation failed."))

        time.sleep(poll_interval_sec())

    raise RuntimeError("Timed out while waiting for the MiroFish prepare stage.")


def wait_for_run(job_id: str, simulation_id: str) -> tuple[dict[str, Any], dict[str, Any] | None]:
    deadline = time.monotonic() + poll_timeout_sec()
    detail_payload: dict[str, Any] | None = None

    while time.monotonic() < deadline:
        ensure_job_can_run(job_id)
        payload = mirofish_request("GET", f"/api/simulation/{simulation_id}/run-status")
        runner_status = safe_text(payload.get("runner_status"), "running").lower()
        progress = clamp01(payload.get("progress_percent"), 0.05)
        current_round = safe_int(payload.get("current_round"), 0)
        total_rounds = max(1, safe_int(payload.get("total_rounds"), max_rounds(read_job(job_id) or {})))
        message = f"Running the world simulation: round {current_round}/{total_rounds}."

        update_progress(
            job_id,
            status="running",
            progress=0.72 + 0.2 * progress,
            phase="simulation_run",
            message=message,
            simulationId=simulation_id,
            runStatus=runner_status,
        )

        if runner_status in {"completed", "finished", "stopped"}:
            try:
                detail_payload = mirofish_request("GET", f"/api/simulation/{simulation_id}/run-status/detail")
            except Exception:
                detail_payload = None
            return payload, detail_payload

        if runner_status in {"failed", "error"}:
            raise RuntimeError("MiroFish runtime failed while executing the world simulation.")

        time.sleep(poll_interval_sec())

    raise RuntimeError("Timed out while waiting for the MiroFish run stage.")


def wait_for_report(job_id: str, simulation_id: str, task_id: str | None) -> dict[str, Any]:
    if task_id:
        deadline = time.monotonic() + poll_timeout_sec()

        while time.monotonic() < deadline:
            ensure_job_can_run(job_id)
            payload = mirofish_request(
                "POST",
                "/api/report/generate/status",
                json_body={"task_id": task_id, "simulation_id": simulation_id},
            )
            report_status = safe_text(payload.get("status"), "processing").lower()
            report_progress = clamp01(payload.get("progress"), 0.1)
            report_message = safe_text(payload.get("message"), "Generating the final world-simulation report.")

            update_progress(
                job_id,
                status="running",
                progress=0.92 + 0.06 * report_progress,
                phase="report_generate",
                message=report_message,
                reportTaskId=task_id,
            )

            if report_status in {"completed", "success"}:
                break

            if report_status in {"failed", "error", "canceled"}:
                raise RuntimeError(safe_text(payload.get("error") or payload.get("message"), "MiroFish report generation failed."))

            time.sleep(poll_interval_sec())
        else:
            raise RuntimeError("Timed out while waiting for the MiroFish report stage.")

    return mirofish_request("GET", f"/api/report/by-simulation/{simulation_id}")


def extract_report_summary(report_payload: dict[str, Any]) -> str:
    outline = report_payload.get("outline") or {}
    sections = outline.get("sections") or []
    summary = safe_text(outline.get("summary"))
    if summary:
        return summary

    for section in sections:
        if isinstance(section, dict):
            content = safe_text(section.get("content"))
            if content:
                return content[:700]

    markdown_content = safe_text(report_payload.get("markdown_content"))
    if markdown_content:
        return markdown_content[:700]

    return ""


def extract_section_snippets(report_payload: dict[str, Any]) -> list[str]:
    outline = report_payload.get("outline") or {}
    sections = outline.get("sections") or []
    snippets: list[str] = []

    for section in sections:
        if not isinstance(section, dict):
            continue
        title = safe_text(section.get("title"))
        content = safe_text(section.get("content"))
        if title and content:
            snippets.append(f"{title}: {content[:180]}")
        elif content:
            snippets.append(content[:180])
        if len(snippets) == 3:
            break

    return snippets


def derive_pivotal_actors(detail_payload: dict[str, Any] | None, graph_pack: dict[str, Any]) -> list[str]:
    if isinstance(detail_payload, dict):
        actions = detail_payload.get("all_actions") or []
        if isinstance(actions, list) and actions:
            counts: Counter[str] = Counter()
            for action in actions:
                if isinstance(action, dict):
                    name = safe_text(action.get("agent_name"))
                    if name:
                        counts[name] += 1
            if counts:
                return [name for name, _ in counts.most_common(3)]

    return (graph_pack.get("entities") or [])[:3]


def build_digest_from_original_runtime(
    job: dict[str, Any],
    project_payload: dict[str, Any],
    run_payload: dict[str, Any],
    detail_payload: dict[str, Any] | None,
    report_payload: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    query = safe_text(job.get("query"))
    query_plan = job.get("queryPlan") or {}
    graph_pack = build_graph_pack(query, query_plan)
    base_digest = run_simulation(query, query_plan, graph_pack, "mirofish_original_async")

    report_summary = extract_report_summary(report_payload) or base_digest.get("narrative_arc", "")
    sections = extract_section_snippets(report_payload)
    pivotal_actors = derive_pivotal_actors(detail_payload, graph_pack)

    base_digest.update(
        {
            "simulation_mode": "mirofish_original_async",
            "quality_score": max(0.82, safe_float(base_digest.get("quality_score"), 0.72)),
            "graph_coverage": max(0.8, clamp01(project_payload.get("total_text_length"), 0.8)),
            "agent_convergence": max(0.74, clamp01(run_payload.get("progress_percent"), 0.74)),
            "graph_age_hours": 0,
            "narrative_arc": report_summary,
            "pivotal_actors": pivotal_actors,
            "community_summaries": sections or base_digest.get("community_summaries", []),
            "graph_summary": safe_text(project_payload.get("analysis_summary"), base_digest.get("graph_summary", "")),
            "simulation_id": safe_text(job.get("simulationId")),
            "cache_status": "mirofish_original_completed",
            "generated_at": utc_now_iso(),
            "source_set": sorted(set([*base_digest.get("source_set", []), "mirofish-original", "oasis", "zep", "report-agent"])),
            "notes": [
                f"Original MiroFish runtime completed with {safe_int(job.get('agentCount'), 120)} target agents.",
                f"Template: {safe_text(job.get('template'))}. Depth: {safe_text(job.get('depth'))}. Queue: {safe_text(job.get('queue'))}.",
                f"Project: {safe_text(job.get('projectId'))}, graph: {safe_text(job.get('graphId'))}, simulation: {safe_text(job.get('simulationId'))}.",
            ],
            "mirofish": {
                "project_id": safe_text(job.get("projectId")),
                "graph_id": safe_text(job.get("graphId")),
                "simulation_id": safe_text(job.get("simulationId")),
                "report_id": safe_text(job.get("reportId") or report_payload.get("report_id")),
                "run_status": safe_text(run_payload.get("runner_status")),
                "actions_count": safe_int(run_payload.get("total_actions_count")),
                "adapter_mode": safe_text(job.get("adapterMode"), "original-runtime"),
            },
        }
    )

    report = {
        "title": safe_text((report_payload.get("outline") or {}).get("title"), f"WorldSim report: {query[:80]}"),
        "summary": report_summary or f"Original MiroFish runtime completed for {query[:80]}",
        "reportId": safe_text(report_payload.get("report_id")),
    }
    return base_digest, report


def run_original_mirofish_job(job: dict[str, Any]) -> None:
    job_id = safe_text(job.get("jobId"))
    simulation_requirement = build_simulation_requirement(job)
    document_content = build_input_markdown(job)

    update_progress(
        job_id,
        status="preparing",
        progress=0.12,
        phase="ontology_generate",
        message="Creating the project brief for the original MiroFish runtime.",
    )

    files = [
        (
            "files",
            (
                "crystal-worldsim-brief.md",
                document_content.encode("utf-8"),
                "text/markdown",
            ),
        )
    ]
    project_payload = mirofish_request(
        "POST",
        "/api/graph/ontology/generate",
        data={
            "simulation_requirement": simulation_requirement,
            "project_name": project_name_for_job(job),
            "additional_context": f"Crystal template: {safe_text(job.get('template'))}; target agents: {safe_int(job.get('agentCount'), 120)}",
        },
        files=files,
        timeout_sec=max(180, safe_int(os.environ.get("MIROFISH_HTTP_TIMEOUT_SEC"), 180)),
    )
    project_id = safe_text(project_payload.get("project_id"))
    if not project_id:
        raise RuntimeError("MiroFish ontology generation did not return a project_id.")

    patch_job(job_id, projectId=project_id)

    update_progress(
        job_id,
        status="preparing",
        progress=0.2,
        phase="graph_build",
        message="MiroFish accepted the project. Building the knowledge graph.",
        projectId=project_id,
    )

    build_payload = mirofish_request(
        "POST",
        "/api/graph/build",
        json_body={
            "project_id": project_id,
            "graph_name": project_name_for_job(job),
            "chunk_size": 500,
            "chunk_overlap": 50,
        },
    )
    graph_task_id = safe_text(build_payload.get("task_id"))
    if not graph_task_id:
        raise RuntimeError("MiroFish graph build did not return a task_id.")

    project_payload, graph_id = wait_for_graph_build(job_id, project_id, graph_task_id)
    patch_job(job_id, graphId=graph_id)

    create_payload = mirofish_request(
        "POST",
        "/api/simulation/create",
        json_body={
            "project_id": project_id,
            "graph_id": graph_id,
            "enable_twitter": True,
            "enable_reddit": True,
        },
    )
    simulation_id = safe_text(create_payload.get("simulation_id"))
    if not simulation_id:
        raise RuntimeError("MiroFish simulation create did not return a simulation_id.")

    update_progress(
        job_id,
        status="ready",
        progress=0.42,
        phase="simulation_created",
        message="Simulation shell created. Preparing OASIS agents and memory.",
        simulationId=simulation_id,
    )

    prepare_payload = mirofish_request(
        "POST",
        "/api/simulation/prepare",
        json_body={
            "simulation_id": simulation_id,
            "use_llm_for_profiles": True,
            "parallel_profile_count": parallel_profile_count(job),
            "force_regenerate": False,
        },
        timeout_sec=max(180, safe_int(os.environ.get("MIROFISH_HTTP_TIMEOUT_SEC"), 180)),
    )
    prepare_status = safe_text(prepare_payload.get("status"), "").lower()
    prepare_task_id = safe_text(prepare_payload.get("task_id"))
    if prepare_status not in {"ready", "completed"} and not prepare_payload.get("already_prepared"):
        wait_for_prepare(job_id, simulation_id, prepare_task_id)

    start_payload = mirofish_request(
        "POST",
        "/api/simulation/start",
        json_body={
            "simulation_id": simulation_id,
            "platform": "parallel",
            "max_rounds": max_rounds(job),
            "enable_graph_memory_update": safe_text(job.get("depth"), "lite") != "lite",
            "force": False,
        },
    )
    runner_status = safe_text(start_payload.get("runner_status") or start_payload.get("status"), "running")
    update_progress(
        job_id,
        status="running",
        progress=0.72,
        phase="simulation_run",
        message="OASIS world simulation is now running.",
        simulationId=simulation_id,
        runStatus=runner_status,
    )

    run_payload, detail_payload = wait_for_run(job_id, simulation_id)

    report_payload = mirofish_request(
        "POST",
        "/api/report/generate",
        json_body={
            "simulation_id": simulation_id,
            "force_regenerate": False,
        },
        timeout_sec=max(180, safe_int(os.environ.get("MIROFISH_HTTP_TIMEOUT_SEC"), 180)),
    )
    report_task_id = safe_text(report_payload.get("task_id"))
    report_id = safe_text(report_payload.get("report_id"))
    patch_job(job_id, reportTaskId=report_task_id or None, reportId=report_id or None)
    report_by_simulation = wait_for_report(job_id, simulation_id, report_task_id or None)
    if not report_id:
        report_id = safe_text(report_by_simulation.get("report_id"))
        patch_job(job_id, reportId=report_id or None)

    digest, report = build_digest_from_original_runtime(
        job=read_job(job_id) or job,
        project_payload=project_payload,
        run_payload=run_payload,
        detail_payload=detail_payload,
        report_payload=report_by_simulation,
    )
    if safe_text((read_job(job_id) or job).get("jobType")) == "matrix_intervention":
        matrix = build_matrix_result(read_job(job_id) or job, digest)
        finish_job(job_id, digest=matrix.get("interventionDigest") or digest, report=report, matrix=matrix)
        return
    finish_job(job_id, digest=digest, report=report)


@app.get("/health")
def health() -> Any:
    with JOB_LOCK:
        active_threads = sum(1 for thread in JOB_THREADS.values() if thread.is_alive())

    return (
        jsonify(
            {
                "ok": True,
                "service": "crystal-world-sim-adapter",
                "timestamp": utc_now_iso(),
                "async_jobs": True,
                "adapter_mode": "original-runtime" if adapter_is_configured() else "fallback",
                "mirofish": {
                    "configured": adapter_is_configured(),
                    "allowFallback": adapter_allows_fallback(),
                    "pollIntervalSec": poll_interval_sec(),
                },
                "activeJobThreads": active_threads,
            }
        ),
        200,
    )


@app.post("/graph/build")
def graph_build() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or payload.get("queryPlan") or {}
    return jsonify({"success": True, "data": build_graph_pack(query, query_plan)}), 200


@app.post("/simulation/run")
def simulation_run() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or payload.get("queryPlan") or {}
    graph_pack = payload.get("graph_pack") or payload.get("graphPack") or build_graph_pack(query, query_plan)
    simulation_mode = safe_text(payload.get("simulation_mode"), "delta_simulation")
    return jsonify({"success": True, "data": run_simulation(query, query_plan, graph_pack, simulation_mode)}), 200


@app.post("/report/generate")
def report_generate() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    digest = payload.get("digest") or {}
    return jsonify({"success": True, "data": generate_report(query, digest)}), 200


@app.post("/simulate")
def simulate() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    query = safe_text(payload.get("query"))
    query_plan = payload.get("query_plan") or payload.get("queryPlan") or {}
    simulation_mode = safe_text(payload.get("simulation_mode"), "delta_simulation")

    graph_pack = build_graph_pack(query, query_plan)
    digest = run_simulation(query, query_plan, graph_pack, simulation_mode)
    report = generate_report(query, digest)

    return jsonify({**digest, "report": report}), 200


@app.post("/worldsim/jobs")
def create_worldsim_job() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    job_id = safe_text(payload.get("jobId"))
    if not job_id:
        generated = hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]
        job_id = f"worldsim-{generated}"

    existing = read_job(job_id)
    if existing:
        if existing.get("status") not in TERMINAL_JOB_STATUSES:
            start_job_thread(job_id)
        return jsonify(job_public_view(existing)), 200

    job = write_job(build_job(job_id, payload))
    start_job_thread(job_id)
    return jsonify(job_public_view(job)), 202


@app.get("/worldsim/jobs/<job_id>")
def get_worldsim_job(job_id: str) -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    job = read_job(job_id)
    if not job:
        return jsonify({"error": "WorldSim job not found."}), 404

    return jsonify(job_public_view(job)), 200


@app.get("/worldsim/jobs/<job_id>/result")
def get_worldsim_job_result(job_id: str) -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    job = read_job(job_id)
    if not job:
        return jsonify({"error": "WorldSim job not found."}), 404

    return (
        jsonify(
            {
                **job_public_view(job),
                "digest": job.get("digest"),
                "world_sim": job.get("world_sim") or job.get("digest"),
                "report": job.get("report"),
                "matrix": job.get("matrix"),
            }
        ),
        200,
    )


@app.post("/worldsim/jobs/<job_id>/cancel")
def cancel_worldsim_job(job_id: str) -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    job = read_job(job_id)
    if not job:
        return jsonify({"error": "WorldSim job not found."}), 404

    if job.get("status") == "completed":
        return jsonify(job_public_view(job)), 200

    if adapter_is_configured() and safe_text(job.get("simulationId")):
        try:
            mirofish_request(
                "POST",
                "/api/simulation/stop",
                json_body={"simulation_id": safe_text(job.get("simulationId"))},
            )
        except Exception:
            pass

    canceled = cancel_job(job_id)
    return jsonify(job_public_view(canceled)), 200


@app.post("/worldsim/interventions")
def create_worldsim_intervention() -> Any:
    allowed, failure = require_api_key()
    if not allowed:
        return failure

    payload = request.get_json(silent=True) or {}
    payload["jobType"] = "matrix_intervention"
    job_id = safe_text(payload.get("jobId"))
    if not job_id:
        generated = hashlib.sha1(json.dumps(payload, sort_keys=True).encode("utf-8")).hexdigest()[:16]
        job_id = f"matrix-{generated}"

    existing = read_job(job_id)
    if existing:
        if existing.get("status") not in TERMINAL_JOB_STATUSES:
            start_job_thread(job_id)
        return jsonify(job_public_view(existing)), 200

    job = write_job(build_job(job_id, payload))
    start_job_thread(job_id)
    return jsonify(job_public_view(job)), 202


@app.get("/worldsim/interventions/<job_id>")
def get_worldsim_intervention(job_id: str) -> Any:
    return get_worldsim_job(job_id)


@app.get("/worldsim/interventions/<job_id>/result")
def get_worldsim_intervention_result(job_id: str) -> Any:
    return get_worldsim_job_result(job_id)


@app.post("/worldsim/interventions/<job_id>/cancel")
def cancel_worldsim_intervention(job_id: str) -> Any:
    return cancel_worldsim_job(job_id)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8081"))
    app.run(host="0.0.0.0", port=port, debug=False)
