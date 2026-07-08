// Session-scoped undo/redo (DESIGN.md §7.6): immutable snapshots, ≥50 steps,
// not persisted. Pure module.

export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly limit = 50) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Record the state as it was BEFORE a mutation. Clears the redo stack. */
  push(snapshot: T): void {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** Returns the state to restore, or null if nothing to undo. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  /** Returns the state to restore, or null if nothing to redo. */
  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
