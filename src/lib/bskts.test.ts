import { describe, it, expect } from 'vitest';
import { bsktsBasketCounts, bsktsCoins, isBsktsFill, parseBsktsCloid } from './bskts';
import type { Fill } from './hyperliquid';
import { applyBasketFill, basketSymbols, bsktsLogoUrl, coinSymbol, isBasketOpen, reduceBsktsFills, valueBasket, type BasketLeg } from './bskts';

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


const leg = (): BasketLeg => ({ coin: 'xyz:NVDA', size: 0, entryPx: 0, entryFeeUsd: 0, tradedUsd: 0 });
const MAG6 = (kind: '01' | '02', rnd: string, legIdx = 0) => `0xb502${kind}${rnd.padEnd(24, '0')}${legIdx.toString(16).padStart(2, '0')}`;

describe('applyBasketFill', () => {
  it('averages cost on adds and realises on closes', () => {
    const l = leg();
    expect(applyBasketFill(l, { isBuy: true, size: 1, px: 100, feeUsd: 0.1 })).toBe(0);
    expect(applyBasketFill(l, { isBuy: true, size: 1, px: 120, feeUsd: 0.1 })).toBe(0);
    expect(l.size).toBe(2);
    expect(l.entryPx).toBeCloseTo(110);
    expect(l.entryFeeUsd).toBeCloseTo(0.2);
    // close half at 130: +20 realised, half the entry fee leaves with it
    expect(applyBasketFill(l, { isBuy: false, size: 1, px: 130, feeUsd: 0.1 })).toBeCloseTo(20);
    expect(l.size).toBe(1);
    expect(l.entryFeeUsd).toBeCloseTo(0.1);
    // close the rest: flat, entry reset
    expect(applyBasketFill(l, { isBuy: false, size: 1, px: 90, feeUsd: 0.1 })).toBeCloseTo(-20);
    expect(l.size).toBe(0);
    expect(l.entryPx).toBe(0);
  });

  it('flips through zero: the remainder opens at the fill price', () => {
    const l = leg();
    applyBasketFill(l, { isBuy: true, size: 1, px: 100, feeUsd: 0 });
    expect(applyBasketFill(l, { isBuy: false, size: 3, px: 110, feeUsd: 0.3 })).toBeCloseTo(10);
    expect(l.size).toBe(-2);
    expect(l.entryPx).toBe(110);
    expect(l.entryFeeUsd).toBeCloseTo(0.2);
  });
});

describe('reduceBsktsFills', () => {
  const fills: Fill[] = [
    // MAG6 open: two legs, one order
    fill({ tid: 1, time: 1000, coin: 'xyz:NVDA', side: 'B', sz: '2', px: '100', fee: '0.2', cloid: MAG6('01', 'a', 0) }),
    fill({ tid: 2, time: 1001, coin: 'xyz:TSLA', side: 'B', sz: '1', px: '300', fee: '0.3', cloid: MAG6('01', 'a', 1) }),
    // the user's own NVDA trade on the same account: not bskts
    fill({ tid: 3, time: 1002, coin: 'xyz:NVDA', side: 'A', sz: '5', px: '101', fee: '0.5' }),
    // MAG6 close of the TSLA leg only
    fill({ tid: 4, time: 2000, coin: 'xyz:TSLA', side: 'A', sz: '1', px: '330', fee: '0.33', cloid: MAG6('02', 'b', 1), builderFee: '0.05' }),
    // CIRCUIT open and full close
    fill({ tid: 5, time: 3000, coin: 'xyz:COPPER', side: 'B', sz: '10', px: '6', fee: '0.06', cloid: `0xb51601${'c'.repeat(24)}00` }),
    fill({ tid: 6, time: 4000, coin: 'xyz:COPPER', side: 'A', sz: '10', px: '5', fee: '0.05', cloid: `0xb51602${'d'.repeat(24)}00` }),
  ];

  it('rebuilds each basket from its own fills and ignores the rest', () => {
    const [circuit, mag6] = reduceBsktsFills(fills); // newest activity first
    expect(mag6.ticker).toBe('MAG6');
    expect(mag6.legs['xyz:NVDA'].size).toBe(2); // untouched by the user's own 5-lot sell
    expect(mag6.legs['xyz:TSLA'].size).toBe(0);
    expect(mag6.realizedUsd).toBeCloseTo(30);
    expect(mag6.feesUsd).toBeCloseTo(0.83);
    expect(mag6.builderFeesUsd).toBeCloseTo(0.05);
    expect(mag6.orders).toBe(2);
    expect(mag6.fills).toBe(3);
    expect(mag6.openedAt).toBe(1000);
    expect(isBasketOpen(mag6)).toBe(true);

    expect(circuit.ticker).toBe('CIRCUIT');
    expect(circuit.realizedUsd).toBeCloseTo(-10);
    expect(circuit.openedAt).toBe(0);
    expect(isBasketOpen(circuit)).toBe(false);
  });

  it('orders a basket\'s symbols by what is held, then by what was traded', () => {
    const [, mag6] = reduceBsktsFills(fills);
    expect(basketSymbols(mag6)).toEqual(['xyz:NVDA', 'xyz:TSLA']);
  });

  it('values open legs at the mark and flags missing marks', () => {
    const [, mag6] = reduceBsktsFills(fills);
    const v = valueBasket(mag6, new Map([['xyz:NVDA', 110]]));
    expect(v.costUsd).toBeCloseTo(200);
    expect(v.valueUsd).toBeCloseTo(220);
    expect(v.unrealizedUsd).toBeCloseTo(20);
    expect(v.partial).toBe(false);
    expect(valueBasket(mag6, new Map()).partial).toBe(true);
  });
});

describe('logos', () => {
  it('maps coins to bskts logo files', () => {
    expect(coinSymbol('xyz:NVDA')).toBe('NVDA');
    expect(coinSymbol('BTC')).toBe('BTC');
    expect(bsktsLogoUrl('xyz:NVDA')).toBe('https://bskts.xyz/logos/NVDA.svg');
    expect(bsktsLogoUrl('xyz:META')).toBe('https://bskts.xyz/logos/META.png');
  });
});
