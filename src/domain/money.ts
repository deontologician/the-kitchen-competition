export interface Money {
  readonly cents: number;
}

export const createMoney = (cents: number): Money => ({ cents: Math.round(cents) });

export const fromDollars = (dollars: number): Money => createMoney(dollars * 100);

export const addMoney = (a: Money, b: Money): Money => createMoney(a.cents + b.cents);

export const subtractMoney = (a: Money, b: Money): Money => createMoney(a.cents - b.cents);

export const isNegative = (m: Money): boolean => m.cents < 0;

export const toDollars = (m: Money): number => m.cents / 100;

export const zero: Money = createMoney(0);
