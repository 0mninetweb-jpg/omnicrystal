const { clamp01, safeText } = require("../predictionCore");

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter((item) => typeof item === "string" && item.trim()))];
}

const FUSION_ELIGIBILITY_THRESHOLDS = {
  quality_score: 0.72,
  graph_coverage: 0.68,
  agent_convergence: 0.62,
};

function shouldRunSimulationDecisionGate({ normalizedQuery = {}, variableSelectionPack = {}, verifiedEvidencePack = {} }) {
  const simulationContext = verifiedEvidencePack?.simulation_context || {};
  const domainCorpus = [
    safeText(normalizedQuery.primary_domain_id),
    safeText(normalizedQuery.resolution_frame),
    safeText(normalizedQuery.original_query),
    safeText(simulationContext.domain_family),
    safeText(simulationContext.decision_frame),
  ]
    .join(" ")
    .toLowerCase();

  const selectedVariables = Array.isArray(variableSelectionPack.selected_variables)
    ? variableSelectionPack.selected_variables
    : [];
  const triggerCount = selectedVariables.filter((item) =>
    ["macro", "case", "core"].includes(safeText(item.family, "case"))
  ).length;
  const liveSignalCount = Array.isArray(verifiedEvidencePack.live_signals) ? verifiedEvidencePack.live_signals.length : 0;

  const reasons = [];
  if (/governance_timeline|geopolitics_conflict|long_run_analog|attention_narrative|culture_event_pressure|personal_tradeoff/.test(domainCorpus)) {
    reasons.push("typed_scenario_family");
  }
  if (/governance|policy|geopolit|public_timeline|media|city|housing|travel/.test(domainCorpus)) {
    reasons.push("domain_system_dynamics");
  }
  if (/referendum|election|coalition|war|regulation|startup|survive|risk|safety/.test(domainCorpus)) {
    reasons.push("multi_actor_dependency");
  }
  if (triggerCount >= 5) {
    reasons.push("branching_importance");
  }
  if (liveSignalCount >= 3 && /policy|market|decision|event/.test(domainCorpus)) {
    reasons.push("feedback_loop_pressure");
  }

  return {
    enabled: reasons.length > 0,
    reasons,
  };
}

function mapScenarioDistribution(digest = {}) {
  const frequencies = Array.isArray(digest.scenario_frequencies) ? digest.scenario_frequencies.slice(0, 3) : [];
  if (!frequencies.length) {
    return {
      base_case: null,
      upside_case: null,
      stress_case: null,
      scenario_weights: [],
      scenario_confidence_notes: [],
    };
  }

  const sorted = [...frequencies].sort((left, right) => right.probability - left.probability);
  return {
    base_case: sorted[0] || null,
    upside_case: sorted[1] || null,
    stress_case: sorted[2] || null,
    scenario_weights: sorted.map((item) => ({
      label: item.label,
      probability: clamp01(item.probability, 0.33),
    })),
    scenario_confidence_notes: uniqueStrings(digest.notes || []).slice(0, 3),
  };
}

