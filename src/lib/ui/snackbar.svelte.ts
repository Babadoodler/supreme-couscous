// Global snackbar state (Svelte 5 runes module).
// Destructive actions use snackbar-undo, not confirm dialogs (DESIGN.md §11).

export interface Snack {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
}

let nextId = 1;

export const snackbar = $state<{ current: Snack | null }>({ current: null });

let timer: ReturnType<typeof setTimeout> | undefined;

export function showSnack(
  message: string,
  options: { actionLabel?: string; onAction?: () => void; durationMs?: number } = {}
): void {
  clearTimeout(timer);
  const snack: Snack = {
    id: nextId++,
    message,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
    durationMs: options.durationMs ?? 5000
  };
  snackbar.current = snack;
  timer = setTimeout(() => {
    if (snackbar.current?.id === snack.id) snackbar.current = null;
  }, snack.durationMs);
}

export function dismissSnack(): void {
  clearTimeout(timer);
  snackbar.current = null;
}
