# 🔐 TRON Vault Relayer System

This repository implements a smart contract system for relayed TRC20 token transfers via deterministic vaults, deployable using `CREATE2` on the TRON blockchain. It includes:

* **`Vault`**: Minimal, signature-authorized token vault.
* **`VaultFactory`**: Deterministic `CREATE2` deployer with nonce support.
* **`EntryPoint`**: Meta-transaction relayer that deploys vaults on demand and forwards signed calls.

---

## 📆 Contracts Overview

### `Vault`

* Ownable TRC20 vault.
* Supports gasless `send()` transfers with EIP-191-style signatures.
* Nonce-protected to prevent replay attacks.
* Constructor-locked and immutable owner.

### `VaultFactory`

* Deploys `Vault` contracts deterministically using `CREATE2`.
* Tracks nonces per user to avoid collisions.
* Verifiable vault computation via `computeAddress()`.

### `EntryPoint`

* Acts as a trusted relayer.
* Automatically deploys a user’s vault if not yet deployed.
* Emits `MetaTransactionExecuted` after forwarding a `send()`.

---

## 🛠 Installation

```bash
git clone https://github.com/yourname/vault-relayer-tron.git
cd vault-relayer-tron
npm install
```

> Requires Node.js, TronBox, and `solc` 0.8.20 compatible compiler.

---

## 🔐 Environment Setup

Create a `.env` file:

```dotenv
PRIVATE_KEY_MAINNET=your_private_key_here
```

Ensure it's ignored:

```bash
echo ".env" >> .gitignore
```

---

## 🚀 Deployment

### Compile

```bash
tronbox compile
```

### Local Deployment

```bash
tronbox migrate --network development
```

### Mainnet Deployment

```bash
source .env && tronbox migrate --network mainnet
```

Ensure `.env` has sufficient TRX staked or balance.

---

## 📏 Energy Estimation

Use [this script](#) or estimate manually:

* Contract size: \~9 KB
* Estimated Energy: \~1.5–2M
* TRX Cost: \~650–900 TRX without staking
* **Tip**: Stake TRX for free energy instead of paying per deployment.

---

## 💫 Staking for Energy

* **Stake TRX** to gain free daily energy and bandwidth.
* Use [TronLink](https://www.tronlink.org/) or TronGrid’s [freeze interface](https://tronscan.org/#/wallet/resources).
* **1000 TRX** staked ≈ enough to cover 1–2 deployments/day depending on size.

---

## ⚙️ Scripts

### Estimate Deployment Energy

```bash
node scripts/estimate.js
```

Includes:

* Bytecode-based cost
* TRX calculation
* Account energy status

---

## 📜 Verifying Contracts

While TRON doesn't support automatic Etherscan-style verification, you can:

1. Flatten contracts manually.
2. Upload bytecode and ABI to Tronscan or call `getContract` via API.
3. For external users, expose your contract source via GitHub or IPFS.

---

## ✅ Meta-Tx Flow Summary

1. User signs a `send(token, to, amount, deadline, nonce)` message.
2. `EntryPoint.relay()`:

   * Deploys the vault if not deployed.
   * Forwards call to `Vault.send()`.
3. Vault:

   * Verifies signature.
   * Transfers tokens.
   * Increments nonce.

---

## 📂 Repo Structure

```
contracts/
  ├── Vault.sol
  ├── VaultFactory.sol
  └── EntryPoint.sol

migrations/
  ├── 1_initial_migration.js
  └── 2_deploy_contracts.js

scripts/
  └── estimate.js

build/ (auto-generated)
```

---

## 🤠 Future Ideas

* Relayer gas sponsorship rules
* Signature batching
* UI for vault interactions
* GraphQL subgraph integration (TheGraph-style indexing)
