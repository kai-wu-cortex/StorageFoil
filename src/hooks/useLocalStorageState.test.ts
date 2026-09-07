import assert from 'node:assert/strict';
import test from 'node:test';

test('reads valid JSON and falls back when local storage is missing or corrupted', async () => {
  const storageModule = await import('./useLocalStorageState').catch(() => ({}));
  const readLocalStorageValue = (
    storageModule as {
      readLocalStorageValue?: <T>(
        storage: Pick<Storage, 'getItem'>,
        key: string,
        fallback: T,
      ) => T;
    }
  ).readLocalStorageValue;
  assert.equal(typeof readLocalStorageValue, 'function');

  const values = new Map<string, string>([
    ['valid', JSON.stringify({ density: 'compact' })],
    ['invalid', '{broken json'],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
  };

  assert.deepEqual(readLocalStorageValue!(storage, 'valid', {}), {
    density: 'compact',
  });
  assert.deepEqual(readLocalStorageValue!(storage, 'missing', { density: 'standard' }), {
    density: 'standard',
  });
  assert.deepEqual(readLocalStorageValue!(storage, 'invalid', { density: 'standard' }), {
    density: 'standard',
  });
});

test('writes JSON without breaking the caller when storage is unavailable', async () => {
  const storageModule = await import('./useLocalStorageState').catch(() => ({}));
  const writeLocalStorageValue = (
    storageModule as {
      writeLocalStorageValue?: <T>(
        storage: Pick<Storage, 'setItem'>,
        key: string,
        value: T,
      ) => boolean;
    }
  ).writeLocalStorageValue;
  assert.equal(typeof writeLocalStorageValue, 'function');

  let saved = '';
  assert.equal(
    writeLocalStorageValue!(
      { setItem: (_key: string, value: string) => { saved = value; } },
      'preference',
      { pageSize: 50 },
    ),
    true,
  );
  assert.equal(saved, JSON.stringify({ pageSize: 50 }));
  assert.equal(
    writeLocalStorageValue!(
      { setItem: () => { throw new Error('quota exceeded'); } },
      'preference',
      { pageSize: 50 },
    ),
    false,
  );
});
