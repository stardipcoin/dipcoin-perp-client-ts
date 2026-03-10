# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DipCoin Perpetual Trading CLI (`dipcoin-cli`) — a TypeScript CLI and SDK for perpetual futures trading on the Sui blockchain. It interacts with DipCoin's on-chain smart contracts and off-chain REST API for order placement, position management, and account operations.

## Commands

```bash
# Run CLI in development (uses tsx)
npm run cli -- <command> [options]

# Build (rollup bundles cli/index.ts -> dist/cli.cjs as a single CJS executable)
npm run build

# Lint
npm run lint
```

There are no tests configured — jest and test files have been removed.

## Architecture

### Two-layer design: SDK (`src/`) + CLI (`cli/`)

**SDK (`src/sdk/sdk.ts`)** — `DipCoinPerpSDK` is the core class. It handles:
- JWT authentication via signed onboarding message (cached in `~/.config/dipcoin/jwt/`)
- REST API calls through `HttpClient` (uses system `curl` via child_process to bypass Cloudflare TLS fingerprinting — do NOT replace with axios/fetch)
- On-chain transaction building and execution via `@mysten/sui` and `@pythnetwork/pyth-sui-js`
- Order signing with the order-signer module

**CLI (`cli/`)** — Commander.js commands that consume the SDK. Each file in `cli/commands/` registers a command group (trade, position, market, orders, account, balance, history, vault, sub-account).

### Key modules

- `src/onchain/transaction-builder.ts` — Builds Sui `Transaction` objects for deposit, withdraw, margin adjustment, sub-account operations. Reads deployment config for package IDs and object IDs.
- `src/onchain/exchange.ts` — Executes built transactions against the Sui RPC.
- `src/onchain/order-signer.ts` — Constructs order message bytes for off-chain signature verification.
- `src/services/httpClient.ts` — HTTP client that spawns `curl` subprocesses. Adds `X-Wallet-Address` and `Authorization: Bearer` headers for authenticated endpoints.
- `src/config/deployed/` — JSON deployment configs per network (mainnet/testnet) containing package IDs, object IDs, and per-market Perpetual/PriceInfoObject IDs.
- `src/utils/jwt-cache.ts` — Persists JWT tokens to `~/.config/dipcoin/jwt/<address>.json`.

### SDK factory and vault system (`cli/utils/sdk-factory.ts`)

The CLI derives Sui keypairs from a mnemonic using SLIP-0010 HD paths (`m/44'/784'/{index}'/0'/0'`). Index 0 is the main account; index N (>0) creates a sub-account/vault keypair. Two SDK creation modes:
- `getSDK(vaultIndex?)` — Trading mode: main keypair signs auth, sub-keypair signs orders
- `getVaultSDK(vaultIndex)` — On-chain mode: vault keypair is the signer for deposit/withdraw

### Wei convention

Prices, quantities, and most numeric values from the API and deployment config use 18-decimal "wei" format (value * 10^18). The SDK converts between human-readable and wei using `formatNormalToWei()` / `formatNormalToWeiBN()`. USDC uses 6 decimals on-chain.

### Environment variables

Env loaded from `~/.config/dipcoin/env` or `.env` in cwd:
- `DIPCOIN_MNEMONIC` — 12-word Sui mnemonic (required)
- `DIPCOIN_NETWORK` — `mainnet` or `testnet` (default: testnet)
- `DIPCOIN_DEFAULT_VAULT_INDEX` — Default vault index

## Code Style

- Prettier: double quotes, semicolons, trailing commas (es5), 100 char width, 2-space indent
- ESLint with `@typescript-eslint` + prettier plugin
- Symbol normalization: bare symbols like "BTC" auto-append "-PERP" suffix via `normalizeSymbol()`
- All CLI output supports `--json` flag for machine-readable JSON output
