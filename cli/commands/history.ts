import { Command } from "commander";
import { getSDK, getVaultAddress, ensureAuth } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerHistoryCommands(program: Command) {
  const history = program.command("history").description("History queries");

  history
    .command("orders")
    .description("Query history orders")
    .option("--symbol <s>", "Filter by symbol")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = opts.vault || sdk.address;
        const result = await sdk.getHistoryOrders({
          ...(opts.symbol ? { symbol: opts.symbol } : {}),
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress: vault,
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No history orders.");

        printTable(
          ["Symbol", "Side", "Type", "Qty", "Price", "Status", "PnL", "Time"],
          result.data.data.map((o) => [
            o.symbol || "-",
            o.side || "-",
            o.orderType || "-",
            formatWei(o.quantity),
            formatWei(o.price),
            o.status || "-",
            formatWei(o.realizedPnl),
            o.createdAt ? new Date(o.createdAt).toLocaleString() : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  history
    .command("funding")
    .description("Query funding settlements")
    .option("--symbol <s>", "Filter by symbol")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = opts.vault || sdk.address;
        const result = await sdk.getFundingSettlements({
          ...(opts.symbol ? { symbol: opts.symbol } : {}),
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress: vault,
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No funding settlements.");

        printTable(
          ["Symbol", "Rate", "Fee", "Qty", "Side", "Time"],
          result.data.data.map((f) => [
            f.symbol || "-",
            formatWei(f.fundingRate),
            formatWei(f.fundingFee),
            formatWei(f.quantity),
            f.side || "-",
            f.createdAt ? new Date(f.createdAt).toLocaleString() : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });

  history
    .command("balance")
    .description("Query balance changes")
    .option("--page <n>", "Page number", "1")
    .option("--size <n>", "Page size", "20")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = opts.vault || sdk.address;
        const result = await sdk.getBalanceChanges({
          page: Number(opts.page),
          pageSize: Number(opts.size),
          parentAddress: vault,
        });
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.data?.length) return console.log("No balance changes.");

        printTable(
          ["Type", "Amount", "Balance", "Symbol", "Time"],
          result.data.data.map((b) => [
            b.type || "-",
            formatWei(b.amount),
            formatWei(b.balance),
            b.symbol || "-",
            b.createdAt ? new Date(b.createdAt).toLocaleString() : "-",
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
