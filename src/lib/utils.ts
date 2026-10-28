import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency values with proper abbreviations ($5.45M, $2.50K)
 * @param value - The numeric value to format
 * @param includeDollarSign - Whether to include $ prefix (default: true)
 * @param includeSign - Whether to include +/- sign for positive/negative values (default: false)
 */
export function formatCurrency(value: number, includeDollarSign = true, includeSign = false): string {
  const absValue = Math.abs(value);
  // The minus goes before the $ (-$12.50, not $-12.50); amounts that round to $0.00 get none
  const sign = value < 0 && absValue >= 0.005 ? '-' : includeSign && value >= 0 ? '+' : '';
  const prefix = includeDollarSign ? '$' : '';

  if (absValue >= 1000000000) {
    return `${sign}${prefix}${(absValue / 1000000000).toFixed(2)}B`;
  }
  if (absValue >= 1000000) {
    return `${sign}${prefix}${(absValue / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}${prefix}${(absValue / 1000).toFixed(2)}K`;
  }
  return `${sign}${prefix}${absValue.toFixed(2)}`;
}

/**
 * Format volume values (similar to currency but can have different precision)
 */
export function formatVolume(value: number): string {
  if (value >= 1000000000) {
    return `$${(value / 1000000000).toFixed(2)}B`;
  }
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Format size/quantity values without currency symbol
 */
export function formatSize(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${(value / 1000).toFixed(2)}K`;
  }
  return value.toFixed(4);
}

/**
 * Short currency for tight spaces (calendar cells on phones): no cents above $10,
 * K/M above a thousand. "+$190", "-$1.3K", "+$4.2".
 */
export function formatCompactUsd(value: number, includeSign = true): string {
  const abs = Math.abs(value);
  const sign = value < 0 && abs >= 0.05 ? '-' : includeSign && value > 0 ? '+' : '';
  let body: string;
  if (abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (abs >= 1_000) body = `${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  else if (abs >= 10) body = Math.round(abs).toString();
  else body = abs.toFixed(1);
  return `${sign}$${body}`;
}
