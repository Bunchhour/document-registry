import React, { useState, useEffect } from 'react';
import { 
  ethers, 
  JsonRpcProvider, 
  BrowserProvider,
  Contract, 
  Wallet,
  formatEther
} from 'ethers';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  Activity, 
  Plus, 
  Layers, 
  User, 
  Cpu, 
  Clipboard, 
  Trash2, 
  Shield, 
  RotateCw,
  Search,
  ArrowRightLeft,
  LogOut
} from 'lucide-react';
import DocumentRegistryArtifact from './contracts/DocumentRegistry.json';
import AuthPage from './AuthPage';

// Destructure from the compiled artifact
const { abi, bytecode } = DocumentRegistryArtifact;

// Session storage key
const SESSION_KEY = 'docregistry_session';

interface Account {
  address: string;
  balance: string;
}

interface EventLog {
  type: 'registered' | 'revoked';
  docHash: string;
  actor: string; // uploader or revoker
  timestamp: string;
  blockNumber: number;
  txHash: string;
}

interface UriValidationResponse {
  ok: boolean;
  hash: string;
  byteLength: number;
  error?: string;
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

type ErrorDetails = {
  codes: string[];
  messages: string[];
};

const extractErrorDetails = (error: unknown): ErrorDetails => {
  const details: ErrorDetails = { codes: [], messages: [] };
  const queue: unknown[] = [error];
  const visited = new Set<object>();

  while (queue.length > 0 && visited.size < 12) {
    const current = queue.shift();

    if (typeof current === 'string') {
      details.messages.push(current);
      continue;
    }

    if (typeof current !== 'object' || current === null || visited.has(current)) {
      continue;
    }

    visited.add(current);
    const value = current as Record<string, unknown>;

    if (typeof value.code === 'string' || typeof value.code === 'number') {
      details.codes.push(String(value.code).toUpperCase());
    }

    for (const key of ['shortMessage', 'reason', 'message']) {
      if (typeof value[key] === 'string') {
        details.messages.push(value[key]);
      }
    }

    for (const key of ['error', 'info', 'data', 'cause']) {
      if (value[key] !== undefined) {
        queue.push(value[key]);
      }
    }
  }

  return details;
};

const getFriendlyTransactionError = (error: unknown, fallback: string) => {
  const { codes, messages } = extractErrorDetails(error);
  const combinedMessage = messages.join(' ').toLowerCase();

  if (
    codes.includes('4001') ||
    codes.includes('ACTION_REJECTED') ||
    /user (?:rejected|denied)|request rejected|ethers-user-denied/.test(combinedMessage)
  ) {
    return 'Transaction cancelled in MetaMask. No changes were made.';
  }

  if (
    codes.includes('INSUFFICIENT_FUNDS') ||
    /insufficient (?:funds|balance)|funds for gas|exceeds (?:the )?balance/.test(combinedMessage)
  ) {
    return 'Insufficient ETH to pay the network fee. Add ETH to this account on the selected network and try again.';
  }

  if (
    codes.includes('NETWORK_ERROR') ||
    codes.includes('SERVER_ERROR') ||
    /failed to fetch|could not connect|network error/.test(combinedMessage)
  ) {
    return 'Could not reach the selected blockchain network. Check the network in MetaMask and try again.';
  }

  const readableMessage = messages
    .map((message) => message
      .replace(/\s*\((?:action|operation|reason|info|error|payload|transaction|code)=.*$/s, '')
      .trim())
    .find((message) =>
      message.length > 0 &&
      message.length <= 180 &&
      !/^(could not coalesce|missing revert data|unknown error|internal json-rpc error)/i.test(message)
    );

  return readableMessage || fallback;
};

export default function App() {
  // ── Auth state ────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    return localStorage.getItem(SESSION_KEY);
  });

  const handleAuthSuccess = (username: string) => {
    localStorage.setItem(SESSION_KEY, username);
    setCurrentUser(username);
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  };

  // ── Connection states ─────────────────────────────────────────────────────
  const [rpcUrl, setRpcUrl] = useState('http://127.0.0.1:8545');
  const [provider, setProvider] = useState<JsonRpcProvider | BrowserProvider | null>(null);
  const [useMetaMask, setUseMetaMask] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Contract states
  const [contractAddress, setContractAddress] = useState('');
  const [contract, setContract] = useState<Contract | null>(null);
  const [owner, setOwner] = useState<string>('');
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  // Wallet/Signer states
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [customPrivateKey, setCustomPrivateKey] = useState('');
  const [customWallet, setCustomWallet] = useState<Wallet | null>(null);
  const [isUsingCustomWallet, setIsUsingCustomWallet] = useState(false);

  // Drag & drop file hashing states
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [computedHash, setComputedHash] = useState<string>('');
  const [isHashing, setIsHashing] = useState(false);