function buildMiroFishOutputContract(digest = {}, gate = { enabled: false, reasons: [] }) {
  if (!gate.enabled || !digest || digest.enabled === false) {
    return {
      simulation_status: {
        status: "skipped",
        simulation_id: safeText(digest?.simulation_id),
        simulation_mode: "skipped",
        runtime_summary: "Simulation gate did not trigger for this run.",
        completion_quality: 0,
      },
      scenario_distribution: {
        base_case: null,
        upside_case: null,
        stress_case: null,
        scenario_weights: [],
        scenario_confidence_notes: [],
      },
      dominant_interaction_patterns: [],
      trigger_points: [],
      fragility_indicators: {
        fragility_score: 0,
        stability_notes: ["No simulation was needed for this run."],
        sensitive_nodes: [],
        shock_sensitivity: 0,
      },
      cascade_and_contagion_indicators: {
        cascade_probability: 0,
        contagion_risk: 0,
        amplification_likelihood: 0,
        propagation_path_notes: [],
      },
      actor_level_findings: [],
      divergence_summary: {
        main_divergence_axes: [],
        scenario_split_reasons: [],
        uncertainty_branch_notes: [],
      },
      confidence_modifiers: {
        confidence_upward_modifiers: [],
        confidence_downward_modifiers: [],
        simulation_reliability_notes: [],
        uncertainty_pressure: 0,
      },
      simulation_summary_for_fusion: {
        simulation_summary: "No simulation evidence was required.",
        top_3_takeaways: [],
        top_3_risks: [],
        top_3_watch_items: [],
        recommended_fusion_weight: 0,
      },
      typed_output: {
        regime_shift_risk: 0,
        actor_dependency: 0,
        cascade_pressure: 0,
        trigger_map: [],
        invalidation_map: [],
        scenario_split_cause: [],
      },
      fusion_eligible: false,
    };
  }

  const fragilityScore = Number(clamp01(1 - clamp01(digest.quality_score, 0.6) * 0.7 - clamp01(digest.agent_convergence, 0.55) * 0.3, 0.42).toFixed(3));
  const uncertaintyPressure = Number(
    clamp01(
      Math.max(0, fragilityScore * 0.5 + (1 - clamp01(digest.graph_coverage, 0.6)) * 0.3 + (1 - clamp01(digest.agent_convergence, 0.55)) * 0.2),
      0.28
    ).toFixed(3)
  );
  const fusionEligible =
    clamp01(digest.quality_score, 0) >= FUSION_ELIGIBILITY_THRESHOLDS.quality_score &&
    clamp01(digest.graph_coverage, 0) >= FUSION_ELIGIBILITY_THRESHOLDS.graph_coverage &&
    clamp01(digest.agent_convergence, 0) >= FUSION_ELIGIBILITY_THRESHOLDS.agent_convergence;
  const typedOutput = {
    regime_shift_risk: Number(clamp01(digest.regime_shift_risk, fragilityScore).toFixed(3)),
    actor_dependency: Number(clamp01(digest.actor_dependency, 0.48).toFixed(3)),
    cascade_pressure: Number(clamp01(digest.cascade_pressure, uncertaintyPressure).toFixed(3)),
    trigger_map: uniqueStrings(digest.trigger_map || []).slice(0, 5),
    invalidation_map: uniqueStrings(digest.invalidation_map || []).slice(0, 5),
    scenario_split_cause: uniqueStrings(digest.scenario_split_cause || []).slice(0, 4),
  };

  return {
    simulation_status: {
      status: digest.cache_status === "failed" ? "failed_safely" : digest.cache_status === "fresh" ? "completed" : "partially_completed",
      simulation_id: safeText(digest.simulation_id),
      simulation_mode: safeText(digest.simulation_mode, "delta_simulation"),
      runtime_summary: safeText(digest.graph_summary || digest.narrative_arc, "Simulation evidence was generated."),
      completion_quality: clamp01(digest.quality_score, 0.62),
    },
    scenario_distribution: mapScenarioDistribution(digest),
    dominant_interaction_patterns: uniqueStrings([
      ...((Array.isArray(digest.pivotal_actors) ? digest.pivotal_actors : []).map((item) => `Pivotal actor: ${item}`)),
      safeText(digest.narrative_arc),
    ]).slice(0, 4),
    trigger_points: uniqueStrings([
      ...(Array.isArray(digest.intervention_points) ? digest.intervention_points : []),
      ...((Array.isArray(digest.counterfactuals) ? digest.counterfactuals : []).map(
        (item) => `${safeText(item.label)} -> ${safeText(item.outcome)}`
      )),
    ]).slice(0, 4),
    fragility_indicators: {
      fragility_score: fragilityScore,
      stability_notes: uniqueStrings(digest.notes || []).slice(0, 3),
      sensitive_nodes: uniqueStrings(digest.pivotal_actors || []).slice(0, 4),
      shock_sensitivity: Number(clamp01(fragilityScore * 0.8 + uncertaintyPressure * 0.2, 0.35).toFixed(3)),
    },
    cascade_and_contagion_indicators: {
      cascade_probability: Number(clamp01(digest.probability_delta > 0 ? 0.55 + digest.probability_delta : 0.45 + Math.abs(digest.probability_delta), 0.42).toFixed(3)),
      contagion_risk: Number(clamp01(uncertaintyPressure * 0.8, 0.24).toFixed(3)),
      amplification_likelihood: Number(clamp01((Array.isArray(digest.tensions) ? digest.tensions.length : 0) * 0.18, 0.2).toFixed(3)),
      propagation_path_notes: uniqueStrings(digest.tensions || []).slice(0, 3),
    },
    actor_level_findings: uniqueStrings([
      ...(Array.isArray(digest.community_summaries) ? digest.community_summaries : []),
      ...(Array.isArray(digest.pivotal_actors) ? digest.pivotal_actors.map((actor) => `${actor} can shift the path quickly.`) : []),
    ]).slice(0, 4),
    divergence_summary: {
      main_divergence_axes: uniqueStrings(digest.tensions || []).slice(0, 3),
      scenario_split_reasons: uniqueStrings(
        (Array.isArray(digest.counterfactuals) ? digest.counterfactuals : []).map((item) => safeText(item.label))
      ).slice(0, 3),
      uncertainty_branch_notes: uniqueStrings(digest.notes || []).slice(0, 3),
    },
    confidence_modifiers: {
      confidence_upward_modifiers:
        fusionEligible && digest.confidence_delta > 0
          ? [`Simulation convergence improved confidence by ${Math.round(digest.confidence_delta * 100)} points.`]
          : [],
      confidence_downward_modifiers:
        fusionEligible && (digest.confidence_delta < 0 || uncertaintyPressure > 0.4)
          ? uniqueStrings([
              digest.confidence_delta < 0 ? `Simulation reduced confidence by ${Math.round(Math.abs(digest.confidence_delta) * 100)} points.` : "",
              uncertaintyPressure > 0.4 ? "Scenario branching remains fragile." : "",
            ]).slice(0, 3)
          : [],
      simulation_reliability_notes: uniqueStrings(digest.notes || []).slice(0, 3),
      uncertainty_pressure: uncertaintyPressure,
    },
    simulation_summary_for_fusion: {
      simulation_summary: safeText(digest.narrative_arc, "Simulation evidence added interaction and fragility context."),
      top_3_takeaways: uniqueStrings(digest.pivotal_actors || []).slice(0, 3),
      top_3_risks: uniqueStrings(digest.tensions || []).slice(0, 3),
      top_3_watch_items: uniqueStrings(digest.intervention_points || []).slice(0, 3),
      recommended_fusion_weight: fusionEligible
        ? Number(clamp01(digest.quality_score * 0.6 + digest.graph_coverage * 0.4, 0.42).toFixed(3))
        : 0,
    },
    typed_output: typedOutput,
    fusion_eligible: fusionEligible,
  };
}

