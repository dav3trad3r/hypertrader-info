import { createPublicClient, fallback, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

// Ethereum mainnet for ENS. viem's default endpoint for mainnet (eth.merkle.io)
// refuses browser requests (no CORS headers), so every lookup failed and ENS
// names never resolved (checked 2026-10-29: "vitalik.eth" -> "Unable to Load
// Data"). These public endpoints answer browser requests; viem tries them in
// order and moves on when one fails. ENS reverse lookups go through the
// Universal Resolver with CCIP-read, which viem handles over the same transport.
export const ENS_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://1rpc.io/eth',
  'https://cloudflare-eth.com',
];

const publicClient = createPublicClient({
  chain: mainnet,
  transport: fallback(ENS_RPCS.map(url => http(url, { timeout: 8_000, retryCount: 0 }))),
});

// Cache for ENS lookups to avoid repeated RPC calls
const ensCache = new Map<string, string | null>();
const addressCache = new Map<string, string | null>();

/**
 * Check if a string looks like an ENS name
 */
export function isENSName(value: string): boolean {
  return value.endsWith('.eth') && value.length > 4;
}

/**
 * Resolve an ENS name to an Ethereum address
 * Returns null if resolution fails
 */
export async function resolveENSName(name: string): Promise<string | null> {
  const normalizedName = name.toLowerCase().trim();

  if (addressCache.has(normalizedName)) {
    return addressCache.get(normalizedName) ?? null;
  }

  try {
    const address = await publicClient.getEnsAddress({ name: normalize(normalizedName) });
    addressCache.set(normalizedName, address);
    return address;
  } catch (error) {
    console.warn('ENS resolution failed:', error);
    // Not cached: a network blip should not stick for the whole session
    return null;
  }
}

/**
 * Resolve an Ethereum address to its primary ENS name (reverse lookup)
 * Returns null if no ENS name is set
 */
export async function resolveAddressToENS(address: string): Promise<string | null> {
  const normalizedAddress = address.toLowerCase();

  if (ensCache.has(normalizedAddress)) {
    return ensCache.get(normalizedAddress) ?? null;
  }

  try {
    const ensName = await publicClient.getEnsName({ address: address as `0x${string}` });
    ensCache.set(normalizedAddress, ensName);
    return ensName;
  } catch (error) {
    console.warn('ENS reverse lookup failed:', error);
    return null;
  }
}

/**
 * Resolve input - handles both ENS names and addresses
 * Returns the resolved address and optionally the ENS name
 */
export async function resolveInput(input: string): Promise<{
  address: string | null;
  ensName: string | null;
}> {
  const trimmed = input.trim();

  if (isENSName(trimmed)) {
    const address = await resolveENSName(trimmed);
    return { address, ensName: address ? trimmed : null };
  }

  if (isAddress(trimmed)) {
    const ensName = await resolveAddressToENS(trimmed);
    return { address: trimmed, ensName };
  }

  return { address: null, ensName: null };
}
