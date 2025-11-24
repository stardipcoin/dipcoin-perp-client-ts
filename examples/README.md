# Unified Demo (`examples/index.ts`)

The `examples` directory now contains a **single, fully orchestrated** workflow: `examples/index.ts`. It supersedes the previous standalone scripts (`basic-usage`, `limit-order`, `orderbook`, `tpsl-example`, `leverage-and-margin`) and runs them in a deterministic order so you can reproduce onboarding, trading, risk control, and market-data flows from one entry point.

## Highlights

- 🔐 Loads credentials from `.env`, authenticates, and prints wallet metadata.
- 💰 Optional deposits / withdrawals to move funds between wallet and exchange.
- 📊 Fetches account info, open positions, and pending orders for the active symbol.
- 🛒 Places market or limit orders (opt-in) and can cancel the first pending order.
- 📈 Streams a concise order-book + ticker snapshot for quick market checks.
- ⚙️ Adjusts preferred leverage + manages on-chain isolated margin when requested.
- 🎯 Manages TP/SL plans end-to-end (create, list, edit, cancel) with existing env knobs.

## Running the Demo

```bash
# Default read-only run (no orders or on-chain actions)
npm run example

# Allow extra steps by toggling env flags
RUN_MARKET_ORDER=1 RUN_LIMIT_ORDER=1 npm run example
```

By default, only **read-only** operations execute. Every trading or on-chain action must be explicitly enabled to prevent accidents.

### Common Flags

| Flag | Description | Notes |
| --- | --- | --- |
| `RUN_DEPOSIT=1` | Deposit `DEPOSIT_AMOUNT` USDC (default 10) | On-chain |
| `RUN_WITHDRAW=1` | Withdraw `WITHDRAW_AMOUNT` USDC (default 5) | On-chain |
| `RUN_MARKET_ORDER=1` | Submit `MARKET_ORDER_QTY` at `MARKET_ORDER_LEVERAGE` | Requires PerpID |
| `RUN_LIMIT_ORDER=1` | Submit a limit order at `LIMIT_ORDER_PRICE` | Provide `LIMIT_ORDER_SIDE` if needed |
| `RUN_CANCEL_ORDER=1` | Cancel the first open order on the active symbol | Uses `sdk.getOpenOrders()` |
| `RUN_MARKET_DATA=0` | Disable order-book/ticker printing | Default is `1` |
| `RUN_ADJUST_LEVERAGE=1` | Update preferred leverage using REST | Safe (off-chain) |
| `RUN_MARGIN_ADD=1` / `RUN_MARGIN_REMOVE=1` | Add or remove `MARGIN_AMOUNT` isolated margin | On-chain |
| `RUN_TPSL_DEMO=1` | Place TP/SL plans (uses `TPSL_*` vars) | Requires open position or overrides |
| `RUN_TPSL_EDIT=1` | Edit plans referenced by `TPSL_EDIT_TP_PLAN_ID` / `TPSL_EDIT_SL_PLAN_ID` | Requires plan IDs |

All historical environment variables (e.g., `TPSL_SYMBOL`, `MARGIN_SYMBOL`, `POSITION_ID`) keep the same semantics so existing tooling remains compatible.

## Suggested Workflow

1. **Dry Run** – `npm run example`  
   Verifies connectivity, authentication, and read-only endpoints.
2. **Paper Trading** – enable `RUN_LIMIT_ORDER=1` with a very small quantity.  
   Confirm new orders appear in the open-order list and cancel them with `RUN_CANCEL_ORDER=1`.
3. **Margin Utilities** – toggle `RUN_ADJUST_LEVERAGE=1` to mirror UI settings, then try `RUN_MARGIN_ADD=1` / `RUN_MARGIN_REMOVE=1` with a nominal `MARGIN_AMOUNT`.
4. **Risk Controls** – set `RUN_TPSL_DEMO=1 TPSL_SYMBOL=BTC-PERP POSITION_ID=<id>` to create or inspect TP/SL orders.

## Safety Checklist

- ✅ Always point to `testnet` while experimenting (`NETWORK=testnet`).
- ✅ Keep `RUN_*` flags unset unless you intend to perform that action.
- ✅ Double-check `LIMIT_ORDER_PRICE`, `MARKET_ORDER_QTY`, and `MARGIN_AMOUNT` before running.
- ✅ Export `PRIVATE_KEY` via `.env` and never commit it.

Refer to the root-level `README.md` and `USAGE.md` for a deeper dive into SDK APIs and advanced configuration tips.
