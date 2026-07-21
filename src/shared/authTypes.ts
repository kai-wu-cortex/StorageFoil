export type StorageFoilRole = 'viewer' | 'admin';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: StorageFoilRole;
}

export function isStorageFoilRole(value: unknown): value is StorageFoilRole {
  return value === 'viewer' || value === 'admin';
}

export function parseStorageFoilRole(value: unknown): StorageFoilRole {
  if (isStorageFoilRole(value)) {
    return value;
  }

  throw new Error('Invalid StorageFoil role');
}
