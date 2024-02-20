import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  Account,
  Account as AccountModel,
  Configuration,
  DailyHistory,
  HourlySymbolFundingRateAverage,
  OpenInterest,
  Quote,
  QuoteClose,
  Solver,
  Symbol,
  SymbolDailyTradeVolume,
  SymbolTradeVolume,
  TotalHistory,
  UserActivity,
  UserDailyHistory,
  User as UserModel,
  UserSymbolDailyHistory,
  UserTotalHistory,
} from "../generated/schema";

import { ethereum } from "@graphprotocol/graph-ts/chain/ethereum";

export function getDateFromTimeStamp(timestamp: BigInt): Date {
  let date = new Date(timestamp.toI64() * 1000);
  date.setUTCHours(0);
  date.setUTCMinutes(0);
  date.setUTCSeconds(0);
  date.setUTCMilliseconds(0);
  return date;
}

export function getDailyHistoryForTimestamp(
  timestamp: BigInt,
  accountSource: Bytes | null
): DailyHistory {
  const dateStr = getDateFromTimeStamp(timestamp).getTime().toString();
  const id =
    dateStr +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let dh = DailyHistory.load(id);
  if (dh == null) {
    dh = new DailyHistory(id);
    dh.updateTimestamp = timestamp;
    dh.timestamp = timestamp;
    dh.deposit = BigInt.zero();
    dh.withdraw = BigInt.zero();
    dh.quotesCount = BigInt.zero();
    dh.tradeVolume = BigInt.zero();
    dh.openTradeVolume = BigInt.zero();
    dh.closeTradeVolume = BigInt.zero();
    dh.allocate = BigInt.zero();
    dh.deallocate = BigInt.zero();
    dh.newUsers = BigInt.zero();
    dh.activeUsers = BigInt.zero();
    dh.newAccounts = BigInt.zero();
    dh.platformFee = BigInt.zero();
    dh.openInterest = BigInt.zero();
    dh.maxOpenInterest = BigInt.zero();
    dh.accountSource = accountSource;
    dh.save();
  }
  return dh;
}

export function getUserSymbolDailyHistoryForTimestamp(
  timestamp: BigInt,
  accountSource: Bytes | null,
  user: string,
  symbol: BigInt
): UserSymbolDailyHistory {
  const dateStr = getDateFromTimeStamp(timestamp).getTime().toString();
  const id =
    user +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString()) +
    "_" +
    dateStr +
    "_" +
    symbol.toString();
  let dh = UserSymbolDailyHistory.load(id);
  if (dh == null) {
    dh = new UserSymbolDailyHistory(id);
    dh.user = user;
    dh.updateTimestamp = timestamp;
    dh.timestamp = timestamp;
    dh.quotesCount = BigInt.zero();
    dh.tradeVolume = BigInt.zero();
    dh.openTradeVolume = BigInt.zero();
    dh.closeTradeVolume = BigInt.zero();
    dh.accountSource = accountSource;
    dh.generatedFee = BigInt.zero();
    dh.symbol = symbol.toString();
    dh.save();
  }
  return dh;
}

export function getUserDailyHistoryForTimestamp(
  timestamp: BigInt,
  accountSource: Bytes | null,
  user: string
): UserDailyHistory {
  const dateStr = getDateFromTimeStamp(timestamp).getTime().toString();
  const id =
    user +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString()) +
    "_" +
    dateStr;
  let dh = UserDailyHistory.load(id);
  if (dh == null) {
    dh = new UserDailyHistory(id);
    dh.user = user;
    dh.updateTimestamp = timestamp;
    dh.timestamp = timestamp;
    dh.deposit = BigInt.zero();
    dh.withdraw = BigInt.zero();
    dh.quotesCount = BigInt.zero();
    dh.tradeVolume = BigInt.zero();
    dh.openTradeVolume = BigInt.zero();
    dh.closeTradeVolume = BigInt.zero();
    dh.allocate = BigInt.zero();
    dh.deallocate = BigInt.zero();
    dh.accounts = BigInt.zero();
    dh.accountSource = accountSource;
    dh.generatedFee = BigInt.zero();
    dh.save();
  }
  return dh;
}

