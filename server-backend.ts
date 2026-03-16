import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDocs, collection, query, where, orderBy, limit, serverTimestamp, getDoc } from 'firebase/firestore';
import axios from 'axios';
import * as crypto from 'crypto-js';
import fs from 'fs';
import path from 'path';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();
import googleTrends from 'google-trends-api';

// Load Firebase Config
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
} catch (e) {
  console.error("Could not load firebase-applet-config.json");
}

let db: any = null;
if (firebaseConfig) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

const GLOBAL_CITIES = ['New York', 'London', 'Tokyo', 'Paris', 'Dubai', 'Singapore', 'Sao Paulo', 'Sydney', 'Rome', 'Los Angeles'];
const GLOBAL_COUNTRIES = ['US', 'GB', 'JP', 'FR', 'AE', 'SG', 'BR', 'AU', 'IT'];
const DOMAINS = { GUTS: 'guts', WEATHER: 'weather', CITY_PULSE: 'city_pulse' };
const SOURCES = { OPENWEATHER: 'OpenWeatherMap', OVERPASS: 'Overpass API', WIKIDATA: 'Wikidata' };

const createHash = (data: any) => crypto.SHA256(JSON.stringify(data)).toString();

const NIXTLA_API_KEY = process.env.NIXTLA_API_KEY || 'nixak-a5746b8ee5fa5019162c334f9a70a92b8f0e2f072dad52ec7b3b0f7aa5371288b05e33c969126c18';

