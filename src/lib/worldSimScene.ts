import { WORLD_SIM_BRAND } from '../content/brand';
import type { PredictionMarketFrame, WorldSimDigest } from '../types/crystal';
import type { WorldSimJobDetail, WorldSimJobRef } from '../types/worldSimJob';
import type {
  MatrixInterventionCard,
  MatrixInterventionPayload,
  MatrixSimulationResult,
  MatrixWorldStateSnapshot,
  SimulationBranch,
  WorldSimNodeTone,
  WorldSimSceneData,
  WorldSimSceneLink,
  WorldSimSceneMarketFrame,
  WorldSimSceneMode,
  WorldSimSceneNode,
  WorldSimScenePrompt,
  WorldSimViewMode,
  WorldStateDelta,
} from '../types/worldSim';

export type WorldSimPreviewId = 'public-opinion' | 'geopolitical-escalation' | 'city-pressure';

type CreateWorldSimSceneInput = {
  title?: string;
  subtitle?: string;
  question?: string;
  sourceLabel?: string;
  mode?: WorldSimSceneMode;
  viewMode?: WorldSimViewMode;
  previewId?: WorldSimPreviewId;
  digest?: Partial<WorldSimDigest> | null;
  narrativeArc?: string;
  actors?: string[];
  interventionPoints?: string[];
  tensions?: string[];
  communityNotes?: string[];
  scenarios?: Array<{ label?: string; probability?: number | null }>;
  marketFrame?: PredictionMarketFrame | WorldSimSceneMarketFrame | null;
  job?: Partial<WorldSimJobRef | WorldSimJobDetail> | null;
  availableInterventions?: MatrixInterventionCard[];
  baseline?: MatrixWorldStateSnapshot | null;
  branch?: SimulationBranch | null;
  delta?: WorldStateDelta | null;
  branchLimit?: number;
};

type WorldSimPreviewDataset = Omit<
  WorldSimSceneData,
  'mode' | 'truthNote' | 'viewMode' | 'availableInterventions' | 'baseline' | 'branch' | 'delta' | 'branchLimit'
>;

const NODE_POSITIONS: Array<{
  orbit: WorldSimSceneNode['orbit'];
  angle: number;
  distance: number;
  tone: WorldSimNodeTone;
  size: WorldSimSceneNode['size'];
}> = [
  { orbit: 'inner', angle: -28, distance: 16, tone: 'signal', size: 'lg' },
  { orbit: 'mid', angle: 18, distance: 28, tone: 'pressure', size: 'md' },
  { orbit: 'mid', angle: 142, distance: 30, tone: 'signal', size: 'md' },
  { orbit: 'outer', angle: 208, distance: 40, tone: 'stability', size: 'sm' },
  { orbit: 'outer', angle: 320, distance: 41, tone: 'pressure', size: 'sm' },
];

