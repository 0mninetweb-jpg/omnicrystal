const { clamp01, safeText } = require("../predictionCore");

function normalizeText(value = "") {
  return safeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildVariable(adapterId, label, family, scores = {}, options = {}) {
  const causal = clamp01(scores.causal_relevance, 0.6);
  const temporal = clamp01(scores.temporal_relevance, 0.6);
  const geographic = clamp01(scores.geographic_relevance, 0.5);
  const signal = clamp01(scores.signal_quality, 0.56);
  const marginal = clamp01(scores.marginal_information_gain, 0.54);
  const overallScore = Number(
    clamp01(
      causal * 0.34 + temporal * 0.18 + geographic * 0.14 + signal * 0.18 + marginal * 0.16,
      0.52
    ).toFixed(3)
  );

  return {
    variable_id: `${adapterId}:${label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`,
    label,
    family,
    source_adapter: adapterId,
    causal_relevance: causal,
    temporal_relevance: temporal,
    geographic_relevance: geographic,
    signal_quality: signal,
    marginal_information_gain: marginal,
    overall_score: overallScore,
    evidence_needs: Array.isArray(options.evidence_needs) ? options.evidence_needs : [],
    rationale: safeText(options.rationale),
  };
}

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

function createUniversalAdapters() {
  return [
    {
      id: "entity_resolution",
      label: "EntityResolutionAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables(normalizedQuery) {
        const entities = Array.isArray(normalizedQuery.entity_map) ? normalizedQuery.entity_map : [];
        const entityLabel = safeText(entities[0]?.label, safeText(normalizedQuery.primary_entity, "primary entity"));
        return [
          buildVariable(
            this.id,
            `Entity identity: ${entityLabel}`,
            "case",
            {
              causal_relevance: entities.length > 0 ? 0.82 : 0.48,
              temporal_relevance: 0.66,
              geographic_relevance: 0.72,
              signal_quality: entities.length > 0 ? 0.76 : 0.42,
              marginal_information_gain: entities.length > 0 ? 0.74 : 0.38,
            },
            {
              evidence_needs: ["entity_resolution"],
              rationale: "Forecast quality improves sharply when the primary entity is explicit and stable.",
            }
          ),
        ];
      },
    },
    {
      id: "temporal_horizon",
      label: "TemporalHorizonAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables(normalizedQuery) {
        const horizon = safeText(normalizedQuery.horizon?.horizon_id, "30d");
        return [
          buildVariable(
            this.id,
            `Horizon regime: ${horizon}`,
            "case",
            {
              causal_relevance: 0.68,
              temporal_relevance: 0.92,
              geographic_relevance: 0.48,
              signal_quality: 0.7,
              marginal_information_gain: 0.72,
            },
            {
              evidence_needs: ["horizon_calibration"],
              rationale: "The same query changes meaning when the resolution window changes.",
            }
          ),
        ];
      },
    },
    {
      id: "historical_baseline",
      label: "HistoricalBaselineAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables(normalizedQuery) {
        return [
          buildVariable(
            this.id,
            "20-year analogs and regime shifts",
            "consensus",
            {
              causal_relevance: 0.74,
              temporal_relevance: 0.64,
              geographic_relevance: 0.56,
              signal_quality: 0.68,
              marginal_information_gain: 0.8,
            },
            {
              evidence_needs: ["historical_baseline"],
              rationale: "Broad coverage needs a strong baseline even when the current signal is sparse.",
            }
          ),
        ];
      },
    },
    {
      id: "consensus_baseline",
      label: "ConsensusBaselineAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables(normalizedQuery) {
        const binary = Boolean(normalizedQuery.binary_frame?.asks_binary_question);
        return [
          buildVariable(
            this.id,
            binary ? "Market-implied probability" : "External consensus reference",
            "consensus",
            {
              causal_relevance: binary ? 0.72 : 0.58,
              temporal_relevance: 0.82,
              geographic_relevance: 0.44,
              signal_quality: 0.74,
              marginal_information_gain: 0.78,
            },
            {
              evidence_needs: binary ? ["prediction_market", "consensus_baseline"] : ["consensus_baseline"],
              rationale: "Crystal should know what the baseline says before claiming an edge.",
            }
          ),
        ];
      },
    },
    {
      id: "macro_spillover",
      label: "MacroSpilloverAdapter",
      scope: "universal",
      match(normalizedQuery) {
        return ["market", "policy", "decision", "trend"].includes(safeText(normalizedQuery.resolution_frame, "trend"));
      },
      candidateVariables(normalizedQuery) {
        return [
          buildVariable(
            this.id,
            "Macro spillovers and second-order pressure",
            "macro",
            {
              causal_relevance: 0.7,
              temporal_relevance: 0.66,
              geographic_relevance: 0.52,
              signal_quality: 0.56,
              marginal_information_gain: 0.62,
            },
            {
              evidence_needs: ["macro_context", "trend_signal"],
              rationale: "Many domains move with macro pressure even when the query sounds local.",
            }
          ),
        ];
      },
    },
    {
      id: "event_news",
      label: "EventNewsAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables(normalizedQuery) {
        return [
          buildVariable(
            this.id,
            "Recent event flow and live narrative shifts",
            "case",
            {
              causal_relevance: 0.78,
              temporal_relevance: 0.9,
              geographic_relevance: 0.58,
              signal_quality: 0.66,
              marginal_information_gain: 0.76,
            },
            {
              evidence_needs: ["search_live", "trend_signal"],
              rationale: "Deep prediction quality depends on fresh event flow, not only static background knowledge.",
            }
          ),
        ];
      },
    },
    {
      id: "source_reliability",
      label: "SourceReliabilityAdapter",
      scope: "universal",
      match: () => true,
      candidateVariables() {
        return [
          buildVariable(
            this.id,
            "Source reliability and conflict pressure",
            "consensus",
            {
              causal_relevance: 0.58,
              temporal_relevance: 0.62,
              geographic_relevance: 0.38,
              signal_quality: 0.88,
              marginal_information_gain: 0.7,
            },
            {
              evidence_needs: ["source_reliability"],
              rationale: "The system should weight signal quality explicitly instead of hiding uncertainty in copy.",
            }
          ),
        ];
      },
    },
  ];
}

