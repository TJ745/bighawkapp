/**
 * Sales rung up while the till had no connection.
 *
 * The queue holds the **intent** of a sale — what was sold, to whom, how it was paid — and never
 * its totals. When the connection returns the server prices it again, allocates the real document
 * number and moves the stock, exactly as it would have online. That is what keeps "server-side
 * calculations are authoritative" true even when the server was not there at the time.
 *
 * IndexedDB rather than memory, because the common outage is long enough for someone to reload
 * the page, and a sale lost on refresh is money lost. Client-only: there is no server in this file.
 */

const DB_NAME = "bighawk-offline";
const DB_VERSION = 1;
const STORE = "queued-sales";

/** What the till rang up, as the server action expects it. Totals are deliberately absent. */
export type QueuedSaleInput = {
  registerId: string | null;
  customerId: string | null;
  cartDiscountPercent: number;
  note: string | null;
  lines: unknown[];
  payments: unknown[];
  park: boolean;
};

export type QueuedSale = {
  /** The till's own id, and the key that makes a replay safe to repeat. */
  reference: string;
  /** When it was rung up — not when it synced. The receipt and the shift both care. */
  ringupAt: string;
  branchName: string;
  /** What the customer was told they owed, for the provisional receipt only. */
  displayTotal: number;
  input: QueuedSaleInput;
  attempts: number;
  /** Set when the server refused it outright: a person has to look. */
  problem?: string;
};

/** A reference the server can treat as unique without asking anyone. */
export function newSaleReference(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `off_${crypto.randomUUID()}`;
  return `off_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "reference" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.oncomplete = () => database.close();
      }),
  );
}

export async function queueSale(sale: QueuedSale): Promise<void> {
  await run("readwrite", (store) => store.put(sale));
}

/** Everything waiting, oldest first — the order they were rung up in is the order they replay. */
export async function listQueuedSales(): Promise<QueuedSale[]> {
  const all = await run<QueuedSale[]>("readonly", (store) => store.getAll() as IDBRequest<QueuedSale[]>);
  return all.sort((a, b) => a.ringupAt.localeCompare(b.ringupAt));
}

export async function removeQueuedSale(reference: string): Promise<void> {
  await run("readwrite", (store) => store.delete(reference));
}

/** Records a refusal against the sale so it stops being retried and a person can look at it. */
export async function markQueuedProblem(reference: string, problem: string): Promise<void> {
  const existing = await run<QueuedSale | undefined>("readonly", (store) => store.get(reference) as IDBRequest<QueuedSale | undefined>);
  if (!existing) return;
  await queueSale({ ...existing, problem, attempts: existing.attempts + 1 });
}

/** Counts another failed attempt without condemning the sale — a network blip is not a refusal. */
export async function markQueuedAttempt(reference: string): Promise<void> {
  const existing = await run<QueuedSale | undefined>("readonly", (store) => store.get(reference) as IDBRequest<QueuedSale | undefined>);
  if (!existing) return;
  await queueSale({ ...existing, attempts: existing.attempts + 1 });
}

/** Whether this browser can queue at all. Private windows and old browsers may not. */
export function queueAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