const INTERVENTION_LIBRARY: MatrixInterventionCard[] = [
  {
    id: 'matrix-marketing',
    category: 'marketing_attention',
    label: 'Marketing / attention',
    description: 'Testa un picco di attenzione e vedi se produce momentum o solo rumore.',
    guidance: 'Per lanci, campagne e spike di attenzione non distruttivi.',
    iconLabel: 'Attention',
    allowedPlans: ['free', 'plus', 'pro'],
    defaultPayload: {
      cardId: 'matrix-marketing',
      category: 'marketing_attention',
      label: 'Marketing / attention',
      intent: 'Test an attention surge and see whether it creates durable momentum.',
      intensity: 0.42,
      geography: 'Italy',
      duration: '14d',
      targetAudience: 'Urban digital audiences',
      timing: 'Launch this week',
      safetyNote: 'Simulation only. This is not a real campaign plan.',
    },
  },
  {
    id: 'matrix-media',
    category: 'media_narrative',
    label: 'Media / narrative',
    description: 'Inietti un framing mediatico e misuri come cambia il tono del sistema.',
    guidance: 'Per leggere se una narrativa resta superficiale o cambia davvero il clima.',
    iconLabel: 'Narrative',
    allowedPlans: ['free', 'plus', 'pro'],
    defaultPayload: {
      cardId: 'matrix-media',
      category: 'media_narrative',
      label: 'Media / narrative',
      intent: 'Inject a strong narrative frame and observe how it changes social response.',
      intensity: 0.5,
      geography: 'Europe',
      duration: '21d',
      targetAudience: 'Media audiences and institutional observers',
      timing: 'Immediately after a public event',
      safetyNote: 'Simulation only. This does not generate persuasion instructions.',
    },
  },
  {
    id: 'matrix-policy',
    category: 'policy_regulation',
    label: 'Policy / regulation',
    description: 'Simuli un cambio regolatorio e osservi reazioni pubbliche e di sistema.',
    guidance: 'Per stress test di policy e ripple effects.',
    iconLabel: 'Policy',
    allowedPlans: ['plus', 'pro'],
    defaultPayload: {
      cardId: 'matrix-policy',
      category: 'policy_regulation',
      label: 'Policy / regulation',
      intent: 'Stress test a policy move and trace the first social and market reactions.',
      intensity: 0.54,
      geography: 'EU',
      duration: '30d',
      targetAudience: 'Institutions, operators, and exposed households',
      timing: 'At the next policy window',
      safetyNote: 'Simulation only. This is not legal or political advice.',
    },
  },
  {
    id: 'matrix-pricing',
    category: 'pricing_product',
    label: 'Pricing / product',
    description: 'Modifichi prezzo o offerta e vedi se il sistema assorbe o respinge il cambiamento.',
    guidance: 'Per prezzo, churn, adozione e risposta della concorrenza.',
    iconLabel: 'Pricing',
    allowedPlans: ['free', 'plus', 'pro'],
    defaultPayload: {
      cardId: 'matrix-pricing',
      category: 'pricing_product',
      label: 'Pricing / product',
      intent: 'Test a pricing intervention and see how adoption and backlash change.',
      intensity: 0.38,
      geography: 'Key launch markets',
      duration: '30d',
      targetAudience: 'Current users and adjacent segments',
      timing: 'Next billing cycle',
      safetyNote: 'Simulation only. This does not replace product research.',
    },
  },
  {
    id: 'matrix-social',
    category: 'social_shock',
    label: 'Social shock',
    description: 'Applichi uno shock sociale astratto e misuri attrito e resilienza.',
    guidance: 'Per leggere contagio comportamentale e punti di fragilita.',
    iconLabel: 'Society',
    allowedPlans: ['plus', 'pro'],
    defaultPayload: {
      cardId: 'matrix-social',
      category: 'social_shock',
      label: 'Social shock',
      intent: 'Inject a broad social shock and observe stress, trust erosion, and adaptation.',
      intensity: 0.6,
      geography: 'Urban clusters',
      duration: '45d',
      targetAudience: 'Households, workers, and local communities',
      timing: 'During a fragile consensus window',
      safetyNote: 'Simulation only. This is not a real-world disruption plan.',
    },
  },
  {
    id: 'matrix-conflict',
    category: 'conflict_systemic_shock',
    label: 'Conflict / systemic shock',
    description: 'Simuli un grande shock di sistema e leggi postura, stress e propagazione.',
    guidance: 'Solo come stress test astratto, non come istruzione operativa.',
    iconLabel: 'Systemic',
    allowedPlans: ['pro'],
    defaultPayload: {
      cardId: 'matrix-conflict',
      category: 'conflict_systemic_shock',
      label: 'Conflict / systemic shock',
      intent: 'Model a systemic shock and measure containment, spillover, and coalition reactions.',
      intensity: 0.68,
      geography: 'Regional system',
      duration: '60d',
      targetAudience: 'Institutions, supply chains, and exposed populations',
      timing: 'At the first sign of escalation',
      safetyNote: 'Simulation only. This does not generate real-world harmful instructions.',
    },
  },
  {
    id: 'matrix-health',
    category: 'health_disruption_shock',
    label: 'Health / disruption shock',
    description: 'Testi una disruption sanitaria astratta e misuri adattamento e pressione.',
    guidance: 'Per preparedness e continuita operativa, non per guidance sanitaria reale.',
    iconLabel: 'Health',
    allowedPlans: ['pro'],
    defaultPayload: {
      cardId: 'matrix-health',
      category: 'health_disruption_shock',
      label: 'Health / disruption shock',
      intent: 'Simulate a health-related disruption and observe service load, trust, and adaptation.',
      intensity: 0.62,
      geography: 'Large metro area',
      duration: '45d',
      targetAudience: 'Public services, households, and local operators',
      timing: 'Before a peak-pressure period',
      safetyNote: 'Simulation only. This is not operational health guidance.',
    },
  },
];

