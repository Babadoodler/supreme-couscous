import { describe, expect, it } from 'vitest';
import { History } from '../../src/lib/store/history';

describe('History', () => {
  it('starts empty', () => {
    const h = new History<number>();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo(0)).toBeNull();
    expect(h.redo(0)).toBeNull();
  });

  it('undoes and redoes through a chain of states', () => {
    const h = new History<number>();
    // state evolves 1 → 2 → 3; push records pre-mutation state
    h.push(1);
    h.push(2);
    let current = 3;
    current = h.undo(current)!; // back to 2
    expect(current).toBe(2);
    current = h.undo(current)!; // back to 1
    expect(current).toBe(1);
    expect(h.canUndo).toBe(false);
    current = h.redo(current)!; // forward to 2
    expect(current).toBe(2);
    current = h.redo(current)!; // forward to 3
    expect(current).toBe(3);
    expect(h.canRedo).toBe(false);
  });

  it('a new push clears the redo stack', () => {
    const h = new History<number>();
    h.push(1);
    let current = 2;
    current = h.undo(current)!;
    expect(h.canRedo).toBe(true);
    h.push(current); // new divergent mutation
    expect(h.canRedo).toBe(false);
  });

  it('caps the stack at the limit, dropping oldest', () => {
    const h = new History<number>(50);
    for (let i = 0; i < 60; i++) h.push(i);
    let current = 60;
    let undos = 0;
    for (;;) {
      const prev = h.undo(current);
      if (prev === null) break;
      current = prev;
      undos++;
    }
    expect(undos).toBe(50);
    expect(current).toBe(10); // 0–9 were dropped
  });

  it('holds at least 50 steps per the design requirement', () => {
    const h = new History<number>();
    for (let i = 0; i < 50; i++) h.push(i);
    expect(h.canUndo).toBe(true);
    let count = 0;
    let cur = 50;
    while (h.canUndo) {
      cur = h.undo(cur)!;
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(50);
  });

  it('clear() empties both stacks', () => {
    const h = new History<number>();
    h.push(1);
    h.undo(2);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});
