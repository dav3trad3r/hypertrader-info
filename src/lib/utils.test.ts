import { describe, it, expect } from 'vitest';
import { formatCurrency } from './utils';

describe('formatCurrency', () => {
  it('puts the minus before the dollar sign', () => {
    expect(formatCurrency(-127.49)).toBe('-$127.49');
    expect(formatCurrency(-1234.5)).toBe('-$1.23K');
    expect(formatCurrency(-2_500_000)).toBe('-$2.50M');
  });

  it('formats positives, with + only when asked', () => {
    expect(formatCurrency(714.7)).toBe('$714.70');
    expect(formatCurrency(3341.43, true, true)).toBe('+$3.34K');
    expect(formatCurrency(-5, false)).toBe('-5.00');
  });

  it('shows no minus for amounts that round to zero', () => {
    expect(formatCurrency(-0.001)).toBe('$0.00');
    expect(formatCurrency(0)).toBe('$0.00');
  });
});
