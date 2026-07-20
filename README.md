# Document Registry DApp

A fullstack decentralized application (DApp) for registering and verifying document authenticity on the Ethereum blockchain. Users create an account, log in, connect their wallet, and interact with the `DocumentRegistry` smart contract directly from the browser.

---

## Features

### 🔐 User Authentication
- **Create Account** — register with a username and password; credentials are hashed with SHA-256 (browser-native `crypto.subtle`) and stored locally
- **Sign In** — password-based login with session persistence across page refreshes
- **Password strength indicator** and real-time match validation on registration
- **Logout** — clears the session from the browser

### ⛓️ Blockchain / Smart Contract
- **Document Registration** — compute a Keccak-256 hash of any file client-side and register it on-chain with a metadata URI
- **Document Verification** — look up any hash to confirm it exists in the registry, see who uploaded it and when
- **File Drag & Drop Hashing** — drop a file onto the UI to instantly compute its hash without uploading any data
- **Metadata URI Validation** — the frontend validates that the file at the provided URL matches the local hash before submitting a transaction
- **Admin Controls** — contract owner can revoke documents or transfer ownership
- **My Entries** — scan indexed events to see active and revoked documents uploaded by the connected wallet
- **Registry Discovery** — create, import, search, and browse registries through an on-chain factory catalog
- **Wallet Dashboard** — see the active address, network, precise native-currency balance, and personal registry totals
- **MetaMask Integration** — connect and sign transactions with MetaMask
- **Local Hardhat Node** — full support for a local RPC node for development and testing
- **Centralized Settings** — MetaMask, JSON-RPC, explorer, currency, event scan range, and factory configuration live on one page

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contract | Solidity `^0.8.24`, Hardhat 3 |
| Frontend Framework | React 18, TypeScript, Vite |
| Blockchain Library | ethers.js v6 |
| Styling | Vanilla CSS (dark glassmorphic theme) |
| Auth Storage | Browser `localStorage` + `crypto.subtle` SHA-256 |
| Icons | lucide-react |

---

## Project Structure

```
document-registry/
├── contracts/
│   ├── DocumentRegistry.sol      # Main smart contract
│   ├── DocumentRegistryFactory.sol # On-chain registry catalog
│   └── Counter.sol               # Example contract
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main DApp (blockchain UI + auth gate)
│   │   ├── AuthPage.tsx          # Login / Create Account screen
│   │   ├── blockchain.ts         # Catalog, event indexing, settings helpers
│   │   ├── index.css             # Global styles
│   │   └── contracts/
│   │       └── DocumentRegistry.json  # Compiled ABI + bytecode
│   ├── index.html
│   ├── vite.config.ts            # Dev server + URI validation middleware
│   └── package.json
├── ignition/                     # Hardhat Ignition deployment modules
├── scripts/                      # Standalone Hardhat scripts
├── test/                         # TypeScript integration tests
├── hardhat.config.ts
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** v18 or later
- **MetaMask** browser extension (for wallet connectivity)

### Installation

1. Install root (Hardhat) dependencies:
   ```bash
   npm install
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

---

## Running Locally

### Step 1 — Start the Hardhat local node

Open a terminal and run:
```bash
npx hardhat node
```
This starts a local Ethereum network at `http://127.0.0.1:8545` and prints 20 pre-funded test accounts.

### Step 2 — Deploy the registry catalog

In a second terminal:
```bash
npx hardhat ignition deploy ignition/modules/DocumentRegistryFactory.ts --network localhost
```
Copy the factory address from the output. You can also deploy it from the Settings page after connecting an account.

### Add local test ETH to a MetaMask account

With the Hardhat node still running, use the account address and ETH amount options:

```bash
npm run fund:local -- --account 0xYOUR_METAMASK_ADDRESS --amount 100
```

The command adds to the account's existing local balance and mines a block so MetaMask can detect the change. This creates development-only ETH on chain `31337`; it cannot fund an account on a public network.

### Step 3 — Start the frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

### Step 4 — Use the app

1. **Create an account** on the login screen (or sign in if you already have one)
2. Open **Settings**, choose MetaMask or JSON-RPC, and connect to the network
3. Enter the deployed factory address and save the network settings
4. Open **Explore** and create a named registry, or import one you already own
5. Open the registry to hash, register, verify, browse, revoke, or transfer ownership
6. Open **My Entries** to see documents uploaded by the active wallet across cataloged registries

---

## Smart Contract Reference

**Contract:** `DocumentRegistry.sol`

| Function | Type | Description |
|---|---|---|
| `registerDocument(bytes32, string)` | write | Register a document hash with a metadata URI |
| `getDocument(bytes32)` | read | Returns uploader address, metadata URI, and timestamp |
| `isRegistered(bytes32)` | read | Returns `true` if the hash exists in the registry |
| `revokeDocument(bytes32)` | write (owner only) | Permanently remove a document from the registry |
| `transferOwnership(address)` | write (owner only) | Transfer contract ownership to a new address |

**Events emitted:**
- `DocumentRegistered(bytes32 indexed docHash, address indexed uploader, uint256 timestamp)`
- `DocumentRevoked(bytes32 indexed docHash, address indexed revokedBy)`

**Factory:** `DocumentRegistryFactory.sol`

| Function | Type | Description |
|---|---|---|
| `createRegistry(string, string)` | write | Deploy and catalog a named registry owned by the caller |
| `importRegistry(address, string, string)` | write | Catalog a compatible registry owned by the caller |
| `getRegistries(uint256, uint256)` | read | Return a paginated slice of cataloged registries |
| `registryCount()` | read | Return the catalog size |

The `DocumentRegistry` constructor now takes an explicit initial-owner address. Previously deployed contracts remain readable and can be imported into a new factory by their current owner.

---

## Running Tests

```bash
# Smart contract tests
npx hardhat test

# TypeScript type check
npx tsc --noEmit
```

---

## User Flow Diagram

```
Open App
  │
  ├─ No session → Auth Screen
  │     ├─ Create Account (username + password, SHA-256 hashed)
  │     └─ Sign In → session saved to localStorage
  │
  └─ Session active → Main DApp
        ├─ Settings → connect MetaMask or JSON-RPC
        ├─ Explore → create, import, and browse registries
        ├─ Registry → hash, register, verify, and browse documents
        ├─ My Entries → view uploads by the active wallet
        ├─ Dashboard → wallet balance and personal summary
        ├─ Owner controls → revoke / transfer ownership
        └─ Logout → returns to Auth Screen
```

---

## Security Notes

> Credentials are stored in your browser's `localStorage`. Passwords are hashed client-side with SHA-256 and are never transmitted to any server. This auth layer is intended for course/demo use. For production applications, use a proper backend with bcrypt and HTTPS.