const PREVIEW_DATASETS: Record<WorldSimPreviewId, Omit<WorldSimPreviewDataset, 'prompts'>> = {
  'public-opinion': {
    id: 'public-opinion',
    kicker: WORLD_SIM_BRAND.previewName,
    title: 'Europa: consenso, attrito e punti di svolta',
    subtitle: 'Quando l esito dipende da coalizioni, pressione pubblica e reazioni a catena, il numero da solo non basta.',
    question: 'Cosa potrebbe far cambiare davvero il consenso nei prossimi 90 giorni?',
    sourceLabel: 'Preview dataset',
    narrativeArc: 'Il sistema resta fragile ma non ancora rotto: la traiettoria cambia quando un segnale economico riorganizza il consenso piu velocemente delle istituzioni.',
    actors: ['Coalizioni di governo', 'Opinione urbana', 'Retail energy consumers', 'Media agenda', 'Blocchi europei'],
    interventionPoints: ['Monitorare il costo percepito.', 'Osservare fratture locali.', 'Separare rumore da cambi persistenti.'],
    tensions: ['Costo della vita vs stabilita politica', 'Narrativa media vs esperienza reale', 'Centro urbano vs periferia'],
    communityNotes: ['I gruppi piu esposti reagiscono prima dei commentatori.', 'Le narrative su identita e bollette cambiano il ritmo del consenso.'],
    scenarios: [
      { label: 'Slow drift', probability: 0.46 },
      { label: 'Sharp polling swing', probability: 0.31 },
      { label: 'Short panic, fast stabilization', probability: 0.23 },
    ],
    nodes: [],
    links: [],
    stats: [
      { label: 'Graph coverage', value: '68%', accent: 'blue' },
      { label: 'Agent convergence', value: '61%', accent: 'rose' },
      { label: 'Freshness', value: '< 24h', accent: 'emerald' },
      { label: 'Source set', value: 'Preview pack', accent: 'amber' },
    ],
    marketFrame: { outcome: 'Il consenso europeo si indebolira nei prossimi 90 giorni', horizon: '90d', resolutionCriteria: 'Misurato tramite polling e segnali sociali.', referenceMarket: null, priorProbability: null },
  },
  'geopolitical-escalation': {
    id: 'geopolitical-escalation',
    kicker: WORLD_SIM_BRAND.previewName,
    title: 'Shock geopolitico: come si propaga nel sistema',
    subtitle: 'Serve quando una crisi attraversa attori, alleanze, supply chain e opinione pubblica.',
    question: 'Dove puo propagarsi davvero un escalation nei prossimi 30 giorni?',
    sourceLabel: 'Preview dataset',
    narrativeArc: 'Le escalation si amplificano quando logistica, narrativa e incentivi politici locali si sincronizzano nello stesso intervallo temporale.',
    actors: ['Blocchi regionali', 'Supply chain energy', 'Alleanze difensive', 'Media internazionali', 'Citta portuali'],
    interventionPoints: ['Leggere i colli di bottiglia logistici.', 'Separare rumore diplomatico da cambi veri.', 'Monitorare nodi ad alta esposizione.'],
    tensions: ['Escalation vs contenimento', 'Shock logistico vs assorbimento', 'Prezzi energia vs resilienza politica'],
    communityNotes: ['I nodi logistici reagiscono in anticipo.', 'Le alleanze reggono finche il costo interno resta assorbibile.'],
    scenarios: [
      { label: 'Contained escalation', probability: 0.44 },
      { label: 'Spillover across logistics', probability: 0.34 },
      { label: 'Rapid de-escalation', probability: 0.22 },
    ],
    nodes: [],
    links: [],
    stats: [
      { label: 'Graph coverage', value: '72%', accent: 'blue' },
      { label: 'Agent convergence', value: '58%', accent: 'rose' },
      { label: 'Freshness', value: '< 12h', accent: 'emerald' },
      { label: 'Source set', value: 'Preview pack', accent: 'amber' },
    ],
    marketFrame: { outcome: 'L escalation avra effetti economici visibili sul sistema europeo', horizon: '30d', resolutionCriteria: 'Osservato tramite stress logistico ed energetico.', referenceMarket: null, priorProbability: null },
  },
  'city-pressure': {
    id: 'city-pressure',
    kicker: WORLD_SIM_BRAND.previewName,
    title: 'City pressure: mobilita, turismo, prezzo percepito',
    subtitle: 'La simulazione urbana serve quando una citta sembra stabile ma i segnali locali salgono insieme.',
    question: 'Quale dinamica locale puo cambiare piu in fretta nei prossimi 30 giorni?',
    sourceLabel: 'Preview dataset',
    narrativeArc: 'Le citta cambiano tono quando domanda improvvisa, capacita rigida e narrativa pubblica si allineano nello stesso momento.',
    actors: ['Pendolari', 'Turismo breve', 'Residenti centrali', 'Servizi urbani', 'Mobility operators'],
    interventionPoints: ['Seguire i colli di bottiglia di mobilita.', 'Osservare pricing e tempi di attesa.', 'Separare picchi stagionali da pattern strutturali.'],
    tensions: ['Domanda turistica vs qualita urbana', 'Prezzo percepito vs accessibilita', 'Servizi rigidi vs domanda volatile'],
    communityNotes: ['I segnali di citta cambiano quando mobilita, prezzo e reputazione convergono.', 'I residenti reagiscono prima sulla routine che sulla dichiarazione politica.'],
    scenarios: [
      { label: 'Managed pressure', probability: 0.41 },
      { label: 'Localized strain', probability: 0.37 },
      { label: 'Fast normalization', probability: 0.22 },
    ],
    nodes: [],
    links: [],
    stats: [
      { label: 'Graph coverage', value: '64%', accent: 'blue' },
      { label: 'Agent convergence', value: '57%', accent: 'rose' },
      { label: 'Freshness', value: '< 24h', accent: 'emerald' },
      { label: 'Source set', value: 'Preview pack', accent: 'amber' },
    ],
    marketFrame: { outcome: 'La pressione urbana diventera visibile nella routine locale', horizon: '30d', resolutionCriteria: 'Confermata da segnali simultanei su mobilita, pricing e congestione.', referenceMarket: null, priorProbability: null },
  },
};

function clampProbability(value: number | null | undefined, fallback = 0.33) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  if (next > 1) return Math.max(0, Math.min(1, next / 100));
  return Math.max(0, Math.min(1, next));
}

function toPercentLabel(value: number | null | undefined, fallback = 0.5) {
  return `${Math.round(clampProbability(value, fallback) * 100)}%`;
}

function sanitizeList(list: unknown, fallback: string[] = []) {
  if (!Array.isArray(list)) return fallback;
  return list.map((item) => String(item).trim()).filter(Boolean);
}

