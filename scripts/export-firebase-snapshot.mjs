import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const admin = require(path.join(repoRoot, 'functions', 'node_modules', 'firebase-admin'));

function parseArgs(argv) {
  const options = {
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT ?? process.env.GOOGLE_APPLICATION_CREDENTIALS ?? '',
    outDir: path.join(repoRoot, 'tmp', `firebase-export-${new Date().toISOString().replace(/[:.]/g, '-')}`),
    includeAuth: true,
    collections: [],
    maxDepth: Number.POSITIVE_INFINITY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--service-account') {
      options.serviceAccount = argv[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (arg === '--out-dir') {
      options.outDir = argv[index + 1] ?? options.outDir;
      index += 1;
      continue;
    }

    if (arg === '--collections') {
      options.collections = (argv[index + 1] ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === '--skip-auth') {
      options.includeAuth = false;
      continue;
    }

    if (arg === '--max-depth') {
      const rawValue = argv[index + 1];
      options.maxDepth = rawValue === undefined ? options.maxDepth : Number(rawValue);
      index += 1;
      continue;
    }
  }

  if (!options.serviceAccount) {
    throw new Error('Missing --service-account. Pass a Firebase service account JSON path.');
  }

  return options;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function describeFirestoreValue(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof admin.firestore.Timestamp) return 'timestamp';
  if (value instanceof admin.firestore.GeoPoint) return 'geopoint';
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return 'bytes';
  if (value?.constructor?.name === 'DocumentReference') return 'reference';
  if (isPlainObject(value)) return 'map';
  return typeof value;
}

function serializeFirestoreValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeFirestoreValue(item));
  }

  if (value instanceof admin.firestore.Timestamp) {
    return {
      __type: 'timestamp',
      iso: value.toDate().toISOString(),
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
    };
  }

  if (value instanceof admin.firestore.GeoPoint) {
    return {
      __type: 'geopoint',
      latitude: value.latitude,
      longitude: value.longitude,
    };
  }

  if (value instanceof Uint8Array || Buffer.isBuffer(value)) {
    return {
      __type: 'bytes',
      base64: Buffer.from(value).toString('base64'),
    };
  }

  if (value?.constructor?.name === 'DocumentReference') {
    return {
      __type: 'reference',
      path: value.path,
    };
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, serializeFirestoreValue(nestedValue)]),
    );
  }

  return value;
}

function recordSchema(schema, data, prefix = '') {
  if (!isPlainObject(data)) {
    return;
  }

  for (const [key, value] of Object.entries(data)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    const kind = describeFirestoreValue(value);
    const entry = schema[fieldPath] ?? { kinds: {}, samples: [] };

    entry.kinds[kind] = (entry.kinds[kind] ?? 0) + 1;

    if (entry.samples.length < 3) {
      entry.samples.push(serializeFirestoreValue(value));
    }

    schema[fieldPath] = entry;

    if (kind === 'map') {
      recordSchema(schema, value, fieldPath);
    }
  }
}

async function exportDocument(docSnap, totals, depth, maxDepth) {
  totals.documents += 1;
  const data = docSnap.data() ?? {};
  const subcollections = {};

  if (depth < maxDepth) {
    for (const subcollectionRef of await docSnap.ref.listCollections()) {
      subcollections[subcollectionRef.id] = await exportCollection(subcollectionRef, totals, depth + 1, maxDepth);
    }
  }

  return {
    id: docSnap.id,
    path: docSnap.ref.path,
    data: serializeFirestoreValue(data),
    subcollections,
  };
}

async function exportCollection(collectionRef, totals, depth = 0, maxDepth = Number.POSITIVE_INFINITY) {
  totals.collections += 1;
  const snapshot = await collectionRef.get();
  const schema = {};
  const documents = [];

  for (const docSnap of snapshot.docs) {
    recordSchema(schema, docSnap.data() ?? {});
    documents.push(await exportDocument(docSnap, totals, depth, maxDepth));
  }

  return {
    id: collectionRef.id,
    path: collectionRef.path,
    documentCount: snapshot.size,
    schema,
    documents,
  };
}

async function exportAuthUsers() {
  const users = [];
  let nextPageToken;

  do {
    const page = await admin.auth().listUsers(1000, nextPageToken);
    nextPageToken = page.pageToken;
    users.push(
      ...page.users.map((userRecord) => ({
        uid: userRecord.uid,
        email: userRecord.email ?? null,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName ?? null,
        disabled: userRecord.disabled,
        phoneNumber: userRecord.phoneNumber ?? null,
        photoURL: userRecord.photoURL ?? null,
        providerData: userRecord.providerData,
        customClaims: userRecord.customClaims ?? {},
        metadata: userRecord.metadata,
      })),
    );
  } while (nextPageToken);

  return users;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const serviceAccountRaw = await fs.readFile(options.serviceAccount, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountRaw);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  const db = admin.firestore();
  const totals = { collections: 0, documents: 0 };
  const topLevelCollectionRefs = await db.listCollections();
  const selectedCollectionRefs = options.collections.length
    ? topLevelCollectionRefs.filter((ref) => options.collections.includes(ref.id))
    : topLevelCollectionRefs;

  await fs.mkdir(options.outDir, { recursive: true });
  await fs.mkdir(path.join(options.outDir, 'firestore'), { recursive: true });

  const manifest = {
    exportedAt: new Date().toISOString(),
    projectId: serviceAccount.project_id,
    topLevelCollections: [],
    totals,
    authUsers: {
      exported: false,
      count: 0,
    },
  };

  for (const collectionRef of selectedCollectionRefs) {
    console.log(`Exporting collection ${collectionRef.id}...`);
    const exportedCollection = await exportCollection(collectionRef, totals, 0, options.maxDepth);
    manifest.topLevelCollections.push({
      id: exportedCollection.id,
      path: exportedCollection.path,
      documentCount: exportedCollection.documentCount,
    });

    await fs.writeFile(
      path.join(options.outDir, 'firestore', `${collectionRef.id}.json`),
      JSON.stringify(exportedCollection, null, 2),
      'utf8',
    );
  }

  if (options.includeAuth) {
    console.log('Exporting Firebase Auth users...');
    const authUsers = await exportAuthUsers();
    manifest.authUsers = {
      exported: true,
      count: authUsers.length,
    };
    await fs.writeFile(path.join(options.outDir, 'auth-users.json'), JSON.stringify(authUsers, null, 2), 'utf8');
  }

  await fs.writeFile(path.join(options.outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Firebase snapshot exported to ${options.outDir}`);
  console.log(`Top-level collections: ${manifest.topLevelCollections.length}`);
  console.log(`Total collections visited: ${totals.collections}`);
  console.log(`Total documents visited: ${totals.documents}`);
  console.log(`Auth users exported: ${manifest.authUsers.count}`);

  await admin.app().delete();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await admin.app().delete();
  } catch {
    // No initialized app to clean up.
  }
  process.exit(1);
});
