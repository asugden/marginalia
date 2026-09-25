// Files panel: the student's own datasets, and anything their code writes.
//
// Uploaded files go straight into the Python runtime's working directory and
// into this browser's storage. They are never sent to the server — the panel
// says so, because "where did my data go?" deserves a plain answer.

import { useCallback, useEffect, useRef, useState } from "react";
import { IconButton } from "../../../components/index.js";
import { DownloadIcon, TrashIcon, UploadIcon } from "../../../icons.js";
import type { Kernel, KernelStatus } from "../kernel/kernel.js";
import type { FileInfo } from "../kernel/protocol.js";
import {
  deleteStoredFile,
  listStoredFiles,
  MAX_FILE_BYTES,
  putStoredFile,
} from "../kernel/files.js";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FilesPanel({
  kernel,
  kernelStatus,
  storageKey,
  refreshSignal,
  persist = true,
}: {
  kernel: Kernel | null;
  kernelStatus: KernelStatus;
  /** IndexedDB namespace: the notebook id, or a starter key. */
  storageKey: string;
  /** Bumped after each run so files a cell wrote appear. */
  refreshSignal: number;
  /** False for a throwaway session (the instructor's scratch copy): files
   *  live in Python's memory only and are gone on reload. */
  persist?: boolean;
}) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [stored, setStored] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ready = kernel !== null && (kernelStatus === "idle" || kernelStatus === "busy");

  const refresh = useCallback(async () => {
    const saved = persist ? await listStoredFiles(storageKey) : [];
    setStored(new Set(saved.map((f) => f.name)));
    if (kernel && ready) setFiles(await kernel.listFiles());
  }, [kernel, ready, storageKey, persist]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshSignal]);

  async function addFiles(list: FileList | File[]) {
    if (!kernel) return;
    setError(null);
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}, the limit for a browser notebook.`);
        continue;
      }
      const data = await file.arrayBuffer();
      try {
        await kernel.writeFile(file.name, data);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Couldn't add ${file.name}`);
        continue;
      }
      if (!persist) continue;
      const kept = await putStoredFile({
        notebookId: storageKey,
        name: file.name,
        size: file.size,
        addedAt: Date.now(),
        data,
      });
      if (!kept) {
        setError(
          `${file.name} was added for this session only: this browser wouldn't store it. You'll need to add it again after reloading.`,
        );
      }
    }
    await refresh();
  }

  async function remove(name: string) {
    if (!kernel) return;
    await kernel.deleteFile(name);
    if (persist) await deleteStoredFile(storageKey, name);
    await refresh();
  }

  async function download(name: string) {
    if (!kernel) return;
    try {
      const data = await kernel.readFile(name);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    }
  }

  return (
    <div
      className={`code-files${dragging ? " is-dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
      }}
    >
      <div className="code-side__head">
        <span className="code-side__title">Files</span>
        <button
          type="button"
          className="code-files__add"
          onClick={() => input.current?.click()}
          disabled={!ready}
        >
          <UploadIcon size={14} /> Add files
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <p className="code-files__note">
        {persist
          ? "Files stay in this browser. They are not uploaded to the course. "
          : "The student's own files aren't included: they never left their browser. Add a copy here to reproduce a problem; it's gone when you close this page. "}
        Read them by name, for example <code>pd.read_csv("data.csv")</code>.
      </p>
      {error && <p className="code-files__error">{error}</p>}
      {!ready ? (
        <p className="code-files__empty">Files appear once Python has started.</p>
      ) : files.length === 0 ? (
        <p className="code-files__empty">No files yet. Drop a CSV here, or use Add files.</p>
      ) : (
        <ul className="code-files__list">
          {files.map((f) => (
            <li key={f.name} className="code-files__row">
              <span className="code-files__name" title={f.name}>
                {f.name}
              </span>
              <span className="code-files__meta">
                {formatBytes(f.size)}
                {stored.has(f.name) ? "" : " · this session"}
              </span>
              <IconButton size="sm" title={`Download ${f.name}`} onClick={() => void download(f.name)}>
                <DownloadIcon size={14} />
              </IconButton>
              <IconButton size="sm" title={`Remove ${f.name}`} onClick={() => void remove(f.name)}>
                <TrashIcon size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
