import { createPublicClient, http, isAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { normalize } from 'viem/ens';

// Create a public client for ENS resolution (uses Ethereum mainnet)
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
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
  
  // Check cache first
  if (addressCache.has(normalizedName)) {
    return addressCache.get(normalizedName) ?? null;
  }
  
  try {
    const normalizedENS = normalize(normalizedName);
    const address = await publicClient.getEnsAddress({
      name: normalizedENS,
    });
    
    // Cache the result
    addressCache.set(normalizedName, address);
    
    return address;
  } catch (error) {
    console.error('ENS resolution failed:', error);
    addressCache.set(normalizedName, null);
    return null;
  }
}

/**
 * Resolve an Ethereum address to its primary ENS name (reverse lookup)
 * Returns null if no ENS name is set
 */
export async function resolveAddressToENS(address: string): Promise<string | null> {
  const normalizedAddress = address.toLowerCase();
  
  // Check cache first
  if (ensCache.has(normalizedAddress)) {
    return ensCache.get(normalizedAddress) ?? null;
  }
  
  try {
    const ensName = await publicClient.getEnsName({
      address: address as `0x${string}`,
    });
    
    // Cache the result
    ensCache.set(normalizedAddress, ensName);
    
    return ensName;
  } catch (error) {
    console.error('ENS reverse lookup failed:', error);
    ensCache.set(normalizedAddress, null);
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
  
  // If it's an ENS name, resolve to address
  if (isENSName(trimmed)) {
    const address = await resolveENSName(trimmed);
    return {
      address,
      ensName: address ? trimmed : null,
    };
  }
  
  // If it's a valid address, try reverse lookup for ENS name
  if (isAddress(trimmed)) {
    const ensName = await resolveAddressToENS(trimmed);
    return {
      address: trimmed,
      ensName,
    };
  }
  
  return { address: null, ensName: null };
}
