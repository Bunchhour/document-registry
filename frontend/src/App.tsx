import React, { useEffect, useMemo, useState } from 'react';
import {
  BrowserProvider,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  ethers,
  formatEther,
  isAddress,
  type Provider,
  type Signer,
} from 'ethers';
import {
  Activity, AlertTriangle, ArrowRightLeft, CheckCircle, Clipboard, Compass,
  ExternalLink, FileCheck2, FileText, Gauge, Layers, LogOut, Plus, RefreshCw,
  Search, Settings, Shield, Trash2, Upload, UserRound, WalletCards,
} from 'lucide-react';
import AuthPage from './AuthPage';
import {
  DEFAULT_SETTINGS,
  explorerLink,
  factoryAbi,
  factoryBytecode,
  formatNativeBalance,
  loadRegistryCatalog,
  loadRegistryEntries,
  loadSettings,
  registryAbi,
  registryBytecode,
  saveSettings,
  shortAddress,
  type NetworkSettings,
  type RegistryEntry,
  type RegistrySummary,
} from './blockchain';

const SESSION_KEY = 'docregistry_session';
type Page = 'dashboard' | 'entries' | 'explore' | 'registry' | 'settings';
type ProviderState = JsonRpcProvider | BrowserProvider;

interface AccountState {
  address: string;
  balance: string;
}

interface LookupResult {
  exists: boolean;
  uploader?: string;
  metadataURI?: string;
  timestamp?: number;
}

