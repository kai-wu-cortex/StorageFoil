import { attachDatabasePool } from '@vercel/functions';
import { MongoClient, type Collection, type Db, type Document, type MongoClientOptions } from 'mongodb';

type MongoEnv = Record<string, string | undefined>;

interface MongoClientLike {
  connect(): Promise<MongoClientLike>;
  close(): Promise<void>;
  db(name: string): unknown;
}

interface MongoRuntimeDependencies {
  env?: MongoEnv;
  createClient?: (uri: string, options: MongoClientOptions) => MongoClientLike;
  attachPool?: (client: MongoClientLike) => void;
}

interface MongoUris {
  primaryUri: string;
  fallbackUri?: string;
}

const MONGODB_URI_PATTERN = /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi;

let defaultRuntime: ReturnType<typeof createMongoRuntime> | null = null;

export function resolveMongoUris(env: MongoEnv = process.env): MongoUris {
  const primaryUri = env.MONGODB_URI || env.MONGODB_DIRECT_URI;
  if (!primaryUri) {
    throw new Error('Missing MONGODB_URI or MONGODB_DIRECT_URI.');
  }

  const fallbackUri =
    env.MONGODB_DIRECT_URI && env.MONGODB_DIRECT_URI !== primaryUri
      ? env.MONGODB_DIRECT_URI
      : undefined;

  return { primaryUri, fallbackUri };
}

export function resolveMongoDbName(env: MongoEnv = process.env): string {
  return env.STORAGE_FOIL_DB_NAME || env.KNOWLEDGE_DB_NAME || 'duocloudDB';
}

export function sanitizeMongoError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(message.replace(MONGODB_URI_PATTERN, '<redacted-mongodb-uri>'));
}

export function createMongoRuntime(dependencies: MongoRuntimeDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const createClient =
    dependencies.createClient ??
    ((uri: string, options: MongoClientOptions): MongoClientLike => new MongoClient(uri, options));
  const attachPool =
    dependencies.attachPool ??
    ((client: MongoClientLike) => attachDatabasePool(client as MongoClient));

  let client: MongoClientLike | null = null;
  let clientPromise: Promise<MongoClientLike> | null = null;

  async function tryConnect(uri: string): Promise<MongoClientLike> {
    const candidate = createClient(uri, {
      // Vercel functions should fail quickly when Atlas selection is unavailable.
      serverSelectionTimeoutMS: 8000,
    });
    attachPool(candidate);
    await candidate.connect();
    return candidate;
  }

  async function getMongoClient(): Promise<MongoClientLike> {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { primaryUri, fallbackUri } = resolveMongoUris(env);
        try {
          client = await tryConnect(primaryUri);
          return client;
        } catch (error) {
          if (!fallbackUri) {
            throw sanitizeMongoError(error);
          }

          try {
            client = await tryConnect(fallbackUri);
            return client;
          } catch (fallbackError) {
            throw sanitizeMongoError(fallbackError);
          }
        }
      })().catch(error => {
        clientPromise = null;
        throw error;
      });
    }

    return clientPromise;
  }

  async function getMongoDb(): Promise<unknown> {
    const connectedClient = await getMongoClient();
    return connectedClient.db(resolveMongoDbName(env));
  }

  async function closeMongoClient(): Promise<void> {
    const activeClient = client || (clientPromise ? await clientPromise : null);
    client = null;
    clientPromise = null;
    if (activeClient) {
      await activeClient.close();
    }
  }

  return { getMongoClient, getMongoDb, closeMongoClient };
}

function getDefaultRuntime() {
  if (!defaultRuntime) {
    defaultRuntime = createMongoRuntime();
  }
  return defaultRuntime;
}

export function getMongoClient(): Promise<MongoClientLike> {
  return getDefaultRuntime().getMongoClient();
}

export async function getMongoDb(): Promise<Db> {
  return (await getDefaultRuntime().getMongoDb()) as Db;
}

export async function getMongoCollection<T extends Document>(
  name: string,
): Promise<Collection<T>> {
  const db = await getMongoDb();
  return db.collection<T>(name);
}

export function resetMongoRuntimeForTests(): void {
  defaultRuntime = null;
}

export async function closeMongoClient(): Promise<void> {
  await getDefaultRuntime().closeMongoClient();
}
