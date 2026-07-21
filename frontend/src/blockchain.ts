import { Contract, type Provider } from 'ethers';
import DocumentRegistryArtifact from './contracts/DocumentRegistry.json';
import DocumentRegistryFactoryArtifact from './contracts/DocumentRegistryFactory.json';

export const registryAbi = DocumentRegistryArtifact.abi;
export const registryBytecode = DocumentRegistryArtifact.bytecode;
export const factoryAbi = DocumentRegistryFactoryArtifact.abi;
export const factoryBytecode = DocumentRegistryFactoryArtifact.bytecode;

export type ConnectionMode = 'metamask' | 'rpc';

export interface NetworkSettings {
  connectionMode: ConnectionMode;
  rpcUrl: string;
  nativeSymbol: string;
  explorerUrl: string;
  factoryAddress: string;
  scanFromBlock: number;
}

export interface RegistrySummary {
  address: string;
  creator: string;
  owner: string;
  name: string;
  metadataURI: string;
  createdAt: number;
  documentCount: number;
}

export interface RegistryEntry {
  hash: string;
  uploader: string;
  metadataURI: string;
  timestamp: number;
  blockNumber: number;
  transactionHash: string;
  active: boolean;
  registryAddress: string;
  registryName: string;
}

export const DEFAULT_SETTINGS: NetworkSettings = {
  connectionMode: 'rpc',
  rpcUrl: 'http://127.0.0.1:8545',
  nativeSymbol: 'ETH',
  explorerUrl: '',
  factoryAddress: '',
  scanFromBlock: 0,
};

export const SETTINGS_KEY = 'docregistry_network_settings_v2';

export const loadSettings = (): NetworkSettings => {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: NetworkSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const shortAddress = (value?: string | null) =>
  value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected';

export const formatNativeBalance = (formatted: string) => {
  const [whole, decimal = ''] = formatted.split('.');
  if (whole !== '0') return decimal ? `${whole}.${decimal.slice(0, 5)}` : whole;
  const firstSignificant = decimal.search(/[1-9]/);
  if (firstSignificant < 0) return '0';
  return `0.${decimal.slice(0, Math.min(decimal.length, firstSignificant + 5))}`;
};

export const explorerLink = (base: string, kind: 'address' | 'tx', value: string) =>
  base ? `${base.replace(/\/$/, '')}/${kind}/${value}` : '';

type OrderedEvent = {
  kind: 'registered' | 'revoked';
  blockNumber: number;
  index: number;
  hash: string;
  uploader?: string;
  timestamp?: number;
  transactionHash: string;
};

export async function loadRegistryEntries(
  provider: Provider,
  registryAddress: string,
  registryName: string,
  fromBlock: number,
  uploader?: string,
): Promise<RegistryEntry[]> {
  const contract = new Contract(registryAddress, registryAbi, provider);
  const registrationFilter = contract.filters.DocumentRegistered(null, uploader ?? null);
  const revocationFilter = contract.filters.DocumentRevoked();
  const [registrations, revocations] = await Promise.all([
    contract.queryFilter(registrationFilter, fromBlock, 'latest'),
    contract.queryFilter(revocationFilter, fromBlock, 'latest'),
  ]);

  const ordered: OrderedEvent[] = [];
  for (const event of registrations) {
    if (!('args' in event) || !event.args) continue;
    ordered.push({
      kind: 'registered',
      hash: event.args[0] as string,
      uploader: event.args[1] as string,
      timestamp: Number(event.args[2]),
      blockNumber: event.blockNumber,
      index: event.index,
      transactionHash: event.transactionHash,
    });
  }
  for (const event of revocations) {
    if (!('args' in event) || !event.args) continue;
    ordered.push({
      kind: 'revoked',
      hash: event.args[0] as string,
      blockNumber: event.blockNumber,
      index: event.index,
      transactionHash: event.transactionHash,
    });
  }
  ordered.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  const state = new Map<string, RegistryEntry>();
  for (const event of ordered) {
    const key = event.hash.toLowerCase();
    if (event.kind === 'registered') {
      state.set(key, {
        hash: event.hash,
        uploader: event.uploader!,
        metadataURI: '',
        timestamp: event.timestamp!,
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        active: true,
        registryAddress,
        registryName,
      });
    } else {
      const previous = state.get(key);
      if (previous) state.set(key, { ...previous, active: false });
    }
  }

  const entries = [...state.values()];
  await Promise.all(entries.filter((entry) => entry.active).map(async (entry) => {
    try {
      const document = await contract.getDocument(entry.hash);
      entry.metadataURI = document[1] as string;
    } catch {
      entry.active = false;
    }
  }));
  return entries.sort((a, b) => b.blockNumber - a.blockNumber);
}

export async function loadRegistryCatalog(
  provider: Provider,
  factoryAddress: string,
): Promise<RegistrySummary[]> {
  if (!factoryAddress) return [];
  const factory = new Contract(factoryAddress, factoryAbi, provider);
  const code = await provider.getCode(factoryAddress);
  if (code === '0x') throw new Error('No registry factory exists at the configured address.');
  const count = Number(await factory.registryCount());
  const raw = await factory.getRegistries(0, count);
  return Promise.all(raw.map(async (item: any) => {
    const registry = new Contract(item.registry, registryAbi, provider);
    const [owner, documentCount] = await Promise.all([registry.owner(), registry.documentCount()]);
    return {
      address: item.registry,
      creator: item.creator,
      owner,
      name: item.name,
      metadataURI: item.metadataURI,
      createdAt: Number(item.createdAt),
      documentCount: Number(documentCount),
    };
  }));
}
