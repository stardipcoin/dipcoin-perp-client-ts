import dotenv from "dotenv";
dotenv.config();

import { initDipCoinPerpSDK, DipCoinPerpSDK } from "../../src";

let sdkInstance: DipCoinPerpSDK | null = null;

export function getSDK(): DipCoinPerpSDK {
  if (sdkInstance) return sdkInstance;

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("Error: PRIVATE_KEY not set in .env");
    process.exit(1);
  }

  const network = (process.env.NETWORK as "mainnet" | "testnet") || "testnet";
  const subAccountKey = process.env.SUB_ACCOUNT_KEY || undefined;

  sdkInstance = initDipCoinPerpSDK(privateKey, {
    network,
    ...(subAccountKey ? { subAccountKey } : {}),
  });

  return sdkInstance;
}

export function getVaultAddress(cmdVault?: string): string | undefined {
  return cmdVault || process.env.VAULT_ADDRESS || undefined;
}

export async function ensureAuth(sdk: DipCoinPerpSDK): Promise<void> {
  const auth = await sdk.authenticate();
  if (!auth.status) {
    console.error("Authentication failed:", auth.error);
    process.exit(1);
  }
}