export function getSymbolDailyTradeVolume(
  symbol: BigInt,
  timestamp: BigInt,
  accountSource: Bytes | null
): SymbolDailyTradeVolume {
  const dateStr = getDateFromTimeStamp(timestamp).getTime().toString();

  const id =
    dateStr +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString()) +
    "_" +
    symbol.toString();
  let sdh = SymbolDailyTradeVolume.load(id);
  if (sdh == null) {
    sdh = new SymbolDailyTradeVolume(id);
    sdh.updateTimestamp = timestamp;
    sdh.timestamp = timestamp;
    sdh.accountSource = accountSource;
    sdh.symbol = symbol.toString();
    sdh.volume = BigInt.zero();
    sdh.save();
  }
  return sdh;
}

export function getTotalHistory(
  timestamp: BigInt,
  accountSource: Bytes | null
): TotalHistory {
  const id = accountSource === null ? "null" : accountSource.toHexString();
  let th = TotalHistory.load(id);
  if (th == null) {
    th = new TotalHistory(id);
    th.updateTimestamp = timestamp;
    th.timestamp = timestamp;
    th.deposit = BigInt.zero();
    th.withdraw = BigInt.zero();
    th.quotesCount = BigInt.zero();
    th.tradeVolume = BigInt.zero();
    th.openTradeVolume = BigInt.zero();
    th.closeTradeVolume = BigInt.zero();
    th.allocate = BigInt.zero();
    th.deallocate = BigInt.zero();
    th.users = BigInt.zero();
    th.accounts = BigInt.zero();
    th.platformFee = BigInt.zero();
    th.accountSource = accountSource;
    th.save();
  }
  return th;
}

export function getUserTotalHistory(
  timestamp: BigInt,
  accountSource: Bytes | null,
  user: string
): UserTotalHistory {
  const id =
    user +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let th = UserTotalHistory.load(id);
  if (th == null) {
    th = new UserTotalHistory(id);
    th.user = user;
    th.updateTimestamp = timestamp;
    th.timestamp = timestamp;
    th.deposit = BigInt.zero();
    th.withdraw = BigInt.zero();
    th.quotesCount = BigInt.zero();
    th.tradeVolume = BigInt.zero();
    th.openTradeVolume = BigInt.zero();
    th.closeTradeVolume = BigInt.zero();
    th.allocate = BigInt.zero();
    th.deallocate = BigInt.zero();
    th.accounts = BigInt.zero();
    th.accountSource = accountSource;
    th.generatedFee = BigInt.zero();
    th.save();
  }
  return th;
}

export function getSymbolTradeVolume(
  symbol: BigInt,
  timestamp: BigInt,
  accountSource: Bytes | null
): SymbolTradeVolume {
  const id =
    symbol.toString() +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let stv = SymbolTradeVolume.load(id);
  if (stv == null) {
    stv = new SymbolTradeVolume(id);
    stv.updateTimestamp = timestamp;
    stv.timestamp = timestamp;
    stv.accountSource = accountSource;
    stv.volume = BigInt.zero();
    stv.symbolId = symbol;
    stv.symbol = symbol.toString();
    stv.save();
  }
  return stv;
}

export function getOpenInterest(
  timestamp: BigInt,
  accountSource: Bytes | null
): OpenInterest {
  const id =
    "OpenInterestId_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let oi = OpenInterest.load(id);
  if (oi == null) {
    oi = new OpenInterest(id);
    oi.amount = BigInt.zero();
    oi.accumulatedAmount = BigInt.zero();
    oi.timestamp = timestamp;
    oi.accountSource = accountSource;
    oi.save();
  }
  return oi;
}

export function getOpenInterestForSymbol(
  timestamp: BigInt,
  accountSource: Bytes | null,
  symbol: BigInt
): OpenInterest {
  const id =
    symbol.toString() +
    "_OpenInterestId_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let oi = OpenInterest.load(id);
  if (oi == null) {
    oi = new OpenInterest(id);
    oi.amount = BigInt.zero();
    oi.accumulatedAmount = BigInt.zero();
    oi.timestamp = timestamp;
    oi.accountSource = accountSource;
    oi.symbol = symbol.toString();
    oi.save();
  }
  return oi;
}

