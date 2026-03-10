import { Command } from "commander";

/**
 * Get the global --vault-index value from the root program.
 */
export function getGlobalVaultIndex(prog: Command): number | undefined {
  const opts = prog.opts();
  if (opts.vaultIndex !== undefined) {
    const n = Number(opts.vaultIndex);
    if (isNaN(n) || n < 0) {
      console.error("Error: --vault-index must be a non-negative integer");
      process.exit(1);
    }
    return n;
  }
  // Fallback to DEFAULT_VAULT_INDEX env
  const envDefault = process.env.DIPCOIN_DEFAULT_VAULT_INDEX;
  if (envDefault !== undefined) {
    const n = Number(envDefault);
    if (!isNaN(n) && n >= 0) return n;
  }
  return undefined;
}