  // Operation states
  const [metadataURI, setMetadataURI] = useState('https://');
  const [registerHash, setRegisterHash] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const [lookupHash, setLookupHash] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<{
    searched: boolean;
    exists: boolean;
    uploader?: string;
    metadataURI?: string;
    timestamp?: string;
  } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [revokeHash, setRevokeHash] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeSuccess, setRevokeSuccess] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const [newOwnerAddress, setNewOwnerAddress] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Live Activity Feed
  const [events, setEvents] = useState<EventLog[]>([]);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Automatically attempt initial connection
  useEffect(() => {
    connectToNode();
  }, []);

  // Connect to JSON-RPC node
  const connectToNode = async (targetUrl = rpcUrl) => {
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const prov = new JsonRpcProvider(targetUrl);
      
      // Test the network connection
      await prov.getNetwork();
      setProvider(prov);
      setIsConnected(true);
      setUseMetaMask(false);
      
      // Load accounts
      await loadAccounts(prov);
    } catch (err: any) {
      console.error(err);
      setIsConnected(false);
      setConnectionError(err.message || 'Failed to connect to JSON-RPC node');
      setAccounts([]);
      setSelectedAddress(null);
    } finally {
      setIsConnecting(false);
    }
  };

  const connectMetaMask = async () => {
    if (!(window as any).ethereum) {
      alert("MetaMask is not installed!");
      return;
    }
    setIsConnecting(true);
    setConnectionError(null);
    try {
      const prov = new BrowserProvider(
        (window as any).ethereum,
        undefined,
        { cacheTimeout: -1 }
      );
      await prov.send("eth_requestAccounts", []);
      
      await prov.getNetwork();
      setProvider(prov);
      setIsConnected(true);
      setUseMetaMask(true);
      
      const signer = await prov.getSigner();
      const address = await signer.getAddress();
      const balanceWei = await prov.getBalance(address);
      
      setAccounts([{ address, balance: parseFloat(formatEther(balanceWei)).toFixed(4) }]);
      setSelectedAddress(address);
      setIsUsingCustomWallet(false);
    } catch (err: any) {
      console.error(err);
      setIsConnected(false);
      setConnectionError(err.message || 'Failed to connect to MetaMask');
      setAccounts([]);
      setSelectedAddress(null);
    } finally {
      setIsConnecting(false);
    }
  };

  // Fetch accounts from the local node
  const loadAccounts = async (prov: JsonRpcProvider) => {
    try {
      const signers = await prov.listAccounts();
      const loaded: Account[] = await Promise.all(
        signers.map(async (signer) => {
          const address = await signer.getAddress();
          const balanceWei = await prov.getBalance(address);
          const balanceEth = formatEther(balanceWei);
          return {
            address,
            balance: parseFloat(balanceEth).toFixed(4)
          };
        })
      );
      setAccounts(loaded);
      if (loaded.length > 0 && !selectedAddress) {
        setSelectedAddress(loaded[0].address);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
    }
  };

  // Refresh account balances
  const refreshBalances = async () => {
    if (!provider) return;
    if (useMetaMask) {
      const p = provider as BrowserProvider;
      const signer = await p.getSigner();
      const address = await signer.getAddress();
      const balanceHex = await p.send('eth_getBalance', [address, 'latest']);
      const balanceWei = BigInt(balanceHex);
      setAccounts([{ address, balance: parseFloat(formatEther(balanceWei)).toFixed(4) }]);
    } else {
      await loadAccounts(provider as JsonRpcProvider);
    }
  };

  // Switch to custom wallet using private key
  const handleApplyCustomPrivateKey = () => {
    if (!provider || !customPrivateKey) return;
    try {
      // Validate key length
      let cleanKey = customPrivateKey.trim();
      if (!cleanKey.startsWith('0x')) {
        cleanKey = '0x' + cleanKey;
      }
      const wallet = new Wallet(cleanKey, provider);
      setCustomWallet(wallet);
      setIsUsingCustomWallet(true);
      setSelectedAddress(wallet.address);
      setCustomPrivateKey('');
    } catch (err: any) {
      alert('Invalid private key format: ' + err.message);
    }
  };

  // Switch back to pre-funded node accounts
  const handleUseNodeAccounts = () => {
    setIsUsingCustomWallet(false);
    setCustomWallet(null);
    if (accounts.length > 0) {
      setSelectedAddress(accounts[0].address);
    }
  };

  // Get current active signer
  const getActiveSigner = async () => {
    if (!provider) throw new Error('No provider connected');
    if (useMetaMask) {
      return await (provider as BrowserProvider).getSigner();
    }
    if (isUsingCustomWallet && customWallet) {
      return customWallet;
    }
    if (!selectedAddress) throw new Error('No signer selected');
    return await (provider as JsonRpcProvider).getSigner(selectedAddress);
  };

  // Load contract details from address input
  const handleLoadContract = async (addr = contractAddress) => {
    if (!provider || !addr) return;
    setContractError(null);
    try {
      const cleanAddr = addr.trim();
      const code = await provider.getCode(cleanAddr);
      if (code === '0x' || code === '0x00') {
        throw new Error('No contract code found at this address');
      }
      
      const newContract = new Contract(cleanAddr, abi, provider);
      setContract(newContract);
      setContractAddress(cleanAddr);
      await fetchContractStats(newContract);
      setupEventListeners(newContract);
    } catch (err: any) {
      console.error(err);
      setContractError(err.message || 'Failed to load contract');
      setContract(null);
    }
  };

  // Deploy a new contract instance directly
  const handleDeployContract = async () => {
    if (!provider) return;
    setIsDeploying(true);
    setContractError(null);
    try {
      const signer = await getActiveSigner();
      const signerAddress = await signer.getAddress();
      const signerBalance = await provider.getBalance(signerAddress);

      if (signerBalance === 0n) {
        throw new Error('Insufficient balance: this account has no ETH to pay the deployment fee.');
      }

      const factory = new ethers.ContractFactory(abi, bytecode, signer);
      
      const deployed = await factory.deploy();
      await deployed.waitForDeployment();
      
      const addr = await deployed.getAddress();
      setContractAddress(addr);
      
      const newContract = new Contract(addr, abi, provider);
      setContract(newContract);
      await fetchContractStats(newContract);
      setupEventListeners(newContract);
      
      // Refresh balances
      await refreshBalances();
    } catch (err: unknown) {
      console.error(err);
      setContractError(getFriendlyTransactionError(
        err,
        'Deployment failed. Check your wallet balance and selected network, then try again.'
      ));
    } finally {
      setIsDeploying(false);
    }
  };

  // Fetch stats from loaded contract
  const fetchContractStats = async (cInstance: Contract) => {
    try {
      const cOwner = await cInstance.owner();
      const cCount = await cInstance.documentCount();
      setOwner(cOwner);
      setDocumentCount(Number(cCount));
    } catch (err) {
      console.error('Error fetching contract stats:', err);
    }
  };

  // Setup contract event listeners
  const setupEventListeners = async (cInstance: Contract) => {
    if (!provider) return;
    // Clear old listeners first
    cInstance.removeAllListeners();

    try {
      // Query past events
      const regFilter = cInstance.filters.DocumentRegistered();
      const revFilter = cInstance.filters.DocumentRevoked();
      
      const [regEvents, revEvents] = await Promise.all([
        cInstance.queryFilter(regFilter, 0, 'latest'),
        cInstance.queryFilter(revFilter, 0, 'latest')
      ]);

      const formattedEvents: EventLog[] = [];
      
      for (const e of regEvents) {
        if ('args' in e && e.args) {
          formattedEvents.push({
            type: 'registered',
            docHash: e.args[0] as string,
            actor: e.args[1] as string,
            timestamp: new Date(Number(e.args[2]) * 1000).toLocaleString(),
            blockNumber: e.blockNumber,
            txHash: e.transactionHash
          });
        }
      }

      for (const e of revEvents) {
        if ('args' in e && e.args) {
          formattedEvents.push({
            type: 'revoked',
            docHash: e.args[0] as string,
            actor: e.args[1] as string,
            timestamp: 'N/A', // Revoked doesn't emit block timestamp
            blockNumber: e.blockNumber,
            txHash: e.transactionHash
          });
        }
      }

      // Sort by block number descending
      formattedEvents.sort((a, b) => b.blockNumber - a.blockNumber);
      setEvents(formattedEvents);

      // Add real-time listeners
      cInstance.on(regFilter, (...args: any[]) => {
        let docHash = '';
        let uploader = '';
        let timestamp: any = 0;
        let blockNumber = 0;
        let txHash = '';

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'log' in args[0]) {
          const payload = args[0];
          if (payload.args) [docHash, uploader, timestamp] = payload.args;
          if (payload.log) {
            blockNumber = payload.log.blockNumber;
            txHash = payload.log.transactionHash;
          }
        } else {
          docHash = args[0];
          uploader = args[1];
          timestamp = args[2];
          const payload = args[args.length - 1];
          blockNumber = payload?.log?.blockNumber || payload?.blockNumber || 0;
          txHash = payload?.log?.transactionHash || payload?.transactionHash || '';
        }

        setEvents((prev) => [
          {
            type: 'registered',
            docHash,
            actor: uploader,
            timestamp: new Date(Number(timestamp) * 1000).toLocaleString(),
            blockNumber,
            txHash
          },
          ...prev
        ]);
        fetchContractStats(cInstance);
        refreshBalances();
      });

      cInstance.on(revFilter, (...args: any[]) => {
        let docHash = '';
        let revokedBy = '';
        let blockNumber = 0;
        let txHash = '';

        if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'log' in args[0]) {
          const payload = args[0];
          if (payload.args) [docHash, revokedBy] = payload.args;
          if (payload.log) {
            blockNumber = payload.log.blockNumber;
            txHash = payload.log.transactionHash;
          }
        } else {
          docHash = args[0];
          revokedBy = args[1];
          const payload = args[args.length - 1];
          blockNumber = payload?.log?.blockNumber || payload?.blockNumber || 0;
          txHash = payload?.log?.transactionHash || payload?.transactionHash || '';
        }

        setEvents((prev) => [
          {
            type: 'revoked',
            docHash,
            actor: revokedBy,
            timestamp: 'N/A',
            blockNumber,
            txHash
          },
          ...prev
        ]);
        fetchContractStats(cInstance);
        refreshBalances();
      });

    } catch (err) {
      console.error('Error fetching/setting up events:', err);
    }
  };

  // Compute file Keccak-256 hash client-side
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    // Format size
    const sizeInMB = file.size / (1024 * 1024);
    setFileSize(sizeInMB < 0.1 ? `${(file.size / 1024).toFixed(1)} KB` : `${sizeInMB.toFixed(2)} MB`);
    setIsHashing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const buffer = event.target?.result as ArrayBuffer;
        const uint8Array = new Uint8Array(buffer);
        // Ethers keccak256 requires BytesLike
        const hash = ethers.keccak256(uint8Array);
        setComputedHash(hash);
        // Pre-fill input fields
        setRegisterHash(hash);
        setLookupHash(hash);
      } catch (err) {
        console.error('Hashing error:', err);
      } finally {
        setIsHashing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const validateFetchedBytes = (bytes: Uint8Array, expectedHash: string) => {
    const fetchedHash = ethers.keccak256(bytes);

    if (fetchedHash.toLowerCase() !== expectedHash.toLowerCase()) {
      throw new Error("Validation Failed: The hash of the file at the provided URI does not match the uploaded file's hash.");
    }
  };

  const validateUriInBrowser = async (uri: string, expectedHash: string) => {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error(`Failed to fetch URI: ${response.statusText || response.status}`);
    }

    const buffer = await response.arrayBuffer();
    validateFetchedBytes(new Uint8Array(buffer), expectedHash);
  };

  const validateUriOnServer = async (uri: string, expectedHash: string) => {
    const response = await fetch('/api/validate-uri', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ uri, expectedHash })
    });
    const result = await response.json() as UriValidationResponse;

    if (!response.ok) {
      throw new Error(result.error || 'Server-side URI validation failed');
    }

    if (!result.ok) {
      throw new Error(`Validation Failed: The hash of the file at the provided URI is ${result.hash}, which does not match the uploaded file's hash.`);
    }
  };

  const validateMetadataUri = async (uri: string, expectedHash: string) => {
    if (!isHttpUrl(uri)) {
      throw new Error("Validation Failed: URI must be a valid http or https direct file link.");
    }

    try {
      await validateUriInBrowser(uri, expectedHash);
    } catch (browserErr) {
      try {
        await validateUriOnServer(uri, expectedHash);
      } catch (serverErr: any) {
        const browserMessage = browserErr instanceof Error ? browserErr.message : 'Browser validation failed';
        throw new Error("Link Validation Error: Could not fetch and validate the file from the URI. " +
          `${serverErr.message || browserMessage} Browser validation said: ${browserMessage}`);
      }
    }
  };

  // Actions
  const handleRegisterDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsRegistering(true);
    setRegisterSuccess(null);
    setRegisterError(null);

    try {
      // 1. Link Validation
      await validateMetadataUri(metadataURI.trim(), registerHash.trim());

      const signer = await getActiveSigner();
      const contractWithSigner = contract.connect(signer) as Contract;
      
      const tx = await contractWithSigner.registerDocument(registerHash, metadataURI);
      const receipt = await tx.wait();
      
      setRegisterSuccess(`Registered successfully! Tx: ${receipt.hash}`);
      fetchContractStats(contract);
      refreshBalances();
    } catch (err: unknown) {
      console.error(err);
      setRegisterError(getFriendlyTransactionError(err, 'Document registration failed. Please try again.'));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleLookupDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsLookingUp(true);
    setLookupResult(null);
    setLookupError(null);

    try {
      const isReg = await contract.isRegistered(lookupHash);
      if (!isReg) {
        setLookupResult({
          searched: true,
          exists: false
        });
        return;
      }

      const [uploader, uri, timestamp] = await contract.getDocument(lookupHash);
      setLookupResult({
        searched: true,
        exists: true,
        uploader,
        metadataURI: uri,
        timestamp: new Date(Number(timestamp) * 1000).toLocaleString()
      });
    } catch (err: any) {
      console.error(err);
      setLookupError(err.reason || err.message || 'Lookup failed');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleRevokeDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsRevoking(true);
    setRevokeSuccess(null);
    setRevokeError(null);

    try {
      const signer = await getActiveSigner();
      const contractWithSigner = contract.connect(signer) as Contract;
      
      const tx = await contractWithSigner.revokeDocument(revokeHash);
      const receipt = await tx.wait();
      
      setRevokeSuccess(`Revoked successfully! Tx: ${receipt.hash}`);
      setRevokeHash('');
      fetchContractStats(contract);
      refreshBalances();
    } catch (err: unknown) {
      console.error(err);
      setRevokeError(getFriendlyTransactionError(err, 'Document revocation failed. Please try again.'));
    } finally {
      setIsRevoking(false);
    }
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contract) return;
    setIsTransferring(true);
    setTransferSuccess(null);
    setTransferError(null);

    try {
      const signer = await getActiveSigner();
      const contractWithSigner = contract.connect(signer) as Contract;
      
      const tx = await contractWithSigner.transferOwnership(newOwnerAddress);
      const receipt = await tx.wait();
      
      setTransferSuccess(`Ownership transferred successfully! Tx: ${receipt.hash}`);
      setNewOwnerAddress('');
      fetchContractStats(contract);
      refreshBalances();
    } catch (err: unknown) {
      console.error(err);
      setTransferError(getFriendlyTransactionError(err, 'Ownership transfer failed. Please try again.'));
    } finally {
      setIsTransferring(false);
    }
  };

  const triggerCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(text);
    setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  };

  // Show auth gate if not logged in
  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="app-container">
      {/* Top Glass Header */}
      <header className="glass-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Layers size={28} style={{ color: '#6366f1' }} />
          <div>
            <h1>Document Registry</h1>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Decentralized Document Verification</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Logged-in user chip */}
          <div className="user-chip">
            <div className="user-chip-avatar">{currentUser.charAt(0)}</div>
            <span>{currentUser}</span>
          </div>

          {/* Network status */}
          <div className="status-indicator">
            <div className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span style={{ color: isConnected ? '#34d399' : '#f87171' }}>
              {isConnected ? (useMetaMask ? 'MetaMask' : 'Local RPC') : 'Disconnected'}
            </span>
            <button 
              className="btn btn-secondary btn-small" 
              onClick={() => connectToNode()}
              style={{ marginLeft: '0.25rem', padding: '0.25rem 0.5rem' }}
            >
              <RotateCw size={14} />
            </button>
          </div>

          {/* Logout button */}
          <button id="btn-logout" className="btn-logout" onClick={handleLogout}>
            <LogOut size={14} />
            Logout
          </button>
        </div>
      </header>

      {/* Main Grid: Sidebar (RPC/Accounts) + Right Content Panels */}
      <div className="dashboard-grid">
        
        {/* LEFT COLUMN: Sidebar (RPC Connection, Accounts) */}
        <aside className="workspace-panels">
          
          {/* RPC Connection Card */}
          <div className="glass-card primary-edge">
            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Cpu size={18} style={{ color: 'var(--primary)' }} />
              Network Connection
            </h3>
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
               <button className="btn btn-primary" style={{ flex: 1 }} onClick={connectMetaMask} disabled={isConnecting}>
                  {useMetaMask ? 'MetaMask Connected' : 'Connect MetaMask'}
               </button>
            </div>

            <div style={{ margin: '1rem 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>OR CONNECT LOCAL NODE</div>
            
            <div className="form-group">
              <label className="form-label">JSON-RPC URL</label>
              <div className="input-container">
                <input 
                  type="text" 
                  className="form-input" 
                  value={rpcUrl}
                  onChange={(e) => setRpcUrl(e.target.value)}
                  placeholder="http://127.0.0.1:8545" 
                />
              </div>
            </div>

            <button 
              className="btn btn-primary" 
              style={{ width: '100%' }}
              onClick={() => connectToNode()}
              disabled={isConnecting}
            >
              {isConnecting ? <span className="spinner"></span> : 'Connect to Node'}
            </button>

            {connectionError && (
              <div className="verification-result not-found" style={{ marginTop: '1rem', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <AlertTriangle size={16} />
                  <span>{connectionError}</span>
                </div>
              </div>
            )}
          </div>

          {/* Accounts List / Active Signer Select */}
          {isConnected && (
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={18} style={{ color: 'var(--primary)' }} />
                  Test Accounts
                </h3>
                <button className="copy-button" onClick={refreshBalances} title="Refresh balances">
                  <RotateCw size={14} />
                </button>
              </div>

              {!isUsingCustomWallet ? (
                <>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    {useMetaMask ? 'MetaMask account currently connected.' : 'Select an unlocked local account. The Hardhat node will sign the transactions automatically.'}
                  </p>
                  
                  <div className="accounts-container">
                    {accounts.map((acc) => {
                      const isAccOwner = acc.address.toLowerCase() === owner.toLowerCase();
                      const isSelected = selectedAddress === acc.address;
                      return (
                        <div 
                          key={acc.address}
                          className={`account-item ${isSelected ? 'active' : ''}`}
                          onClick={() => setSelectedAddress(acc.address)}
                        >
                          <div className="account-header">
                            <span className="account-address">
                              {acc.address.substring(0, 8)}...{acc.address.substring(34)}
                            </span>
                            {isAccOwner && <span className="badge badge-owner">Owner</span>}
                          </div>
                          <span className="account-balance">{acc.balance} ETH</span>
                        </div>
                      );
                    })}
                  </div>
                  
                  <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '1rem', paddingTop: '1rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Or use custom private key</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="password"
                        className="form-input"
                        placeholder="Private Key (0x...)"
                        value={customPrivateKey}
                        onChange={(e) => setCustomPrivateKey(e.target.value)}
                        style={{ fontSize: '0.8rem', padding: '0.5rem' }}
                      />
                      <button 
                        className="btn btn-secondary btn-small"
                        onClick={handleApplyCustomPrivateKey}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span className="badge badge-primary">Custom Burner Wallet Active</span>
                    <button className="btn btn-secondary btn-small" onClick={handleUseNodeAccounts}>
                      Use Node Accounts
                    </button>
                  </div>
                  
                  <div className="account-item active" style={{ cursor: 'default' }}>
                    <div className="account-header">
                      <span className="account-address">
                        {selectedAddress?.substring(0, 10)}...{selectedAddress?.substring(32)}
                      </span>
                      {selectedAddress?.toLowerCase() === owner.toLowerCase() && (
                        <span className="badge badge-owner">Owner</span>
                      )}
                    </div>
                    <span className="account-balance">Custom Wallet Mode</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>

        {/* RIGHT COLUMN: Contract Settings & Interactions */}
        <main className="workspace-panels">
          
          {/* Contract Loader & Statistics */}
          {isConnected && (
            <div className="glass-card">
              <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Layers size={18} style={{ color: 'var(--primary)' }} />
                Smart Contract Connection
              </h3>
              
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, minWidth: '250px' }}>
                  <label className="form-label">Contract Address</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={contractAddress}
                    onChange={(e) => setContractAddress(e.target.value)}
                    placeholder="0x5FbDB2315678afecb367f032d93F642f64180aa3" 
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => handleLoadContract()}
                    disabled={!contractAddress}
                  >
                    Load Instance
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={handleDeployContract}
                    disabled={isDeploying}
                  >
                    {isDeploying ? <span className="spinner"></span> : 'Deploy Contract'}
                  </button>
                </div>
              </div>

              {contractError && (
                <div className="verification-result not-found" style={{ marginTop: '0px', marginBottom: '1.5rem', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <AlertTriangle size={16} />
                    <span>{contractError}</span>
                  </div>
                </div>
              )}

              {/* Show Stats if Contract Loaded */}
              {contract && (
                <div className="stats-grid">
                  <div className="stat-box">
                    <div className="stat-label">Contract Owner</div>
                    <div className="stat-value" style={{ fontSize: '0.9rem', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {owner ? `${owner.substring(0, 10)}...${owner.substring(32)}` : 'Unknown'}
                      <button className="copy-button" onClick={() => triggerCopy(owner)} style={{ marginLeft: '0.25rem' }}>
                        <Clipboard size={12} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="stat-box">
                    <div className="stat-label">Document Count</div>
                    <div className="stat-value">
                      {documentCount !== null ? documentCount : '0'}
                    </div>
                  </div>
                </div>
              )}

              {!contract && (
                <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed var(--border-subtle)', borderRadius: '0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Deploy a new instance or input an existing address to unlock interactive features.
                </div>
              )}
            </div>
          )}

          {/* Interactive Actions Panels (Require Contract Loaded) */}
          {isConnected && contract && (
            <>
              {/* File Drop & In-Browser Hashing */}
              <div className="glass-card">
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <FileText size={18} style={{ color: 'var(--primary)' }} />
                  Drag & Drop Hashing Tool
                </h3>
                
                <div 
                  className={`drag-zone ${isDragging ? 'dragging' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleFileDrop}
                  onClick={() => document.getElementById('file-picker')?.click()}
                >
                  <input 
                    type="file" 
                    id="file-picker" 
                    style={{ display: 'none' }} 
                    onChange={handleFileInput} 
                  />
                  <Upload size={32} className="drag-zone-icon" />
                  <div className="drag-zone-text">
                    Drag and drop your file here, or click to browse
                  </div>
                  <div className="drag-zone-sub">
                    Keccak-256 hash is computed client-side inside the browser. No file data is uploaded.
                  </div>
                </div>

                {isHashing && (
                  <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                    <span className="spinner" style={{ marginRight: '0.5rem' }}></span>
                    Computing Keccak-256 hash...
                  </div>
                )}

                {fileName && computedHash && (
                  <div className="file-info-card">
                    <div className="file-info-header">
                      <span className="file-info-name">
                        <FileText size={14} />
                        {fileName}
                      </span>
                      <span className="file-info-size">{fileSize}</span>
                    </div>
                    <div className="file-info-hash">
                      <span>{computedHash}</span>
                      <button className="copy-button" onClick={() => triggerCopy(computedHash)} title="Copy Hash">
                        <Clipboard size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                      <span className="badge badge-success">Hash Computed</span>
                      {copyFeedback === computedHash && <span className="badge badge-primary">Copied!</span>}
                    </div>
                  </div>
                )}
              </div>

              {/* TWO COLUMN WORKSPACE: Register + Verify */}
              <div className="two-column-workspace">
                
                {/* Panel: Register Document */}
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Plus size={18} style={{ color: 'var(--success)' }} />
                    Register Document
                  </h3>
                  
                  <form onSubmit={handleRegisterDocument}>
                    <div className="form-group">
                      <label className="form-label">Document Hash (bytes32)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        required
                        placeholder="0x..." 
                        value={registerHash}
                        onChange={(e) => setRegisterHash(e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">File URL</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        required
                        placeholder="https://example.com/document.pdf" 
                        value={metadataURI}
                        onChange={(e) => setMetadataURI(e.target.value)}
                      />
                      <div className="form-help">
                        Use a direct http or https file link. CORS-enabled locations are validated in the browser; public links fall back to local server validation.
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-success" 
                      style={{ width: '100%', marginTop: '0.5rem' }}
                      disabled={isRegistering || !registerHash}
                    >
                      {isRegistering ? <span className="spinner"></span> : 'Register On-Chain'}
                    </button>
                  </form>

                  {registerSuccess && (
                    <div className="verification-result found" style={{ padding: '0.75rem' }}>
                      <div className="result-message">
                        <CheckCircle size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                        <span className="result-value">{registerSuccess}</span>
                      </div>
                    </div>
                  )}

                  {registerError && (
                    <div className="verification-result not-found" style={{ padding: '0.75rem' }}>
                      <div className="result-message">
                        <AlertTriangle size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                        <span className="result-value">{registerError}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Panel: Lookup / Verify */}
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Search size={18} style={{ color: 'var(--primary)' }} />
                    Verify Document
                  </h3>
                  
                  <form onSubmit={handleLookupDocument}>
                    <div className="form-group">
                      <label className="form-label">Document Hash (bytes32)</label>
                      <input 
                        type="text" 
                        className="form-input" 
                        required
                        placeholder="0x..." 
                        value={lookupHash}
                        onChange={(e) => setLookupHash(e.target.value)}
                      />
                    </div>

                    <button 
                      type="submit" 
                      className="btn btn-primary" 
                      style={{ width: '100%', marginTop: '2.5rem' }}
                      disabled={isLookingUp || !lookupHash}
                    >
                      {isLookingUp ? <span className="spinner"></span> : 'Verify Hash'}
                    </button>
                  </form>

                  {lookupResult && lookupResult.searched && (
                    lookupResult.exists ? (
                      <div className="verification-result found">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          <CheckCircle size={18} style={{ color: 'var(--success)' }} />
                          <span style={{ color: '#fff' }}>VERIFIED REGISTRATION</span>
                        </div>
                        <div className="result-body">
                          <div className="result-row">
                            <span className="result-label">Uploader:</span>
                            <span className="result-value result-value-mono">{lookupResult.uploader}</span>
                          </div>
                          <div className="result-row">
                            <span className="result-label">Metadata:</span>
                            <span className="result-value">{lookupResult.metadataURI}</span>
                          </div>
                          <div className="result-row">
                            <span className="result-label">Registered At:</span>
                            <span className="result-value">{lookupResult.timestamp}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="verification-result not-found">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
                          <AlertTriangle size={18} style={{ color: 'var(--error)' }} />
                          <span style={{ color: '#fff' }}>NOT REGISTERED</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          This hash does not exist in the contract registry.
                        </p>
                      </div>
                    )
                  )}

                  {lookupError && (
                    <div className="verification-result not-found" style={{ padding: '0.75rem' }}>
                      <div className="result-message">
                        <AlertTriangle size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
                        <span className="result-value">{lookupError}</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* TWO COLUMN WORKSPACE: Admin Controls & Event Activity Feed */}
              <div className="two-column-workspace">
                
                {/* Panel: Admin / Owner Actions */}
                <div className="glass-card error-edge">
                  <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={18} style={{ color: 'var(--error)' }} />
                    Owner Controls
                  </h3>
                  
                  {/* Warning if not Owner */}
                  {selectedAddress?.toLowerCase() !== owner.toLowerCase() && (
                    <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '0.5rem', fontSize: '0.8rem', marginBottom: '1rem', color: '#fcd34d' }}>
                      <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                      <span>
                        Active account is not the owner. Transactions will revert unless you switch to the owner account.
                      </span>
                    </div>
                  )}

                  {/* Revoke Doc Form */}
                  <form onSubmit={handleRevokeDocument} style={{ marginBottom: '1.5rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Revoke Document by Hash</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          required
                          placeholder="0x..." 
                          value={revokeHash}
                          onChange={(e) => setRevokeHash(e.target.value)}
                          style={{ fontSize: '0.85rem' }}
                        />
                        <button 
                          type="submit" 
                          className="btn btn-danger btn-small"
                          disabled={isRevoking || !revokeHash}
                          style={{ flexShrink: 0 }}
                        >
                          {isRevoking ? <span className="spinner"></span> : <Trash2 size={16} />}
                        </button>
                      </div>
                    </div>
                    {revokeSuccess && <p style={{ fontSize: '0.8rem', color: '#34d399', wordBreak: 'break-all' }}>{revokeSuccess}</p>}
                    {revokeError && <p style={{ fontSize: '0.8rem', color: '#f87171' }}>{revokeError}</p>}
                  </form>

                  {/* Transfer Ownership Form */}
                  <form onSubmit={handleTransferOwnership}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Transfer Contract Ownership</label>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <input 
                          type="text" 
                          className="form-input" 
                          required
                          placeholder="New owner address (0x...)" 
                          value={newOwnerAddress}
                          onChange={(e) => setNewOwnerAddress(e.target.value)}
                          style={{ fontSize: '0.85rem' }}
                        />
                        <button 
                          type="submit" 
                          className="btn btn-primary btn-small"
                          disabled={isTransferring || !newOwnerAddress}
                          style={{ flexShrink: 0 }}
                        >
                          {isTransferring ? <span className="spinner"></span> : <ArrowRightLeft size={16} />}
                        </button>
                      </div>
                    </div>
                    {transferSuccess && <p style={{ fontSize: '0.8rem', color: '#34d399', wordBreak: 'break-all' }}>{transferSuccess}</p>}
                    {transferError && <p style={{ fontSize: '0.8rem', color: '#f87171' }}>{transferError}</p>}
                  </form>
                </div>

                {/* Panel: Activity Feed */}
                <div className="glass-card">
                  <h3 style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Activity size={18} style={{ color: 'var(--primary)' }} />
                    Live Activity Logs
                  </h3>

                  <div className="logs-container">
                    {events.length === 0 ? (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>
                        No events logged yet. Try registering or revoking a document!
                      </p>
                    ) : (
                      events.map((ev, index) => (
                        <div 
                          key={`${ev.txHash}-${index}`}
                          className={`log-item ${ev.type === 'registered' ? 'register' : 'revoke'}`}
                        >
                          <div className="log-item-header">
                            <span className="log-item-title">
                              {ev.type === 'registered' ? 'Document Registered' : 'Document Revoked'}
                            </span>
                            <span className="log-item-time">Block {ev.blockNumber}</span>
                          </div>
                          
                          <div className="log-item-details">
                            <div className="log-item-row">
                              <span className="log-item-label">Hash:</span>
                              <span className="log-item-value">{ev.docHash.substring(0, 14)}...{ev.docHash.substring(50)}</span>
                            </div>
                            <div className="log-item-row">
                              <span className="log-item-label">
                                {ev.type === 'registered' ? 'Uploader:' : 'Revoker:'}
                              </span>
                              <span className="log-item-value">{ev.actor.substring(0, 8)}...{ev.actor.substring(34)}</span>
                            </div>
                            {ev.type === 'registered' && (
                              <div className="log-item-row">
                                <span className="log-item-label">Time:</span>
                                <span className="log-item-value" style={{ fontFamily: 'sans-serif' }}>{ev.timestamp}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            </>
          )}

          {/* Node Instructions if Disconnected */}
          {!isConnected && (
            <div className="glass-card error-edge" style={{ padding: '2rem', textAlign: 'center' }}>
              <AlertTriangle size={48} style={{ color: 'var(--error)', marginBottom: '1rem' }} />
              <h2 style={{ marginBottom: '0.75rem' }}>Local Hardhat Node Required</h2>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '500px', margin: '0 auto 1.5rem' }}>
                To interactively test your smart contract without browser extensions, please make sure your local Hardhat node is running and the contracts are compiled.
              </p>
              
              <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-subtle)', borderRadius: '0.75rem', padding: '1rem', margin: '0 auto 1.5rem', maxWidth: '500px', textAlign: 'left', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                <p style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}># Step 1: Start the Hardhat Node</p>
                <p style={{ color: '#fff', marginBottom: '1rem' }}>npx hardhat node</p>
                
                <p style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}># Step 2: Compile & Deploy Document Registry</p>
                <p style={{ color: '#fff' }}>npx hardhat ignition deploy ignition/DocumentRegistry.ts --network localhost</p>
              </div>

              <button className="btn btn-primary" onClick={() => connectToNode()}>
                <RotateCw size={16} /> Reconnect
              </button>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
