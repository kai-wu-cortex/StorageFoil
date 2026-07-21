import type { Request, Response } from 'express';
import type { UpdateResult } from 'mongodb';
import { COLLECTION_NAMES, type StorageFoilUserDocument } from './collections.ts';
import { getMongoCollection } from './mongodb.ts';
import { verifyPassword } from './password.ts';
import {
  SessionAuthError,
  createSessionToken,
  getSessionSecret,
  sendJson,
  setSessionCookie,
  type SessionUser,
} from './sessionAuth.ts';

interface LoginRequestBody {
  username?: unknown;
  password?: unknown;
}

export interface StorageFoilUsersCollection {
  findOne(filter: { username: string }): Promise<StorageFoilUserDocument | null>;
  updateOne(
    filter: { _id: string },
    update: { $set: { lastLoginAt: Date; updatedAt: Date } },
  ): Promise<Pick<UpdateResult, 'acknowledged'> | { acknowledged: boolean }>;
}

let usersCollectionResolver: (() => Promise<StorageFoilUsersCollection>) | null = null;

export function setStorageFoilUsersCollectionResolverForTests(
  resolver: (() => Promise<StorageFoilUsersCollection>) | null,
): void {
  usersCollectionResolver = resolver;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function parseBody(body: unknown): LoginRequestBody {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as LoginRequestBody;
    } catch {
      return {};
    }
  }
  return body && typeof body === 'object' ? (body as LoginRequestBody) : {};
}

function toSessionUser(user: StorageFoilUserDocument): SessionUser {
  return {
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

async function getUsersCollection(): Promise<StorageFoilUsersCollection> {
  if (usersCollectionResolver) {
    return usersCollectionResolver();
  }
  return getMongoCollection<StorageFoilUserDocument>(COLLECTION_NAMES.users);
}

function rejectCredentials(): never {
  throw new SessionAuthError(401, 'UNAUTHORIZED', '用户名或密码错误。');
}

export async function loginApiHandler(
  req: Pick<Request, 'method' | 'body'>,
  res: Pick<Response, 'status' | 'json' | 'setHeader'>,
): Promise<void> {
  if (req.method !== 'POST') {
    throw new SessionAuthError(405, 'METHOD_NOT_ALLOWED', '仅支持 POST。');
  }

  const body = parseBody(req.body);
  const username = typeof body.username === 'string' ? normalizeUsername(body.username) : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    rejectCredentials();
  }

  const collection = await getUsersCollection();
  const user = await collection.findOne({ username });
  if (!user || !user.enabled || !(await verifyPassword(password, user.password))) {
    rejectCredentials();
  }

  const sessionUser = toSessionUser(user);
  const token = createSessionToken(sessionUser, getSessionSecret());
  setSessionCookie(res, token);
  collection
    .updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), updatedAt: new Date() } })
    .catch(error => console.warn('StorageFoil lastLoginAt update failed.', error));
  sendJson(res, 200, { success: true, data: sessionUser });
}
