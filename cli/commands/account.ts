import { Command } from "commander";
import { getSDK, getVaultAddress, ensureAuth } from "../utils/sdk-factory";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerAccountCommands(program: Command) {
  const account = program.command("account").description("Account operations");

  account
    .command("info")
    .description("Show account info (balance, margin, PnL)")
    .option("--vault <address>", "Vault address")
    .action(async (opts) => {
      try {
        const sdk = getSDK();
        await ensureAuth(sdk);
        const vault = getVaultAddress(opts.vault);
        const result = await sdk.getAccountInfo(vault ? { parentAddress: vault } : undefined);
        if (!result.status || !result.data) return handleError(result.error);

        if (isJson(program)) return printJson(result.data);

        const d = result.data;
        printTable(
          ["Field", "Value"],
          [
            ["Wallet", sdk.address],
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

  account
    .command("deposit")
    .description("Deposit USDC to exchange")
    .argument("<amount>", "Amount in USDC")
    .action(async (amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.depositToBank(Number(amount));
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(`Deposit ${amount} USDC submitted. Tx: ${tx?.digest || JSON.stringify(tx)}`);
      } catch (e) {
        handleError(e);
      }
    });

  account
    .command("withdraw")
    .description("Withdraw USDC from exchange")
    .argument("<amount>", "Amount in USDC")
    .action(async (amount) => {
      try {
        const sdk = getSDK();
        const tx = await sdk.withdrawFromBank(Number(amount));
        if (isJson(program)) return printJson({ digest: tx?.digest, status: "ok" });
        console.log(`Withdraw ${amount} USDC submitted. Tx: ${tx?.digest || JSON.stringify(tx)}`);
      } catch (e) {
        handleError(e);
      }
    });
}