function toFreshnessLabel(hours: number | null | undefined) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return 'Unknown';
  if (value <= 6) return '< 6h';
  if (value <= 24) return '< 24h';
  if (value <= 72) return '< 72h';
  return `${Math.round(value)}h`;
}

function normalizeMarketFrame(frame?: PredictionMarketFrame | WorldSimSceneMarketFrame | null): WorldSimSceneMarketFrame | null {
  if (!frame) return null;
  const normalizedFrame = frame as {
    outcome?: string;
    horizon?: string;
    resolution_criteria?: string;
    resolutionCriteria?: string;
    reference_market?: string | null;
    referenceMarket?: string | null;
    prior_probability?: number | null;
    priorProbability?: number | null;
    market_id?: string | null;
    marketId?: string | null;
    market_slug?: string | null;
    marketSlug?: string | null;
    market_question?: string;
    marketQuestion?: string;
    market_url?: string | null;
    marketUrl?: string | null;
    implied_probability?: number | null;
    impliedProbability?: number | null;
    match_confidence?: number | null;
    matchConfidence?: number | null;
    market_quality?: number | null;
    marketQuality?: number | null;
    open_interest?: number | null;
    openInterest?: number | null;
    volume_24h?: number | null;
    volume24h?: number | null;
    liquidity?: number | null;
    price_updated_at?: string | null;
    priceUpdatedAt?: string | null;
    divergence_vs_crystal?: number | null;
    divergenceVsCrystal?: number | null;
    calibration_applied?: boolean;
    calibrationApplied?: boolean;
    calibration_note?: string;
    calibrationNote?: string;
    crystal_probability?: number | null;
    crystalProbability?: number | null;
    calibrated_probability?: number | null;
    calibratedProbability?: number | null;
    price_change_7d?: number | null;
    priceChange7d?: number | null;
  };

  return {
    outcome: normalizedFrame.outcome,
    horizon: normalizedFrame.horizon,
    resolutionCriteria: normalizedFrame.resolution_criteria || normalizedFrame.resolutionCriteria,
    referenceMarket: normalizedFrame.referenceMarket || normalizedFrame.reference_market || null,
    priorProbability: normalizedFrame.priorProbability ?? normalizedFrame.prior_probability ?? null,
    marketId: normalizedFrame.marketId || normalizedFrame.market_id || null,
    marketSlug: normalizedFrame.marketSlug || normalizedFrame.market_slug || null,
    marketQuestion: normalizedFrame.marketQuestion || normalizedFrame.market_question,
    marketUrl: normalizedFrame.marketUrl || normalizedFrame.market_url || null,
    impliedProbability: normalizedFrame.impliedProbability ?? normalizedFrame.implied_probability ?? null,
    matchConfidence: normalizedFrame.matchConfidence ?? normalizedFrame.match_confidence ?? null,
    marketQuality: normalizedFrame.marketQuality ?? normalizedFrame.market_quality ?? null,
    openInterest: normalizedFrame.openInterest ?? normalizedFrame.open_interest ?? null,
    volume24h: normalizedFrame.volume24h ?? normalizedFrame.volume_24h ?? null,
    liquidity: normalizedFrame.liquidity ?? null,
    priceUpdatedAt: normalizedFrame.priceUpdatedAt || normalizedFrame.price_updated_at || null,
    divergenceVsCrystal: normalizedFrame.divergenceVsCrystal ?? normalizedFrame.divergence_vs_crystal ?? null,
    calibrationApplied: normalizedFrame.calibrationApplied ?? normalizedFrame.calibration_applied ?? false,
    calibrationNote: normalizedFrame.calibrationNote || normalizedFrame.calibration_note,
    crystalProbability: normalizedFrame.crystalProbability ?? normalizedFrame.crystal_probability ?? null,
    calibratedProbability: normalizedFrame.calibratedProbability ?? normalizedFrame.calibrated_probability ?? null,
    priceChange7d: normalizedFrame.priceChange7d ?? normalizedFrame.price_change_7d ?? null,
  };
}

function buildNodes(actors: string[]): WorldSimSceneNode[] {
  return actors.slice(0, NODE_POSITIONS.length).map((actor, index) => {
    const position = NODE_POSITIONS[index];
    return {
      id: `node-${index + 1}`,
      label: actor,
      orbit: position.orbit,
      angle: position.angle,
      distance: position.distance,
      tone: position.tone,
      status: position.tone === 'pressure' ? 'Pressure' : position.tone === 'signal' ? 'Signal' : 'Stability',
      size: position.size,
    };
  });
}

function buildLinks(nodes: WorldSimSceneNode[]): WorldSimSceneLink[] {
  const links: WorldSimSceneLink[] = nodes.map((node, index) => ({
    id: `core-${node.id}`,
    from: 'core',
    to: node.id,
    strength: index < 2 ? 'high' : index < 4 ? 'medium' : 'low',
  }));

  if (nodes.length > 2) {
    links.push({ id: `${nodes[0].id}-${nodes[1].id}`, from: nodes[0].id, to: nodes[1].id, strength: 'medium' });
    links.push({ id: `${nodes[1].id}-${nodes[2].id}`, from: nodes[1].id, to: nodes[2].id, strength: 'low' });
  }

  return links;
}

