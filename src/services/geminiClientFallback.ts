import { GoogleGenAI, Type } from '@google/genai';
import { SUPPORTED_DOMAINS } from '../data/domains';

let cachedClientApiKey: string | null = null;

async function getClientAI() {
  if (cachedClientApiKey) {
    return new GoogleGenAI({ apiKey: cachedClientApiKey });
  }

  let apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === 'undefined') {
    apiKey = process.env.GEMINI_API_KEY;
  }

  if (!apiKey || apiKey === 'undefined') {
    throw new Error(
      'No Gemini key is available. Configure VITE_GEMINI_API_KEY or the Appwrite runtime environment.'
    );
  }

  cachedClientApiKey = apiKey;
  return new GoogleGenAI({ apiKey });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const message = error?.message || '';
    const isQuotaError = message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
    if (isQuotaError && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export async function compileQueryClient(query: string) {
  const ai = await getClientAI();

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
            domain_id: { type: Type.STRING },
            mode: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING, enum: ['predict_only', 'predict_action'] },
              },
            },
            entities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  entity_id: { type: Type.STRING },
                  entity_type: { type: Type.STRING },
                  label: { type: Type.STRING },
                },
              },
            },
            horizons: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  horizon_id: { type: Type.STRING },
                },
              },
            },
            card_types: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  card_type_id: {
                    type: Type.STRING,
                    enum: [
                      'prediction_summary',
                      'scenario_set',
                      'ranked_list',
                      'tradeoff_plan',
                      'drivers_breakdown',
                      'risk_band',
                    ],
                  },
                },
              },
            },
          },
          required: ['plan_version', 'domain_id', 'mode', 'entities', 'horizons', 'card_types'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function predictClient(query: string, queryPlan: any, userContext?: any) {
  const ai = await getClientAI();

  let contextString = '';
  if (userContext) {
    contextString = `
USER CONTEXT:
- Location: ${userContext.location || 'Not specified'}
- Profession: ${userContext.profession || 'Not specified'}
- Interests: ${userContext.interests?.join(', ') || 'Not specified'}
`;
  }

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: `You are Crystal's predictive engine.
The user asked: "${query}"
The system Query Plan is: ${JSON.stringify(queryPlan)}
${contextString}

Generate a JSON CrystalCard.

Rules:
1. Use Google Search for facts that change quickly.
2. Do not invent data: if the evidence is weak, say so in the trust layer.
3. Return verdict, scenarios, drivers, and practical actions in a readable way.`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
      },
    });

    const card = JSON.parse(response.text || '{}');
    return { ...card, _source: 'live-client' };
  });
}

export async function chatWithProfileBotClient(messages: { role: string; content: string }[]) {
  const ai = await getClientAI();
  const formattedMessages = messages.map((message) => ({
    role: message.role === 'user' ? 'user' : 'model',
    parts: [{ text: message.content }],
  }));

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: formattedMessages,
      config: {
        systemInstruction: `You are Crystal's AI assistant.
Collect three things naturally:
1. Geography
2. Profession or sector
3. Interests or assets

Ask one question at a time. Once you have enough information, also return a JSON summary inside a markdown block.`,
      },
    });
    return response.text;
  });
}

export async function generateNextletterClient(interests: string[], userContext?: any) {
  const ai = await getClientAI();

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
You are "The Crystal Times", a predictive briefing layer.
Write a Nextletter for a user today.

Rules:
1. Use real current data with Google Search.
2. Include at least one historical parallel.
3. End every section with one practical action.

TOPICS: ${interests.join(', ')}
CONTEXT: ${contextString}

OUTPUT JSON with title, subtitle, and sections.`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }],
      },
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function generateCrystalQuotesClient() {
  const ai = await getClientAI();
  const currentDate = new Date().toLocaleDateString('en-GB');

  const prompt = `
Generate 5 Crystal Quotes for the current week.
Base them only on real and current trends using Google Search.

OUTPUT JSON:
{
  "quotes": [
    {
      "quote_id": "string",
      "text": "string",
      "author": "string",
      "context": "string",
      "date": "${currentDate}",
      "analysis": {
        "title": "string",
        "full_text": "string",
        "drivers": ["string"],
        "impact": "string",
        "historical_parallel": "string"
      }
    }
  ]
}`;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        tools: [{ googleSearch: {} }],
      },
    });
    return JSON.parse(response.text || '{}');
  });
}

export async function getLocalInsightsClient(query: string, entities: any[]) {
  const ai = await getClientAI();
  const locationEntity = entities?.find((entity: any) =>
    entity.entity_type === 'city' || entity.entity_type === 'location' || entity.entity_type === 'country'
  );
  const locationContext = locationEntity ? `around ${locationEntity.label}` : '';

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Provide a short local read related to this query: "${query}" ${locationContext}. Mention places, activity, or local reviews if relevant. Keep it concise.`,
      config: {
        tools: [{ googleMaps: {} }],
      },
    });

    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    return { text: response.text, chunks };
  });
}
