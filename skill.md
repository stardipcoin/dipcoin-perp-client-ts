# DipCoin Perpetual Trading CLI

## Skill Overview

This skill provides access to the DipCoin perpetual contract trading platform on the Sui blockchain. You can execute trades (market/limit orders), manage positions, deposit/withdraw funds, and query market data through a CLI tool.

## Installation

```bash
npm install -g dipcoin-cli
```

Verify installation:

```bash
dipcoin-cli --help
```

You should see the help output listing available commands. If you see errors, ensure Node.js >= 18 is installed.

## Configuration

The CLI reads configuration from a `.env` file in the current working directory.

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | **Yes** | Sui wallet private key (starts with `suiprivkey...`) |
| `NETWORK` | **Yes** | `mainnet` or `testnet` (default: `testnet`) |
| `SUB_ACCOUNT_KEY` | No | Sub-account private key for main/sub separation |
| `VAULT_ADDRESS` | No | Vault address for vault-based queries and trading |

### Setup Steps

**IMPORTANT: Never ask the user for their private key. Never accept, log, or handle private keys in the conversation. The user must configure the `.env` file themselves.**

1. Tell the user to create a `.env` file in their working directory and fill in:
   - `PRIVATE_KEY` - their Sui wallet private key (starts with `suiprivkey...`)
   - `NETWORK` - set to `mainnet` or `testnet`
   - (Optional) `SUB_ACCOUNT_KEY` and `VAULT_ADDRESS` if needed

2. After the user confirms they have configured the `.env` file, verify it works:

```bash
dipcoin-cli account info --json
```

If successful, you will see the account's wallet balance, account value, and margin info in JSON. If it fails with an auth error, ask the user to double-check their `.env` configuration.

## Usage

**IMPORTANT:** Always run commands from the project directory and always append `--json` to get machine-readable JSON output for parsing.

Base command pattern:

```bash
dipcoin-cli <command> [options] --json
```

---

### Market Data (no authentication required)

```bash
# List all available trading pairs
dipcoin-cli market pairs --json

# Get ticker info (lastPrice, markPrice, 24h change, volume, funding rate)
dipcoin-cli market ticker <symbol> --json

# Get order book
dipcoin-cli market orderbook <symbol> --json

# Get oracle price
dipcoin-cli market oracle <symbol> --json
```

### Account

```bash
# View account info (wallet balance, account value, free collateral, margin, unrealized PnL)
dipcoin-cli account info --json

# View account info for a vault
dipcoin-cli account info --vault <address> --json

# View on-chain wallet coin balances
dipcoin-cli balance --json

# Deposit USDC to exchange
dipcoin-cli account deposit <amount> --json

# Withdraw USDC from exchange
dipcoin-cli account withdraw <amount> --json
```

### Trading

```bash
# Place a BUY market order (specify quantity)
dipcoin-cli trade buy <symbol> <quantity> --leverage <n> --json

# Place a BUY market order (specify USDC margin amount, auto-calculates quantity)
dipcoin-cli trade buy <symbol> --usdc <amount> --leverage <n> --json

# Place a SELL market order
dipcoin-cli trade sell <symbol> <quantity> --leverage <n> --json
dipcoin-cli trade sell <symbol> --usdc <amount> --leverage <n> --json

# Place a LIMIT order
dipcoin-cli trade buy <symbol> <quantity> --type limit --price <price> --leverage <n> --json
dipcoin-cli trade sell <symbol> <quantity> --type limit --price <price> --leverage <n> --json

# Place order with take profit and/or stop loss
dipcoin-cli trade buy <symbol> --usdc <amount> --leverage <n> --tp <price> --sl <price> --json

# Reduce-only order (for closing positions)
dipcoin-cli trade sell <symbol> <quantity> --leverage <n> --reduce-only --json

# Cancel orders by hash
dipcoin-cli trade cancel <symbol> <hash1> [hash2...] --json
```

