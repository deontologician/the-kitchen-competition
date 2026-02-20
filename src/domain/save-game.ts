import { type Wallet, createWallet } from "./wallet";

export interface SaveData {
  readonly version: 1;
  readonly coins: number;
}

export const SAVE_KEY = "the-kitchen-competition";

export const createSaveData = (wallet: Wallet): SaveData => ({
  version: 1,
  coins: wallet.coins,
});

export const serializeSave = (data: SaveData): string =>
  JSON.stringify(data);

export const deserializeSave = (json: string): SaveData | undefined => {
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("coins" in parsed)
    ) {
      return undefined;
    }
    const { version, coins } = parsed as Record<string, unknown>;
    if (
      version !== 1 ||
      typeof coins !== "number" ||
      !Number.isInteger(coins) ||
      coins < 0
    ) {
      return undefined;
    }
    return { version: 1, coins };
  } catch {
    return undefined;
  }
};

export const saveDataToWallet = (data: SaveData): Wallet =>
  createWallet(data.coins);
