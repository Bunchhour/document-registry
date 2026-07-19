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
- **Live Activity Feed** — real-time event log of all registrations and revocations from the contract
- **MetaMask Integration** — connect and sign transactions with MetaMask
- **Local Hardhat Node** — full support for a local RPC node for development and testing

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
│   └── Counter.sol               # Example contract
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main DApp (blockchain UI + auth gate)
│   │   ├── AuthPage.tsx          # Login / Create Account screen
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

### Step 2 — Deploy the smart contract

In a second terminal:
```bash
npx hardhat ignition deploy ignition/modules/DocumentRegistry.ts --network localhost
```
Copy the deployed contract address from the output.

### Step 3 — Start the frontend

```bash
cd frontend
npm run dev
```

Open **http://localhost:3000** in your browser.

### Step 4 — Use the app

1. **Create an account** on the login screen (or sign in if you already have one)
2. **Connect to the network** — click **Connect MetaMask** or use the local RPC URL (`http://127.0.0.1:8545`)
3. **Load the contract** — paste the deployed address and click **Load Instance**
4. **Register a document** — drag and drop a file to hash it, then submit with a metadata URL
5. **Verify a document** — enter any hash to check if it's registered on-chain

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
        ├─ Connect Wallet (MetaMask or local RPC)
        ├─ Load / Deploy DocumentRegistry contract
        ├─ Drop file → Keccak-256 hash computed in browser
        ├─ Register Document on-chain
        ├─ Verify Document by hash
        ├─ Admin: Revoke / Transfer Ownership
        └─ Logout → returns to Auth Screen
```

---

## Security Notes

> Credentials are stored in your browser's `localStorage`. Passwords are hashed client-side with SHA-256 and are never transmitted to any server. This auth layer is intended for course/demo use. For production applications, use a proper backend with bcrypt and HTTPS.
