import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { COLLECTION_NAMES, type StorageFoilUserDocument } from '../src/server/collections';
import { getMongoCollection, resolveMongoDbName } from '../src/server/mongodb';
import { createPasswordHash } from '../src/server/password';
import type { StorageFoilRole } from '../src/shared/authTypes';

export interface AccountManifestEntryInput {
  username: string;
  displayName: string;
  role: StorageFoilRole;
  passwordEnv: string;
}

export interface AccountManifestInput {
  accounts: AccountManifestEntryInput[];
}

export interface ParsedAccountManifest {
  accounts: AccountManifestEntryInput[];
}

export interface SeedUsersCollection {
  updateOne(
    filter: { _id: string },
    update: {
      $set: Omit<StorageFoilUserDocument, '_id' | 'createdAt'>;
      $setOnInsert: Pick<StorageFoilUserDocument, 'createdAt'>;
    },
    options: { upsert: true },
  ): Promise<{ acknowledged: boolean }>;
}

interface ProvisionOptions {
  manifest: AccountManifestInput;
  env: Record<string, string | undefined>;
  dryRun: boolean;
  resolvedDbName: string;
  confirmDbName?: string;
  collection?: SeedUsersCollection;
}

export interface ProvisionResult {
  mode: 'dry-run' | 'apply';
  database: string;
  accounts: Array<{
    username: string;
    displayName: string;
    role: StorageFoilRole;
    passwordEnv: string;
  }>;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Invalid account ${field}.`);
  }
  return value.trim();
}

export function parseAccountManifest(
  manifest: AccountManifestInput,
  env: Record<string, string | undefined>,
): ParsedAccountManifest {
  if (!manifest || !Array.isArray(manifest.accounts)) {
    throw new Error('Manifest must contain an accounts array.');
  }

  const seen = new Set<string>();
  const accounts = manifest.accounts.map(account => {
    const username = normalizeUsername(assertString(account.username, 'username'));
    const displayName = assertString(account.displayName, 'displayName');
    const passwordEnv = assertString(account.passwordEnv, 'passwordEnv');

    if (account.role !== 'viewer' && account.role !== 'admin') {
      throw new Error(`Unsupported role for ${username}.`);
    }
    if (seen.has(username)) {
      throw new Error(`Duplicate username: ${username}.`);
    }
    if (!env[passwordEnv]) {
      throw new Error(`Missing password env: ${passwordEnv}.`);
    }

    seen.add(username);
    return { username, displayName, role: account.role, passwordEnv };
  });

  const viewerCount = accounts.filter(account => account.role === 'viewer').length;
  const adminCount = accounts.filter(account => account.role === 'admin').length;
  if (viewerCount !== 10) {
    throw new Error('Manifest must contain exactly 10 viewer accounts.');
  }
  if (adminCount !== 1) {
    throw new Error('Manifest must contain exactly 1 admin account.');
  }

  return { accounts };
}

export async function provisionStorageFoilUsers(
  options: ProvisionOptions,
): Promise<ProvisionResult> {
  const parsed = parseAccountManifest(options.manifest, options.env);
  const result: ProvisionResult = {
    mode: options.dryRun ? 'dry-run' : 'apply',
    database: options.resolvedDbName,
    accounts: parsed.accounts.map(account => ({ ...account })),
  };

  if (options.dryRun) {
    return result;
  }

  if (options.confirmDbName !== options.resolvedDbName) {
    throw new Error(`Refusing to write. Re-run with --confirm-db ${options.resolvedDbName}.`);
  }

  const collection =
    options.collection ??
    (await getMongoCollection<StorageFoilUserDocument>(
      COLLECTION_NAMES.users,
    )) as unknown as SeedUsersCollection;
  const now = new Date();

  for (const account of parsed.accounts) {
    const password = await createPasswordHash(options.env[account.passwordEnv] ?? '');
    await collection.updateOne(
      { _id: account.username },
      {
        $set: {
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          enabled: true,
          password,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );
  }

  return result;
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function loadManifest(): Promise<AccountManifestInput> {
  const manifestPath = argValue('--manifest');
  if (!manifestPath) {
    throw new Error('Missing --manifest <path>.');
  }

  return JSON.parse(await readFile(manifestPath, 'utf8')) as AccountManifestInput;
}

async function main(): Promise<void> {
  const dryRun = !process.argv.includes('--apply');
  const manifest = await loadManifest();
  const result = await provisionStorageFoilUsers({
    manifest,
    env: process.env,
    dryRun,
    resolvedDbName: resolveMongoDbName(),
    confirmDbName: argValue('--confirm-db'),
  });

  console.log(
    JSON.stringify(
      {
        mode: result.mode,
        database: result.database,
        accounts: result.accounts.map(account => ({
          username: account.username,
          displayName: account.displayName,
          role: account.role,
          passwordEnv: account.passwordEnv,
        })),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
