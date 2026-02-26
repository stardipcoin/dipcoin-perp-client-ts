import Table from "cli-table3";
import { Command } from "commander";

export function isJson(cmd: Command): boolean {
  return cmd.optsWithGlobals().json === true;
}

export function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({ head: headers, style: { head: ["cyan"] } });
  rows.forEach((r) => table.push(r));
  console.log(table.toString());
}

export function formatWei(value: string | number | null | undefined): string {
  if (value === undefined || value === null || value === "") return "0.00";
  const str = String(value);
  const num = Number(str) / 1e18;
  return num.toFixed(2);
}

export function handleError(error: any): void {
  console.error("Error:", typeof error === "string" ? error : error?.message || JSON.stringify(error));
  process.exit(1);
}
