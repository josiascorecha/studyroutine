/** Acesso mínimo ao IndexedDB (navegador e WebView do Android, onde os dados ficam no espaço privado do app). */

export const STORES = { records: 'records', meta: 'meta', cache: 'cache' } as const;
type StoreName = (typeof STORES)[keyof typeof STORES];

export function openDb(name = 'studyroutine'): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.records)) {
        const s = db.createObjectStore(STORES.records, { keyPath: 'pk' });
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains(STORES.meta)) db.createObjectStore(STORES.meta);
      if (!db.objectStoreNames.contains(STORES.cache)) db.createObjectStore(STORES.cache);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o banco local'));
    req.onblocked = () => reject(new Error('Banco local bloqueado por outra aba'));
  });
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  return done(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}

export async function getOne<T>(db: IDBDatabase, store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return done(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}

export function putOne(db: IDBDatabase, store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada'));
  });
}

export function putMany(db: IDBDatabase, store: StoreName, values: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    for (const v of values) s.put(v);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Gravação cancelada'));
  });
}

export function deleteOne(db: IDBDatabase, store: StoreName, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function clearStore(db: IDBDatabase, store: StoreName): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
