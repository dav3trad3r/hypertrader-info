// A bskts account (a contract on Robinhood Chain) trades perps from a separate
// Hyperliquid account: its owner's wallet. Nothing on Hyperliquid points back to
// the bskts account, but every transfer to perps does. bskts sends dollars to
// Hyperliquid as an Across deposit from the bskts account (the depositor) to
// Across's HyperCore handler on HyperEVM, with the Hyperliquid address to credit
// in the message (bskts src/lib/perps/transfer.ts, 2026-10-02):
//
//   message = flag byte (01 = open a new account, 00 otherwise)
//           | the Hyperliquid address as a 32-byte word
//           | a zero word
//
// So the newest such deposit names the account's perps wallet. All public data;
// no bskts API involved.

export const RH_RPC = 'https://rpc.mainnet.chain.robinhood.com';
/** Across's SpokePool on Robinhood Chain, where a bskts account deposits. */
export const RH_SPOKE_POOL = '0xd29c85f15df544ba632c9e25829fd29d767d7978';
/** Across's handler on HyperEVM that credits a HyperCore perps balance. */
export const HYPERCORE_HANDLER = '0xbfb53e9c8acce6d6ac54885a8e33a7aec95427d5';
export const HYPEREVM_CHAIN_ID = 999;

/** keccak256 of FundsDeposited(bytes32,bytes32,uint256,uint256,uint256,uint256,uint32,uint32,uint32,bytes32,bytes32,bytes32,bytes) */
export const FUNDS_DEPOSITED_TOPIC = '0x32ed1a409ef04c7b0227189c3a103dc5ac10e775a15b785dcc510201f7c25ad3';

/** bskts perps transfers began 2026-10-02 (first one at block 78,039,284); nothing before can match. */
export const BSKTS_PERPS_FROM_BLOCK = 77_500_000;
/** The public RPC refuses a log query wider than 10,000,000 blocks. */
const WINDOW = 9_999_000;

const word = (hex: string) => '0x' + hex.toLowerCase().replace(/^0x/, '').padStart(64, '0');

/** The Hyperliquid address in a HyperCore-handler message, or null if the
 *  message is not that shape. */
export function decodeHandlerMessage(message: string): string | null {
  const m = /^0x(0[01])([0-9a-fA-F]{64})([0-9a-fA-F]{64})?$/.exec(message);
  if (!m) return null;
  const w = m[2].toLowerCase();
  if (!/^0{24}/.test(w)) return null; // an address word is left-padded with zeros
  const addr = '0x' + w.slice(24);
  return /^0x0{40}$/.test(addr) ? null : addr;
}

interface RpcLog {
  blockNumber: string;
  data: string;
  topics: string[];
  transactionHash: string;
}

/** Recipient (bytes32) and message (bytes) out of a FundsDeposited log's data.
 *  Non-indexed fields, in order: inputToken, outputToken, inputAmount,
 *  outputAmount, quoteTimestamp, fillDeadline, exclusivityDeadline, recipient,
 *  exclusiveRelayer, then the offset of `message`. */
export function decodeDepositLog(log: Pick<RpcLog, 'data'>): { recipient: string; message: string } | null {
  const d = log.data.replace(/^0x/, '');
  const at = (i: number) => d.slice(i * 64, (i + 1) * 64);
  if (d.length < 10 * 64) return null;
  const recipient = '0x' + at(7).slice(24);
  const offset = parseInt(at(9), 16) * 2;
  const len = parseInt(d.slice(offset, offset + 64), 16) * 2;
  if (!Number.isFinite(len)) return null;
  const message = '0x' + d.slice(offset + 64, offset + 64 + len);
  return { recipient, message };
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function rpc<T>(method: string, params: unknown[], fetcher: Fetcher, signal?: AbortSignal): Promise<T> {
  const res = await fetcher(RH_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(`Robinhood Chain ${method}: ${j.error.message}`);
  return j.result as T;
}

export interface BsktsPerpsLink {
  /** the bskts account that was searched (Robinhood Chain contract) */
  account: string;
  /** the Hyperliquid account it funds */
  perpsAccount: string;
  /** the transfer the link was read from */
  txHash: string;
}

/** If `address` is a bskts account that has moved money to perps, the
 *  Hyperliquid account it funds. Null for plain wallets (one cheap code check)
 *  and for accounts that never transferred. */
export async function resolveBsktsPerpsAccount(
  address: string,
  signal?: AbortSignal,
  fetcher: Fetcher = fetch,
): Promise<BsktsPerpsLink | null> {
  const a = address.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;

  const code = await rpc<string>('eth_getCode', [a, 'latest'], fetcher, signal);
  if (!code || code === '0x') return null; // a wallet, not an account contract

  const head = parseInt(await rpc<string>('eth_blockNumber', [], fetcher, signal), 16);
  // Newest window first: the latest transfer names the current perps wallet.
  for (let to = head; to >= BSKTS_PERPS_FROM_BLOCK; to -= WINDOW + 1) {
    const from = Math.max(BSKTS_PERPS_FROM_BLOCK, to - WINDOW);
    const logs = await rpc<RpcLog[]>(
      'eth_getLogs',
      [{
        address: RH_SPOKE_POOL,
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + to.toString(16),
        topics: [FUNDS_DEPOSITED_TOPIC, word(HYPEREVM_CHAIN_ID.toString(16)), null, word(a)],
      }],
      fetcher,
      signal,
    );
    for (const log of [...logs].reverse()) {
      const dep = decodeDepositLog(log);
      if (!dep || dep.recipient !== HYPERCORE_HANDLER) continue;
      const perps = decodeHandlerMessage(dep.message);
      if (perps) return { account: a, perpsAccount: perps, txHash: log.transactionHash };
    }
  }
  return null;
}