function createPromptSet(question: string, actors: string[], interventionPoints: string[], tensions: string[]): WorldSimScenePrompt[] {
  const leadActors = actors.slice(0, 2).join(' e ') || 'gli attori chiave';
  const firstIntervention = interventionPoints[0] || 'osservare i punti di pressione che si stanno addensando';
  const firstTension = tensions[0] || 'la frizione principale tra segnali e sistema';

  return [
    {
      id: 'system-shift',
      label: 'What shifts the system',
      question: 'Nella simulazione: cosa sposta davvero questa domanda?',
      response: `Il sistema si sposta quando ${firstTension.toLowerCase()} smette di restare locale e si trasforma in comportamento collettivo. In quel momento ${leadActors.toLowerCase()} iniziano a reagire in sequenza, non piu in modo isolato.`,
    },
    {
      id: 'watch-next',
      label: 'What to watch next',
      question: 'Se stessi guardando questa traiettoria dall alto, cosa seguirei adesso?',
      response: `Seguirei prima ${firstIntervention.toLowerCase()}. Se quel punto si irrigidisce mentre la narrativa resta indietro, la probabilita cambia prima che il quadro sembri ovvio.`,
    },
    {
      id: 'god-mode',
      label: 'God mode question',
      question,
      response:
        'Se interroghi il sistema come se fossi sopra la mappa, la risposta non e un singolo headline. E la sequenza: chi reagisce per primo, dove si forma attrito, e quale segnale cambia il comportamento collettivo.',
    },
  ];
}

function inferPreviewIdFromText(text?: string): WorldSimPreviewId {
  const query = (text || '').toLowerCase();
  if (/(city|roma|milano|tourism|mobility|urban|citta|mobilita|turismo)/.test(query)) return 'city-pressure';
  if (/(war|ceasefire|border|tariff|sanction|embargo|geopolit|sanzioni|dazi|conflitto)/.test(query)) {
    return 'geopolitical-escalation';
  }
  return 'public-opinion';
}

function clonePreviewDataset(id: WorldSimPreviewId): WorldSimPreviewDataset {
  const dataset = PREVIEW_DATASETS[id];
  return {
    ...dataset,
    actors: [...dataset.actors],
    interventionPoints: [...dataset.interventionPoints],
    tensions: [...dataset.tensions],
    communityNotes: [...dataset.communityNotes],
    scenarios: dataset.scenarios.map((scenario) => ({ ...scenario })),
    prompts: [],
    nodes: dataset.nodes.map((node) => ({ ...node })),
    links: dataset.links.map((link) => ({ ...link })),
    stats: dataset.stats.map((stat) => ({ ...stat })),
    marketFrame: dataset.marketFrame ? { ...dataset.marketFrame } : null,
  };
}

function cloneInterventionCards(cards: MatrixInterventionCard[]) {
  return cards.map((card) => ({
    ...card,
    allowedPlans: [...card.allowedPlans],
    defaultPayload: { ...card.defaultPayload },
  }));
}

function buildMatrixWorldStateSnapshot(input: {
  title: string;
  subtitle: string;
  narrativeArc: string;
  actors: string[];
  scenarios: Array<{ label: string; probability: number }>;
  notes: string[];
  digest?: Partial<WorldSimDigest> | null;
}): MatrixWorldStateSnapshot {
  return {
    title: input.title,
    subtitle: input.subtitle,
    narrativeArc: input.narrativeArc,
    actors: [...input.actors],
    scenarios: input.scenarios.map((scenario) => ({ ...scenario })),
    notes: [...input.notes],
    digest: input.digest || null,
  };
}

function getCategoryNarrative(category: MatrixInterventionPayload['category']) {
  switch (category) {
    case 'marketing_attention':
      return ['Attention compresses quickly around a visible launch.', 'Audience response splits between curiosity and skepticism.', 'Low systemic stress, high volatility in attention.'];
    case 'media_narrative':
      return ['A narrative frame moves faster than facts.', 'Communities amplify the new frame before institutions react.', 'Moderate stress through reputational pressure.'];
    case 'policy_regulation':
      return ['Institutions react first, operators second, households later.', 'Compliance moves before public clarity catches up.', 'Moderate-to-high stress where incentives diverge.'];
    case 'pricing_product':
      return ['Perceived fairness becomes the hinge.', 'Users compare alternatives publicly and quickly.', 'Medium stress on loyalty and switching behavior.'];
    case 'social_shock':
      return ['Trust redistributes quickly across unevenly resilient groups.', 'Communities adapt at different speeds.', 'High social stress with local pressure pockets.'];
    case 'conflict_systemic_shock':
      return ['Coalitions harden and logistics become fragile.', 'Public reactions swing between stability and escalation.', 'High systemic stress with spillover risk.'];
    case 'health_disruption_shock':
      return ['Service capacity and trust become the bottlenecks.', 'Communities change routines before institutions normalize the signal.', 'High stress on services and public trust.'];
    default:
      return ['The system absorbs the intervention and redistributes pressure.', 'Communities react in waves.', 'Mixed stress across the network.'];
  }
}

