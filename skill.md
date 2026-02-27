# DipCoin Perpetual Trading CLI

## Skill Overview

This skill provides access to the DipCoin perpetual contract trading platform on the Sui blockchain. You can execute trades (market/limit orders), manage positions, deposit/withdraw funds, and query market data through a CLI tool.

## Installation

Run the following commands to clone and set up the CLI tool:

```bash
git clone https://github.com/dipcoinlab/dipcoin-perp-client-ts.git ~/dipcoin-perp-cli
cd ~/dipcoin-perp-cli
npm install
```

Verify installation:

```bash
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts --help
```

You should see the help output listing available commands. If you see errors, ensure Node.js >= 18 is installed.

## Configuration

The CLI reads configuration from a `.env` file in the project root (`~/dipcoin-perp-cli/.env`).

### Required Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PRIVATE_KEY` | **Yes** | Sui wallet private key (starts with `suiprivkey...`) |
| `NETWORK` | **Yes** | `mainnet` or `testnet` (default: `testnet`) |
| `SUB_ACCOUNT_KEY` | No | Sub-account private key for main/sub separation |
| `VAULT_ADDRESS` | No | Vault address for vault-based queries and trading |

### Setup Steps

1. Ask the user for their `PRIVATE_KEY` and which `NETWORK` they want to use (`mainnet` or `testnet`).
2. Optionally ask for `SUB_ACCOUNT_KEY` and `VAULT_ADDRESS` if needed.
3. Create the `.env` file:

```bash
cat > ~/dipcoin-perp-cli/.env << 'EOF'
PRIVATE_KEY=<user_provided_private_key>
NETWORK=<user_provided_network>
SUB_ACCOUNT_KEY=<optional>
VAULT_ADDRESS=<optional>
EOF
```

### Verify Configuration

After setting up `.env`, verify authentication works:

```bash
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts account info --json
```

If successful, you will see the account's wallet balance, account value, and margin info in JSON. If it fails with an auth error, the `PRIVATE_KEY` is incorrect.

## Usage

**IMPORTANT:** Always run commands from the project directory and always append `--json` to get machine-readable JSON output for parsing.

Base command pattern:

```bash
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts <command> [options] --json
```

---

### Market Data (no authentication required)

```bash
# List all available trading pairs
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts market pairs --json

# Get ticker info (lastPrice, markPrice, 24h change, volume, funding rate)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts market ticker <symbol> --json

# Get order book
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts market orderbook <symbol> --json

# Get oracle price
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts market oracle <symbol> --json
```

### Account

```bash
# View account info (wallet balance, account value, free collateral, margin, unrealized PnL)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts account info --json

# View account info for a vault
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts account info --vault <address> --json

# View on-chain wallet coin balances
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts balance --json

# Deposit USDC to exchange
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts account deposit <amount> --json

# Withdraw USDC from exchange
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts account withdraw <amount> --json
```

### Trading

```bash
# Place a BUY market order (specify quantity)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade buy <symbol> <quantity> --leverage <n> --json

# Place a BUY market order (specify USDC margin amount, auto-calculates quantity)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade buy <symbol> --usdc <amount> --leverage <n> --json

# Place a SELL market order
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade sell <symbol> <quantity> --leverage <n> --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade sell <symbol> --usdc <amount> --leverage <n> --json

# Place a LIMIT order
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade buy <symbol> <quantity> --type limit --price <price> --leverage <n> --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade sell <symbol> <quantity> --type limit --price <price> --leverage <n> --json

# Place order with take profit and/or stop loss
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade buy <symbol> --usdc <amount> --leverage <n> --tp <price> --sl <price> --json

# Reduce-only order (for closing positions)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade sell <symbol> <quantity> --leverage <n> --reduce-only --json

# Cancel orders by hash
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts trade cancel <symbol> <hash1> [hash2...] --json
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
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position list --json

# List positions for a specific symbol
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position list --symbol <symbol> --json

# List positions for a vault
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position list --vault <address> --json

# Set TP/SL on an existing position
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --sl-trigger <price> --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <tp_price> --sl-trigger <sl_price> --json

# TP/SL with limit order type
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position tpsl <symbol> --side <buy|sell> --quantity <q> --leverage <n> --tp-trigger <price> --tp-type limit --tp-price <limit_price> --json

# Add margin to a position (on-chain tx)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position margin add <symbol> <amount_usdc> --json

# Remove margin from a position (on-chain tx)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts position margin remove <symbol> <amount_usdc> --json
```

**TP/SL side note:** The `--side` is the closing side. For a LONG position, the closing side is `sell`. For a SHORT position, the closing side is `buy`.

### Open Orders

```bash
# List all open orders
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts orders --json

# Filter by symbol
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts orders --symbol <symbol> --json

# Filter by vault
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts orders --vault <address> --json
```

### Vault / Sub-Account

```bash
# Set sub-account (on-chain tx)
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts vault set-sub-account <subAddress> --json

# View vault info
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts vault info --address <vault_address> --json
```

### History

```bash
# Query historical orders
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history orders --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history orders --symbol <symbol> --page <n> --size <n> --json

# Query funding settlements
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history funding --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history funding --symbol <symbol> --json

# Query balance changes
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history balance --json
cd ~/dipcoin-perp-cli && npx tsx cli/index.ts history balance --page <n> --size <n> --json

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
