// useConfirm — a promise-based replacement for window.confirm() that renders
// the designed ConfirmDialog. Call `confirm({...})` in an async handler and
// await the boolean; render `dialog` somewhere in the component tree.
//
//   const { confirm, dialog } = useConfirm();
//   async function onDelete() {
//     if (!(await confirm({ title: "Delete?", confirmLabel: "Delete" }))) return;
//     …
//   }
//   return (<>… {dialog}</>);
//
// While a confirm is resolving you can flip it into a loading state by passing
// an async `onConfirm` via confirmAsync (keeps the spinner on the button until
// the work finishes). For the common case, plain `confirm` is enough.

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog.js";

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface DialogState extends ConfirmOptions {
  loading: boolean;
  /** Notice mode: a single acknowledge button, no cancel. */
  notice?: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<DialogState | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const runner = useRef<(() => Promise<void>) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    runner.current = null;
    setState({ ...opts, loading: false });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // A one-button notice — the designed replacement for window.alert(). Resolves
  // when acknowledged so callers can `await notify(...)` before continuing.
  const notify = useCallback((opts: ConfirmOptions): Promise<void> => {
    runner.current = null;
    setState({
      danger: false,
      confirmLabel: "OK",
      ...opts,
      notice: true,
      loading: false,
    });
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve();
    });
  }, []);

  // Variant that keeps the dialog open with a spinner while `onConfirm` runs,
  // then closes it. Rejects/closes on error so the caller can surface it.
  const confirmAsync = useCallback(
    (opts: ConfirmOptions & { onConfirm: () => Promise<void> }): void => {
      runner.current = opts.onConfirm;
      setState({ ...opts, loading: false });
    },
    [],
  );

  const handleCancel = useCallback(() => {
    resolver.current?.(false);
    resolver.current = null;
    runner.current = null;
    setState(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (runner.current) {
      const run = runner.current;
      setState((s) => (s ? { ...s, loading: true } : s));
      try {
        await run();
      } finally {
        runner.current = null;
        setState(null);
      }
      return;
    }
    resolver.current?.(true);
    resolver.current = null;
    setState(null);
  }, []);

  const dialog = state ? (
    <ConfirmDialog
      title={state.title}
      body={state.body}
      confirmLabel={state.confirmLabel}
      cancelLabel={state.cancelLabel}
      danger={state.danger}
      notice={state.notice}
      loading={state.loading}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirm, confirmAsync, notify, dialog };
}
