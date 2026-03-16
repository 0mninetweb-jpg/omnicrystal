import { GoogleGenAI, Type } from '@google/genai';
import { SUPPORTED_DOMAINS } from '../data/domains';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import { fetchCachedCard, saveCachedCard } from './apiService';

async function get20YearHistoricalContext(domain: string, city?: string, ai?: any): Promise<string> {
  if (!db || !ai) return "";
  const docId = `${domain}_${city || 'global'}`.replace(/[^a-zA-Z0-9_]/g, '_');
  
  try {
    const docRef = doc(db, 'historical_20y_summaries', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data().summary;
    }
    
    const prompt = `Genera un riassunto storico fattuale e analitico degli ultimi 20 anni per il dominio "${domain}"${city ? ` con focus specifico sull'area di ${city}` : ' a livello globale'}. 
    Includi:
    1. Principali cicli di mercato/trend (es. bolle, crisi, picchi di crescita).
    2. Cambiamenti strutturali e normativi.
    3. Eventi "Cigno Nero" o shock esogeni che hanno colpito questo settore.
    4. Valori medi storici o benchmark di riferimento (es. tassi medi, volumi medi).
    Sii estremamente conciso, usa elenchi puntati, massimo 250 parole. Questo testo servirà come "baseline" per calibrare un modello predittivo.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
    });
    
    const summary = response.text || "Nessun dato storico disponibile.";
    
    await setDoc(docRef, {
      domain,
      city: city || 'global',
      summary,
      created_at: new Date()
    });
    
    return summary;
  } catch (err) {
    console.error("Error fetching/generating 20y history:", err);
    return "";
  }
}

async function fetchTimeGptForecast(domain: string, city?: string, fh?: number) {
  try {
    const response = await fetch('/api/timegpt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, city, fh })
    });
    if (response.ok) {
      const data = await response.json();
      return data.forecast;
    }
  } catch (err) {
    console.error("Error fetching TimeGPT forecast:", err);
  }
  return null;
}

let cachedApiKey: string | null = null;

async function getAI() {
  if (cachedApiKey) return new GoogleGenAI({ apiKey: cachedApiKey });

  // 1. Try import.meta.env (Standard for Vite/Vercel client-side)
  // This is the most reliable way for Vercel deployments
  // @ts-ignore
  let apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  // 2. Try process.env (Standard in AI Studio / Node environment)
  if (!apiKey || apiKey === 'undefined') {
    apiKey = process.env.GEMINI_API_KEY;
  }

  // 3. If still missing, fetch from our backend (Fallback for full-stack/local)
  if (!apiKey || apiKey === 'undefined') {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const config = await response.json();
        apiKey = config.apiKey;
      }
    } catch (e) {
      // Silent fail
    }
  }

  if (!apiKey || apiKey === 'undefined') {
    console.error("ERRORE: GEMINI_API_KEY non trovata.");
    throw new Error(
      "GEMINI_API_KEY mancante. Per risolvere su Vercel:\n" +
      "1. Vai su Vercel Dashboard > Project Settings > Environment Variables\n" +
      "2. Aggiungi una variabile chiamata 'VITE_GEMINI_API_KEY'\n" +
      "3. Incolla la tua chiave API di Google AI Studio\n" +
      "4. Salva e riesegui il Deploy."
    );
  }

  cachedApiKey = apiKey;
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isQuotaError = error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
    if (isQuotaError && retries > 0) {
      console.warn(`Quota esaurita. Riprovo tra ${delay}ms... (${retries} tentativi rimasti)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function chatWithProfileBot(messages: {role: string, content: string}[]) {
  const ai = await getAI();

  const formattedMessages = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }]
  }));

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: formattedMessages,
      config: {
        systemInstruction: `Sei un assistente AI di Crystal, un'app di previsioni macro-economiche. 
Il tuo obiettivo è estrarre 3 informazioni chiave dall'utente attraverso una conversazione naturale e amichevole:
1. Posizione Geografica (città, nazione)
2. Professione o Settore lavorativo
3. Interessi e Asset (es. mercato immobiliare, crypto, AI, viaggi)

Fai una domanda alla volta. Sii conciso, empatico e professionale.
Quando hai raccolto tutte e tre le informazioni, ringrazia l'utente e fornisci un riepilogo in formato JSON alla fine del tuo messaggio, racchiuso in un blocco di codice markdown come questo:
\`\`\`json
{
  "location": "...",
  "profession": "...",
  "interests": "..."
}
\`\`\`
Se l'utente non vuole rispondere a qualcosa, accetta la sua scelta e vai avanti.`,
      }
    });
    return response.text;
  });
}

