# DipCoin Perpetual Trading SDK

TypeScript SDK for DipCoin Perpetual Trading on Sui blockchain.

## 📦 Installation

```bash
npm install @dipcoinlab/perp-client-ts
# or
yarn add @dipcoinlab/perp-client-ts
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```bash
PRIVATE_KEY=your-private-key-here
```

### 3. Run Example

```bash
npm run example
```

For detailed usage instructions, see [USAGE.md](./USAGE.md).

## 📖 Usage Guide

### Initialize SDK

```typescript
import { initDipCoinPerpSDK } from "@dipcoinlab/perp-client-ts";

// Initialize with private key string
const sdk = initDipCoinPerpSDK("your-private-key-string", {
  network: "mainnet", // or "testnet"
  apiBaseUrl: "https://api.dipcoin.io", // Optional, defaults based on network
});

// Or initialize with Keypair
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
const keypair = Ed25519Keypair.fromSecretKey(/* your secret key */);
const sdk = initDipCoinPerpSDK(keypair, {
  network: "mainnet",
});
```

## Core Features

### Authentication (Onboarding)

Before using the SDK, you need to authenticate first. The SDK will automatically handle authentication when you call any API method, but you can also authenticate manually:

```typescript
// Manual authentication
const authResult = await sdk.authenticate();
if (authResult.status) {
  console.log("Authenticated! JWT Token:", authResult.data);
} else {
  console.error("Authentication failed:", authResult.error);
}

// Get JWT token (authenticates if needed)
const tokenResult = await sdk.getJWTToken();
if (tokenResult.status) {
  console.log("JWT Token:", tokenResult.data);
}

// Force refresh token
const refreshResult = await sdk.getJWTToken(true);

// Clear authentication (logout)
sdk.clearAuth();
```

**Note:** All API methods automatically authenticate if needed, so you don't need to call `authenticate()` manually in most cases.

### Account Information

Get account balance and trading information:

```typescript
const accountInfo = await sdk.getAccountInfo();

if (accountInfo.status && accountInfo.data) {
  console.log("Wallet Balance:", accountInfo.data.walletBalance);
  console.log("Account Value:", accountInfo.data.accountValue);
  console.log("Free Collateral:", accountInfo.data.freeCollateral);
  console.log("Unrealized PnL:", accountInfo.data.totalUnrealizedProfit);
}
```

### Deposit and Withdraw

Deposit USDC to the exchange bank account for trading collateral, or withdraw USDC back to your wallet:

```typescript
// Deposit USDC to bank (deposit funds for trading)
const depositResult = await sdk.depositToBank(100); // Deposit 100 USDC
if (depositResult) {
  console.log("Deposit successful!");
}

// Withdraw USDC from bank (withdraw funds to wallet)
const withdrawResult = await sdk.withdrawFromBank(50); // Withdraw 50 USDC
if (withdrawResult) {
  console.log("Withdraw successful!");
}
```

**Note:** These methods execute on-chain transactions on Sui blockchain. Make sure you have sufficient USDC balance in your wallet before depositing, and sufficient balance in your exchange account before withdrawing.

### Place Order

Place a market or limit order:

```typescript
import { OrderSide, OrderType } from "@dipcoinlab/perp-client-ts";

// Market order
const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1", // 0.1 BTC
  leverage: "10", // 10x leverage
});

// Limit order
const limitResult = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  quantity: "0.1",
  price: "50000", // Limit price
  leverage: "10",
  reduceOnly: false, // Optional: only reduce position
});

if (result.status) {
  console.log("Order placed successfully:", result.data);
} else {
  console.error("Order failed:", result.error);
}
```

### Place Order with TP/SL

Place an order with take profit and stop loss:

```typescript
const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.1",
  leverage: "10",
  // Take profit
  tpTriggerPrice: "55000",
  tpOrderType: OrderType.MARKET,
  // Stop loss
  slTriggerPrice: "45000",
  slOrderType: OrderType.MARKET,
});
```

### Manage Existing Position TP/SL Orders

```typescript
await sdk.placePositionTpSlOrders({
  symbol: "BTC-PERP",
  market: "<perpetual-id>",
  side: OrderSide.SELL,
  isLong: false,
  leverage: "10",
  quantity: "0.05",
  tp: {
    triggerPrice: "90000",
    orderType: OrderType.LIMIT,
    orderPrice: "90000",
    tpslType: "position",
  },
  sl: {
    triggerPrice: "70000",
    orderType: OrderType.MARKET,
    tpslType: "position",
  },
});

