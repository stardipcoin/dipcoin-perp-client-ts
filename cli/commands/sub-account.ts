import { Command } from "commander";
import { getSDK, resolveVaultAddress, listVaultAddresses } from "../utils/sdk-factory";
import { getGlobalVaultIndex } from "../utils/vault-index";
import { isJson, printJson, printTable, handleError, formatWei } from "../utils/output";

export function registerSubAccountCommands(program: Command) {
  const sub = program.command("sub-account").description("HD-derived sub-account operations");

  sub
    .command("set")
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

  sub
    .command("setup")
    .description("Derive sub-account at index and register it on-chain via main account")
    .argument("<index>", "Vault index to setup (1+)")
    .action(async (indexStr) => {
      try {
        const index = Number(indexStr);
        if (isNaN(index) || index < 1) return handleError("Vault index must be >= 1");

        const subAddress = resolveVaultAddress(index);
        if (!subAddress) return handleError("Could not derive vault address. Is MNEMONIC set?");

        const sdk = getSDK();
        console.log(`Registering sub-account ${index} (${subAddress})...`);
        const tx = await sdk.setSubAccount(subAddress);
        if (isJson(program)) return printJson({ digest: tx?.digest, index, address: subAddress });
        console.log(`Sub-account ${index} setup complete. Address: ${subAddress}`);
        console.log(`Tx: ${tx?.digest || JSON.stringify(tx)}`);
      } catch (e) {
        handleError(e);
      }
    });

  sub
    .command("list")
    .description("List HD-derived sub-account addresses")
    .option("--count <n>", "Number of addresses to derive", "5")
    .action(async (opts) => {
      try {
        const count = Number(opts.count) || 5;
        const addresses = listVaultAddresses(count);

        if (isJson(program)) return printJson(addresses);

        printTable(
          ["Index", "Address", "Path", "Role"],
          addresses.map((a) => [
            String(a.index),
            a.address,
            a.path,
            a.index === 0 ? "Main Account" : `Sub-Account ${a.index}`,
          ])
        );
      } catch (e) {
        handleError(e);
      }
    });
}