#### Trade Options Reference

| Option | Description | Default |
|--------|-------------|---------|
| `--leverage <n>` | Leverage multiplier | 10 |
| `--price <p>` | Limit order price (required for limit orders) | - |
| `--type <type>` | `market` or `limit` | market |
| `--reduce-only` | Reduce-only order flag | false |
| `--tp <price>` | Take profit trigger price | - |
| `--sl <price>` | Stop loss trigger price | - |
| `--vault <address>` | Vault/creator address | env VAULT_ADDRESS |
| `--usdc <amount>` | Margin in USDC (alternative to quantity) | - |

**Note:** You must specify either `<quantity>` or `--usdc <amount>`, not both.

### Positions

```bash
# List all open positions
dipcoin-cli position list --json

# List positions for a specific symbol
dipcoin-cli position list --symbol <symbol> --json

# List positions for a vault
dipcoin-cli position list --vault <address> --json

# Set TP/SL on an existing position
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --json
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --sl-trigger <price> --json
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <tp_price> --sl-trigger <sl_price> --json

# TP/SL with limit order type
dipcoin-cli position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --tp-type limit --tp-price <limit_price> --json

# Add margin to a position (on-chain tx)
dipcoin-cli position margin add <symbol> <amount_usdc> --json

# Remove margin from a position (on-chain tx)
dipcoin-cli position margin remove <symbol> <amount_usdc> --json
```

**TP/SL side note:** The `--side` is the closing side. For a LONG position, the closing side is `sell`. For a SHORT position, the closing side is `buy`.

### Open Orders

```bash
# List all open orders
dipcoin-cli orders --json

# Filter by symbol
dipcoin-cli orders --symbol <symbol> --json

# Filter by vault
dipcoin-cli orders --vault <address> --json
```

### Vault / Sub-Account

```bash
# Set sub-account (on-chain tx)
dipcoin-cli vault set-sub-account <subAddress> --json

# View vault info
dipcoin-cli vault info --address <vault_address> --json
```

### History

```bash
# Query historical orders
dipcoin-cli history orders --json
dipcoin-cli history orders --symbol <symbol> --page <n> --size <n> --json

# Query funding settlements
dipcoin-cli history funding --json
dipcoin-cli history funding --symbol <symbol> --json

# Query balance changes
dipcoin-cli history balance --json
dipcoin-cli history balance --page <n> --size <n> --json

# All history commands support --vault <address> for vault queries
```

## Typical Trading Workflow

1. **Check available pairs:** `market pairs`
2. **Get current price:** `market ticker BTC-PERP`
3. **Check account balance:** `account info`
4. **Open a position:** `trade buy BTC-PERP --usdc 100 --leverage 10 --tp 105000 --sl 90000`
5. **Monitor position:** `position list`
6. **Monitor orders:** `orders`
7. **Close position (reduce-only sell):** `trade sell BTC-PERP <quantity> --leverage 10 --reduce-only`
8. **Review history:** `history orders --symbol BTC-PERP`

## Important Notes

- All price/quantity values returned by the API are in **wei (18 decimals)**. Divide by `1e18` to get human-readable values. When using `--json`, the output is raw wei.
- `--usdc` mode auto-converts USDC margin amount to quantity based on current market price and leverage.
- On-chain operations (deposit, withdraw, margin add/remove, set-sub-account) require Sui chain interaction and may take a few seconds.
- Authentication is handled automatically using the `PRIVATE_KEY` in `.env`.
- Order hashes returned from trade commands can be used with `trade cancel`.
- The `--vault` option is for sub-account/vault trading where the vault address acts as the parent.
- Available trading pair symbols include: `BTC-PERP`, `ETH-PERP`, `SUI-PERP`, etc. Use `market pairs` to get the full list.
- **SECURITY:** Never log or expose the user's `PRIVATE_KEY`. Treat it as a secret at all times.