export function isSameDay(timestamp1: BigInt, timestamp2: BigInt): boolean {
  return (
    getDateFromTimeStamp(timestamp1).getTime().toString() ==
    getDateFromTimeStamp(timestamp2).getTime().toString()
  );
}

export function unDecimal(value: BigInt): BigInt {
  return value.div(BigInt.fromString("10").pow(18));
}

export function diffInSeconds(timestamp1: BigInt, timestamp2: BigInt): BigInt {
  return timestamp1.minus(timestamp2);
}

export function updateDailyOpenInterest(
  symbolId: BigInt,
  blockTimestamp: BigInt,
  value: BigInt,
  increase: boolean,
  accountSource: Bytes | null
): void {
  let oi = getOpenInterest(blockTimestamp, accountSource);
  let dh = getDailyHistoryForTimestamp(blockTimestamp, accountSource);
  let oiForSymbol = getOpenInterestForSymbol(
    blockTimestamp,
    accountSource,
    symbolId
  );

  const startOfDay = BigInt.fromString(
    (getDateFromTimeStamp(blockTimestamp).getTime() / 1000).toString()
  );

  if (isSameDay(blockTimestamp, oi.timestamp)) {
    oi.accumulatedAmount = oi.accumulatedAmount.plus(
      diffInSeconds(blockTimestamp, oi.timestamp).times(oi.amount)
    );
    dh.openInterest = oi.accumulatedAmount.div(
      diffInSeconds(blockTimestamp, startOfDay)
    );
    oiForSymbol.accumulatedAmount = oiForSymbol.accumulatedAmount.plus(
      diffInSeconds(blockTimestamp, oiForSymbol.timestamp).times(
        oiForSymbol.amount
      )
    );
  } else {
    dh.openInterest = oi.accumulatedAmount.div(BigInt.fromString("86400"));
    oi.accumulatedAmount = diffInSeconds(blockTimestamp, startOfDay).times(
      oi.amount
    );
    oiForSymbol.accumulatedAmount = diffInSeconds(
      blockTimestamp,
      startOfDay
    ).times(oiForSymbol.amount);
  }

  oi.amount = increase ? oi.amount.plus(value) : oi.amount.minus(value);
  oi.timestamp = blockTimestamp;
  oiForSymbol.amount = increase
    ? oiForSymbol.amount.plus(value)
    : oiForSymbol.amount.minus(value);
  oiForSymbol.timestamp = blockTimestamp;
  dh.updateTimestamp = blockTimestamp;

  if (oi.amount > dh.maxOpenInterest) {
    dh.maxOpenInterest = oi.amount;
  }

  oi.save();
  dh.save();
  oiForSymbol.save();
}

export function updateActivityTimestamps(
  account: Account,
  timestamp: BigInt
): void {
  account.lastActivityTimestamp = timestamp;
  account.save();
  let ua: UserActivity = getUserActivity(
    account.user,
    account.accountSource,
    timestamp
  );

  let uaTimestamp =
    ua.updateTimestamp === null ? BigInt.fromString("0") : ua.updateTimestamp!;
  if (!isSameDay(timestamp, uaTimestamp)) {
    let dh = getDailyHistoryForTimestamp(timestamp, account.accountSource);
    dh.activeUsers = dh.activeUsers.plus(BigInt.fromString("1"));
    dh.save();
  }

  ua.updateTimestamp = timestamp;
  ua.save();
}

export function getUserActivity(
  user: string,
  accountSource: Bytes | null,
  timestamp: BigInt
): UserActivity {
  const id =
    user +
    "_" +
    (accountSource === null ? "null" : accountSource.toHexString());
  let ua: UserActivity | null = UserActivity.load(id);
  if (ua == null) {
    ua = new UserActivity(id);
    ua.user = user;
    ua.accountSource = accountSource;
    ua.timestamp = timestamp;
    ua.save();
  }
  return ua as UserActivity;
}