function applySimulationFusion(rawPrediction = {}, simulationContract = null) {
  if (!simulationContract || simulationContract.simulation_status?.status === "skipped") {
    return rawPrediction;
  }

  const confidencePressure =
    simulationContract.fusion_eligible === true
      ? (simulationContract.confidence_modifiers?.confidence_upward_modifiers?.length || 0) * 0.03 -
        (simulationContract.confidence_modifiers?.confidence_downward_modifiers?.length || 0) * 0.04 -
        clamp01(simulationContract.confidence_modifiers?.uncertainty_pressure, 0) * 0.05
      : 0;

  const next = {
    ...rawPrediction,
    key_drivers: uniqueStrings([
      ...(Array.isArray(rawPrediction.key_drivers) ? rawPrediction.key_drivers : []),
      ...((Array.isArray(simulationContract.dominant_interaction_patterns)
        ? simulationContract.dominant_interaction_patterns
        : []
      ).slice(0, 2)),
    ]).slice(0, 4),
    counter_signals: uniqueStrings([
      ...(Array.isArray(rawPrediction.counter_signals) ? rawPrediction.counter_signals : []),
      ...((Array.isArray(simulationContract.divergence_summary?.uncertainty_branch_notes)
        ? simulationContract.divergence_summary.uncertainty_branch_notes
        : []
      ).slice(0, 2)),
    ]).slice(0, 4),
    invalidators: uniqueStrings([
      ...(Array.isArray(rawPrediction.invalidators) ? rawPrediction.invalidators : []),
      ...((Array.isArray(simulationContract.trigger_points) ? simulationContract.trigger_points : []).slice(0, 3)),
    ]).slice(0, 4),
    simulation_summary_for_fusion: simulationContract.simulation_summary_for_fusion,
    simulation_typed_output: simulationContract.typed_output,
    confidence_score:
      rawPrediction.confidence_score == null
        ? undefined
        : Number(clamp01(rawPrediction.confidence_score + confidencePressure, rawPrediction.confidence_score).toFixed(3)),
  };

  return next;
}

module.exports = {
  shouldRunSimulationDecisionGate,
  buildMiroFishOutputContract,
  applySimulationFusion,
};
