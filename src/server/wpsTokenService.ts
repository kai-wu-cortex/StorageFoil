import type { UpdateResult } from 'mongodb';
import type { StorageFoilWpsCredentialsDocument } from './collections.ts';
import { COLLECTION_NAMES } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { decryptSecret, encryptSecret, resolveEncryptionKey } from './secretCrypto.ts';
import { sanitizeWpsMessage } from './wpsClient.ts';

export interface WpsCredentialsCollection {
  findOne(filter: { _id: 'global' }): Promise<StorageFoilWpsCredentialsDocument | null>;
  updateOne(
    filter: { _id: 'global' },
    update: { $set: Partial<StorageFoilWpsCredentialsDocument> },
  ): Promise<Pick<UpdateResult, 'acknowledged'> | { acknowledged: boolean }>;
}

export interface WpsTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
  refresh_token?: string;
  refresh_expires_in?: string | number;
}

export interface WpsTokenOptions {
  encryptionKey?: Buffer;
  fetchImpl?: typeof fetch;
  now?: Date;
}

let collectionResolver: (() => Promise<WpsCredentialsCollection>) | null = null;

export function setWpsCredentialsCollectionForTests(resolver: (() => Promise<WpsCredentialsCollection>) | null): void {
  collectionResolver = resolver;
}

async function getCollection(): Promise<WpsCredentialsCollection> {
  if (collectionResolver) return collectionResolver();
  return getMongoCollection<StorageFoilWpsCredentialsDocument>(COLLECTION_NAMES.wpsCredentials);
}

function tokenStillValid(expiresAt: Date | undefined, now: Date): boolean {
  return Boolean(expiresAt && expiresAt.getTime() - now.getTime() > 5 * 60 * 1000);
}

async function requestToken(
  credential: StorageFoilWpsCredentialsDocument,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<WpsTokenResponse> {
  const response = await fetchImpl(`${credential.apiBase.replace(/\/$/, '')}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = (await response.json()) as WpsTokenResponse & { msg?: string; message?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(`WPS token request failed: ${sanitizeWpsMessage(data.msg || data.message || response.statusText)}`);
  }
  return data;
}

async function persistToken(
  collection: WpsCredentialsCollection,
  token: WpsTokenResponse,
  refreshToken: string,
  key: Buffer,
  now: Date,
): Promise<void> {
  const refreshExpiresIn = Number(token.refresh_expires_in);
  await collection.updateOne(
    { _id: 'global' },
    {
      $set: {
        accessTokenEncrypted: encryptSecret(token.access_token, key),
        refreshTokenEncrypted: encryptSecret(token.refresh_token || refreshToken, key),
        accessExpiresAt: new Date(now.getTime() + Number(token.expires_in || 3600) * 1000),
        refreshExpiresAt: Number.isFinite(refreshExpiresIn)
          ? new Date(now.getTime() + refreshExpiresIn * 1000)
          : undefined,
        updatedAt: now,
      },
    },
  );
}

export async function exchangeWpsAuthorizationCode(
  code: string,
  options: WpsTokenOptions & { updatedBy: string },
): Promise<void> {
  const now = options.now || new Date();
  const key = options.encryptionKey || resolveEncryptionKey();
  const collection = await getCollection();
  const credential = await collection.findOne({ _id: 'global' });
  if (!credential?.appKeyEncrypted || !credential.appId || !credential.redirectUri) {
    throw new Error('WPS credentials are not configured.');
  }
  const appKey = decryptSecret(credential.appKeyEncrypted, key);
  const token = await requestToken(
    credential,
    {
      grant_type: 'authorization_code',
      client_id: credential.appId,
      client_secret: appKey,
      code,
      redirect_uri: credential.redirectUri,
    },
    options.fetchImpl || fetch,
  );
  await persistToken(collection, token, token.refresh_token || '', key, now);
  await collection.updateOne({ _id: 'global' }, { $set: { updatedBy: options.updatedBy, updatedAt: now } });
}

export async function getValidWpsAccessToken(options: WpsTokenOptions = {}): Promise<{ accessToken: string; apiBase: string }> {
  const now = options.now || new Date();
  const key = options.encryptionKey || resolveEncryptionKey();
  const collection = await getCollection();
  const credential = await collection.findOne({ _id: 'global' });
  if (!credential?.appKeyEncrypted || !credential.refreshTokenEncrypted) {
    throw new Error('WPS authorization is required.');
  }
  if (credential.accessTokenEncrypted && tokenStillValid(credential.accessExpiresAt, now)) {
    return {
      accessToken: decryptSecret(credential.accessTokenEncrypted, key),
      apiBase: credential.apiBase,
    };
  }
  const appKey = decryptSecret(credential.appKeyEncrypted, key);
  const refreshToken = decryptSecret(credential.refreshTokenEncrypted, key);
  const token = await requestToken(
    credential,
    {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: credential.appId,
      client_secret: appKey,
    },
    options.fetchImpl || fetch,
  );
  await persistToken(collection, token, refreshToken, key, now);
  return { accessToken: token.access_token, apiBase: credential.apiBase };
}
