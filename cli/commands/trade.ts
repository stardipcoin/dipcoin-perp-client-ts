import { Command } from "commander";
import { getSDK, getVaultAddress, ensureAuth } from "../utils/sdk-factory";
import { isJson, printJson, handleError } from "../utils/output";
import { OrderSide, OrderType } from "../../src";

async function placeOrder(program: Command, side: OrderSide, symbol: string, quantity: string, opts: any) {
  try {
    const sdk = getSDK();
    await ensureAuth(sdk);

    const leverage = opts.leverage || "10";
    const orderType = opts.type?.toUpperCase() === "LIMIT" ? OrderType.LIMIT : OrderType.MARKET;
    const vault = getVaultAddress(opts.vault);

    const perpId = await sdk.getPerpetualID(symbol);
    if (!perpId) return handleError(`PerpetualID not found for ${symbol}`);

    const params: any = {
      symbol,
      market: perpId,
      side,
      orderType,
      quantity,
      leverage,
      reduceOnly: opts.reduceOnly || false,
    };

    if (orderType === OrderType.LIMIT) {
      if (!opts.price) return handleError("--price is required for LIMIT orders");
      params.price = opts.price;
    }

    if (vault) params.creator = vault;
    if (opts.tp) params.tpTriggerPrice = opts.tp;
    if (opts.sl) params.slTriggerPrice = opts.sl;

    const result = await sdk.placeOrder(params);
    if (!result.status) return handleError(result.error);

    if (isJson(program)) return printJson(result.data);
    console.log(`${side} ${orderType} order placed on ${symbol}: ${result.data?.message || "OK"}`);
    if (result.data?.data) console.log(JSON.stringify(result.data.data, null, 2));
  } catch (e) {
    handleError(e);
  }
}

export function registerTradeCommands(program: Command) {
  const trade = program.command("trade").description("Trading operations");

  const orderOpts = (cmd: Command) =>
    cmd
      .option("--leverage <n>", "Leverage multiplier", "10")
      .option("--price <p>", "Order price (required for limit)")
      .option("--type <type>", "Order type: market or limit", "market")
      .option("--reduce-only", "Reduce only order")
      .option("--tp <price>", "Take profit trigger price")
      .option("--sl <price>", "Stop loss trigger price")
      .option("--vault <address>", "Vault/creator address");

  orderOpts(
    trade
      .command("buy")
      .description("Place a BUY order")
      .argument("<symbol>", "Trading pair (e.g. BTC-PERP)")
      .argument("<quantity>", "Order quantity")
  ).action((symbol, quantity, opts) => placeOrder(program, OrderSide.BUY, symbol, quantity, opts));

  orderOpts(
    trade
      .command("sell")
      .description("Place a SELL order")
      .argument("<symbol>", "Trading pair (e.g. BTC-PERP)")
      .argument("<quantity>", "Order quantity")
  ).action((symbol, quantity, opts) => placeOrder(program, OrderSide.SELL, symbol, quantity, opts));

  trade
    .command("cancel")
    .description("Cancel orders by hash")
    .argument("<symbol>", "Trading pair")
    .argument("<hashes...>", "Order hashes to cancel")
    .option("--vault <address>", "Parent address")
    .action(async (symbol, hashes, opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = getVaultAddress(opts.vault);
        const result = await sdk.cancelOrder({
          symbol,
          orderHashes: hashes,
          ...(vault ? { parentAddress: vault } : {}),
        });
        if (!result.status) return handleError(result.error);
        if (isJson(program)) return printJson(result.data);
        console.log("Orders cancelled:", hashes.join(", "));
      } catch (e) {
        handleError(e);
      }
    });
}
