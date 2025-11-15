// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * Limit Order Example for DipCoin Perpetual Trading SDK
 * 
 * This example demonstrates how to place a limit order.
 * 
 * Usage:
 *   1. Create a .env file in the project root with: PRIVATE_KEY=your-private-key
 *   2. Run: ts-node --project tsconfig.example.json examples/limit-order.ts
 *   3. Or: PRIVATE_KEY=your-key npm run example:limit
 */

// Try to load .env file if dotenv is available (optional)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch (e) {
  // dotenv is optional, continue without it
}

import { initDipCoinPerpSDK, OrderSide, OrderType } from "../src";

async function main() {
  // Initialize SDK with private key
  // WARNING: Never expose your private key in production code
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("❌ Error: PRIVATE_KEY environment variable is not set");
    console.error("\nPlease set it in one of the following ways:");
    console.error("  1. Create a .env file with: PRIVATE_KEY=your-private-key");
    console.error("  2. Export it: export PRIVATE_KEY=your-private-key");
    console.error("  3. Inline: PRIVATE_KEY=your-key ts-node examples/limit-order.ts");
    console.error("\nExample .env file:");
    console.error("  PRIVATE_KEY=suiprivkey1...");
    return;
  }

  const sdk = initDipCoinPerpSDK(privateKey, {
    network: "testnet", // or "mainnet"
  });

  console.log("Wallet Address:", sdk.address);

  try {
    // 0. Authenticate first (onboarding)
    console.log("\n=== Authenticating (Onboarding) ===");
    const authResult = await sdk.authenticate();
    if (authResult.status) {
      console.log("✅ Authentication successful!");
      console.log("JWT Token:", authResult.data?.substring(0, 20) + "...");
    } else {
      console.error("❌ Authentication failed:", authResult.error);
      return;
    }

    // 1. Get trading pairs to find PerpetualID
    console.log("\n=== Getting Trading Pairs ===");
    const tradingPairsResult = await sdk.getTradingPairs();
    if (!tradingPairsResult.status || !tradingPairsResult.data) {
      console.error("❌ Failed to get trading pairs:", tradingPairsResult.error);
      return;
    }

    console.log(`✅ Found ${tradingPairsResult.data.length} trading pairs`);
    console.log("\nAvailable trading pairs:");
    tradingPairsResult.data.slice(0, 10).forEach((pair) => {
      console.log(`  - ${pair.symbol}: PerpetualID = ${pair.perpId}`);
    });
    if (tradingPairsResult.data.length > 10) {
      console.log(`  ... and ${tradingPairsResult.data.length - 10} more`);
    }

    // 2. Get PerpetualID for BTC-PERP (or use another symbol)
    const symbolToTrade = "BTC-PERP";
    console.log(`\n=== Getting PerpetualID for ${symbolToTrade} ===`);
    const perpetualId = await sdk.getPerpetualID(symbolToTrade);

    if (!perpetualId) {
      console.error(`❌ Error: Could not find PerpetualID for ${symbolToTrade}`);
      console.error("Available symbols:");
      tradingPairsResult.data.forEach((pair) => {
        console.error(`  - ${pair.symbol}`);
      });
      return;
    }

    console.log(`✅ Found PerpetualID for ${symbolToTrade}: ${perpetualId}`);

    // 3. Get current account info to check balance
    console.log("\n=== Getting Account Info ===");
    const accountInfo = await sdk.getAccountInfo();
    if (accountInfo.status && accountInfo.data) {
      console.log("Wallet Balance:", accountInfo.data.walletBalance);
      console.log("Account Value:", accountInfo.data.accountValue);
      console.log("Free Collateral:", accountInfo.data.freeCollateral);
    } else {
      console.error("Failed to get account info:", accountInfo.error);
    }

    // 4. Place a limit order
    // NOTE: For limit orders, you need to specify a price
    // The price should be in the same unit as the trading pair (e.g., USDC for BTC-PERP)
    console.log("\n=== Placing Limit Order ===");
    console.log("⚠️  WARNING: This will place a real limit order!");
    console.log("   Make sure you have sufficient balance and the price is reasonable.\n");

    // Example: Place a limit buy order for BTC-PERP at $50,000
    // Adjust these values according to current market conditions
    const limitPrice = "90000"; // Price in USDC
    const quantity = "0.01"; // Quantity in BTC
    const leverage = "20"; // 10x leverage

    console.log(`Order Details:`);
    console.log(`  Symbol: ${symbolToTrade}`);
    console.log(`  Side: BUY`);
    console.log(`  Order Type: LIMIT`);
    console.log(`  Price: ${limitPrice} USDC`);
    console.log(`  Quantity: ${quantity} BTC`);
    console.log(`  Leverage: ${leverage}x`);

    const orderResult = await sdk.placeOrder({
      symbol: symbolToTrade,
      market: perpetualId, // REQUIRED: PerpetualID for the trading pair
      side: OrderSide.BUY,
      orderType: OrderType.LIMIT,
      price: limitPrice, // REQUIRED for LIMIT orders
      quantity: quantity,
      leverage: leverage,
    });

    if (orderResult.status && orderResult.data) {
      console.log("\n✅ Limit order placed successfully!");
      console.log("Response Code:", orderResult.data.code);
      console.log("Response Message:", orderResult.data.message || "N/A");
      if (orderResult.data.data) {
        console.log("Order Data:", JSON.stringify(orderResult.data.data, null, 2));
      }
    } else {
      console.error("\n❌ Failed to place limit order:", orderResult.error);
      if (orderResult.data) {
        console.error("Response Code:", orderResult.data.code);
        console.error("Response Message:", orderResult.data.message || "N/A");
        console.error("Full Response:", JSON.stringify(orderResult.data, null, 2));
      }
    }

    // 5. Get open orders to verify the order was placed
    console.log("\n=== Getting Open Orders ===");
    const openOrders = await sdk.getOpenOrders(symbolToTrade);
    if (openOrders.status && openOrders.data) {
      console.log(`Found ${openOrders.data.length} open orders for ${symbolToTrade}`);
      openOrders.data.forEach((order) => {
        console.log(
          `- ${order.symbol}: ${order.side} ${order.orderType} ${order.quantity} @ ${order.price} (Hash: ${order.hash})`
        );
      });
    } else {
      console.error("Failed to get open orders:", openOrders.error);
    }

    // 6. Example: Place a limit sell order
    /*
    console.log("\n=== Placing Limit Sell Order ===");
    const sellPrice = "51000"; // Sell at $51,000
    const sellQuantity = "0.01"; // Sell 0.01 BTC
    
    const sellOrderResult = await sdk.placeOrder({
      symbol: symbolToTrade,
      market: perpetualId,
      side: OrderSide.SELL,
      orderType: OrderType.LIMIT,
      price: sellPrice,
      quantity: sellQuantity,
      leverage: leverage,
    });

    if (sellOrderResult.status) {
      console.log("✅ Limit sell order placed successfully!");
    } else {
      console.error("❌ Failed to place limit sell order:", sellOrderResult.error);
    }
    */
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require.main === module) {
  main().catch(console.error);
}

