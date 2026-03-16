import { BACKEND_CONFIG } from '../config';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';

export async function fetchCachedCard(queryText: string, domain: string, city: string): Promise<{ cached: boolean; card: any } | null> {
  if (!db) return null;

  try {
    const now = new Date();
    const cachedCardsRef = collection(db, 'cached_cards', domain, city);
    const q = query(
      cachedCardsRef,
      where('query', '==', queryText),
      where('ttl', '>', now),
      orderBy('ttl', 'desc'),
      limit(1)
    );
    
    const cachedCardsSnap = await getDocs(q);

    if (!cachedCardsSnap.empty) {
      const cachedCard = cachedCardsSnap.docs[0].data();
      return { cached: true, card: cachedCard.card_data };
    }
    
    return null;
  } catch (error) {
    console.warn("Failed to fetch from cache:", error);
    return null;
  }
}

export async function saveCachedCard(card: any, queryText: string, domain: string, city: string): Promise<void> {
  try {
    const cardId = card.card_id;
    const ttl = new Date();
    ttl.setHours(ttl.getHours() + 24); // 24 hours TTL

    const cachedCard = {
      card_id: cardId,
      domain,
      city,
      query: queryText,
      card_data: card,
      generated_at: serverTimestamp(),
      ttl: ttl
    };

    await setDoc(doc(db, 'cached_cards', domain, city, cardId), cachedCard);
  } catch (error) {
    console.warn("Failed to save cached card to Firestore:", error);
  }
}

export async function getPipelineStatus(): Promise<any> {
  try {
    const logsRef = collection(db, 'pipeline_logs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(1));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return snapshot.docs[0].data();
    }
    return null;
  } catch (error) {
    console.warn("Failed to fetch pipeline status:", error);
    return null;
  }
}