const errorMessage = (error: unknown, fallback: string) => {
  const value = error as { code?: string | number; shortMessage?: string; reason?: string; message?: string };
  if (value?.code === 4001 || value?.code === 'ACTION_REJECTED') return 'The wallet request was cancelled.';
  if (value?.code === 'INSUFFICIENT_FUNDS') return 'This account does not have enough funds for the network fee.';
  return value?.shortMessage || value?.reason || value?.message || fallback;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const [page, setPage] = useState<Page>('dashboard');
  const [settings, setSettings] = useState<NetworkSettings>(loadSettings);
  const [provider, setProvider] = useState<ProviderState | null>(null);
  const [networkName, setNetworkName] = useState('');
  const [chainId, setChainId] = useState<bigint | null>(null);
  const [accounts, setAccounts] = useState<AccountState[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [connectionMode, setConnectionMode] = useState<'metamask' | 'rpc' | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [balanceUpdatedAt, setBalanceUpdatedAt] = useState<Date | null>(null);

  const [catalog, setCatalog] = useState<RegistrySummary[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [registryAddressInput, setRegistryAddressInput] = useState('');
  const [registryAddress, setRegistryAddress] = useState('');
  const [registryName, setRegistryName] = useState('Uncatalogued registry');
  const [registryOwner, setRegistryOwner] = useState('');
  const [documentCount, setDocumentCount] = useState(0);
  const [registryEntries, setRegistryEntries] = useState<RegistryEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [myEntries, setMyEntries] = useState<RegistryEntry[]>([]);
  const [myEntriesLoading, setMyEntriesLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [registryForm, setRegistryForm] = useState({ name: '', metadataURI: '' });
  const [importAddress, setImportAddress] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [isWorking, setIsWorking] = useState(false);

  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [documentHash, setDocumentHash] = useState('');
  const [metadataURI, setMetadataURI] = useState('https://');
  const [lookupHash, setLookupHash] = useState('');
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [newOwner, setNewOwner] = useState('');

  const connected = provider !== null && chainId !== null;
  const selectedAccount = accounts.find((account) => account.address.toLowerCase() === selectedAddress.toLowerCase());
  const currentRegistry = catalog.find((item) => item.address.toLowerCase() === registryAddress.toLowerCase());
  const isRegistryOwner = !!selectedAddress && selectedAddress.toLowerCase() === registryOwner.toLowerCase();

  const visibleRegistryEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return registryEntries.filter((entry) => !query || [entry.hash, entry.uploader, entry.metadataURI]
      .some((value) => value.toLowerCase().includes(query)));
  }, [registryEntries, search]);

  const visibleMyEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return myEntries.filter((entry) => !query || [entry.hash, entry.metadataURI, entry.registryName]
      .some((value) => value.toLowerCase().includes(query)));
  }, [myEntries, search]);

  const disconnect = (message = '') => {
    setProvider(null);
    setAccounts([]);
    setSelectedAddress('');
    setNetworkName('');
    setChainId(null);
    setConnectionMode(null);
    setRegistryAddress('');
    setRegistryEntries([]);
    setCatalog([]);
    if (message) setConnectionError(message);
  };

  const hydrateConnection = async (nextProvider: ProviderState, mode: 'metamask' | 'rpc') => {
    const network = await nextProvider.getNetwork();
    let nextAccounts: AccountState[] = [];
    if (mode === 'metamask') {
      const signer = await (nextProvider as BrowserProvider).getSigner();
      const address = await signer.getAddress();
      nextAccounts = [{ address, balance: formatEther(await nextProvider.getBalance(address)) }];
    } else {
      const signers = await (nextProvider as JsonRpcProvider).listAccounts();
      nextAccounts = await Promise.all(signers.map(async (signer) => {
        const address = await signer.getAddress();
        return { address, balance: formatEther(await nextProvider.getBalance(address)) };
      }));
    }
    setProvider(nextProvider);
    setConnectionMode(mode);
    setNetworkName(network.name === 'unknown' ? `Chain ${network.chainId}` : network.name);
    setChainId(network.chainId);
    setAccounts(nextAccounts);
    setSelectedAddress(nextAccounts[0]?.address ?? '');
    setBalanceUpdatedAt(new Date());
    setConnectionError('');
  };

  const connectRpc = async () => {
    setIsConnecting(true);
    setConnectionError('');
    try {
      const nextProvider = new JsonRpcProvider(settings.rpcUrl);
      await hydrateConnection(nextProvider, 'rpc');
    } catch (error) {
      disconnect(errorMessage(error, 'Could not connect to the JSON-RPC endpoint.'));
    } finally {
      setIsConnecting(false);
    }
  };

  const connectMetaMask = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setConnectionError('MetaMask is not installed in this browser.');
      return;
    }
    setIsConnecting(true);
    setConnectionError('');
    try {
      await ethereum.request({ method: 'eth_requestAccounts' });
      await hydrateConnection(new BrowserProvider(ethereum, undefined, { cacheTimeout: -1 }), 'metamask');
    } catch (error) {
      setConnectionError(errorMessage(error, 'Could not connect to MetaMask.'));
    } finally {
      setIsConnecting(false);
    }
  };

  const refreshBalances = async () => {
    if (!provider) return;
    const refreshed = await Promise.all(accounts.map(async (account) => ({
      ...account,
      balance: formatEther(await provider.getBalance(account.address)),
    })));
    setAccounts(refreshed);
    setBalanceUpdatedAt(new Date());
  };

  useEffect(() => {
    const ethereum = (window as any).ethereum;
    if (!ethereum?.on || connectionMode !== 'metamask') return;
    const onAccountsChanged = (next: string[]) => {
      if (!next.length) disconnect('MetaMask disconnected the active account.');
      else {
        setSelectedAddress(next[0]);
        if (provider) provider.getBalance(next[0]).then((balance) => {
          setAccounts([{ address: next[0], balance: formatEther(balance) }]);
          setBalanceUpdatedAt(new Date());
        });
      }
    };
    const onChainChanged = () => disconnect('The wallet network changed. Reconnect from Settings.');
    ethereum.on('accountsChanged', onAccountsChanged);
    ethereum.on('chainChanged', onChainChanged);
    return () => {
      ethereum.removeListener('accountsChanged', onAccountsChanged);
      ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, [connectionMode, provider]);

  useEffect(() => {
    if (!provider) return;
    let lastRefresh = 0;
    const onBlock = () => {
      const now = Date.now();
      if (now - lastRefresh > 12_000) {
        lastRefresh = now;
        refreshBalances().catch(() => undefined);
      }
    };
    provider.on('block', onBlock);
    return () => { provider.off('block', onBlock); };
  }, [provider, accounts.map((account) => account.address).join(',')]);

  const getSigner = async (): Promise<Signer> => {
    if (!provider || !selectedAddress) throw new Error('Connect and select a wallet first.');
    return connectionMode === 'metamask'
      ? (provider as BrowserProvider).getSigner()
      : (provider as JsonRpcProvider).getSigner(selectedAddress);
  };

  const refreshCatalog = async (targetProvider: Provider | null = provider) => {
    if (!targetProvider || !settings.factoryAddress) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    setCatalogError('');
    try {
      setCatalog(await loadRegistryCatalog(targetProvider, settings.factoryAddress));
    } catch (error) {
      setCatalogError(errorMessage(error, 'Could not load the registry catalog.'));
      setCatalog([]);
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (provider && settings.factoryAddress) refreshCatalog();
  }, [provider, settings.factoryAddress]);

  const openRegistry = async (address: string, name?: string) => {
    if (!provider) return;
    setEntriesLoading(true);
    setWorkspaceError('');
    try {
      if (!isAddress(address)) throw new Error('Enter a valid registry contract address.');
      const code = await provider.getCode(address);
      if (code === '0x') throw new Error('No contract was found at this address on the connected network.');
      const contract = new Contract(address, registryAbi, provider);
      const [owner, count] = await Promise.all([contract.owner(), contract.documentCount()]);
      const resolvedName = name || catalog.find((item) => item.address.toLowerCase() === address.toLowerCase())?.name || 'Uncatalogued registry';
      const entries = await loadRegistryEntries(provider, address, resolvedName, settings.scanFromBlock);
      setRegistryAddress(address);
      setRegistryAddressInput(address);
      setRegistryName(resolvedName);
      setRegistryOwner(owner);
      setDocumentCount(Number(count));
      setRegistryEntries(entries);
      setPage('registry');
    } catch (error) {
      setWorkspaceError(errorMessage(error, 'Could not open this registry.'));
    } finally {
      setEntriesLoading(false);
    }
  };

  const refreshCurrentRegistry = async () => {
    if (registryAddress) await openRegistry(registryAddress, registryName);
    await refreshBalances();
    await refreshCatalog();
  };

  const loadOwnedEntries = async () => {
    if (!provider || !selectedAddress) return;
    setMyEntriesLoading(true);
    setWorkspaceError('');
    try {
      const targets = catalog.length
        ? catalog.map((item) => ({ address: item.address, name: item.name }))
        : registryAddress ? [{ address: registryAddress, name: registryName }] : [];
      const grouped = await Promise.all(targets.map((target) =>
        loadRegistryEntries(provider, target.address, target.name, settings.scanFromBlock, selectedAddress)));
      setMyEntries(grouped.flat().sort((a, b) => b.blockNumber - a.blockNumber));
    } catch (error) {
      setWorkspaceError(errorMessage(error, 'Could not load entries uploaded by this wallet.'));
    } finally {
      setMyEntriesLoading(false);
    }
  };

  useEffect(() => {
    if (page === 'entries' && connected && selectedAddress) loadOwnedEntries();
  }, [page, selectedAddress, catalog.length]);

  const runTransaction = async (work: (signer: Signer) => Promise<any>, success: string) => {
    setIsWorking(true);
    setActionStatus('');
    setActionError('');
    try {
      const transaction = await work(await getSigner());
      await transaction.wait();
      setActionStatus(success);
      await refreshBalances();
      return true;
    } catch (error) {
      setActionError(errorMessage(error, 'The transaction failed.'));
      return false;
    } finally {
      setIsWorking(false);
    }
  };

  const createRegistry = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!settings.factoryAddress) return setActionError('Configure or deploy a registry factory in Settings first.');
    const ok = await runTransaction(async (signer) =>
      new Contract(settings.factoryAddress, factoryAbi, signer).createRegistry(registryForm.name.trim(), registryForm.metadataURI.trim()),
    'Registry created and added to the public catalog.');
    if (ok) {
      setRegistryForm({ name: '', metadataURI: '' });
      await refreshCatalog();
    }
  };

  const importRegistry = async () => {
    if (!settings.factoryAddress) return setActionError('Configure a registry factory first.');
    const ok = await runTransaction(async (signer) =>
      new Contract(settings.factoryAddress, factoryAbi, signer).importRegistry(importAddress, registryForm.name.trim(), registryForm.metadataURI.trim()),
    'Existing registry imported into the catalog.');
    if (ok) {
      setImportAddress('');
      await refreshCatalog();
    }
  };

  const deployFactory = async () => {
    setIsWorking(true);
    setActionError('');
    try {
      const factory = await new ContractFactory(factoryAbi, factoryBytecode, await getSigner()).deploy();
      await factory.waitForDeployment();
      const address = await factory.getAddress();
      const next = { ...settings, factoryAddress: address };
      setSettings(next);
      saveSettings(next);
      setActionStatus(`Factory deployed at ${address}`);
      await refreshBalances();
    } catch (error) {
      setActionError(errorMessage(error, 'Factory deployment failed.'));
    } finally {
      setIsWorking(false);
    }
  };

  const deployStandaloneRegistry = async () => {
    setIsWorking(true);
    setActionError('');
    try {
      const signer = await getSigner();
      const address = await signer.getAddress();
      const registry = await new ContractFactory(registryAbi, registryBytecode, signer).deploy(address);
      await registry.waitForDeployment();
      const deployedAddress = await registry.getAddress();
      setActionStatus(`Standalone registry deployed at ${deployedAddress}`);
      await refreshBalances();
      await openRegistry(deployedAddress, 'My standalone registry');
    } catch (error) {
      setActionError(errorMessage(error, 'Registry deployment failed.'));
    } finally {
      setIsWorking(false);
    }
  };

  const processFile = async (file: File) => {
    setFileName(file.name);
    setFileSize(file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(2)} MB`);
    const hash = ethers.keccak256(new Uint8Array(await file.arrayBuffer()));
    setDocumentHash(hash);
    setLookupHash(hash);
  };

  const validateMetadata = async () => {
    if (!isHttpUrl(metadataURI)) throw new Error('Use a direct HTTP or HTTPS file URL.');
    try {
      const response = await fetch(metadataURI);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const remoteHash = ethers.keccak256(new Uint8Array(await response.arrayBuffer()));
      if (remoteHash.toLowerCase() !== documentHash.toLowerCase()) throw new Error('The linked file does not match the selected file hash.');
    } catch (browserError) {
      const response = await fetch('/api/validate-uri', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ uri: metadataURI, expectedHash: documentHash }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'The linked file does not match the selected file hash.');
    }
  };

  const registerDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!registryAddress) return;
    setIsWorking(true);
    setActionError('');
    setActionStatus('');
    try {
      await validateMetadata();
      const contract = new Contract(registryAddress, registryAbi, await getSigner());
      const transaction = await contract.registerDocument(documentHash, metadataURI.trim());
      await transaction.wait();
      setActionStatus('Document registered successfully.');
      await refreshCurrentRegistry();
    } catch (error) {
      setActionError(errorMessage(error, 'Document registration failed.'));
    } finally {
      setIsWorking(false);
    }
  };

  const verifyDocument = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!provider || !registryAddress) return;
    setLookup(null);
    setActionError('');
    try {
      const contract = new Contract(registryAddress, registryAbi, provider);
      if (!(await contract.isRegistered(lookupHash))) return setLookup({ exists: false });
      const document = await contract.getDocument(lookupHash);
      setLookup({ exists: true, uploader: document[0], metadataURI: document[1], timestamp: Number(document[2]) });
    } catch (error) {
      setActionError(errorMessage(error, 'Document verification failed.'));
    }
  };

  const revokeDocument = async (hash: string) => {
    const ok = await runTransaction(async (signer) =>
      new Contract(registryAddress, registryAbi, signer).revokeDocument(hash), 'Document revoked.');
    if (ok) await refreshCurrentRegistry();
  };

  const transferOwnership = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await runTransaction(async (signer) =>
      new Contract(registryAddress, registryAbi, signer).transferOwnership(newOwner), 'Registry ownership transferred.');
    if (ok) {
      setNewOwner('');
      await refreshCurrentRegistry();
    }
  };

  const handleAuthSuccess = (username: string) => {
    localStorage.setItem(SESSION_KEY, username);
    setCurrentUser(username);
  };
  const logout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    disconnect();
  };
  const copy = (value: string) => navigator.clipboard.writeText(value);

  if (!currentUser) return <AuthPage onAuthSuccess={handleAuthSuccess} />;

  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <Gauge size={18} /> },
    { id: 'entries', label: 'My Entries', icon: <FileCheck2 size={18} /> },
    { id: 'explore', label: 'Explore', icon: <Compass size={18} /> },
    { id: 'registry', label: 'Registry', icon: <Layers size={18} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} /> },
  ];

  return (
    <div className="product-shell">
      <aside className="app-sidebar">
        <button className="brand-button" onClick={() => setPage('dashboard')}>
          <span className="brand-mark"><Layers size={22} /></span>
          <span><strong>DocRegistry</strong><small>Trusted on-chain</small></span>
        </button>
        <nav className="app-nav">
          {navItems.map((item) => (
            <button key={item.id} className={page === item.id ? 'active' : ''} onClick={() => { setSearch(''); setPage(item.id); }}>
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-profile">
          <div className="user-chip-avatar">{currentUser.charAt(0)}</div>
          <div><strong>{currentUser}</strong><small>Local profile</small></div>
          <button className="icon-button" onClick={logout} title="Log out"><LogOut size={16} /></button>
        </div>
      </aside>

      <div className="app-stage">
        <header className="product-header">
          <div>
            <p className="eyebrow">{page === 'registry' ? registryName : navItems.find((item) => item.id === page)?.label}</p>
            <h1>{page === 'dashboard' ? `Welcome back, ${currentUser}` : page === 'entries' ? 'Documents uploaded by you' : page === 'explore' ? 'Explore registries' : page === 'settings' ? 'Network & wallet settings' : 'Registry workspace'}</h1>
          </div>
          <button className="wallet-pill" onClick={() => setPage('settings')}>
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
            <span className="wallet-pill-copy">
              <strong>{connected ? shortAddress(selectedAddress) : 'Connect wallet'}</strong>
              <small>{connected ? `${formatNativeBalance(selectedAccount?.balance ?? '0')} ${settings.nativeSymbol} · ${networkName}` : 'Open Settings'}</small>
            </span>
            <WalletCards size={19} />
          </button>
        </header>

        <main className="page-content">
          {actionStatus && <Notice kind="success" text={actionStatus} onClose={() => setActionStatus('')} />}
          {actionError && <Notice kind="error" text={actionError} onClose={() => setActionError('')} />}
          {workspaceError && <Notice kind="error" text={workspaceError} onClose={() => setWorkspaceError('')} />}

          {page === 'dashboard' && (
            <>
              {!connected && <EmptyState icon={<WalletCards size={34} />} title="Connect your blockchain account" body="Your network and wallet are now configured in one place." action="Open Settings" onAction={() => setPage('settings')} />}
              {connected && (
                <>
                  <section className="metric-grid">
                    <Metric label="Wallet balance" value={`${formatNativeBalance(selectedAccount?.balance ?? '0')} ${settings.nativeSymbol}`} hint={balanceUpdatedAt ? `Updated ${balanceUpdatedAt.toLocaleTimeString()}` : 'Live network balance'} />
                    <Metric label="My discovered registries" value={String(catalog.filter((item) => item.owner.toLowerCase() === selectedAddress.toLowerCase()).length)} hint={`${catalog.length} total in catalog`} />
                    <Metric label="Open registry entries" value={registryAddress ? String(documentCount) : '—'} hint={registryAddress ? registryName : 'Choose a registry'} />
                  </section>
                  <section className="dashboard-columns">
                    <div className="glass-card primary-edge">
                      <div className="section-heading"><div><p className="eyebrow">Identity</p><h2>Your blockchain profile</h2></div><UserRound size={22} /></div>
                      <div className="identity-address"><span>{selectedAddress}</span><button className="icon-button" onClick={() => copy(selectedAddress)}><Clipboard size={15} /></button></div>
                      <p className="muted">The connected wallet is the authority for ownership and uploads. Your username is only a local display profile.</p>
                      <button className="btn btn-secondary" onClick={() => setPage('entries')}>View my entries</button>
                    </div>
                    <div className="glass-card">
                      <div className="section-heading"><div><p className="eyebrow">Continue</p><h2>{registryAddress ? registryName : 'Choose a registry'}</h2></div><Activity size={22} /></div>
                      <p className="muted">{registryAddress ? `${documentCount} active documents at ${shortAddress(registryAddress)}.` : 'Browse the on-chain catalog or open a known address.'}</p>
                      <button className="btn btn-primary" onClick={() => setPage(registryAddress ? 'registry' : 'explore')}>{registryAddress ? 'Open workspace' : 'Explore registries'}</button>
                    </div>
                  </section>
                </>
              )}
            </>
          )}

          {page === 'settings' && (
            <section className="settings-grid">
              <div className="glass-card primary-edge">
                <div className="section-heading"><div><p className="eyebrow">Connection</p><h2>Choose how to connect</h2></div><WalletCards size={22} /></div>
                <div className="segmented-control">
                  <button className={settings.connectionMode === 'metamask' ? 'active' : ''} onClick={() => setSettings({ ...settings, connectionMode: 'metamask' })}>MetaMask</button>
                  <button className={settings.connectionMode === 'rpc' ? 'active' : ''} onClick={() => setSettings({ ...settings, connectionMode: 'rpc' })}>JSON-RPC</button>
                </div>
                {settings.connectionMode === 'rpc' && <Field label="JSON-RPC URL" value={settings.rpcUrl} onChange={(rpcUrl) => setSettings({ ...settings, rpcUrl })} placeholder={DEFAULT_SETTINGS.rpcUrl} />}
                <button className="btn btn-primary full-width" disabled={isConnecting} onClick={settings.connectionMode === 'metamask' ? connectMetaMask : connectRpc}>{isConnecting ? 'Connecting…' : connected ? 'Reconnect' : 'Connect'}</button>
                {connectionError && <p className="field-error">{connectionError}</p>}
                {connected && <div className="connection-readout"><CheckCircle size={17} /><span><strong>{networkName}</strong><small>Chain ID {chainId?.toString()} · {connectionMode}</small></span><button className="btn btn-secondary btn-small" onClick={() => disconnect()}>Disconnect</button></div>}
                {connectionMode === 'rpc' && accounts.length > 1 && <div className="form-group"><label className="form-label">Active unlocked account</label><select className="form-input" value={selectedAddress} onChange={(event) => setSelectedAddress(event.target.value)}>{accounts.map((account) => <option key={account.address} value={account.address}>{shortAddress(account.address)} · {formatNativeBalance(account.balance)} {settings.nativeSymbol}</option>)}</select></div>}
              </div>
              <div className="glass-card">
                <div className="section-heading"><div><p className="eyebrow">Network metadata</p><h2>Display & discovery</h2></div><Settings size={22} /></div>
                <Field label="Native currency symbol" value={settings.nativeSymbol} onChange={(nativeSymbol) => setSettings({ ...settings, nativeSymbol })} placeholder="ETH" />
                <Field label="Block explorer URL (optional)" value={settings.explorerUrl} onChange={(explorerUrl) => setSettings({ ...settings, explorerUrl })} placeholder="https://sepolia.etherscan.io" />
                <Field label="Registry factory address" value={settings.factoryAddress} onChange={(factoryAddress) => setSettings({ ...settings, factoryAddress })} placeholder="0x…" />
                <Field label="Scan logs from block" value={String(settings.scanFromBlock)} onChange={(value) => setSettings({ ...settings, scanFromBlock: Math.max(0, Number(value) || 0) })} placeholder="0" type="number" />
                <button className="btn btn-primary full-width" onClick={() => { saveSettings(settings); setActionStatus('Network preferences saved in this browser.'); }}>Save settings</button>
              </div>
              <div className="glass-card settings-wide">
                <div className="section-heading"><div><p className="eyebrow">Development tools</p><h2>Deploy network contracts</h2></div><Shield size={22} /></div>
                <p className="muted">Deploy a catalog factory once per network. Standalone registries remain available for development and can later be imported by their owner.</p>
                <div className="button-row"><button className="btn btn-primary" disabled={!connected || isWorking} onClick={deployFactory}>Deploy catalog factory</button><button className="btn btn-secondary" disabled={!connected || isWorking} onClick={deployStandaloneRegistry}>Deploy standalone registry</button></div>
              </div>
            </section>
          )}

          {page === 'explore' && (
            <>
              {!connected ? <EmptyState icon={<Compass size={34} />} title="Connect before exploring" body="Registry discovery follows the network selected in Settings." action="Open Settings" onAction={() => setPage('settings')} /> : (
                <>
                  <section className="dashboard-columns">
                    <form className="glass-card primary-edge" onSubmit={createRegistry}>
                      <div className="section-heading"><div><p className="eyebrow">Publish</p><h2>Create a named registry</h2></div><Plus size={22} /></div>
                      <Field label="Registry name" value={registryForm.name} onChange={(name) => setRegistryForm({ ...registryForm, name })} placeholder="Legal documents" />
                      <Field label="Profile or metadata URI (optional)" value={registryForm.metadataURI} onChange={(metadataURI) => setRegistryForm({ ...registryForm, metadataURI })} placeholder="ipfs://… or https://…" />
                      <button className="btn btn-primary full-width" disabled={!settings.factoryAddress || !registryForm.name.trim() || isWorking}>Create registry</button>
                    </form>
                    <div className="glass-card">
                      <div className="section-heading"><div><p className="eyebrow">Migration</p><h2>Import an existing registry</h2></div><ArrowRightLeft size={22} /></div>
                      <Field label="Existing contract address" value={importAddress} onChange={setImportAddress} placeholder="0x…" />
                      <p className="muted">Use the name and metadata from the create form. The connected wallet must currently own this registry.</p>
                      <button className="btn btn-secondary full-width" disabled={!settings.factoryAddress || !isAddress(importAddress) || !registryForm.name.trim() || isWorking} onClick={importRegistry}>Import into catalog</button>
                    </div>
                  </section>
                  <section className="glass-card">
                    <div className="section-heading"><div><p className="eyebrow">On-chain catalog</p><h2>{catalog.length} discoverable registries</h2></div><button className="icon-button" onClick={() => refreshCatalog()}><RefreshCw size={17} /></button></div>
                    {!settings.factoryAddress ? <InlineEmpty text="Set a registry factory address in Settings to enable discovery." /> : catalogLoading ? <InlineEmpty text="Loading registries from the blockchain…" /> : catalogError ? <InlineEmpty text={catalogError} /> : catalog.length === 0 ? <InlineEmpty text="This factory does not have any registries yet." /> : <div className="registry-grid">{catalog.map((item) => <RegistryCard key={item.address} item={item} activeAddress={selectedAddress} explorerUrl={settings.explorerUrl} onOpen={() => openRegistry(item.address, item.name)} />)}</div>}
                  </section>
                  <section className="glass-card compact-card"><div className="manual-open"><div><strong>Open an uncatalogued registry</strong><p className="muted">Useful for existing or independently deployed contracts.</p></div><input className="form-input" value={registryAddressInput} onChange={(event) => setRegistryAddressInput(event.target.value)} placeholder="Registry address (0x…)" /><button className="btn btn-secondary" disabled={!isAddress(registryAddressInput) || entriesLoading} onClick={() => openRegistry(registryAddressInput)}>Open</button></div></section>
                </>
              )}
            </>
          )}

          {page === 'entries' && (
            !connected ? <EmptyState icon={<FileCheck2 size={34} />} title="Connect to see your entries" body="Entries are matched to the active blockchain wallet—not the local username." action="Open Settings" onAction={() => setPage('settings')} /> :
              <section className="glass-card">
                <div className="section-heading"><div><p className="eyebrow">Wallet ownership</p><h2>Uploaded by {shortAddress(selectedAddress)}</h2></div><button className="icon-button" onClick={loadOwnedEntries}><RefreshCw size={17} /></button></div>
                <SearchBox value={search} onChange={setSearch} placeholder="Search hash, URI, or registry…" />
                {myEntriesLoading ? <InlineEmpty text="Scanning indexed registration events…" /> : visibleMyEntries.length === 0 ? <InlineEmpty text={catalog.length || registryAddress ? 'No entries were uploaded by this wallet.' : 'Configure a catalog or open a registry first.'} /> : <EntryTable entries={visibleMyEntries} explorerUrl={settings.explorerUrl} onRegistry={(entry) => openRegistry(entry.registryAddress, entry.registryName)} />}
              </section>
          )}

          {page === 'registry' && (
            !connected ? <EmptyState icon={<Layers size={34} />} title="Connect to open a registry" body="Select your network and wallet before loading contract data." action="Open Settings" onAction={() => setPage('settings')} /> : !registryAddress ?
              <EmptyState icon={<Layers size={34} />} title="No registry selected" body="Choose one from the catalog or open a known contract address." action="Explore registries" onAction={() => setPage('explore')} /> : (
                <>
                  <section className="registry-hero glass-card primary-edge">
                    <div><p className="eyebrow">{currentRegistry ? 'Cataloged registry' : 'Direct contract'}</p><h2>{registryName}</h2><div className="identity-address"><span>{registryAddress}</span><button className="icon-button" onClick={() => copy(registryAddress)}><Clipboard size={15} /></button>{explorerLink(settings.explorerUrl, 'address', registryAddress) && <a className="icon-button" href={explorerLink(settings.explorerUrl, 'address', registryAddress)} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>}</div></div>
                    <div className="registry-stats"><span><strong>{documentCount}</strong><small>active entries</small></span><span><strong>{shortAddress(registryOwner)}</strong><small>owner</small></span><button className="icon-button" onClick={refreshCurrentRegistry}><RefreshCw size={17} /></button></div>
                  </section>
                  <section className="dashboard-columns">
                    <div className="glass-card">
                      <div className="section-heading"><div><p className="eyebrow">Local hashing</p><h2>Select a document</h2></div><Upload size={22} /></div>
                      <label className="file-drop"><input type="file" onChange={(event) => event.target.files?.[0] && processFile(event.target.files[0])} /><Upload size={28} /><strong>{fileName || 'Choose a file to hash'}</strong><small>{fileName ? fileSize : 'The file never leaves your browser.'}</small></label>
                      {documentHash && <div className="hash-readout"><span>{documentHash}</span><button className="icon-button" onClick={() => copy(documentHash)}><Clipboard size={14} /></button></div>}
                    </div>
                    <form className="glass-card" onSubmit={registerDocument}>
                      <div className="section-heading"><div><p className="eyebrow">Write</p><h2>Register document</h2></div><FileText size={22} /></div>
                      <Field label="Document hash" value={documentHash} onChange={setDocumentHash} placeholder="0x…" />
                      <Field label="Direct file URL" value={metadataURI} onChange={setMetadataURI} placeholder="https://…" />
                      <button className="btn btn-primary full-width" disabled={!documentHash || !metadataURI || isWorking}>Validate and register</button>
                    </form>
                  </section>
                  <section className="dashboard-columns">
                    <form className="glass-card" onSubmit={verifyDocument}>
                      <div className="section-heading"><div><p className="eyebrow">Read</p><h2>Verify a document</h2></div><Search size={22} /></div>
                      <Field label="Document hash" value={lookupHash} onChange={setLookupHash} placeholder="0x…" />
                      <button className="btn btn-secondary full-width" disabled={!lookupHash}>Verify hash</button>
                      {lookup && <div className={`verification-result ${lookup.exists ? 'found' : 'not-found'}`}><strong>{lookup.exists ? 'Verified registration' : 'Not registered'}</strong>{lookup.exists && <div className="result-body"><span>Uploader: {lookup.uploader}</span><span>Metadata: {lookup.metadataURI}</span><span>Registered: {new Date((lookup.timestamp ?? 0) * 1000).toLocaleString()}</span></div>}</div>}
                    </form>
                    <form className="glass-card" onSubmit={transferOwnership}>
                      <div className="section-heading"><div><p className="eyebrow">Administration</p><h2>Owner controls</h2></div><Shield size={22} /></div>
                      {!isRegistryOwner && <p className="field-warning"><AlertTriangle size={15} />Only {shortAddress(registryOwner)} can use these actions.</p>}
                      <Field label="Transfer to address" value={newOwner} onChange={setNewOwner} placeholder="0x…" />
                      <button className="btn btn-secondary full-width" disabled={!isRegistryOwner || !isAddress(newOwner) || isWorking}>Transfer ownership</button>
                    </form>
                  </section>
                  <section className="glass-card">
                    <div className="section-heading"><div><p className="eyebrow">Browse</p><h2>Registry entries</h2></div><span className="badge badge-primary">{registryEntries.filter((entry) => entry.active).length} active</span></div>
                    <SearchBox value={search} onChange={setSearch} placeholder="Search by hash, uploader, or metadata…" />
                    {entriesLoading ? <InlineEmpty text="Loading registry history…" /> : visibleRegistryEntries.length === 0 ? <InlineEmpty text="This registry has no matching entries." /> : <EntryTable entries={visibleRegistryEntries} explorerUrl={settings.explorerUrl} canRevoke={isRegistryOwner} onRevoke={revokeDocument} />}
                  </section>
                </>
              )
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return <div className="form-group"><label className="form-label">{label}</label><input className="form-input" type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>;
}

function Notice({ kind, text, onClose }: { kind: 'success' | 'error'; text: string; onClose: () => void }) {
  return <div className={`page-notice ${kind}`}><span>{kind === 'success' ? <CheckCircle size={17} /> : <AlertTriangle size={17} />}{text}</span><button onClick={onClose}>×</button></div>;
}

function EmptyState({ icon, title, body, action, onAction }: { icon: React.ReactNode; title: string; body: string; action: string; onAction: () => void }) {
  return <div className="glass-card empty-state">{icon}<h2>{title}</h2><p>{body}</p><button className="btn btn-primary" onClick={onAction}>{action}</button></div>;
}

function InlineEmpty({ text }: { text: string }) {
  return <div className="inline-empty">{text}</div>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="search-box"><Search size={17} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>;
}

function RegistryCard({ item, activeAddress, explorerUrl, onOpen }: { item: RegistrySummary; activeAddress: string; explorerUrl: string; onOpen: () => void }) {
  const owned = !!activeAddress && item.owner.toLowerCase() === activeAddress.toLowerCase();
  return <article className="registry-card"><div className="registry-card-top"><span className="registry-icon"><Layers size={20} /></span>{owned && <span className="badge badge-owner">Owned by you</span>}</div><h3>{item.name}</h3><p>{item.metadataURI || 'No public description provided.'}</p><div className="registry-card-meta"><span>{item.documentCount} documents</span><span>Owner {shortAddress(item.owner)}</span><span>{new Date(item.createdAt * 1000).toLocaleDateString()}</span></div><div className="button-row"><button className="btn btn-primary btn-small" onClick={onOpen}>Browse</button>{explorerLink(explorerUrl, 'address', item.address) && <a className="btn btn-secondary btn-small" href={explorerLink(explorerUrl, 'address', item.address)} target="_blank" rel="noreferrer">Explorer <ExternalLink size={13} /></a>}</div></article>;
}

function EntryTable({ entries, explorerUrl, canRevoke, onRevoke, onRegistry }: { entries: RegistryEntry[]; explorerUrl: string; canRevoke?: boolean; onRevoke?: (hash: string) => void; onRegistry?: (entry: RegistryEntry) => void }) {
  return <div className="entry-list">{entries.map((entry) => <article className="entry-row" key={`${entry.registryAddress}-${entry.hash}`}><div className={`entry-status ${entry.active ? 'active' : 'revoked'}`}><FileCheck2 size={18} /></div><div className="entry-main"><div><strong>{entry.registryName}</strong><span className={`badge ${entry.active ? 'badge-success' : 'badge-revoked'}`}>{entry.active ? 'Active' : 'Revoked'}</span></div><code>{entry.hash}</code><small>{entry.metadataURI || 'Metadata unavailable after revocation'} · {new Date(entry.timestamp * 1000).toLocaleString()}</small></div><div className="entry-actions">{onRegistry && <button className="icon-button" title="Open registry" onClick={() => onRegistry(entry)}><Layers size={15} /></button>}{explorerLink(explorerUrl, 'tx', entry.transactionHash) && <a className="icon-button" title="Open transaction" href={explorerLink(explorerUrl, 'tx', entry.transactionHash)} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>}{canRevoke && entry.active && onRevoke && <button className="icon-button danger" title="Revoke" onClick={() => onRevoke(entry.hash)}><Trash2 size={15} /></button>}</div></article>)}</div>;
}
