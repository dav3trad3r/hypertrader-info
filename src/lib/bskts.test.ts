import { describe, it, expect } from 'vitest';
import { bsktsBasketCounts, bsktsCoins, isBsktsFill, parseBsktsCloid } from './bskts';
import type { Fill } from './hyperliquid';

const fill = (over: Partial<Fill>): Fill => ({
  closedPnl: '0',
  coin: 'xyz:NVDA',
  crossed: true,
  dir: 'Open Long',
  hash: '0x0',
  oid: 1,
  px: '100',
  side: 'B',
  startPosition: '0',
  sz: '1',
  time: 0,
  fee: '0',
  feeToken: 'USDC',
  tid: 1,
  ...over,
});

// A real one from the account ending ab82: basket 0x16 = 22 (CIRCUIT), kind 01, leg 01.
const REAL = '0xb5160156f32897a2ee16104809d23101';

describe('parseBsktsCloid', () => {
  it('decodes a real bskts cloid', () => {
    expect(parseBsktsCloid(REAL)).toEqual({
      basketId: 22,
      ticker: 'CIRCUIT',
      kind: 'open',
      orderId: 'b5160156f32897a2ee16104809d231',
      leg: 1,
    });
  });

  it('reads every kind and is case-insensitive', () => {
    const r = '0'.repeat(24);
    expect(parseBsktsCloid(`0xb50402${r}00`)?.kind).toBe('close');
    expect(parseBsktsCloid(`0xb50403${r}00`)?.kind).toBe('tp');
    expect(parseBsktsCloid(`0xb50404${r}00`)?.kind).toBe('sl');
    expect(parseBsktsCloid(`0xB50401${r}0A`)).toMatchObject({ ticker: 'FRONTIER', kind: 'open', leg: 10 });
  });

  it('labels unknown basket ids rather than rejecting them', () => {
    expect(parseBsktsCloid(`0xb5ff01${'0'.repeat(24)}00`)).toMatchObject({ basketId: 255, ticker: '#255' });
  });

  it('rejects anything that is not a bskts id', () => {
    expect(parseBsktsCloid(undefined)).toBeUndefined();
    expect(parseBsktsCloid(null)).toBeUndefined();
    expect(parseBsktsCloid('')).toBeUndefined();
    expect(parseBsktsCloid('0xb5')).toBeUndefined();
    expect(parseBsktsCloid(`0xa50401${'0'.repeat(24)}00`)).toBeUndefined(); // wrong tag
    expect(parseBsktsCloid(`0xb50405${'0'.repeat(24)}00`)).toBeUndefined(); // kind 05 does not exist
    expect(parseBsktsCloid(`0xb50401${'0'.repeat(24)}0`)).toBeUndefined(); // short
    expect(parseBsktsCloid('0x00000000000000000000000000000001')).toBeUndefined(); // someone else's cloid
  });
});

describe('isBsktsFill / bsktsCoins / bsktsBasketCounts', () => {
  const fills = [
    fill({ cloid: REAL, coin: 'xyz:COPPER' }),
    fill({ cloid: `0xb50201${'0'.repeat(24)}00`, coin: 'xyz:NVDA' }),
    fill({ cloid: `0xb50202${'1'.repeat(24)}00`, coin: 'xyz:NVDA' }),
    fill({ cloid: undefined, coin: 'BTC' }),
    fill({ cloid: '0x1234', coin: 'ETH' }),
  ];

  it('separates bskts fills from the rest of the account', () => {
    expect(fills.filter(isBsktsFill)).toHaveLength(3);
  });

  it('collects the coins bskts traded and counts fills per basket', () => {
    expect([...bsktsCoins(fills)].sort()).toEqual(['xyz:COPPER', 'xyz:NVDA']);
    expect(bsktsBasketCounts(fills)).toEqual([
      { ticker: 'MAG6', fills: 2 },
      { ticker: 'CIRCUIT', fills: 1 },
    ]);
  });
});
