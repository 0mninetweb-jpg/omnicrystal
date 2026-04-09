import { invokeCrystalApi } from '../appwriteFunctionApi';

type FirestoreRoot = {
  __type: 'db';
};

type PathTarget = FirestoreRoot | CollectionReference | DocumentReference;

type QueryConstraint =
  | { kind: 'where'; field: string; op: string; value: unknown }
  | { kind: 'orderBy'; field: string; direction: 'asc' | 'desc' }
  | { kind: 'limit'; value: number };

type BaseRef = {
  path: string[];
};

export type CollectionReference = BaseRef & {
  __type: 'collection';
};

export type DocumentReference = BaseRef & {
  __type: 'document';
};

export type QueryReference = {
  __type: 'query';
  ref: CollectionReference;
  constraints: QueryConstraint[];
};

type DocumentSnapshot = {
  id: string;
  exists: () => boolean;
  data: () => Record<string, any> | undefined;
};

type QuerySnapshot = {
  docs: DocumentSnapshot[];
  empty: boolean;
  size: number;
  forEach: (callback: (snapshot: DocumentSnapshot) => void) => void;
};

const POLL_INTERVAL_MS = 4000;

export const db: FirestoreRoot = {
  __type: 'db',
};

export function getFirestore(..._args: unknown[]) {
  return db;
}

function randomId() {
  return globalThis.crypto?.randomUUID?.() || `id_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function pathFromTarget(target: PathTarget, segments: string[]) {
  if ((target as FirestoreRoot).__type === 'db') {
    return [...segments];
  }
  return [...(target as BaseRef).path, ...segments];
}

function normalizeTimestampValue(value: unknown): string | unknown {
  if (!value || typeof value !== 'object') return value;
  if ((value as any).__serverTimestamp) {
    return new Date().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeTimestampValue(entry));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [key, normalizeTimestampValue(nestedValue)])
  );
}

async function requestDataApi<T>(path: string, body: Record<string, unknown>, options: { requireAuth?: boolean } = {}) {
  return invokeCrystalApi<T>(path, {
    method: 'POST',
    body,
    requireAuth: options.requireAuth !== false,
  });
}

function createDocumentSnapshot(id: string, data: Record<string, any> | null | undefined): DocumentSnapshot {
  return {
    id,
    exists: () => Boolean(data),
    data: () => (data ? { ...data } : undefined),
  };
}

function createQuerySnapshot(items: Array<{ id: string; data: Record<string, any> }>): QuerySnapshot {
  const docs = items.map((item) => createDocumentSnapshot(item.id, item.data));
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach(callback) {
      docs.forEach(callback);
    },
  };
}

export function doc(target: PathTarget, ...segments: string[]) {
  const resolvedPath =
    segments.length === 0 && (target as CollectionReference).__type === 'collection'
      ? [...(target as CollectionReference).path, randomId()]
      : pathFromTarget(target, segments);
  return {
    __type: 'document' as const,
    path: resolvedPath,
  };
}

export function collection(target: PathTarget, ...segments: string[]) {
  return {
    __type: 'collection' as const,
    path: pathFromTarget(target, segments),
  };
}

export function query(ref: CollectionReference, ...constraints: QueryConstraint[]) {
  return {
    __type: 'query' as const,
    ref,
    constraints,
  };
}

export function where(field: string, op: string, value: unknown): QueryConstraint {
  return { kind: 'where', field, op, value };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): QueryConstraint {
  return { kind: 'orderBy', field, direction };
}

export function limit(value: number): QueryConstraint {
  return { kind: 'limit', value };
}

export function serverTimestamp() {
  return { __serverTimestamp: true };
}

export async function getDoc(ref: DocumentReference): Promise<any> {
  const payload = await requestDataApi<{ document: { id: string; data: Record<string, any> | null } }>('data/document/get', {
    path: ref.path,
  });
  return createDocumentSnapshot(payload.document.id, payload.document.data);
}

export async function setDoc(ref: DocumentReference, data: Record<string, unknown>, options?: { merge?: boolean }) {
  await requestDataApi('data/document/set', {
    path: ref.path,
    merge: Boolean(options?.merge),
    data: normalizeTimestampValue(data),
  });
}

export async function addDoc(ref: CollectionReference, data: Record<string, unknown>) {
  const payload = await requestDataApi<{ document: { id: string; data: Record<string, any> } }>('data/collection/add', {
    path: ref.path,
    data: normalizeTimestampValue(data),
  });
  return doc(ref, payload.document.id);
}

export async function deleteDoc(ref: DocumentReference) {
  await requestDataApi('data/document/delete', { path: ref.path });
}

export async function getDocs(target: CollectionReference | QueryReference): Promise<any> {
  const path = target.__type === 'query' ? target.ref.path : target.path;
  const payload = await requestDataApi<{ documents: Array<{ id: string; data: Record<string, any> }> }>('data/query', {
    path,
    constraints: target.__type === 'query' ? target.constraints : [],
  }, {
    requireAuth: path[0] !== 'users',
  });
  return createQuerySnapshot(payload.documents);
}

export function onSnapshot(
  target: DocumentReference | QueryReference | CollectionReference,
  onNext: (snapshot: any) => void,
  onError?: (error: unknown) => void
) {
  let active = true;
  let timer: number | null = null;
  let previousPayload = '';

  const read = async () => {
    try {
      const snapshot =
        (target as DocumentReference).__type === 'document'
          ? await getDoc(target as DocumentReference)
          : await getDocs(target as QueryReference | CollectionReference);
      if (!active) return;
      const serialized = JSON.stringify(
        'docs' in snapshot
          ? snapshot.docs.map((docSnapshot) => ({ id: docSnapshot.id, data: docSnapshot.data() }))
          : { id: snapshot.id, data: snapshot.data() }
      );
      if (serialized !== previousPayload) {
        previousPayload = serialized;
        onNext(snapshot);
      }
    } catch (error) {
      if (active) {
        onError?.(error);
      }
    } finally {
      if (active) {
        timer = window.setTimeout(read, POLL_INTERVAL_MS);
      }
    }
  };

  void read();

  return () => {
    active = false;
    if (timer) {
      window.clearTimeout(timer);
    }
  };
}

export const Timestamp = {
  now() {
    return new Date();
  },
};