function createVerticalAdapters() {
  return [
    {
      id: "policy_risk",
      label: "PolicyPoliticalRiskAdapter",
      scope: "vertical",
      match(normalizedQuery) {
        const corpus = normalizeText(
          [normalizedQuery.primary_domain_id, normalizedQuery.resolution_frame, normalizedQuery.original_query].join(" ")
        );
        return /governance|policy|referendum|election|geopolit|public_timeline|government|coalition/.test(corpus);
      },
      candidateVariables() {
        return [
          buildVariable(
            this.id,
            "Institutional calendar and governing body incentives",
            "core",
            {
              causal_relevance: 0.9,
              temporal_relevance: 0.82,
              geographic_relevance: 0.84,
              signal_quality: 0.68,
              marginal_information_gain: 0.82,
            },
            {
              evidence_needs: ["entity_resolution", "historical_baseline", "consensus_baseline", "event_news"],
              rationale: "Policy calls need calendars, institutions, and coalition incentives, not generic political prose.",
            }
          ),
          buildVariable(
            this.id,
            "Polling, public pressure, and regulatory momentum",
            "core",
            {
              causal_relevance: 0.86,
              temporal_relevance: 0.86,
              geographic_relevance: 0.78,
              signal_quality: 0.66,
              marginal_information_gain: 0.78,
            },
            {
              evidence_needs: ["event_news", "trend_signal", "consensus_baseline"],
              rationale: "Binary policy questions usually turn on late public pressure and signal momentum.",
            }
          ),
          buildVariable(
            this.id,
            "Legislative path, veto points, and approval bottlenecks",
            "core",
            {
              causal_relevance: 0.88,
              temporal_relevance: 0.8,
              geographic_relevance: 0.8,
              signal_quality: 0.64,
              marginal_information_gain: 0.76,
            },
            {
              evidence_needs: ["entity_resolution", "event_news", "consensus_baseline"],
              rationale: "Approval and referendum calls improve when Crystal models who can block, delay, or ratify the outcome.",
            }
          ),
        ];
      },
    },
    {
      id: "markets_assets",
      label: "MarketsAssetsAdapter",
      scope: "vertical",
      match(normalizedQuery) {
        const corpus = normalizeText(
          [normalizedQuery.primary_domain_id, normalizedQuery.original_query, normalizedQuery.resolution_frame].join(" ")
        );
        return /market|asset|macro|bitcoin|crypto|gold|oil|housing|cost_of_living|rates|inflation/.test(corpus);
      },
      candidateVariables() {
        return [
          buildVariable(
            this.id,
            "Price action, range pressure, and regime change risk",
            "core",
            {
              causal_relevance: 0.86,
              temporal_relevance: 0.78,
              geographic_relevance: 0.44,
              signal_quality: 0.72,
              marginal_information_gain: 0.82,
            },
            {
              evidence_needs: ["trend_signal", "consensus_baseline", "historical_baseline"],
              rationale: "Markets improve when Crystal separates trend, regime, and consensus explicitly.",
            }
          ),
          buildVariable(
            this.id,
            "Macro rates, liquidity, and demand/supply pressure",
            "macro",
            {
              causal_relevance: 0.82,
              temporal_relevance: 0.74,
              geographic_relevance: 0.56,
              signal_quality: 0.64,
              marginal_information_gain: 0.76,
            },
            {
              evidence_needs: ["macro_context", "search_live"],
              rationale: "Edge often comes from spillovers that the consensus underweights.",
            }
          ),
        ];
      },
    },
    {
      id: "cities_housing_travel",
      label: "CitiesHousingTravelAdapter",
      scope: "vertical",
      match(normalizedQuery) {
        const corpus = normalizeText(
          [normalizedQuery.primary_domain_id, normalizedQuery.original_query, normalizedQuery.geography?.label].join(" ")
        );
        return /housing|real_estate|rent|city|travel|tourism|tokyo|rome|milan|urban/.test(corpus);
      },
      candidateVariables() {
        return [
          buildVariable(
            this.id,
            "Local demand, supply tightness, and seasonality",
            "core",
            {
              causal_relevance: 0.88,
              temporal_relevance: 0.8,
              geographic_relevance: 0.88,
              signal_quality: 0.68,
              marginal_information_gain: 0.82,
            },
            {
              evidence_needs: ["historical_baseline", "search_live", "trend_signal"],
              rationale: "Housing and travel calls need local pressure, seasonality, and event context.",
            }
          ),
          buildVariable(
            this.id,
            "Mobility, tourism, and event calendar pressure",
            "case",
            {
              causal_relevance: 0.74,
              temporal_relevance: 0.84,
              geographic_relevance: 0.82,
              signal_quality: 0.62,
              marginal_information_gain: 0.72,
            },
            {
              evidence_needs: ["search_live", "macro_context"],
              rationale: "Local pressure often changes because of event cadence rather than slow-moving fundamentals.",
            }
          ),
        ];
      },
    },
    {
      id: "company_operations",
      label: "CompanyOperationsAdapter",
      scope: "vertical",
      match(normalizedQuery) {
        const corpus = normalizeText(
          [normalizedQuery.primary_domain_id, normalizedQuery.original_query, normalizedQuery.resolution_frame].join(" ")
        );
        return /business|startup|company|operations|labor|jobs|career|survive|runway/.test(corpus);
      },
      candidateVariables() {
        return [
          buildVariable(
            this.id,
            "Runway, demand health, and operating resilience",
            "core",
            {
              causal_relevance: 0.86,
              temporal_relevance: 0.82,
              geographic_relevance: 0.44,
              signal_quality: 0.64,
              marginal_information_gain: 0.8,
            },
            {
              evidence_needs: ["historical_baseline", "search_live", "macro_context"],
              rationale: "Business and startup outcomes usually hinge on resilience, demand, and external financing pressure.",
            }
          ),
        ];
      },
    },
  ];
}

