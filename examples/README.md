# Example Files

This directory contains usage examples for the DipCoin Perpetual Trading SDK.

## File List

### basic-usage.ts

Basic usage example demonstrating core SDK features:

- ✅ Initialize SDK
- ✅ Authentication (Onboarding)
- ✅ Deposit to bank account
- ✅ Withdraw from bank account
- ✅ Query account information
- ✅ Query positions
- ✅ Query open orders
- ✅ Get trading pairs list
- ✅ Place order (Market Order)
- ✅ Cancel order

### limit-order.ts

Limit order example demonstrating how to place LIMIT orders:

- ✅ Initialize SDK
- ✅ Authentication (Onboarding)
- ✅ Get trading pairs and PerpetualID
- ✅ Query account information
- ✅ Place LIMIT order (price required)
- ✅ Query open orders

## Running Examples

### Prerequisites

1. Install project dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   # Copy example file
   cp .env.example .env
   
   # Edit .env file and add your private key
   # PRIVATE_KEY=your-private-key-here
   ```

### Running Methods

```bash
# Run basic example (Market Order)
npm run example

# Run limit order example
npm run example:limit

# Or use tsx directly
tsx examples/basic-usage.ts
tsx examples/limit-order.ts
```

## Example Instructions

### 1. Initialize SDK

```typescript
const sdk = initDipCoinPerpSDK(privateKey, {
  network: "testnet", // or "mainnet"
});
```

### 2. Deposit and Withdraw

#### Deposit to Bank Account

Deposit USDC from wallet to exchange bank account for trading collateral:

```typescript
// Deposit 10 USDC to bank account
await sdk.depositToBank(10);
console.log("Deposit successful!");
```

**Note:**
- This is an on-chain transaction on Sui blockchain
- Ensure you have sufficient USDC balance in your wallet
- After deposit, funds will be available in the exchange account for trading

#### Withdraw from Bank Account

Withdraw USDC from exchange bank account back to wallet:

```typescript
// Withdraw 5 USDC from bank account
await sdk.withdrawFromBank(5);
console.log("Withdraw successful!");
```

**Note:**
- This is an on-chain transaction on Sui blockchain
- Ensure you have sufficient balance in the exchange account
- After withdrawal, funds will be returned to your wallet address

### 3. Query Account Information

```typescript
const accountInfo = await sdk.getAccountInfo();
if (accountInfo.status) {
  console.log("Wallet Balance:", accountInfo.data?.walletBalance);
  console.log("Account Value:", accountInfo.data?.accountValue);
  console.log("Free Collateral:", accountInfo.data?.freeCollateral);
  console.log("Unrealized PnL:", accountInfo.data?.totalUnrealizedProfit);
}
```

### 4. Query Positions

```typescript
const positions = await sdk.getPositions();
if (positions.status) {
  positions.data?.forEach(pos => {
    console.log(`${pos.symbol}: ${pos.side} ${pos.quantity}`);
  });
}
```

### 5. Query Open Orders

```typescript
const orders = await sdk.getOpenOrders();
if (orders.status) {
  orders.data?.forEach(order => {
    console.log(`${order.symbol}: ${order.side} ${order.quantity} @ ${order.price}`);
  });
}
```

### 6. Place Order

#### Market Order

```typescript
// First get PerpetualID
const perpId = await sdk.getPerpetualID("BTC-PERP");

const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  market: perpId, // REQUIRED: PerpetualID
  side: OrderSide.BUY,
  orderType: OrderType.MARKET,
  quantity: "0.01", // Small quantity for testing
  leverage: "10",
});
```

#### Limit Order

```typescript
// First get PerpetualID
const perpId = await sdk.getPerpetualID("BTC-PERP");

const result = await sdk.placeOrder({
  symbol: "BTC-PERP",
  market: perpId, // REQUIRED: PerpetualID
  side: OrderSide.BUY,
  orderType: OrderType.LIMIT,
  price: "50000", // REQUIRED for LIMIT orders
  quantity: "0.01",
  leverage: "10",
});
```

### 7. Cancel Order (Manual Enable Required)

Uncomment the code to test order cancellation:

```typescript
const cancelResult = await sdk.cancelOrder({
  symbol: "BTC-PERP",
  orderHashes: [orderHash],
});
```

## Important Notes

1. **Private Key Security**: Never commit private keys to Git or public code
2. **Test Environment**: It's recommended to test on testnet first
3. **Small Quantity Testing**: Use small quantities when placing orders for testing
4. **Error Handling**: All operations should check the returned `status` field
5. **Deposit and Withdraw**:
   - Both deposit and withdraw are on-chain transactions that require Gas fees
   - Ensure sufficient USDC balance in wallet before depositing
   - Ensure sufficient balance in exchange account before withdrawing
   - It's recommended to test deposit and withdraw functions on testnet first

## More Examples

For more usage examples, please refer to `README.md` and `USAGE.md` in the project root directory.