async function callTimeGPT(y: Record<string, number>, fh: number): Promise<any> {
  if (!y || Object.keys(y).length < 2) {
    console.warn("TimeGPT skipped: not enough historical data points.");
    return null;
  }
  try {
    const response = await fetch('https://api.nixtla.io/forecast', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NIXTLA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "timegpt-1",
        y,
        fh,
        level: [80, 90]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TimeGPT API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    return await response.json();
  } catch (error: any) {
    console.error("TimeGPT call failed, falling back to Gemini:", error);
    return { error: error.message }; // Return error instead of null
  }
}

async function fetchHistoricalDataForTimeGPT(domain: string, city?: string): Promise<Record<string, number>> {
  const series: Record<string, number> = {};
  const today = new Date();
  
  try {
    if (domain === 'markets_and_assets' || domain === 'crypto') {
      // Fetch real historical BTC data from Binance (last 90 days)
      const res = await axios.get('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=90');
      const klines = res.data;
      for (const k of klines) {
        const dateStr = new Date(k[0]).toISOString().split('T')[0];
        const closePrice = parseFloat(k[4]);
        series[dateStr] = closePrice;
      }
      return series;
    } 
    else if (domain === 'weather' || domain === 'climate_impact') {
      // Fetch real historical weather data from Open-Meteo (last 90 days)
      // Default to Rome if no city is provided
      let lat = 41.9028;
      let lon = 12.4964;
      
      if (city) {
        const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
        if (geoRes.data?.results?.length > 0) {
          lat = geoRes.data.results[0].latitude;
          lon = geoRes.data.results[0].longitude;
        }
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() - 2); // Open-Meteo archive is usually 2-5 days behind
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 90);
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const weatherRes = await axios.get(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean`);
      
      if (weatherRes.data?.daily?.time && weatherRes.data?.daily?.temperature_2m_mean) {
        const times = weatherRes.data.daily.time;
        const temps = weatherRes.data.daily.temperature_2m_mean;
        for (let i = 0; i < times.length; i++) {
          if (temps[i] !== null) {
            series[times[i]] = temps[i];
          }
        }
        return series;
      }
    }
    else if (domain === 'macro_economy' || domain === 'personal_finance') {
      // Fetch S&P 500 (^GSPC) as a proxy for macro economy
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const result = await yahooFinance.chart('^GSPC', {
        period1: startDate.toISOString().split('T')[0],
        interval: '1d'
      });
      for (const row of result.quotes) {
        const dateStr = row.date.toISOString().split('T')[0];
        series[dateStr] = row.close;
      }
      return series;
    }
    else {
      // Use Google Trends for all other domains (tourism, real estate, tech, geopolitics, etc.)
      const keyword = city ? `${domain.replace(/_/g, ' ')} ${city}` : domain.replace(/_/g, ' ');
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      
      const resultStr = await googleTrends.interestOverTime({
        keyword: keyword,
        startTime: startDate
      });
      const result = JSON.parse(resultStr);
      const timelineData = result.default.timelineData;
      
      for (const item of timelineData) {
        // item.time is a unix timestamp string in seconds
        const dateStr = new Date(parseInt(item.time) * 1000).toISOString().split('T')[0];
        series[dateStr] = item.value[0];
      }
      return series;
    }
  } catch (err: any) {
    console.error(`Error fetching real historical data for ${domain}:`, err.message);
  }

  // Fallback to a simulated proxy if API fails
  console.log(`Using simulated historical proxy for domain: ${domain}`);
  let baseValue = 100;
  if (domain.includes('inflation') || domain.includes('macro')) baseValue = 105;
  else if (domain.includes('tourism') || domain.includes('real_estate')) baseValue = 80;
  
  for (let i = 90; i > 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    baseValue = baseValue + (Math.random() - 0.5) * 2; // Random walk
    series[dateStr] = Number(baseValue.toFixed(2));
  }
  return series;
}

async function logPipeline(runId: string, status: string, details: any) {
  if (!db) return;
  try {
    await setDoc(doc(db, 'pipeline_logs', runId), {
      timestamp: serverTimestamp(),
      status,
      details
    });
  } catch (e) {
    console.error("Failed to log pipeline", e);
  }
}

export async function runDataCollector() {
  if (!db) return;
  const runId = `run_${Date.now()}`;
  const logs: any[] = [];
  
  try {
    await logPipeline(runId, 'STARTED', { trigger: 'schedule' });

    for (const city of GLOBAL_CITIES) {
      // 1. Weather & Air Quality (Open-Meteo - NO API KEY REQUIRED)
      try {
        // Geocoding
        const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
        if (geoRes.data && geoRes.data.results && geoRes.data.results.length > 0) {
          const { latitude: lat, longitude: lon } = geoRes.data.results[0];
          
          // Weather
          const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,surface_pressure,weather_code`);
          const weatherData = weatherRes.data;
          
          const weatherFactId = `weather_${city}_${Date.now()}`;
          await setDoc(doc(db, 'facts', weatherFactId), {
            fact_id: weatherFactId,
            domain: DOMAINS.WEATHER,
            city,
            source: 'Open-Meteo',
            source_url: 'https://open-meteo.com/',
            collected_at: serverTimestamp(),
            data: { 
              temp: weatherData.current.temperature_2m, 
              humidity: weatherData.current.relative_humidity_2m, 
              pressure: weatherData.current.surface_pressure, 
              weather_code: weatherData.current.weather_code 
            },
            raw_response_hash: createHash(weatherData)
          });
          logs.push(`Weather collected for ${city}`);

          // Air Quality
          const aqRes = await axios.get(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone`);
          const aqData = aqRes.data;
          
          const aqFactId = `air_quality_${city}_${Date.now()}`;
          await setDoc(doc(db, 'facts', aqFactId), {
            fact_id: aqFactId,
            domain: 'air_quality',
            city,
            source: 'Open-Meteo',
            source_url: 'https://open-meteo.com/',
            collected_at: serverTimestamp(),
            data: { 
              european_aqi: aqData.current.european_aqi,
              pm10: aqData.current.pm10,
              pm2_5: aqData.current.pm2_5,
              no2: aqData.current.nitrogen_dioxide
            },
            raw_response_hash: createHash(aqData)
          });
          logs.push(`Air Quality collected for ${city}`);
        }
      } catch (err: any) {
        logs.push(`Error collecting Weather/AQ for ${city}: ${err.message}`);
      }

      // 2. GUTS (Overpass API - NO API KEY REQUIRED)
      try {
        const overpassQuery = `[out:json];area[name="${city}"]->.searchArea;node["amenity"="restaurant"](area.searchArea);out count;`;
        const overpassRes = await axios.post('https://overpass-api.de/api/interpreter', `data=${encodeURIComponent(overpassQuery)}`);
        const overpassData = overpassRes.data;
        const factId = `guts_${city}_${Date.now()}`;
        await setDoc(doc(db, 'facts', factId), {
          fact_id: factId,
          domain: DOMAINS.GUTS,
          city,
          source: SOURCES.OVERPASS,
          source_url: 'https://overpass-api.de/',
          collected_at: serverTimestamp(),
          data: { restaurant_count: overpassData.elements?.[0]?.tags?.nodes || 0 },
          raw_response_hash: createHash(overpassData)
        });
        logs.push(`GUTS collected for ${city}`);
      } catch (err: any) {
        logs.push(`Error collecting GUTS for ${city}: ${err.message}`);
      }

      // 3. City Pulse (Wikidata - NO API KEY REQUIRED)
      try {
        const sparqlQuery = `SELECT ?population WHERE { ?city wdt:P31 wd:Q515; rdfs:label "${city}"@en; wdt:P1082 ?population. } LIMIT 1`;
        const wikiRes = await axios.get(`https://query.wikidata.org/sparql?query=${encodeURIComponent(sparqlQuery)}&format=json`);
        const wikiData = wikiRes.data;
        const factId = `pulse_${city}_${Date.now()}`;
        await setDoc(doc(db, 'facts', factId), {
          fact_id: factId,
          domain: DOMAINS.CITY_PULSE,
          city,
          source: SOURCES.WIKIDATA,
          source_url: 'https://query.wikidata.org/',
          collected_at: serverTimestamp(),
          data: { population: wikiData.results?.bindings?.[0]?.population?.value || 'unknown' },
          raw_response_hash: createHash(wikiData)
        });
        logs.push(`City Pulse collected for ${city}`);
      } catch (err: any) {
        logs.push(`Error collecting City Pulse for ${city}: ${err.message}`);
      }

      // 4. Wikipedia Pageviews (Proxy for Attention/Tourism - NO API KEY REQUIRED)
      try {
        const today = new Date();
        today.setDate(today.getDate() - 2); // Wikipedia API has 1-2 days delay
        const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
        const wikiCity = city.replace(/ /g, '_');
        
        const viewsRes = await axios.get(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${wikiCity}/daily/${dateStr}/${dateStr}`, {
          headers: { 'User-Agent': 'CrystalB2C/1.0 (tommasotonarelli03@gmail.com)' }
        });
        
        const viewsData = viewsRes.data;
        const factId = `attention_${city}_${Date.now()}`;
        await setDoc(doc(db, 'facts', factId), {
          fact_id: factId,
          domain: 'attention_economics',
          city,
          source: 'Wikimedia REST API',
          source_url: 'https://wikimedia.org/api/rest_v1/',
          collected_at: serverTimestamp(),
          data: { pageviews: viewsData.items?.[0]?.views || 0 },
          raw_response_hash: createHash(viewsData)
        });
        logs.push(`Attention (Wiki views) collected for ${city}`);
      } catch (err: any) {
        logs.push(`Error collecting Attention for ${city}: ${err.message}`);
      }
    }

    // 5. Macro Economy (REST Countries - NO API KEY REQUIRED)
    for (const countryCode of GLOBAL_COUNTRIES) {
      try {
        const countryRes = await axios.get(`https://restcountries.com/v3.1/alpha/${countryCode}`);
        const countryData = countryRes.data[0];
        const factId = `macro_${countryCode}_${Date.now()}`;
        await setDoc(doc(db, 'facts', factId), {
          fact_id: factId,
          domain: 'macro_economy',
          country: countryCode,
          source: 'REST Countries',
          source_url: 'https://restcountries.com/',
          collected_at: serverTimestamp(),
          data: { 
            population: countryData.population,
            region: countryData.region,
            subregion: countryData.subregion
          },
          raw_response_hash: createHash(countryData)
        });
        logs.push(`Macro Economy collected for ${countryCode}`);
      } catch (err: any) {
        logs.push(`Error collecting Macro Economy for ${countryCode}: ${err.message}`);
      }
    }

    // 6. Markets & Asset Regimes (Binance Public API - NO API KEY REQUIRED)
    try {
      const cryptoRes = await axios.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT`);
      const cryptoData = cryptoRes.data;
      const factId = `markets_BTC_${Date.now()}`;
      await setDoc(doc(db, 'facts', factId), {
        fact_id: factId,
        domain: 'markets_and_assets',
        asset: 'BTC',
        source: 'Binance Public API',
        source_url: 'https://api.binance.com/',
        collected_at: serverTimestamp(),
        data: { 
          lastPrice: cryptoData.lastPrice,
          priceChangePercent: cryptoData.priceChangePercent,
          volume: cryptoData.volume
        },
        raw_response_hash: createHash(cryptoData)
      });
      logs.push(`Markets (BTC) collected`);
    } catch (err: any) {
      logs.push(`Error collecting Markets: ${err.message}`);
    }

    await logPipeline(runId, 'COMPLETED', { logs });
  } catch (error: any) {
    await logPipeline(runId, 'FAILED', { error: error.message, logs });
  }
}

async function get20YearHistoricalContext(domain: string, city?: string, ai?: any): Promise<string> {
  if (!db || !ai) return "";
  const docId = `${domain}_${city || 'global'}`.replace(/[^a-zA-Z0-9_]/g, '_');
  
  try {
    const docRef = doc(db, 'historical_20y_summaries', docId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data().summary;
    }
    
    // Generate the 20-year summary using Gemini if not in DB (Cloud Pre-loading)
    const prompt = `Genera un riassunto storico fattuale e analitico degli ultimi 20 anni per il dominio "${domain}"${city ? ` con focus specifico sull'area di ${city}` : ' a livello globale'}. 
    Includi:
    1. Principali cicli di mercato/trend (es. bolle, crisi, picchi di crescita).
    2. Cambiamenti strutturali e normativi.
    3. Eventi "Cigno Nero" o shock esogeni che hanno colpito questo settore.
    4. Valori medi storici o benchmark di riferimento (es. tassi medi, volumi medi).
    Sii estremamente conciso, usa elenchi puntati, massimo 250 parole. Questo testo servirà come "baseline" per calibrare un modello predittivo.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    
    const summary = response.text || "Nessun dato storico disponibile.";
    
    // Save to Firestore for future use
    await setDoc(docRef, {
      domain,
      city: city || 'global',
      summary,
      created_at: serverTimestamp()
    });
    
    return summary;
  } catch (err) {
    console.error("Error fetching/generating 20y history:", err);
    return "";
  }
}

export async function handleTimeGpt(req: any, res: any) {
  const { domain, city, fh } = req.body;
  console.log(`[handleTimeGpt] Called with domain: ${domain}, city: ${city}, fh: ${fh}`);
  if (!domain) {
    return res.status(400).json({ error: 'Missing domain' });
  }

  try {
    const historicalData = await fetchHistoricalDataForTimeGPT(domain, city);
    const length = historicalData ? Object.keys(historicalData).length : 0;
    console.log(`[handleTimeGpt] historicalData length: ${length}`);
    const timeGptResponse = await callTimeGPT(historicalData, fh || 7);
    console.log(`[handleTimeGpt] timeGptResponse: ${timeGptResponse ? 'success' : 'null'}`);
    
    if (timeGptResponse && timeGptResponse.value) {
      return res.json({ forecast: timeGptResponse });
    } else {
      return res.json({ forecast: null, debug: { length, timeGptResponse } });
    }
  } catch (error: any) {
    console.error("Error in handleTimeGpt:", error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}

export function startBackgroundTasks() {
  console.log("Starting Crystal background tasks...");
  // Run data collector immediately, then every 6 hours
  runDataCollector();
  setInterval(runDataCollector, 6 * 60 * 60 * 1000);
}