const tpSlOrders = await sdk.getPositionTpSl("<position-id>", "position");

await sdk.cancelTpSlOrders({
  symbol: "BTC-PERP",
  orderHashes: ["0xabc..."],
});
```

### Market Data (Ticker & Order Book)

```typescript
const ticker = await sdk.getTicker("BTC-PERP");
const orderBook = await sdk.getOrderBook("BTC-PERP");
```

### Cancel Order

Cancel one or more orders:

```typescript
const result = await sdk.cancelOrder({
  symbol: "BTC-PERP",
  orderHashes: ["0x1234...", "0x5678..."], // Array of order hashes
});

if (result.status) {
  console.log("Orders cancelled successfully");
} else {
  console.error("Cancel failed:", result.error);
}
```

### Get Positions

Get current positions:

```typescript
// Get all positions
const positions = await sdk.getPositions();

// Get positions for specific symbol
const btcPositions = await sdk.getPositions("BTC-PERP");

if (positions.status && positions.data) {
  positions.data.forEach((position) => {
    console.log("Symbol:", position.symbol);
    console.log("Side:", position.side);
    console.log("Quantity:", position.quantity);
    console.log("Entry Price:", position.avgEntryPrice);
    console.log("Unrealized PnL:", position.unrealizedProfit);
    console.log("Liquidation Price:", position.liquidationPrice);
  });
}
```

### Get Open Orders

Get current open orders:

```typescript
// Get all open orders
const orders = await sdk.getOpenOrders();

// Get open orders for specific symbol
const btcOrders = await sdk.getOpenOrders("BTC-PERP");

if (orders.status && orders.data) {
  orders.data.forEach((order) => {
    console.log("Symbol:", order.symbol);
    console.log("Side:", order.side);
    console.log("Type:", order.orderType);
    console.log("Price:", order.price);
    console.log("Quantity:", order.quantity);
    console.log("Filled:", order.filledQty);
  });
}
```

## API Reference

### DipCoinPerpSDK

Main SDK class for interacting with DipCoin Perpetual Trading.

#### Methods

##### `placeOrder(params: PlaceOrderParams): Promise<SDKResponse<OrderResponse>>`

Place a new order.

**Parameters:**
- `symbol`: Trading symbol (e.g., "BTC-PERP")
- `side`: Order side (`OrderSide.BUY` or `OrderSide.SELL`)
- `orderType`: Order type (`OrderType.MARKET` or `OrderType.LIMIT`)
- `quantity`: Order quantity (number or string)
- `price`: Order price (required for LIMIT orders)
- `leverage`: Leverage multiplier (number or string)
- `market`: Optional market ID
- `reduceOnly`: Optional, only reduce position
- `clientId`: Optional client order ID
- `tpTriggerPrice`: Optional take profit trigger price
- `tpOrderType`: Optional take profit order type
- `tpOrderPrice`: Optional take profit order price
- `slTriggerPrice`: Optional stop loss trigger price
- `slOrderType`: Optional stop loss order type
- `slOrderPrice`: Optional stop loss order price

##### `cancelOrder(params: CancelOrderParams): Promise<SDKResponse<OrderResponse>>`

Cancel one or more orders.

**Parameters:**
- `symbol`: Trading symbol
- `orderHashes`: Array of order hashes to cancel
- `parentAddress`: Optional parent address (defaults to wallet address)

##### `getAccountInfo(): Promise<SDKResponse<AccountInfo>>`

Get account information including balance, collateral, and PnL.

##### `getPositions(symbol?: string): Promise<SDKResponse<Position[]>>`

Get current positions. Optionally filter by symbol.

##### `getOpenOrders(symbol?: string): Promise<SDKResponse<OpenOrder[]>>`

Get current open orders. Optionally filter by symbol.

##### `depositToBank(amount: number): Promise<any>`

Deposit USDC from wallet to exchange bank account for trading collateral.

**Parameters:**
- `amount`: Deposit amount in USDC (standard units, e.g., 100 means 100 USDC)

**Returns:** On-chain transaction result

**Note:** This is an on-chain transaction on Sui blockchain. Ensure you have sufficient USDC balance in your wallet.

##### `withdrawFromBank(amount: number): Promise<any>`

Withdraw USDC from exchange bank account back to wallet.

**Parameters:**
- `amount`: Withdraw amount in USDC (standard units, e.g., 50 means 50 USDC)

**Returns:** On-chain transaction result

**Note:** This is an on-chain transaction on Sui blockchain. Ensure you have sufficient balance in your exchange account.

## Types

### OrderSide

```typescript
enum OrderSide {
  BUY = "BUY",
  SELL = "SELL",
}
```

### OrderType

```typescript
enum OrderType {
  MARKET = "MARKET",
  LIMIT = "LIMIT",
}
```

### AccountInfo

```typescript
interface AccountInfo {
  walletBalance: string;
  totalUnrealizedProfit: string;
  accountValue: string;
  freeCollateral: string;
  totalMargin: string;
}
```

### Position

```typescript
interface Position {
  symbol: string;
  side: string;
  quantity: string;
  avgEntryPrice: string;
  leverage: string;
  margin: string;
  unrealizedProfit: string;
  liquidationPrice: string;
  // ... more fields
}
```

### OpenOrder

```typescript
interface OpenOrder {
  hash: string;
  symbol: string;
  side: string;
  orderType: string;
  price: string;
  quantity: string;
  filledQty: string;
  leverage: string;
  status: string;
  // ... more fields
}
```

## Error Handling

All SDK methods return a `SDKResponse` object with the following structure:

```typescript
interface SDKResponse<T> {
  status: boolean; // Operation success status
  data?: T; // Response data if successful
  error?: string; // Error message if failed
}
```

Always check the `status` field before accessing `data`:

```typescript
const result = await sdk.placeOrder(/* ... */);