function buildResearchPlan(normalizedQuery, selectedVariables = [], adapters = []) {
  const evidenceNeeds = uniqueStrings(
    selectedVariables.flatMap((variable) => (Array.isArray(variable.evidence_needs) ? variable.evidence_needs : []))
  );

  return {
    depth_mode: "deep",
    domains_to_inspect: uniqueStrings([
      safeText(normalizedQuery.primary_domain_id),
      ...(Array.isArray(normalizedQuery.supporting_domains) ? normalizedQuery.supporting_domains : []),
      ...((Array.isArray(normalizedQuery.subdomain_map) ? normalizedQuery.subdomain_map : []).map((item) => safeText(item.domain_id))),
    ]).filter(Boolean),
    source_priorities: evidenceNeeds.length > 0 ? evidenceNeeds : ["historical_baseline", "search_live", "source_reliability"],
    adapter_activation_order: adapters.map((adapter) => adapter.id),
    latency_policy: "deep_default_async_safe",
  };
}

function buildAdapterActivationMap(matchedAdapters = [], selectedVariables = []) {
  return matchedAdapters.map((adapter) => ({
    adapter_id: adapter.id,
    label: adapter.label,
    scope: adapter.scope,
    active: true,
    selected_variable_count: selectedVariables.filter((variable) => variable.source_adapter === adapter.id).length,
  }));
}

