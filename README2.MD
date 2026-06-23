# DocumentRegistry — Solidity smart contract assignment

A minimal contract that registers document hashes on-chain (e.g. proof that
a document existed at a given time), built to satisfy a standard
"store/retrieve + access control" smart contract assignment.

## Assignment requirements → where they live

| Requirement | Where |
|---|---|
| State variables | `owner`, `documentCount`, `documents` mapping (contracts/DocumentRegistry.sol) |
| Store function | `registerDocument(bytes32, string)` |
| Retrieve function | `getDocument(bytes32)`, `isRegistered(bytes32)` |
| Validation | `require` checks: non-zero hash, no duplicate registration, non-empty metadata |
| Access control | `onlyOwner` modifier on `revokeDocument` and `transferOwnership` |

The contract itself (`contracts/DocumentRegistry.sol`) is identical no matter
which setup below you use — Solidity doesn't change based on the JS tooling
around it.

## Two variants — pick the one matching your `hardhat init`

**A. JavaScript / Hardhat 2** (`npx hardhat init` → "Create a JavaScript project")

```
document-registry/
├── contracts/DocumentRegistry.sol
├── test/DocumentRegistry.test.js
├── scripts/deploy.js
├── hardhat.config.js
└── package.json
```

```bash
npm install
npx hardhat compile
npx hardhat test
```

Run against a local chain:

```bash
# terminal 1
npx hardhat node

# terminal 2
npx hardhat run scripts/deploy.js --network localhost
```

Interact manually:

```bash
npx hardhat console --network localhost
```
```js
const Registry = await ethers.getContractFactory("DocumentRegistry");
const registry = await Registry.attach("PASTE_DEPLOYED_ADDRESS");
const hash = ethers.keccak256(ethers.toUtf8Bytes("my-doc"));
await registry.registerDocument(hash, "ipfs://Qm123");
await registry.getDocument(hash);
```

---

**B. TypeScript / Hardhat 3** (`npx hardhat --init` → "A TypeScript Hardhat project using Mocha and Ethers.js")

```
document-registry/
├── contracts/DocumentRegistry.sol
├── test/DocumentRegistry.ts
├── ignition/modules/DocumentRegistry.ts
├── hardhat.config.ts
└── package.json   (needs "type": "module")
```

```bash
npx hardhat build      # compile (alias: npx hardhat compile)
npx hardhat test
```

Run against a local chain:

```bash
# terminal 1
npx hardhat node

# terminal 2
npx hardhat ignition deploy ignition/modules/DocumentRegistry.ts --network localhost
```

Interact manually:

```bash
npx hardhat console --network localhost
```
```js
const { network } = await import("hardhat");
const { ethers } = await network.create();
const registry = await ethers.getContractAt("DocumentRegistry", "PASTE_DEPLOYED_ADDRESS");
const hash = ethers.keccak256(ethers.toUtf8Bytes("my-doc"));
await registry.registerDocument(hash, "ipfs://Qm123");
await registry.getDocument(hash);
```