export function getSolver(address: string): Solver {
  let solver = Solver.load(address);
  if (solver == null) {
    solver = new Solver(address);
    solver.save();
  }
  return solver;
}

export function createNewUser(
  address: Bytes,
  accountSource: Bytes | null,
  block: ethereum.Block,
  transaction: ethereum.Transaction
): UserModel {
  let user = new UserModel(
    address.toHexString() +
      "_" +
      (accountSource === null ? "null" : accountSource.toHexString())
  );
  user.timestamp = block.timestamp;
  user.lastActivityTimestamp = block.timestamp;
  user.transaction = transaction.hash;
  user.accountSource = accountSource;
  user.address = address;
  user.allocated = BigInt.zero();
  user.deallocated = BigInt.zero();
  user.deposit = BigInt.zero();
  user.withdraw = BigInt.zero();

  user.save();
  const dh = getDailyHistoryForTimestamp(block.timestamp, accountSource);
  dh.newUsers = dh.newUsers.plus(BigInt.fromString("1"));
  dh.save();
  const th = getTotalHistory(block.timestamp, accountSource);
  th.users = th.users.plus(BigInt.fromString("1"));
  th.save();
  return user;
}

export function createNewAccount(
  address: string,
  user: UserModel,
  accountSource: Bytes | null,
  block: ethereum.Block,
  transaction: ethereum.Transaction,
  name: string | null = null
): AccountModel {
  let account = new AccountModel(address);
  account.lastActivityTimestamp = block.timestamp;
  account.timestamp = block.timestamp;
  account.transaction = transaction.hash;
  account.deposit = BigInt.zero();
  account.withdraw = BigInt.zero();
  account.allocated = BigInt.zero();
  account.deallocated = BigInt.zero();
  account.quotesCount = BigInt.zero();
  account.positionsCount = BigInt.zero();
  account.user = user.id;
  account.updateTimestamp = block.timestamp;
  account.accountSource = accountSource;
  account.name = name;
  account.save();
  const dh = getDailyHistoryForTimestamp(block.timestamp, accountSource);
  dh.newAccounts = dh.newAccounts.plus(BigInt.fromString("1"));
  dh.save();
  const th = getTotalHistory(block.timestamp, accountSource);
  th.accounts = th.accounts.plus(BigInt.fromString("1"));
  th.save();
  return account;
}

export function getConfiguration(event: ethereum.Event): Configuration {
  let configuration = Configuration.load("0");
  if (configuration == null) {
    configuration = new Configuration("0");
    configuration.updateTimestamp = event.block.timestamp;
    configuration.updateTransaction = event.transaction.hash;
    configuration.collateral = event.address; // Will be replaced shortly after creation
    configuration.save();
  }
  return configuration;
}

export function getHourlySymbolFundingRateAverage(
  timestamp: BigInt,
  symbol: string,
  solver: string
): HourlySymbolFundingRateAverage {
  const symbolRecord = Symbol.load(symbol);

  const dateStr = getDateFromTimeStamp(timestamp).getTime().toString();
  const id = dateStr + "_" + symbol + "_" + solver;
  let dh = HourlySymbolFundingRateAverage.load(id);
  if (dh == null) {
    dh = new HourlySymbolFundingRateAverage(id);
    dh.symbol = symbol;
    dh.solver = solver;
    dh.timestamp = timestamp;
    dh.lastUpdatedTimestamp = timestamp;
    dh.rateApplied = BigInt.zero();
    dh.longRateApplied = BigInt.zero();
    dh.shortRateApplied = BigInt.zero();
    if (symbolRecord !== null) {
      dh.fundingRateEpochDuration = symbolRecord.fundingRateEpochDuration;
    } else {
      dh.fundingRateEpochDuration = BigInt.fromString("0");
    }
    dh.save();
  }
  return dh;
}

export function getQuoteClose(quote: Quote): QuoteClose | null {
  const closeCount = quote.requestedCloseCount;
  const quoteClose = QuoteClose.load(quote.id + "-" + closeCount.toString());

  return quoteClose;
}
