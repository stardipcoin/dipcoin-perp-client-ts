import { Command } from "commander";
import { getSDK, getVaultAddress, ensureAuth } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerVaultCommands(program: Command) {
  const vault = program.command("vault").description("Vault / sub-account operations");

  vault
    .command("set-sub-account")
    .description("Set sub-account on-chain (authorize a sub-account address)")
    .argument("<subAddress>", "Sub-account address to authorize")
    .action(async (subAddress) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.setSubAccount(subAddress);
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(`Sub-account ${subAddress} set. Tx: ${tx?.digest || JSON.stringify(tx)}`);
      } catch (e) {
        handleError(e);
      }
    });

  vault
    .command("info")
    .description("Show vault account info")
    .option("--address <address>", "Vault address (or use VAULT_ADDRESS env)")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vaultAddr = getVaultAddress(opts.address);
        if (!vaultAddr) return handleError("Vault address required (--address or VAULT_ADDRESS env)");

        const result = await sdk.getAccountInfo({ parentAddress: vaultAddr });
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Vault Address", vaultAddr],
            ["Wallet Balance", formatWei(d.walletBalance)],
            ["Account Value", formatWei(d.accountValue)],
            ["Free Collateral", formatWei(d.freeCollateral)],
            ["Total Margin", formatWei(d.totalMargin)],
            ["Unrealized PnL", formatWei(d.totalUnrealizedProfit)],
          ]
        );
      } catch (e) {
        handleError(e);
      }
    });
}

export function registerOrdersCommand(program: Command) {
  program
    .command("orders")
    .description("List open orders")
    .option("--symbol <s>", "Filter by symbol")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = opts.vault || sdk.address;
        const params: any = {
          parentAddress: vault,
          ...(opts.symbol ? { symbol: opts.symbol } : {}),
        };
        const result = await sdk.getOpenOrders(params as any);
        if (!result.status) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        if (!result.data?.length) return console.log("No open orders.");

        printTable(
          ["Hash", "Symbol", "Side", "Type", "Qty", "Price", "Leverage", "Status"],
          result.data.map((o) => [
            o.hash.slice(0, 12) + "...",
            o.symbol,
            o.side,
            o.orderType,
            formatWei(o.quantity),
            formatWei(o.price),
            formatWei(o.leverage) + "x",
            o.status,
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
