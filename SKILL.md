# DipCoin Perpetual Trading CLI — Agent Skill Guide

This document teaches AI agents (e.g. OpenClaw) how to install, configure, and use the `dipcoin-cli` tool for perpetual futures trading on the Sui blockchain.

## Installation

```bash
npm install -g dipcoin-cli
```

After installation, the `dipcoin-cli` command is available globally.

## Configuration

Before using the CLI, set up your credentials. Choose one of two methods:

### Method 1: Global config file (recommended)

```bash
mkdir -p ~/.config/dipcoin
cat > ~/.config/dipcoin/env << 'EOF'
DIPCOIN_MNEMONIC=word1 word2 word3 ... word12
DIPCOIN_NETWORK=mainnet
EOF
```

### Method 2: Environment variables

```bash
export DIPCOIN_MNEMONIC="word1 word2 word3 ... word12"
export DIPCOIN_NETWORK=mainnet   # or testnet
```

### Environment variables reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DIPCOIN_MNEMONIC` | Yes | 12-word Sui mnemonic phrase |
| `DIPCOIN_NETWORK` | No | `mainnet` or `testnet` (default: `testnet`) |
| `DIPCOIN_DEFAULT_VAULT_INDEX` | No | Default sub-account index |

## Global Options

These options apply to all commands and must be placed **before** the subcommand:

```bash
dipcoin-cli [global-options] <command> [command-options]
```

| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format (machine-readable, recommended for agents) |
| `--vault-index <n>` | Use HD-derived sub-account at index N (0 = main account) |
| `-V, --version` | Show version |

**Important for agents:** Always use `--json` to get structured JSON output for parsing.

## Commands Reference

### Market Data (read-only, no auth needed)

```bash
# List all available trading pairs
dipcoin-cli --json market pairs

# Get ticker info (price, volume, funding rate)
dipcoin-cli --json market ticker BTC

# Get order book
dipcoin-cli --json market orderbook BTC

# Get oracle price
dipcoin-cli --json market oracle BTC
```

Symbols auto-normalize: `BTC` becomes `BTC-PERP`. You can use either form.

### Account Information

```bash
# Show account info (balance, margin, PnL)
dipcoin-cli --json account info

# Show account info for a specific vault address
dipcoin-cli --json account info --vault <address>

# Show on-chain coin balances
dipcoin-cli --json balance
```

### Deposit & Withdraw (on-chain USDC operations)

```bash
# Deposit USDC to exchange (required before trading)
dipcoin-cli account deposit <amount>

# Withdraw USDC from exchange
dipcoin-cli account withdraw <amount>
```

### Trading

#### Open a position (USDC margin mode)

The default mode: specify USDC margin amount and leverage. The CLI auto-converts to quantity based on current market price.

```bash
# Buy BTC with 100 USDC margin at 10x leverage (market order)
dipcoin-cli trade buy BTC 100USDC 10x

# Sell ETH with 50 USDC margin at 5x leverage
dipcoin-cli trade sell ETH 50USDC 5x

# Limit order (auto-detected from --price)
dipcoin-cli trade buy BTC 100USDC 10x --price 95000

# With take-profit and stop-loss
dipcoin-cli trade buy BTC 100USDC 10x --tp 105000 --sl 90000
```

#### Open a position (explicit quantity mode)

```bash
# Buy 0.01 BTC at 10x leverage
dipcoin-cli trade buy BTC 0 10x --qty 0.01

# Sell 1 ETH at 5x leverage with limit price
dipcoin-cli trade sell ETH 0 5x --qty 1 --price 3500
```

Note: When using `--qty`, the `<amount>` argument is ignored (use 0 as placeholder).

#### Close a position

```bash
# Close a long position by selling (reduce-only)
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only

# Close a short position by buying (reduce-only)
dipcoin-cli trade buy ETH 0 5x --qty 1 --reduce-only
```

#### Cancel orders

```bash
dipcoin-cli trade cancel <symbol> <hash1> [hash2...]
```

#### Trade options summary

| Option | Description |
|--------|-------------|
| `--qty <quantity>` | Specify order quantity directly (bypasses USDC conversion) |
| `--price <p>` | Limit order price (auto-enables LIMIT order type) |
| `--reduce-only` | Reduce-only order (for closing positions) |
| `--tp <price>` | Take profit trigger price |
| `--sl <price>` | Stop loss trigger price |
| `--vault <address>` | Vault/creator address override |

### Positions

