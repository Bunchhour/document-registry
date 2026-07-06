# Document Registry DApp

This repository contains the source code for the Document Registry Decentralized Application (DApp). The project includes both the smart contract and the Web3-enabled frontend.

## Features

- **Document Registration:** Allows users to securely register a document hash on the Ethereum blockchain.
- **Verification:** Anyone can verify the authenticity of a document by checking its hash against the registry.
- **Link Validation:** The frontend ensures that the provided metadata URI is valid and matches the uploaded file's hash before submitting the transaction.
- **MetaMask Integration:** Seamlessly connect and sign transactions using your MetaMask wallet.
- **Local Fallback:** A local RPC connection mode is provided for testing and development without a browser extension.

## Tech Stack

- **Smart Contract:** Solidity, Hardhat 3
- **Frontend:** React, Vite, TypeScript, ethers.js
- **Styling:** CSS

## Getting Started

### Prerequisites

- Node.js (v18+)
- MetaMask browser extension

### Installation

1. Clone the repository and install dependencies for the root (Hardhat) project:
   ```bash
   npm install
   ```

2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

### Running Locally

1. Start the Hardhat local node:
   ```bash
   npx hardhat node
   ```

2. Deploy the `DocumentRegistry` contract to the local network:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```
   *Note: Save the deployed contract address.*

3. Start the Vite development server for the frontend:
   ```bash
   cd frontend
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.
5. Connect your MetaMask wallet (make sure it's set to the Localhost network at `http://127.0.0.1:8545`).
6. Paste the deployed contract address into the DApp and start interacting!

## Testing

To run the smart contract tests:

```bash
npx hardhat test
```
