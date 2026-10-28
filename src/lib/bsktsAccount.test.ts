import { describe, it, expect, vi } from 'vitest';
import {
  FUNDS_DEPOSITED_TOPIC,
  HYPERCORE_HANDLER,
  decodeDepositLog,
  decodeHandlerMessage,
  resolveBsktsPerpsAccount,
} from './bsktsAccount';

// The owner's real transfers from bskts account …8e47 (Robinhood Chain).
const ACCOUNT = '0x0665bf88f4e364748ec346ba90595f7d1e8f8e47';
const PERPS = '0x87b19d1ca2013a02a0c02146a61901fab35eab82';
const MSG_FIRST = '0x0100000000000000000000000087b19d1ca2013a02a0c02146a61901fab35eab820000000000000000000000000000000000000000000000000000000000000000';
const MSG_LATER = '0x0000000000000000000000000087b19d1ca2013a02a0c02146a61901fab35eab820000000000000000000000000000000000000000000000000000000000000000';

const w = (hex: string) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');

/** Data of a FundsDeposited log: 9 static words, the message offset, then the message. */
function depositData(recipient: string, message: string): string {
  const msg = message.replace(/^0x/, '');
  const words = [
    w('0x01'), w('0x02'), w('0x0a'), w('0x0b'), w('0x01'), w('0x02'), w('0x03'),
    w(recipient), w('0x00'),
    w((10 * 32).toString(16)), // offset of `message`
    w((msg.length / 2).toString(16)),
    msg.padEnd(Math.ceil(msg.length / 64) * 64, '0'),
  ];
  return '0x' + words.join('');
}

describe('decodeHandlerMessage', () => {
  it('reads the Hyperliquid address from both message forms', () => {
    expect(decodeHandlerMessage(MSG_FIRST)).toBe(PERPS);
    expect(decodeHandlerMessage(MSG_LATER)).toBe(PERPS);
  });

  it('rejects anything else', () => {
    expect(decodeHandlerMessage('0x')).toBeNull();
    expect(decodeHandlerMessage('0x02' + MSG_LATER.slice(4))).toBeNull(); // unknown flag
    expect(decodeHandlerMessage('0x00' + 'f'.repeat(64))).toBeNull(); // not an address word
    expect(decodeHandlerMessage('0x00' + '0'.repeat(128))).toBeNull(); // zero address
  });
});

describe('decodeDepositLog', () => {
  it('pulls the recipient and message out of the log data', () => {
    expect(decodeDepositLog({ data: depositData(HYPERCORE_HANDLER, MSG_LATER) })).toEqual({
      recipient: HYPERCORE_HANDLER,
      message: MSG_LATER,
    });
  });
});

describe('resolveBsktsPerpsAccount', () => {
  type Req = { method: string; params: unknown[] };
  const make = (handlers: Record<string, (p: unknown[]) => unknown>) =>
    vi.fn(async (_url: string, init?: RequestInit) => {
      const req = JSON.parse(String(init?.body)) as Req;
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: handlers[req.method](req.params) }));
    });

  it('returns null for a plain wallet after one code check', async () => {
    const fetcher = make({ eth_getCode: () => '0x' });
    expect(await resolveBsktsPerpsAccount(PERPS, undefined, fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('links a bskts account to the Hyperliquid account its newest transfer credits', async () => {
    const queries: Array<{ fromBlock: string; toBlock: string; topics: unknown[] }> = [];
    const fetcher = make({
      eth_getCode: () => '0x6080',
      eth_blockNumber: () => '0x' + (88_000_000).toString(16),
      eth_getLogs: p => {
        const q = p[0] as { fromBlock: string; toBlock: string; topics: unknown[] };
        queries.push(q);
        return [
          { blockNumber: '0x1', transactionHash: '0xold', topics: [FUNDS_DEPOSITED_TOPIC], data: depositData(HYPERCORE_HANDLER, MSG_FIRST) },
          // a deposit somewhere else (not the HyperCore handler) is ignored
          { blockNumber: '0x2', transactionHash: '0xother', topics: [FUNDS_DEPOSITED_TOPIC], data: depositData('0x1111111111111111111111111111111111111111', MSG_LATER) },
          { blockNumber: '0x3', transactionHash: '0xnew', topics: [FUNDS_DEPOSITED_TOPIC], data: depositData(HYPERCORE_HANDLER, MSG_LATER) },
        ].filter(() => queries.length === 1);
      },
    });
    const link = await resolveBsktsPerpsAccount(ACCOUNT.toUpperCase().replace('0X', '0x'), undefined, fetcher as unknown as typeof fetch);
    expect(link).toEqual({ account: ACCOUNT, perpsAccount: PERPS, txHash: '0xnew' });
    // filtered by depositor and destination, newest window first, within the RPC's 10M-block cap
    expect(queries[0].topics[3]).toBe('0x' + ACCOUNT.slice(2).padStart(64, '0'));
    expect(queries[0].topics[1]).toBe('0x' + (999).toString(16).padStart(64, '0'));
    expect(parseInt(queries[0].toBlock, 16)).toBe(88_000_000);
    expect(parseInt(queries[0].toBlock, 16) - parseInt(queries[0].fromBlock, 16)).toBeLessThan(10_000_000);
  });

  it('returns null for an account contract that never transferred', async () => {
    const fetcher = make({
      eth_getCode: () => '0x6080',
      eth_blockNumber: () => '0x' + (88_000_000).toString(16),
      eth_getLogs: () => [],
    });
    expect(await resolveBsktsPerpsAccount(ACCOUNT, undefined, fetcher as unknown as typeof fetch)).toBeNull();
    // 88.0M down to the 77.5M floor is two windows
    expect(fetcher.mock.calls.filter(c => String(c[1]?.body).includes('eth_getLogs'))).toHaveLength(2);
  });
});

describe('resolveBsktsPerpsAccount retries', () => {
  it('retries a call that fails the way a doubled CORS header does', async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new TypeError('Failed to fetch');
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' }));
    });
    expect(await resolveBsktsPerpsAccount(PERPS, undefined, fetcher as unknown as typeof fetch)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