function adjustScenarios(scenarios: Array<{ label: string; probability: number }>, shift: number) {
  if (scenarios.length === 0) {
    return [
      { label: 'Higher momentum', probability: clampProbability(0.5 + shift, 0.55) },
      { label: 'Contained response', probability: clampProbability(0.3 - shift / 2, 0.25) },
      { label: 'Backlash and reversal', probability: clampProbability(0.2 + Math.abs(shift) / 2, 0.2) },
    ];
  }

  const next = scenarios.map((scenario, index) => {
    const delta = index === 0 ? shift : index === 1 ? -shift / 2 : Math.abs(shift) / 2;
    return { ...scenario, probability: clampProbability(scenario.probability + delta, scenario.probability) };
  });
  const total = next.reduce((sum, scenario) => sum + scenario.probability, 0) || 1;
  return next.map((scenario) => ({ ...scenario, probability: scenario.probability / total }));
}

export function getDefaultMatrixInterventionCards() {
  return cloneInterventionCards(INTERVENTION_LIBRARY);
}

export function createSimulationBranch({
  id,
  label,
  payload,
  parentId = null,
  status = 'draft',
  jobId = null,
  result = null,
}: {
  id: string;
  label: string;
  payload: MatrixInterventionPayload;
  parentId?: string | null;
  status?: SimulationBranch['status'];
  jobId?: string | null;
  result?: MatrixSimulationResult | null;
}): SimulationBranch {
  return {
    id,
    parentId,
    label,
    createdAt: new Date().toISOString(),
    status,
    payload: { ...payload },
    jobId,
    result,
  };
}

export function createMatrixSimulationPreviewResult({
  scene,
  payload,
  branchId,
  sourceMode = 'preview',
}: {
  scene: Pick<WorldSimSceneData, 'title' | 'subtitle' | 'baseline' | 'actors' | 'scenarios' | 'communityNotes' | 'narrativeArc'>;
  payload: MatrixInterventionPayload;
  branchId: string;
  sourceMode?: 'preview' | 'live';
}): MatrixSimulationResult {
  const baseline =
    scene.baseline ||
    buildMatrixWorldStateSnapshot({
      title: scene.title,
      subtitle: scene.subtitle,
      narrativeArc: scene.narrativeArc,
      actors: scene.actors,
      scenarios: scene.scenarios,
      notes: scene.communityNotes,
      digest: null,
    });

  const intensity = Math.max(0.1, Math.min(1, payload.intensity));
  const durationFactor = /60d|90d/i.test(payload.duration) ? 0.07 : /30d|45d/i.test(payload.duration) ? 0.05 : 0.03;
  const geographyFactor = /global|regional|eu|europe/i.test(payload.geography) ? 0.02 : /metro|city|urban/i.test(payload.geography) ? 0.015 : 0.01;
  const categoryFactor = {
    marketing_attention: 0.025,
    media_narrative: 0.03,
    policy_regulation: 0.04,
    pricing_product: 0.022,
    social_shock: 0.045,
    conflict_systemic_shock: 0.05,
    health_disruption_shock: 0.048,
  }[payload.category];
  const deltaProbability = Math.max(-0.18, Math.min(0.18, intensity * 0.08 + durationFactor + geographyFactor + categoryFactor - 0.04));
  const narrativePack = getCategoryNarrative(payload.category);
  const interventionScenarios = adjustScenarios(baseline.scenarios, deltaProbability);

  const interventionDigest: Partial<WorldSimDigest> = {
    enabled: true,
    simulation_mode: sourceMode === 'live' ? 'matrix_live_intervention' : 'matrix_preview_intervention',
    narrative_arc: `${narrativePack[0]} Timing: ${payload.timing}. Target: ${payload.targetAudience}.`,
    pivotal_actors: baseline.actors.slice(0, 3),
    intervention_points: [
      `Intensity set to ${Math.round(payload.intensity * 100)}%.`,
      `Primary geography: ${payload.geography}.`,
      `Target audience: ${payload.targetAudience}.`,
    ],
    counterfactuals: [],
    source_set: ['matrix-simulation', sourceMode === 'live' ? 'live-runtime' : 'preview-runtime'],
    scenario_frequencies: interventionScenarios,
    probability_delta: deltaProbability,
    confidence_delta: 0.02,
    graph_coverage: baseline.digest?.graph_coverage ?? 0.62,
    agent_convergence: baseline.digest?.agent_convergence ?? 0.55,
    graph_age_hours: baseline.digest?.graph_age_hours ?? 0,
    quality_score: baseline.digest?.quality_score ?? 0.58,
    community_summaries: [
      narrativePack[1],
      `The first visible reaction is concentrated in ${payload.targetAudience.toLowerCase()}.`,
      `Durability depends on whether the system can absorb the move over ${payload.duration}.`,
    ],
    tensions: [
      `Intervention pressure vs resilience in ${payload.geography}.`,
      `Narrative coherence vs backlash among ${payload.targetAudience.toLowerCase()}.`,
    ],
    notes: [payload.safetyNote],
    matrix_mode: 'intervene',
    matrix_branch_id: branchId,
  };

  const deltaDigest: WorldStateDelta = {
    headline: `${payload.label} changes the shape of the system, not just the top-line probability.`,
    summary: `${narrativePack[0]} The main effect is a ${deltaProbability >= 0 ? 'higher' : 'lower'} probability path with visible redistribution of attention and stress.`,
    deltaProbability,
    socialResponse: narrativePack[1],
    narrativeShift: narrativePack[0],
    systemStress: narrativePack[2],
    dominantReactions: [
      `Early response concentrates in ${payload.targetAudience.toLowerCase()}.`,
      `Actors react faster when the intervention lasts ${payload.duration.toLowerCase()}.`,
      `Narrative loops grow strongest in ${payload.geography.toLowerCase()}.`,
    ],
    secondOrderEffects: [
      'Secondary actors adjust after seeing the first reputational or behavioral move.',
      'Backlash risk rises if the intervention intensity outruns perceived legitimacy.',
      'The system can overreact in adjacent communities even when the direct target is narrow.',
    ],
    riskOfBackfire:
      intensity >= 0.65
        ? 'High. Strong interventions create fast visibility but also sharper backlash and faster counter-mobilization.'
        : 'Medium. The system has room to absorb the move, but backlash rises if the narrative looks manipulative.',
    interventionEffectiveness:
      intensity >= 0.5
        ? 'High enough to move the system, but only if target audience and timing stay aligned.'
        : 'Useful for testing sensitivity, not yet strong enough to force a regime shift on its own.',
    amplificationFactors: [
      `A clearer message among ${payload.targetAudience.toLowerCase()}.`,
      `Alignment between timing (${payload.timing.toLowerCase()}) and public attention.`,
    ],
    dampeningFactors: [
      'Low credibility, weak distribution, or fast institutional pushback.',
      'Signal fatigue if the intervention lasts too long without a reinforcing event.',
    ],
    metrics: [
      { label: 'Delta probability', before: baseline.scenarios[0]?.probability ?? null, after: interventionScenarios[0]?.probability ?? null, delta: deltaProbability, unit: 'probability' },
      { label: 'Social response', before: 0.42, after: Math.max(0, Math.min(1, 0.42 + intensity * 0.25)), delta: intensity * 0.25, unit: 'response' },
      { label: 'Narrative shift', before: 0.4, after: Math.max(0, Math.min(1, 0.4 + intensity * 0.22)), delta: intensity * 0.22, unit: 'sentiment' },
      { label: 'System stress', before: 0.36, after: Math.max(0, Math.min(1, 0.36 + intensity * 0.3)), delta: intensity * 0.3, unit: 'stress' },
    ],
  };

  return {
    branchId,
    baselineDigest: baseline.digest || null,
    interventionDigest,
    deltaDigest,
    dominantReactions: deltaDigest.dominantReactions,
    narrativeShift: deltaDigest.narrativeShift,
    secondOrderEffects: deltaDigest.secondOrderEffects,
    riskOfBackfire: deltaDigest.riskOfBackfire,
    interventionEffectiveness: deltaDigest.interventionEffectiveness,
    branchLabel: payload.label,
    sourceMode,
  };
}