if (result.status) {
  // Success - use result.data
  console.log(result.data);
} else {
  // Error - use result.error
  console.error(result.error);
}
```

## Examples

### Complete Trading Flow

```typescript
import { initDipCoinPerpSDK, OrderSide, OrderType } from "@dipcoinlab/perp-client-ts";

// Initialize SDK
const sdk = initDipCoinPerpSDK("your-private-key", {
  network: "testnet",
});

async function tradingFlow() {
  // 1. Deposit funds to exchange bank account
  console.log("Depositing 100 USDC to bank...");
  await sdk.depositToBank(100);

  // 2. Check account balance
  const account = await sdk.getAccountInfo();
  if (account.status) {
    console.log("Account Value:", account.data?.accountValue);
  }

  // 3. Check existing positions
  const positions = await sdk.getPositions();
  if (positions.status) {
    console.log("Current Positions:", positions.data);
  }

  // 4. Place a market order
  const orderResult = await sdk.placeOrder({
    symbol: "BTC-PERP",
    side: OrderSide.BUY,
    orderType: OrderType.MARKET,
    quantity: "0.1",
    leverage: "10",
  });

  if (orderResult.status) {
    console.log("Order placed:", orderResult.data);
  }

  // 5. Check open orders
  const openOrders = await sdk.getOpenOrders("BTC-PERP");
  if (openOrders.status) {
    console.log("Open Orders:", openOrders.data);
  }

  // 6. Cancel an order (if needed)
  if (openOrders.status && openOrders.data && openOrders.data.length > 0) {
    const cancelResult = await sdk.cancelOrder({
      symbol: "BTC-PERP",
      orderHashes: [openOrders.data[0].hash],
    });
    console.log("Cancel result:", cancelResult);
  }

  // 7. Withdraw funds from exchange bank account
  console.log("Withdrawing 50 USDC from bank...");
  await sdk.withdrawFromBank(50);
}

tradingFlow();
```

### Example Scripts

- `npm run example` – Basic end-to-end usage
- `npm run example:limit` – Limit order workflow
- `npm run example:orderbook` – Fetch order book snapshots
- `npm run example:tpsl` – Manage position TP/SL (set `RUN_TPSL_DEMO=1`)

## License

Apache License 2.0
