import { add } from './calculator';
import { describe, it, expect } from 'vitest';

describe('Calculator Function', () => {
  it('should correctly add two positive numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