```bash
# List all open positions
dipcoin-cli --json position list

# Filter by symbol
dipcoin-cli --json position list --symbol BTC-PERP

# Set TP/SL on existing position (closing side: sell for long, buy for short)
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 105000 --sl-trigger 90000

# TP/SL with limit order type
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 105000 --tp-type limit --tp-price 105000

# Add/remove margin on a position
dipcoin-cli position margin add BTC 5
dipcoin-cli position margin remove BTC 2
```

### Open Orders

```bash
# List all open orders
dipcoin-cli --json orders

# Filter by symbol
dipcoin-cli --json orders --symbol BTC-PERP
```

### History

```bash
# Order history
dipcoin-cli --json history orders --symbol BTC-PERP --page 1 --size 20

# Funding settlements
dipcoin-cli --json history funding --symbol BTC-PERP

# Balance changes
dipcoin-cli --json history balance
```

All history commands support `--vault <address>` and `--begin-time <ms>` (epoch milliseconds).

### Sub-Accounts (HD-derived)

The CLI derives multiple accounts from a single mnemonic. Index 0 = main account, index 1+ = sub-accounts.

```bash
# List derived addresses
dipcoin-cli --json sub-account list --count 5

# Register sub-account on-chain (one-time setup)
dipcoin-cli sub-account setup 1

# Use sub-account for trading (global option)
dipcoin-cli --vault-index 1 trade buy BTC 100USDC 10x
dipcoin-cli --vault-index 1 position list
dipcoin-cli --vault-index 1 account info
```

### Vault Operations (on-chain fund management)

```bash
# Create a vault
dipcoin-cli vault create --name "My Vault" --trader <address> --max-cap 10000 \
  --min-deposit 100 --creator-share 10 --profit-share 20 --initial 1000

# List your vaults
dipcoin-cli --json vault list

# Vault details
dipcoin-cli --json vault info <vaultId>

# Deposit/withdraw from vault
dipcoin-cli vault deposit <vaultId> <amount>
dipcoin-cli vault withdraw <vaultId> <shares>

# Manage vault
dipcoin-cli vault set-trader <vaultId> <address>
dipcoin-cli vault set-deposit-status <vaultId>          # enable
dipcoin-cli vault set-deposit-status <vaultId> --disable # disable
dipcoin-cli vault set-max-cap <vaultId> <amount>
dipcoin-cli vault set-min-deposit <vaultId> <amount>
dipcoin-cli vault set-auto-close <vaultId>
dipcoin-cli vault close <vaultId>
dipcoin-cli vault remove <vaultId>
dipcoin-cli vault claim <vaultId>
```

## Typical Agent Workflow

Here is a recommended step-by-step workflow for an agent:

### 1. Check market conditions

```bash
dipcoin-cli --json market pairs        # see available pairs
dipcoin-cli --json market ticker BTC   # check current price
dipcoin-cli --json market orderbook BTC # check liquidity
```

### 2. Check account status

```bash
dipcoin-cli --json account info        # check balance & margin
dipcoin-cli --json position list       # check existing positions
dipcoin-cli --json orders              # check open orders
```

### 3. Place a trade

```bash
# Open long BTC with 100 USDC at 10x with risk management
dipcoin-cli --json trade buy BTC 100USDC 10x --tp 105000 --sl 90000
```

### 4. Monitor and manage

```bash
dipcoin-cli --json position list       # monitor positions
dipcoin-cli --json orders              # monitor orders

# Adjust TP/SL if needed
dipcoin-cli position tpsl BTC --side sell --quantity 0.01 --leverage 10 \
  --tp-trigger 110000 --sl-trigger 92000

# Add margin if position is at risk
dipcoin-cli position margin add BTC 10
```

### 5. Close position

```bash
# Close by reduce-only order
dipcoin-cli trade sell BTC 0 10x --qty 0.01 --reduce-only
```

## Error Handling

- Non-zero exit code indicates failure
- With `--json`, errors are in the JSON output's `error` field
- Common errors: `DIPCOIN_MNEMONIC not set`, `PerpetualID not found`, `Authentication failed`
- If authentication fails, the CLI automatically re-authenticates on retry

## Notes

- All prices from the API are in 18-decimal "wei" format (divide by 10^18 for human-readable)
- The `--json` output returns raw API values; agents should handle wei conversion
- The CLI uses system `curl` for HTTP requests (not Node.js fetch/axios)
- Supported trading pairs include: BTC-PERP, ETH-PERP, SUI-PERP, SOL-PERP, BNB-PERP, XRP-PERP (check `market pairs` for current list)