export async function generateNextletter(interests: string[], userContext?: any) {
  const ai = await getAI();
  const currentDate = new Date().toLocaleDateString('it-IT', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  let contextString = '';
  if (userContext) {
    contextString = `
    User Context:
    - Location: ${userContext.location || 'Unknown'}
    - Profession: ${userContext.profession || 'Unknown'}
    - General Interests: ${userContext.interests ? userContext.interests.join(', ') : 'Unknown'}
    `;
  }

  const prompt = `
    Sei "The Crystal Times", il quotidiano d'inchiesta predittiva più autorevole del 2045.
    Il tuo compito è scrivere un'edizione speciale della Nextletter per un utente del presente (2024-2025).
    
    REGOLE GIORNALISTICHE:
    1. STILE: Denso, preciso, descrittivo. Usa un tono da "giornalismo d'inchiesta dal futuro". Evita generalizzazioni.
    2. DATI: Basati su dati reali attuali (usa Google Search) ma proiettali con logica ferrea.
    3. STORIA: Giustifica ogni previsione citando almeno un parallelo storico degli ultimi 20 anni (es. crisi energetica 2022, bolla dot-com, ecc.).
    4. AZIONE: Ogni articolo deve terminare con un "So What" (Azione Strategica) estremamente concreto.
    
    ARGOMENTI RICHIESTI: ${interests.join(', ')}
    CONTESTO UTENTE: ${contextString}
    
    STRUTTURA JSON RICHIESTA:
    {
      "title": "Titolo altisonante e giornalistico dell'edizione",
      "subtitle": "Sottotitolo che riassume il macro-trend del mese",
      "sections": [
        {
          "topic": "Argomento specifico",
          "icon": "Icona Lucide (Trophy, Zap, Laptop, TrendingUp, Calendar, Lightbulb, Globe2, Shield, Activity, Landmark)",
          "title": "Titolo dell'articolo (stile prima pagina)",
          "content": "Articolo denso (almeno 150 parole) con dettagli tecnici, percentuali di probabilità e analisi dei driver.",
          "historical_context": "Parallelo storico dettagliato che valida la previsione.",
          "probability": 85,
          "horizon": "15d",
          "impact": "High/Medium/Low",
          "so_what": "Azione specifica e immediata che l'utente deve compiere.",
          "query_suggestion": "Una query di ricerca per approfondire con una Crystal Card"
        }
      ]
    }
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }]
      }
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function generateCrystalQuotes() {
  const currentDate = new Date().toLocaleDateString('it-IT');
  const cacheKey = `quotes_${currentDate.replace(/\//g, '-')}`;
  const cacheRef = doc(db, 'system_cache', cacheKey);

  try {
    const cachedDoc = await getDoc(cacheRef);
    if (cachedDoc.exists()) {
      return cachedDoc.data();
    }
  } catch (e) {
    console.warn("Cache read failed, generating new quotes", e);
  }

  const ai = await getAI();

  const prompt = `
    Genera 5 "Crystal Quotes" per la settimana corrente.
    Le Crystal Quotes sono aforismi predittivi, densi di significato, che sembrano venire da un'intelligenza superiore che ha già visto il futuro.
    
    Ogni quote deve avere un'analisi profonda ("Deep Analysis") che spieghi la logica dietro la previsione.
    
    CRITICO: Le quotes devono riguardare ESCLUSIVAMENTE i seguenti domini:
    1. GUTS (Territory & Infrastructure): Popolazione, densità, infrastrutture, servizi.
    2. Weather and Atmosphere: Clima, impatto meteo su economia/società.
    3. City Pulse and Urban Pressure: Trend urbani, crowding, attività economica locale.
    
    STRUTTURA JSON:
    {
      "quotes": [
        {
          "quote_id": "string",
          "text": "La quote stessa, breve, d'impatto, enigmatica ma chiara",
          "author": "L'Oracolo di Crystal / Crystal Intelligence / [Nome di un driver futuro]",
          "context": "Macro-area (es. GUTS, Weather, City Pulse)",
          "date": "${currentDate}",
          "analysis": {
            "title": "Titolo dell'analisi",
            "full_text": "Analisi dettagliata e densa (100 parole) dei driver che portano a questa conclusione.",
            "drivers": ["Driver 1", "Driver 2", "Driver 3"],
            "impact": "Descrizione dell'impatto sistemico di questa verità",
            "historical_parallel": "Evento del passato che funge da modello per questa previsione"
          }
        }
      ]
    }
    
    Usa Google Search per trovare trend reali e attuali su cui basare le quotes.
  `;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }]
      }
    });
    
    const data = JSON.parse(response.text || '{}');
    
    try {
      await setDoc(cacheRef, data);
    } catch (e) {
      console.warn("Failed to cache quotes", e);
    }
    
    return data;
  });
}

