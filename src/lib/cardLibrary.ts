import { collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { CardData } from '../types/crystal';
import type { ForecastResolvedContext } from '../types/forecastV1';

function simpleHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function createForecastLineageId(query: string, context: ForecastResolvedContext) {
  const seed = [
    query.trim().toLowerCase(),
    context.domainId,
    context.entity.toLowerCase(),
    context.geography.toLowerCase(),
    context.horizon.toLowerCase(),
  ].join('|');
  return `lineage_${simpleHash(seed)}`;
}

function buildCardRecord(card: CardData, query: string, context: ForecastResolvedContext, lineageId: string) {
  return {
    ...card,
    lineage_id: lineageId,
    query_text: query,
    entity_label: context.entity,
    geography_label: context.geography,
    horizon_label: context.horizon,
    domain_label: context.domainId,
    card_state_ui: card.card_state === 'blocked' ? 'coverage_gap' : card.card_state || 'published',
    trust_confidence: card.trust_layer?.confidence_score ?? 0,
    savedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

export async function saveForecastCardToLibrary(userId: string, query: string, context: ForecastResolvedContext, card: CardData) {
  const lineageId = createForecastLineageId(query, context);
  const cardRef = doc(db, 'users', userId, 'cards', lineageId);
  const versionId = card.card_id || `${Date.now()}`;
  const versionRef = doc(collection(db, 'users', userId, 'cards', lineageId, 'versions'), versionId);
  const snapshot = await getDoc(cardRef);
  const baseRecord = buildCardRecord(card, query, context, lineageId);

  const cardPayload = snapshot.exists()
    ? baseRecord
    : {
        ...baseRecord,
        createdAt: serverTimestamp(),
      };

  await setDoc(cardRef, cardPayload, { merge: true });
  await setDoc(
    versionRef,
    {
      ...baseRecord,
      createdAt: serverTimestamp(),
      parent_lineage_id: lineageId,
      version_saved_at: serverTimestamp(),
    },
    { merge: true }
  );

  return lineageId;
}

export async function isForecastCardSaved(userId: string, query: string, context: ForecastResolvedContext) {
  const lineageId = createForecastLineageId(query, context);
  const snapshot = await getDoc(doc(db, 'users', userId, 'cards', lineageId));
  return snapshot.exists();
}

export async function followForecastEntity(userId: string, context: ForecastResolvedContext) {
  const followId = `follow_${simpleHash(`${context.entity}|${context.domainId}|${context.geography}`)}`;
  const followRef = doc(db, 'users', userId, 'watchlist', followId);
  const snapshot = await getDoc(followRef);

  const type =
    context.entityType === 'city'
      ? 'City'
      : context.entityType === 'country'
        ? 'Country'
        : 'Entity';

  const payload = {
    entity: context.entity,
    type,
    domains: [context.domainId],
    alerts: true,
    pulse: `Following ${context.entity}`,
    trend: 'flat',
    geography_label: context.geography,
    updatedAt: serverTimestamp(),
  };

  await setDoc(
    followRef,
    snapshot.exists()
      ? payload
      : {
          ...payload,
          createdAt: serverTimestamp(),
        },
    { merge: true }
  );

  return followId;
}
