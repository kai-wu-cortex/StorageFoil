import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

export function readLocalStorageValue<T>(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  fallback: T,
): T {
  try {
    const saved = storage.getItem(key);
    return saved === null ? fallback : JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

export function writeLocalStorageValue<T>(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  value: T,
): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function useLocalStorageState<T>(
  key: string,
  fallback: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback;
    return readLocalStorageValue(window.localStorage, key, fallback);
  });

  useEffect(() => {
    writeLocalStorageValue(window.localStorage, key, value);
  }, [key, value]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== key) return;
      setValue(readLocalStorageValue(window.localStorage, key, fallback));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [fallback, key]);

  return [value, setValue];
}