function withMode(dataset: WorldSimPreviewDataset, mode: WorldSimSceneMode): WorldSimSceneData {
  const nodes = dataset.nodes.length > 0 ? dataset.nodes : buildNodes(dataset.actors);
  return {
    ...dataset,
    mode,
    viewMode: 'observe',
    truthNote: mode === 'live' ? WORLD_SIM_BRAND.liveNote : WORLD_SIM_BRAND.previewNote,
    prompts: createPromptSet(dataset.question, dataset.actors, dataset.interventionPoints, dataset.tensions),
    nodes,
    links: dataset.links.length > 0 ? dataset.links : buildLinks(nodes),
    availableInterventions: cloneInterventionCards(INTERVENTION_LIBRARY),
    baseline: buildMatrixWorldStateSnapshot({
      title: dataset.title,
      subtitle: dataset.subtitle,
      narrativeArc: dataset.narrativeArc,
      actors: dataset.actors,
      scenarios: dataset.scenarios,
      notes: dataset.communityNotes,
      digest: null,
    }),
    branch: null,
    delta: null,
    branchLimit: 2,
  };
}

export function getDefaultWorldSimPreviewDataset(id: WorldSimPreviewId = 'public-opinion', mode: WorldSimSceneMode = 'preview') {
  return withMode(clonePreviewDataset(id), mode);
}

