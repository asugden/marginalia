// Browser-local storage for the files a student adds to a notebook.
//
// Datasets never leave the student's machine. They are kept in IndexedDB,
// keyed by notebook, and written into the Python runtime's working directory
// whenever it starts — so `pd.read_csv("mydata.csv")` works after a reload or
// a restart without re-uploading. The server has no copy, by design.
//
// The cost of that design, stated to students in the Files panel: the files
// are on this browser only. A different computer, a private window, or
// clearing site data means adding them again.

const DB_NAME = "code-notebook-files";
const STORE = "files";
/** Per-file cap. Pyodide holds files in memory, and a browser tab gets a few
 *  GB at most; this keeps one careless upload from taking the tab down. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024;

export interface StoredFile {
  notebookId: string;
  name: string;
  size: number;
  addedAt: number;
  data: ArrayBuffer;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["notebookId", "name"] });
        store.createIndex("byNotebook", "notebookId");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Every stored file for a notebook. Returns [] when storage is unavailable
 *  (a private window, blocked site data) rather than failing the page. */
export async function listStoredFiles(notebookId: string): Promise<StoredFile[]> {
  try {
    return await tx("readonly", (s) =>
      s.index("byNotebook").getAll(IDBKeyRange.only(notebookId)) as IDBRequest<StoredFile[]>,
    );
  } catch {
    return [];
  }
}

/** Store a file. Returns false when browser storage refused it, so the caller
 *  can say "added for this session only". */
export async function putStoredFile(file: StoredFile): Promise<boolean> {
  try {
    await tx("readwrite", (s) => s.put(file));
    return true;
  } catch {
    return false;
  }
}

export async function deleteStoredFile(notebookId: string, name: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete([notebookId, name]));
  } catch {
    /* nothing stored, nothing to remove */
  }
}
