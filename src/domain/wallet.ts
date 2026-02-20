export interface Wallet {
  readonly coins: number;
}

export const createWallet = (coins: number): Wallet => ({
  coins: Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : 0,
});

export const initialWallet: Wallet = createWallet(20);

export const addCoins = (wallet: Wallet, amount: number): Wallet =>
  createWallet(wallet.coins + amount);

export const spendCoins = (wallet: Wallet, amount: number): Wallet | undefined =>
  wallet.coins >= amount ? createWallet(wallet.coins - amount) : undefined;

export const canAfford = (wallet: Wallet, cost: number): boolean =>
  wallet.coins >= cost;

export const formatCoins = (wallet: Wallet): string =>
  `$${wallet.coins}`;