export function createWorldSimSceneData({
  title,
  subtitle,
  question,
  sourceLabel,
  mode = 'preview',
  viewMode = 'observe',
  previewId,
  digest,
  narrativeArc,
  actors,
  interventionPoints,
  tensions,
  communityNotes,
  scenarios,
  marketFrame,
  job,
  availableInterventions,
  baseline,
  branch,
  delta,
  branchLimit,
}: CreateWorldSimSceneInput): WorldSimSceneData {
  const selectedPreviewId = previewId || inferPreviewIdFromText(`${title || ''} ${question || ''}`);
  const base = getDefaultWorldSimPreviewDataset(selectedPreviewId, mode);
  const nextActors = sanitizeList(actors || digest?.pivotal_actors, base.actors).slice(0, 5);
  const nextInterventionPoints = sanitizeList(interventionPoints || digest?.intervention_points, base.interventionPoints).slice(0, 4);
  const nextTensions = sanitizeList(tensions || digest?.tensions, base.tensions).slice(0, 4);
  const nextCommunityNotes = sanitizeList(communityNotes || digest?.community_summaries, base.communityNotes).slice(0, 4);
  const nextScenarios = (Array.isArray(scenarios) ? scenarios : digest?.scenario_frequencies || [])
    .map((scenario, index) => ({
      label: String(scenario.label || `Scenario ${index + 1}`),
      probability: clampProbability(scenario.probability, 1 / Math.max(1, index + 2)),
    }))
    .filter((scenario) => scenario.probability > 0)
    .slice(0, 4);

  const normalizedScenarios = nextScenarios.length > 0 ? nextScenarios : base.scenarios;
  const nextQuestion = question || base.question;
  const nextNodes = buildNodes(nextActors.length > 0 ? nextActors : base.actors);
  const normalizedMarketFrame = normalizeMarketFrame(marketFrame || digest?.prediction_market_frame || base.marketFrame);
  const marketStats = normalizedMarketFrame?.impliedProbability != null
    ? [
        { label: 'Market consensus', value: toPercentLabel(normalizedMarketFrame.impliedProbability, 0.5), accent: 'amber' as const },
        ...(normalizedMarketFrame.divergenceVsCrystal != null
          ? [
              {
                label: 'Market delta',
                value: `${Math.round(normalizedMarketFrame.divergenceVsCrystal * 100)} pts`,
                accent: Math.abs(normalizedMarketFrame.divergenceVsCrystal) >= 0.1 ? ('rose' as const) : ('emerald' as const),
              },
            ]
          : []),
      ]
    : [];

  const baselineSnapshot =
    baseline ||
    buildMatrixWorldStateSnapshot({
      title: title || base.title,
      subtitle: subtitle || digest?.graph_summary || base.subtitle,
      narrativeArc: narrativeArc || digest?.narrative_arc || base.narrativeArc,
      actors: nextActors.length > 0 ? nextActors : base.actors,
      scenarios: normalizedScenarios,
      notes: nextCommunityNotes.length > 0 ? nextCommunityNotes : base.communityNotes,
      digest: digest || null,
    });

  return {
    id: base.id,
    mode,
    viewMode,
    kicker: mode === 'live' ? WORLD_SIM_BRAND.name : WORLD_SIM_BRAND.previewName,
    title: title || base.title,
    subtitle: subtitle || digest?.graph_summary || base.subtitle,
    question: nextQuestion,
    sourceLabel: sourceLabel || (mode === 'live' ? 'Live simulation digest' : base.sourceLabel),
    truthNote: mode === 'live' ? WORLD_SIM_BRAND.liveNote : WORLD_SIM_BRAND.previewNote,
    narrativeArc: narrativeArc || digest?.narrative_arc || base.narrativeArc,
    actors: nextActors.length > 0 ? nextActors : base.actors,
    interventionPoints: nextInterventionPoints.length > 0 ? nextInterventionPoints : base.interventionPoints,
    tensions: nextTensions.length > 0 ? nextTensions : base.tensions,
    communityNotes: nextCommunityNotes.length > 0 ? nextCommunityNotes : base.communityNotes,
    scenarios: normalizedScenarios,
    prompts: createPromptSet(nextQuestion, nextActors, nextInterventionPoints, nextTensions),
    nodes: nextNodes,
    links: buildLinks(nextNodes),
    stats: [
      { label: 'Graph coverage', value: toPercentLabel(digest?.graph_coverage, 0.64), accent: 'blue' },
      { label: 'Agent convergence', value: toPercentLabel(digest?.agent_convergence, 0.58), accent: 'rose' },
      { label: 'Freshness', value: toFreshnessLabel(digest?.graph_age_hours), accent: 'emerald' },
      {
        label: 'Source set',
        value: Array.isArray(digest?.source_set) && digest?.source_set.length > 0 ? `${digest.source_set.length} sources` : base.stats[3].value,
        accent: 'amber',
      },
      ...marketStats,
    ],
    availableInterventions: cloneInterventionCards(availableInterventions || INTERVENTION_LIBRARY),
    baseline: baselineSnapshot,
    branch: branch ? { ...branch, payload: { ...branch.payload }, result: branch.result ? { ...branch.result } : null } : null,
    delta: delta
      ? {
          ...delta,
          dominantReactions: [...delta.dominantReactions],
          secondOrderEffects: [...delta.secondOrderEffects],
          amplificationFactors: [...delta.amplificationFactors],
          dampeningFactors: [...delta.dampeningFactors],
          metrics: delta.metrics.map((metric) => ({ ...metric })),
        }
      : null,
    branchLimit: branchLimit ?? 2,
    marketFrame: normalizedMarketFrame,
    jobStatus: typeof job?.status === 'string' ? job.status : null,
    jobProgress: typeof job?.progress === 'number' ? job.progress : 0,
    jobMessage: typeof job?.statusMessage === 'string' ? job.statusMessage : '',
    agentCount: typeof job?.agentCount === 'number' ? job.agentCount : undefined,
  };
}