export async function compileQuery(query: string) {
  const ai = await getAI();

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Convert the following user query into a Crystal B2C QueryPlan JSON object.
      
      Query: "${query}"
      
      Extract the intent, domain, entities, horizons, and required card types based on the Crystal B2C Blueprint.
      
      CRITICAL: The domain_id MUST be chosen from the following list of supported domains:
      ${SUPPORTED_DOMAINS.join(', ')}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            plan_version: { type: Type.STRING },
            domain_id: { type: Type.STRING, description: "Must be one of the supported domains from the blueprint." },
            mode: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ["predict_only", "predict_action"] }
              }
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  entity_id: { type: Type.STRING },
                  entity_type: { type: Type.STRING },
                  label: { type: Type.STRING }
                }
              }
            },
            horizons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  horizon_id: { type: Type.STRING, description: "e.g. 7d, 30d, 90d, 6m, 12m" }
                }
              }
            },
            card_types: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  card_type_id: { type: Type.STRING, enum: ["prediction_summary", "scenario_set", "ranked_list", "tradeoff_plan", "drivers_breakdown", "risk_band"] }
                }
              }
            }
          },
          required: ["plan_version", "domain_id", "mode", "entities", "horizons", "card_types"]
        }
      }
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function predict(query: string, queryPlan: any, userContext?: any) {
  const domain = queryPlan?.domain || queryPlan?.domain_id || '';
  const city = queryPlan?.filters?.location || queryPlan?.entities?.find((e: any) => e.entity_type === 'city' || e.entity_type === 'location')?.label || '';

  // 1. Try to fetch from cache
  if (domain && city) {
    const cachedResult = await fetchCachedCard(query, domain, city);
    if (cachedResult && cachedResult.card) {
      return { ...cachedResult.card, _source: 'cache' };
    }
  }

  // 2. Fallback to local live generation
  const ai = await getAI();

  let contextString = '';
  if (userContext) {
    contextString = `
    CONTESTO UTENTE (USALO PER GENERARE IL "PERSONAL OUTPUT"):
    - Posizione: ${userContext.location || 'Non specificata'}
    - Professione: ${userContext.profession || 'Non specificata'}
    - Interessi: ${userContext.interests?.join(', ') || 'Non specificati'}
    `;
  }

  let historical20yContext = '';
  if (domain) {
    const historySummary = await get20YearHistoricalContext(domain, city, ai);
    if (historySummary) {
      historical20yContext = `
      BASELINE STORICA (ULTIMI 20 ANNI - PRE-CARICATA DAL CLOUD):
      ${historySummary}
      Usa questa baseline per calibrare la tua previsione, identificare se ci troviamo in un ciclo ricorrente o in una situazione anomala rispetto agli ultimi 20 anni.
      `;
    }
  }

  let timeGptContext = '';
  if (domain) {
    let fh = 7;
    if (queryPlan?.horizons && queryPlan.horizons.length > 0) {
      const h = queryPlan.horizons[0].horizon_id;
      if (h === '30d') fh = 30;
      else if (h === '14d') fh = 14;
      else if (h === '12w') fh = 84;
    }
    const timeGptForecast = await fetchTimeGptForecast(domain, city, fh);
    if (timeGptForecast) {
      timeGptContext = `
      DATI PREVISIONALI DA TIMEGPT (USA QUESTI DATI COME BASE QUANTITATIVA PER LA PREVISIONE):
      - Orizzonte: ${timeGptForecast.value.length} periodi
      - Valori previsti: ${JSON.stringify(timeGptForecast.value)}
      - Timestamp: ${JSON.stringify(timeGptForecast.timestamp)}
      Questi numeri rappresentano la proiezione quantitativa del trend per il dominio "${domain}".
      Integra questi valori quantitativi nella tua analisi e negli scenari. È FONDAMENTALE CITARE ESPLICITAMENTE I DATI DI TIMEGPT NELLA PREVISIONE O NEI DRIVER (es. "Secondo l'analisi quantitativa di TimeGPT...").
      `;
    }
  }

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `Sei il motore predittivo di Crystal B2C. 
      L'utente ha chiesto: "${query}"
      Il Query Plan generato dal sistema è: ${JSON.stringify(queryPlan)}
      ${contextString}
      ${historical20yContext}
      ${timeGptContext}
      
      Il tuo compito è generare un oggetto JSON CrystalCard finale.
      
      REGOLE FONDAMENTALI:
      1. PRIORITÀ DATI REAL-TIME (CRITICO): Prima di ogni analisi, usa Google Search per verificare lo stato attuale dei fatti (es: chi è l'attuale allenatore, ultime news di mercato, quotazioni odierne, eventi geopolitici delle ultime 24 ore). NON FARE AFFIDAMENTO SULLA TUA CONOSCENZA PREGRESSA PER FATTI SOGGETTI A CAMBIAMENTO RAPIDO. Se i dati di ricerca contraddicono la tua memoria, i dati di ricerca HANNO SEMPRE LA PRECEDENZA.
      2. ANALISI MULTI-DOMINIO: Non limitarti al dominio principale. Incrocia dati da temi diversi per trovare correlazioni nascoste (es: come il meteo influenza i prezzi dell'energia, o come la geopolitica impatta i flussi turistici).
      3. ESTRAZIONE DATI PROFONDA: Usa Google Search per estrarre segnali deboli, news dell'ultima ora e dati macroeconomici. Verifica sempre la "freschezza" delle fonti.
      4. ANTI-ALLUCINAZIONE: Non inventare dati. Se non trovi informazioni specifiche tramite Google Search, usa il campo 'data_sufficiency_flag' per segnalarlo. Ogni numero, data o trend deve avere un fondamento nei dati estratti.
      5. CALIBRAZIONE STORICA (20 ANNI): Analizza il contesto degli ULTIMI 20 ANNI per ogni driver identificato, ma usa questi dati solo per identificare pattern e cicli, MAI per sovrascrivere la realtà dei fatti odierni.
      6. PREVISIONE DETERMINISTICA (OUTPUT OGGETTIVO PRIMARIO): Sintetizza tutto in una previsione DIRETTA e ASSERTIVA nel campo 'verdict'. Questo deve essere l'output principale e DEVE rispondere in modo oggettivo, analitico e distaccato alla domanda dell'utente basandosi sui fatti REALI di oggi. Usa un linguaggio chiaro e ben formattato.
      7. VERDETTO CRYSTAL (MACRO OUTPUT): Fornisci un verdetto sintetico (es: "Prezzi in aumento del 15% a Giugno"). ATTENZIONE: NON omettere MAI gli spazi tra le parole. Il testo deve essere grammaticalmente corretto e leggibile (es. "Altamente probabile. È confermato che...").
      8. PERSONAL OUTPUT (OUTPUT SECONDARIO): SOLO DOPO aver fornito l'analisi oggettiva, usa il CONTESTO UTENTE (se fornito) per generare un impatto personalizzato nel campo 'personal_output'. Spiega come il Macro Output influenzerà specificamente l'utente in base alla sua posizione, professione e interessi. Se il contesto non è fornito, lascia il campo vuoto.
      9. SCENARI E DRIVER: Crea 3 scenari e identifica 3 driver chiave che riflettano l'incrocio dei temi (es: Driver 1: Geopolitica, Driver 2: Trend Meteo, Driver 3: Sentiment Social).
      10. AZIONI ESPLICITE: Fornisci 2 azioni "COSA PUOI FARE ORA" estremamente pratiche e imperative.
      11. RISK BAND: Identifica chiaramente la fascia di rischio (low, medium, high, extreme) basata sulla volatilità dei dati storici e dei segnali attuali.
      
      L'output DEVE seguire rigorosamente lo schema JSON fornito.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            card_id: { type: Type.STRING },
            card_type: { type: Type.STRING },
            domain: { type: Type.STRING },
            stakes_level: { type: Type.STRING, enum: ["low", "medium", "high", "imminent"] },
            risk_band: { type: Type.STRING, enum: ["low", "medium", "high", "extreme"] },
            title: { type: Type.STRING },
            summary: { type: Type.STRING, description: "Un riassunto di 2 righe della previsione, in linguaggio semplice" },
            verdict: { type: Type.STRING, description: "Un verdetto esplicito e diretto sull'esito più probabile (Macro Output)" },
            personal_output: { type: Type.STRING, description: "L'impatto personalizzato della previsione sull'utente, basato sul suo contesto (Personal Output)" },
            scenario_set: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  scenario_id: { type: Type.STRING },
                  label: { type: Type.STRING, description: "Nome semplice dello scenario" },
                  probability: { type: Type.NUMBER }
                },
                required: ["scenario_id", "label", "probability"]
              }
            },
            so_what: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  option_id: { type: Type.STRING },
                  label: { type: Type.STRING, description: "Azione consigliata" },
                  tradeoff_note: { type: Type.STRING, description: "Pro e contro dell'azione in parole povere" }
                },
                required: ["option_id", "label", "tradeoff_note"]
              }
            },
            ranked_list: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item_id: { type: Type.STRING },
                  label: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  rank: { type: Type.INTEGER },
                  note: { type: Type.STRING }
                },
                required: ["item_id", "label", "score", "rank"]
              }
            },
            drivers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  feature_key: { type: Type.STRING, description: "Nome del segnale chiave" },
                  direction: { type: Type.STRING, enum: ["up", "down", "flat"] },
                  contribution: { type: Type.NUMBER },
                  historical_trend: {
                    type: Type.ARRAY,
                    description: "Dati storici degli ultimi 20 anni per questo driver (solo per il driver principale)",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        year: { type: Type.INTEGER },
                        value: { type: Type.NUMBER }
                      },
                      required: ["year", "value"]
                    }
                  }
                },
                required: ["feature_key", "direction", "contribution"]
              }
            },
            trust_layer: {
              type: Type.OBJECT,
              properties: {
                confidence_score: { type: Type.NUMBER },
                confidence_tier: { type: Type.STRING, enum: ["low", "medium", "high"] },
                data_sufficiency_flag: { type: Type.STRING, enum: ["insufficient", "partial", "sufficient"] },
                freshness: {
                  type: Type.OBJECT,
                  properties: {
                    staleness_bucket: { type: Type.STRING, enum: ["fresh", "stale", "unknown"] },
                    as_of_utc: { type: Type.STRING }
                  },
                  required: ["staleness_bucket", "as_of_utc"]
                },
                provenance_summary: {
                  type: Type.OBJECT,
                  properties: {
                    verification_level: { type: Type.STRING, enum: ["unverified", "partially_verified", "verified", "official"] },
                    license_summary: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING }
                    }
                  },
                  required: ["verification_level", "license_summary"]
                }
              },
              required: ["confidence_score", "confidence_tier", "data_sufficiency_flag", "freshness", "provenance_summary"]
            }
          },
          required: ["card_id", "card_type", "domain", "stakes_level", "title", "summary", "verdict", "scenario_set", "so_what", "drivers", "trust_layer"]
        }
      }
    });
    
    const generatedCard = JSON.parse(response.text || '{}');
    
    // Save to cache for future requests
    if (domain && city) {
      await saveCachedCard(generatedCard, query, domain, city);
    }
    
    return { ...generatedCard, _source: 'live' };
  });
}

export async function getLocalInsights(query: string, entities: any[]) {
  const ai = await getAI();

  const locationEntity = entities?.find((e: any) => 
    e.entity_type === 'city' || e.entity_type === 'location' || e.entity_type === 'country'
  );
  const locationContext = locationEntity ? `nella zona di ${locationEntity.label}` : '';

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Fornisci un breve approfondimento locale (luoghi, attività, recensioni) relativo a questa query: "${query}" ${locationContext}. Menziona luoghi specifici, ristoranti, hotel o attrazioni se rilevanti per il contesto. Sii conciso (massimo 3-4 frasi).`,
      config: {
        tools: [{ googleMaps: {} }]
      }
    });

    const text = response.text;
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    return { text, chunks };
  });
}
