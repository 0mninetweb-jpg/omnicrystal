import { CardData } from '../types/crystal';

export const mockCards: CardData[] = [
  {
    card_id: "card:travel_tourism_rome:h_30d:0",
    card_type: "scenario_set",
    domain: "travel.tourism_intensity",
    stakes_level: "high",
    risk_band: "medium",
    title: "Roma: Impatto Giubileo sui Trasporti",
    summary: "Previsto un sovraccarico critico della rete metropolitana (Linea A) nel prossimo mese a causa dell'afflusso record di pellegrini.",
    verdict: "Caos trasporti imminente: +45% di traffico passeggeri previsto sulla Linea A.",
    personal_output: "Dato che lavori in centro a Roma, considera lo smart working il martedì e giovedì, giorni di picco previsti per gli eventi giubilari.",
    scenario_set: [
      { scenario_id: "s1", label: "Sovraccarico critico (Ritardi > 30m)", probability: 0.65 },
      { scenario_id: "s2", label: "Gestione sotto stress (Ritardi < 15m)", probability: 0.25 },
      { scenario_id: "s3", label: "Flussi regolari", probability: 0.10 }
    ],
    so_what: [
      { option_id: "o1", label: "Usa la bici elettrica o monopattino", tradeoff_note: "Eviti la metro, ma dipendi dal meteo" },
      { option_id: "o2", label: "Rimodula gli orari d'ufficio", tradeoff_note: "Meno stress, ma richiede accordo aziendale" }
    ],
    drivers: [
      { 
        feature_key: "pellegrini_inbound", 
        direction: "up", 
        contribution: 0.75,
        historical_trend: [
          { year: 2021, value: 30 },
          { year: 2022, value: 50 },
          { year: 2023, value: 70 },
          { year: 2024, value: 85 },
          { year: 2025, value: 140 }
        ]
      },
      { feature_key: "lavori_infrastrutturali", direction: "flat", contribution: 0.15 },
      { feature_key: "meteo_favorevole", direction: "up", contribution: 0.10 }
    ],
    trust_layer: {
      confidence_score: 0.88,
      confidence_tier: "high",
      data_sufficiency_flag: "sufficient",
      freshness: {
        as_of_utc: "2026-03-15T00:00:00Z",
        staleness_bucket: "fresh"
      },
      provenance_summary: {
        verification_level: "verified",
        license_summary: ["internal"]
      }
    }
  },
  {
    card_id: "card:macro_inflation_it:h_90d:0",
    card_type: "prediction_summary",
    domain: "A.12.cost_of_living.inflation_pressure",
    stakes_level: "medium",
    risk_band: "high",
    title: "Prezzi Energia: Shock Autunnale",
    summary: "I recenti tagli alla produzione OPEC+ e le tensioni nel Mar Rosso indicano un probabile aumento dei costi energetici in Europa.",
    verdict: "Bollette in aumento del 15-20% entro il prossimo trimestre.",
    personal_output: "Come freelance che lavora da casa, questo impatterà direttamente i tuoi costi operativi. Valuta di bloccare ora una tariffa fissa.",
    scenario_set: [
      { scenario_id: "s1", label: "Spike dei prezzi (>20%)", probability: 0.45 },
      { scenario_id: "s2", label: "Aumento moderato (10-15%)", probability: 0.40 },
      { scenario_id: "s3", label: "Intervento governativo (Prezzi bloccati)", probability: 0.15 }
    ],
    so_what: [
      { option_id: "o1", label: "Passa a tariffa fissa 12 mesi", tradeoff_note: "Ti protegge dai rincari, ma perdi eventuali cali" },
      { option_id: "o2", label: "Investi in efficienza energetica", tradeoff_note: "Costo iniziale alto, risparmio a lungo termine" }
    ],
    drivers: [
      { 
        feature_key: "gas_ttf_futures", 
        direction: "up", 
        contribution: 0.60,
        historical_trend: [
          { year: 2021, value: 40 },
          { year: 2022, value: 130 },
          { year: 2023, value: 50 },
          { year: 2024, value: 45 },
          { year: 2025, value: 65 }
        ]
      },
      { feature_key: "opec_cuts", direction: "up", contribution: 0.25 },
      { feature_key: "euro_usd_exchange", direction: "down", contribution: 0.15 }
    ],
    trust_layer: {
      confidence_score: 0.74,
      confidence_tier: "high",
      data_sufficiency_flag: "sufficient",
      freshness: {
        as_of_utc: "2026-03-15T00:00:00Z",
        staleness_bucket: "fresh"
      },
      provenance_summary: {
        verification_level: "official",
        license_summary: ["cc_by_4_0", "official_stats"]
      }
    }
  },
  {
    card_id: "card:tech_ai_adoption:h_6m:0",
    card_type: "ranked_list",
    domain: "tech.ai_adoption",
    stakes_level: "high",
    risk_band: "medium",
    title: "AI Generativa: Settori a Rischio Disruption",
    summary: "L'adozione di agenti AI autonomi sta accelerando. Ecco i settori che subiranno i maggiori cambiamenti nei prossimi 6 mesi.",
    verdict: "Il settore del Customer Service sarà quasi interamente automatizzato entro fine anno.",
    personal_output: "Lavorando nel marketing digitale, l'AI è un'opportunità. Concentrati sull'imparare a orchestrare agenti AI piuttosto che sulla produzione manuale di contenuti.",
    ranked_list: [
      { item_id: "i1", label: "Customer Service (Tier 1)", score: 95, rank: 1, note: "Sostituzione rapida con agenti vocali AI" },
      { item_id: "i2", label: "Copywriting & Content SEO", score: 88, rank: 2, note: "Produzione di massa automatizzata" },
      { item_id: "i3", label: "Analisi Dati Junior", score: 75, rank: 3, note: "Tool come Code Interpreter azzerano le barriere" },
      { item_id: "i4", label: "Sviluppo Web (Frontend base)", score: 60, rank: 4, note: "Generazione UI da design in tempo reale" }
    ],
    so_what: [
      { option_id: "o1", label: "Fai upskilling su AI orchestration", tradeoff_note: "Richiede tempo, ma garantisce rilevanza" },
      { option_id: "o2", label: "Spostati su ruoli strategici/relazionali", tradeoff_note: "Meno rischio automazione, richiede soft skills" }
    ],
    trust_layer: {
      confidence_score: 0.82,
      confidence_tier: "high",
      data_sufficiency_flag: "sufficient",
      freshness: {
        as_of_utc: "2026-03-15T00:00:00Z",
        staleness_bucket: "fresh"
      },
      provenance_summary: {
        verification_level: "verified",
        license_summary: ["internal"]
      }
    }
  }
];
