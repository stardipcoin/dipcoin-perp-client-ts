// Copyright (c) 2025 Dipcoin LLC
// SPDX-License-Identifier: Apache-2.0

/**
 * OrderBook and Ticker Example for DipCoin Perpetual Trading SDK
 * 
 * This example demonstrates how to get:
 * - OrderBook: The order book for a trading pair (bids and asks)
 * - Ticker: Market ticker information (price, volume, 24h stats, etc.)
 * 
 * Usage:
 *   1. Create a .env file in the project root with: PRIVATE_KEY=your-private-key
 *   2. Run: ts-node --project tsconfig.example.json examples/orderbook.ts
 *   3. Or: PRIVATE_KEY=your-key npm run example:orderbook
 */

// Try to load .env file if dotenv is available (optional)
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch (e) {
  // dotenv is optional, continue without it
}

import BigNumber from "bignumber.js";
import { initDipCoinPerpSDK } from "../src";

async function main() {
  // Initialize SDK with private key
  // WARNING: Never expose your private key in production code
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey) {
    console.error("❌ Error: PRIVATE_KEY environment variable is not set");
    console.error("\nPlease set it in one of the following ways:");
    console.error("  1. Create a .env file with: PRIVATE_KEY=your-private-key");
    console.error("  2. Export it: export PRIVATE_KEY=your-private-key");
    console.error("  3. Inline: PRIVATE_KEY=your-key ts-node examples/orderbook.ts");
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
    // Note: OrderBook and Ticker are market data endpoints and may not require authentication,
    // but we authenticate for consistency
    console.log("\n=== Authenticating (Onboarding) ===");
    const authResult = await sdk.authenticate();
    if (authResult.status) {
      console.log("✅ Authentication successful!");
      console.log("JWT Token:", authResult.data?.substring(0, 20) + "...");
    } else {
      console.error("❌ Authentication failed:", authResult.error);
      // Continue anyway as market data endpoints might work without auth
      console.log("⚠️  Continuing without authentication (Market data may work without auth)");
    }

    // 1. Get trading pairs to see available symbols
    console.log("\n=== Getting Trading Pairs ===");
    const tradingPairsResult = await sdk.getTradingPairs();
    if (tradingPairsResult.status && tradingPairsResult.data) {
      console.log(`✅ Found ${tradingPairsResult.data.length} trading pairs`);
      console.log("\nAvailable trading pairs (first 10):");
      tradingPairsResult.data.slice(0, 10).forEach((pair) => {
        console.log(`  - ${pair.symbol}`);
      });
      if (tradingPairsResult.data.length > 10) {
        console.log(`  ... and ${tradingPairsResult.data.length - 10} more`);
      }
    } else {
      console.error("❌ Failed to get trading pairs:", tradingPairsResult.error);
    }

    // 2. Get OrderBook for a specific trading pair
    const symbolToQuery = "BTC-PERP";
    console.log(`\n=== Getting OrderBook for ${symbolToQuery} ===`);
    const orderBookResult = await sdk.getOrderBook(symbolToQuery);

    if (orderBookResult.status && orderBookResult.data) {
      const orderBook = orderBookResult.data;
      console.log("✅ OrderBook retrieved successfully!");
      console.log(`\nSymbol: ${symbolToQuery}`);
      if (orderBook.timestamp) {
        console.log(`Timestamp: ${new Date(orderBook.timestamp).toISOString()}`);
      }

      // Display bids (buy orders) - sorted from highest to lowest price
      // Note: All values are in wei format (18 decimals)
      console.log(`\n📊 Bids (Buy Orders) - ${orderBook.bids.length} levels (values in wei):`);
      if (orderBook.bids.length > 0) {
        console.log("   Price (wei)              | Quantity (wei)");
        console.log("   " + "-".repeat(50));
        // Show top 10 bids
        orderBook.bids.slice(0, 10).forEach((bid, index) => {
          const marker = index === 0 ? "🏆" : "  ";
          console.log(`${marker} ${bid.price.padStart(24)} | ${bid.quantity.padStart(24)}`);
        });
        if (orderBook.bids.length > 10) {
          console.log(`   ... and ${orderBook.bids.length - 10} more bid levels`);
        }

        // Calculate total bid volume (in wei)
        const totalBidVolume = orderBook.bids.reduce(
          (sum, bid) => {
            const qtyBN = new BigNumber(bid.quantity);
            return sum.plus(qtyBN);
          },
          new BigNumber(0)
        );
        console.log(`\n   Total Bid Volume (wei): ${totalBidVolume.toString()}`);
      } else {
        console.log("   No bids available");
      }

      // Display asks (sell orders) - sorted from lowest to highest price
      // Note: All values are in wei format (18 decimals)
      console.log(`\n📊 Asks (Sell Orders) - ${orderBook.asks.length} levels (values in wei):`);
      if (orderBook.asks.length > 0) {
        console.log("   Price (wei)              | Quantity (wei)");
        console.log("   " + "-".repeat(50));
        // Show top 10 asks
        orderBook.asks.slice(0, 10).forEach((ask, index) => {
          const marker = index === 0 ? "🏆" : "  ";
          console.log(`${marker} ${ask.price.padStart(24)} | ${ask.quantity.padStart(24)}`);
        });
        if (orderBook.asks.length > 10) {
          console.log(`   ... and ${orderBook.asks.length - 10} more ask levels`);
        }

        // Calculate total ask volume (in wei)
        const totalAskVolume = orderBook.asks.reduce(
          (sum, ask) => {
            const qtyBN = new BigNumber(ask.quantity);
            return sum.plus(qtyBN);
          },
          new BigNumber(0)
        );
        console.log(`\n   Total Ask Volume (wei): ${totalAskVolume.toString()}`);
      } else {
        console.log("   No asks available");
      }

      // Calculate spread and mid price (in wei)
      if (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
        const bestBidBN = new BigNumber(orderBook.bids[0].price);
        const bestAskBN = new BigNumber(orderBook.asks[0].price);
        const spreadBN = bestAskBN.minus(bestBidBN);
        const spreadPercent = bestBidBN.isZero() 
          ? "0" 
          : spreadBN.dividedBy(bestBidBN).multipliedBy(100).toFixed(4);
        const midPriceBN = bestBidBN.plus(bestAskBN).dividedBy(2);

        console.log("\n📈 Market Summary (all values in wei):");
        console.log(`   Best Bid: ${bestBidBN.toString()}`);
        console.log(`   Best Ask: ${bestAskBN.toString()}`);
        console.log(`   Spread: ${spreadBN.toString()} (${spreadPercent}%)`);
        console.log(`   Mid Price: ${midPriceBN.toString()}`);
      }

      // 3. Get OrderBook for multiple symbols
      console.log("\n=== Getting OrderBook for Multiple Symbols ===");
      const symbolsToQuery = ["BTC-PERP", "ETH-PERP"];
      
      for (const symbol of symbolsToQuery) {
        const result = await sdk.getOrderBook(symbol);
        if (result.status && result.data) {
          const ob = result.data;
          if (ob.bids.length > 0 && ob.asks.length > 0) {
            const bestBidBN = new BigNumber(ob.bids[0].price);
            const bestAskBN = new BigNumber(ob.asks[0].price);
            const midPriceBN = bestBidBN.plus(bestAskBN).dividedBy(2);
            console.log(`✅ ${symbol}: Mid Price (wei) = ${midPriceBN.toString()}`);
          } else {
            console.log(`⚠️  ${symbol}: No orders available`);
          }
        } else {
          console.error(`❌ ${symbol}: Failed to get order book - ${result.error}`);
        }
      }
    } else {
      console.error("❌ Failed to get order book:", orderBookResult.error);
      if (orderBookResult.error) {
        console.error("Error details:", orderBookResult.error);
      }
    }

    // 4. Get Ticker information for a trading pair
    console.log(`\n=== Getting Ticker for ${symbolToQuery} ===`);
    const tickerResult = await sdk.getTicker(symbolToQuery);

    if (tickerResult.status && tickerResult.data) {
      const ticker = tickerResult.data;
      console.log("✅ Ticker retrieved successfully!");
      console.log(`\n📊 Ticker Information for ${ticker.symbol}:`);
      console.log("   " + "=".repeat(50));

      // Price information (all values in wei format)
      console.log("\n💰 Price Information (all values in wei):");
      if (ticker.lastPrice) {
        console.log(`   Last Price:     ${ticker.lastPrice}`);
      }
      if (ticker.markPrice) {
        console.log(`   Mark Price:     ${ticker.markPrice}`);
      }
      if (ticker.oraclePrice) {
        console.log(`   Oracle Price:   ${ticker.oraclePrice}`);
      }
      if (ticker.openPrice) {
        console.log(`   Open Price:     ${ticker.openPrice}`);
      }
      if (ticker.midPrice) {
        console.log(`   Mid Price:      ${ticker.midPrice}`);
      }

      // Best bid/ask (all values in wei format)
      console.log("\n📈 Best Bid/Ask (all values in wei):");
      if (ticker.bestBidPrice) {
        console.log(`   Best Bid:       ${ticker.bestBidPrice}`);
        if (ticker.bestBidAmount) {
          console.log(`   Bid Amount:     ${ticker.bestBidAmount}`);
        }
      }
      if (ticker.bestAskPrice) {
        console.log(`   Best Ask:       ${ticker.bestAskPrice}`);
        if (ticker.bestAskAmount) {
          console.log(`   Ask Amount:     ${ticker.bestAskAmount}`);
        }
      }

      // 24h statistics (all values in wei format)
      console.log("\n📊 24-Hour Statistics (all values in wei):");
      if (ticker.high24h) {
        console.log(`   24h High:       ${ticker.high24h}`);
      }
      if (ticker.low24h) {
        console.log(`   24h Low:        ${ticker.low24h}`);
      }
      if (ticker.open24h) {
        console.log(`   24h Open:       ${ticker.open24h}`);
      }
      if (ticker.volume24h) {
        console.log(`   24h Volume:     ${ticker.volume24h} (wei)`);
      }
      if (ticker.amount24h) {
        console.log(`   24h Amount:     ${ticker.amount24h} (wei)`);
      }

      // Price change (all values in wei format)
      if (ticker.change24h || ticker.rate24h) {
        console.log("\n📉 24-Hour Change (all values in wei):");
        if (ticker.change24h) {
          const changeBN = new BigNumber(ticker.change24h);
          const changeSign = changeBN.isPositive() || changeBN.isZero() ? "+" : "";
          console.log(`   Change:         ${changeSign}${ticker.change24h}`);
        }
        if (ticker.rate24h) {
          const rateBN = new BigNumber(ticker.rate24h);
          const rateSign = rateBN.isPositive() || rateBN.isZero() ? "+" : "";
          const rateColor = rateBN.isPositive() || rateBN.isZero() ? "🟢" : "🔴";
          console.log(`   Change Rate:    ${rateColor} ${rateSign}${ticker.rate24h} (wei)`);
        }
      }

      // Additional information (all values in wei format)
      if (ticker.fundingRate || ticker.openInterest) {
        console.log("\n📋 Additional Information (all values in wei):");
        if (ticker.fundingRate) {
          console.log(`   Funding Rate:   ${ticker.fundingRate} (wei)`);
        }
        if (ticker.openInterest) {
          console.log(`   Open Interest:  ${ticker.openInterest} (wei)`);
        }
      }

      if (ticker.timestamp) {
        console.log(`\n⏰ Timestamp: ${new Date(ticker.timestamp).toISOString()}`);
      }
    } else {
      console.error("❌ Failed to get ticker:", tickerResult.error);
      if (tickerResult.error) {
        console.error("Error details:", tickerResult.error);
      }
    }

    // 5. Get Ticker for multiple symbols
    console.log("\n=== Getting Ticker for Multiple Symbols ===");
    const tickerSymbols = ["BTC-PERP", "ETH-PERP"];
    
    for (const symbol of tickerSymbols) {
      const result = await sdk.getTicker(symbol);
      if (result.status && result.data) {
        const ticker = result.data;
        const lastPrice = ticker.lastPrice || "N/A";
        const change24h = ticker.rate24h || "N/A";
        const volume24h = ticker.volume24h || "N/A";
        
        console.log(`✅ ${symbol} (all values in wei):`);
        console.log(`   Last Price: ${lastPrice} | 24h Change Rate: ${change24h} | 24h Volume: ${volume24h}`);
      } else {
        console.error(`❌ ${symbol}: Failed to get ticker - ${result.error}`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

// Run the example
// eslint-disable-next-line @typescript-eslint/no-require-imports
if (require.main === module) {
  main().catch(console.error);
}

