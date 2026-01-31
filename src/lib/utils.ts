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
  const sign = includeSign ? (value >= 0 ? '+' : '') : '';
  const prefix = includeDollarSign ? '$' : '';
  
  if (absValue >= 1000000000) {
    return `${sign}${prefix}${(value / 1000000000).toFixed(2)}B`;
  }
  if (absValue >= 1000000) {
    return `${sign}${prefix}${(value / 1000000).toFixed(2)}M`;
  }
  if (absValue >= 1000) {
    return `${sign}${prefix}${(value / 1000).toFixed(2)}K`;
  }
  return `${sign}${prefix}${value.toFixed(2)}`;
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