function ensureVerticalAdapterCoverage(candidateVariables = [], matchedAdapters = [], limit = 10) {
  const selected = candidateVariables.slice(0, limit);
  const selectedIds = new Set(selected.map((variable) => variable.variable_id));
  const matchedVerticalAdapters = matchedAdapters.filter((adapter) => safeText(adapter?.scope) === "vertical");

  for (const adapter of matchedVerticalAdapters) {
    const alreadyCovered = selected.some((variable) => variable.source_adapter === adapter.id);
    if (alreadyCovered) continue;

    const fallbackVariable = candidateVariables.find(
      (variable) => variable.source_adapter === adapter.id && !selectedIds.has(variable.variable_id)
    );
    if (!fallbackVariable) continue;

    const replacementIndex = selected.findIndex((variable) => variable.source_adapter !== adapter.id);
    if (replacementIndex >= 0) {
      selected[replacementIndex] = fallbackVariable;
      selectedIds.add(fallbackVariable.variable_id);
    } else if (selected.length < limit) {
      selected.push(fallbackVariable);
      selectedIds.add(fallbackVariable.variable_id);
    }
  }

  return selected
    .filter((variable) => variable && safeText(variable.variable_id))
    .sort((left, right) => Number(right?.overall_score || 0) - Number(left?.overall_score || 0))
    .slice(0, limit);
}

function runContextualVariableSelection(normalizedQuery = {}) {
  const registry = [...createUniversalAdapters(), ...createVerticalAdapters()];
  const matchedAdapters = registry.filter((adapter) => {
    try {
      return adapter.match(normalizedQuery);
    } catch (_error) {
      return false;
    }
  });

  const candidateVariables = matchedAdapters
    .flatMap((adapter) => {
      try {
        return adapter.candidateVariables(normalizedQuery) || [];
      } catch (_error) {
        return [];
      }
    })
    .sort((left, right) => right.overall_score - left.overall_score);

  const selectedVariables = ensureVerticalAdapterCoverage(candidateVariables, matchedAdapters, 10);
  const discardedVariables = candidateVariables.slice(10, 18).map((variable) => ({
    label: variable.label,
    source_adapter: variable.source_adapter,
    overall_score: variable.overall_score,
    reason_for_discard:
      variable.overall_score < 0.6
        ? "Signal quality or marginal information gain was too weak for this run."
        : "Kept out to preserve a finite deep-research budget.",
  }));

  const activationMap = buildAdapterActivationMap(matchedAdapters, selectedVariables);
  const researchPlan = buildResearchPlan(normalizedQuery, selectedVariables, matchedAdapters);

  return {
    research_plan: researchPlan,
    variable_selection_pack: {
      selected_variables: selectedVariables,
      discarded_variables: discardedVariables,
      selection_rationale: uniqueStrings(selectedVariables.map((variable) => safeText(variable.rationale))).slice(0, 8),
      adapter_activation_map: activationMap,
    },
  };
}

module.exports = {
  runContextualVariableSelection,
};
