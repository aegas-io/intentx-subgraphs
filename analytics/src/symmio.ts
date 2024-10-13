import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AcceptCancelCloseRequest,
  AcceptCancelRequest,
  ActiveEmergencyMode,
  AddSymbol,
  BalanceChangePartyA,
  BalanceChangePartyB,
  ChargeFundingRate,
  DeactiveEmergencyMode,
  Deposit,
  DiamondCut,
  DisputeForLiquidation,
  EmergencyClosePosition,
  ExpireQuote,
  FillCloseRequest,
  ForceCancelCloseRequest,
  ForceCancelQuote,
  ForceClosePosition,
  FullyLiquidatedPartyB,
  LiquidatePartyA,
  LiquidatePartyB,
  LiquidatePositionsPartyA,
  LiquidatePositionsPartyB,
  LockQuote,
  OpenPosition,
  PauseAccounting,
  PauseGlobal,
  PauseLiquidation,
  PausePartyAActions,
  PausePartyBActions,
  RegisterPartyB,
  RequestToCancelCloseRequest,
  RequestToCancelQuote,
  RequestToClosePosition,
  RoleGranted,
  RoleRevoked,
  SendQuote,
  SetCollateral,
  SetDeallocateCooldown,
  SetFeeCollector,
  SetForceCancelCloseCooldown,
  SetForceCancelCooldown,
  SetForceCloseCooldown,
  SetForceCloseGapRatio,
  SetLiquidationTimeout,
  SetLiquidatorShare,
  SetMuonConfig,
  SetMuonIds,
  SetPartyBEmergencyStatus,
  SetPendingQuotesValidLength,
  SetSuspendedAddress,
  SetSymbolAcceptableValues,
  SetSymbolMaxSlippage,
  SetSymbolTradingFee,
  SetSymbolValidationState,
  SetSymbolsPrices,
  TransferAllocation,
  UnlockQuote,
  UnpauseAccounting,
  UnpauseGlobal,
  UnpauseLiquidation,
  UnpausePartyAActions,
  UnpausePartyBActions,
  Withdraw,
} from "../generated/symmio/symmio";

import {
  Account as AccountModel,
  BalanceChange,
  ExecutedLiquidation,
  GrantedRole,
  PaidFundingFee,
  PartyALiquidation,
  PartyALiquidationDisputed,
  PartyASymbolPrice,
  PartyBLiquidation,
  PriceCheck,
  QuoteClose,
  Quote as QuoteModel,
  Symbol,
  SymbolFeeChange,
  TradeHistory as TradeHistoryModel,
  User,
} from "./../generated/schema";

import { getBalanceInfoOfPartyA, getBalanceInfoOfPartyB, getLiquidatedStateOfPartyA, getQuote } from "./contract_utils";
import {
  createNewAccount,
  createNewUser,
  getConfiguration,
  getDailyHistoryForTimestamp,
  getHourlySymbolFundingRateAverage,
  getQuoteClose,
  getSolver,
  getSymbolDailyTradeVolume,
  getSymbolTradeVolume,
  getTotalHistory,
  getUserDailyHistoryForTimestamp,
  getUserSymbolDailyHistoryForTimestamp,
  getUserTotalHistory,
  unDecimal,
  updateActivityTimestamps,
  updateDailyOpenInterest,
  updatePartyACurrentBalances,
} from "./utils";

import { ethereum } from "@graphprotocol/graph-ts/chain/ethereum";

export enum QuoteStatus {
  PENDING,
  LOCKED,
  CANCEL_PENDING,
  CANCELED,
  OPENED,
  CLOSE_PENDING,
  CANCEL_CLOSE_PENDING,
  CLOSED,
  LIQUIDATED,
  EXPIRED,
}

export enum BalanceChangeType {
  ALLOCATE,
  DEALLOCATE,
  PLATFORM_FEE_IN,
  PLATFORM_FEE_OUT,
  REALIZED_PNL_IN,
  REALIZED_PNL_OUT,
  CVA_IN,
  CVA_OUT,
  LF_IN,
  LF_OUT,
}

// //////////////////////////////////// CONTROL ////////////////////////////////////////
export function handleAddSymbol(event: AddSymbol): void {
  let symbol = new Symbol(event.params.id.toString());
  symbol.name = event.params.name;
  symbol.tradingFee = event.params.tradingFee;
  symbol.timestamp = event.block.timestamp;
  symbol.updateTimestamp = event.block.timestamp;
  symbol.fundingRateEpochDuration = event.params.fundingRateEpochDuration;
  symbol.save();
}

export function handleSetSymbolTradingFee(event: SetSymbolTradingFee): void {
  let symbol = Symbol.load(event.params.symbolId.toString())!;
  symbol.tradingFee = event.params.tradingFee;
  symbol.updateTimestamp = event.block.timestamp;
  symbol.save();

  // Storing SymbolFeeChange
  let symbolFeeChange = new SymbolFeeChange(event.transaction.hash.toHex() + "-" + event.logIndex.toHexString());
  symbolFeeChange.symbol = symbol.id;
  symbolFeeChange.timestamp = event.block.timestamp;
  symbolFeeChange.blockNumber = event.block.number;
  symbolFeeChange.transaction = event.transaction.hash;
  symbolFeeChange.tradingFee = event.params.tradingFee;
  symbolFeeChange.save();
}

export function handleRoleGranted(event: RoleGranted): void {
  let gr = new GrantedRole(event.params.role.toHexString() + "_" + event.params.user.toHexString());
  gr.role = event.params.role.toHexString() || event.params.role.toHexString();
  gr.user = event.params.user;
  gr.grantTransaction = event.transaction.hash;
  gr.revokeTransaction = null;
  gr.updateTimestamp = event.block.timestamp;
  gr.save();
}

export function handleRoleRevoked(event: RoleRevoked): void {
  let gr = GrantedRole.load(event.params.role.toHexString() + "_" + event.params.user.toHexString());
  if (gr == null) {
    gr = new GrantedRole(event.params.role.toHexString() + "_" + event.params.user.toHexString());
    gr.role = event.params.role.toHexString() || event.params.role.toHexString();
    gr.user = event.params.user;
  }
  gr.updateTimestamp = event.block.timestamp;
  gr.revokeTransaction = event.transaction.hash;
  gr.save();
}

function handleClose(_event: ethereum.Event, name: string): void {
  const event = changetype<FillCloseRequest>(_event); // FillClose, ForceClose, EmergencyClose all have the same event signature
  let quote = QuoteModel.load(event.params.quoteId.toString());

  if (quote == null) return;

  if (name == "ForceClosePosition") {
    // Try get quote.avgClosePrice
    const quoteData = getQuote(event.address, event.params.quoteId);
    if (quoteData) {
      quote.avgClosedPrice = quoteData.avgClosedPrice;
    }
  } else {
    quote.avgClosedPrice = quote.avgClosedPrice
      .times(quote.closedAmount)
      .plus(event.params.filledAmount.times(event.params.closedPrice))
      .div(quote.closedAmount.plus(event.params.filledAmount));
  }

  quote.closedAmount = quote.closedAmount.plus(event.params.filledAmount);
  if (quote.closedAmount.equals(quote.quantity)) {
    quote.quoteStatus = QuoteStatus.CLOSED;
    quote.fullyClosedAt = event.block.timestamp;
  } else {
    quote.quoteStatus = QuoteStatus.OPENED;
  }

  // Updating CVA & LFs
  quote.remainingCVA = quote.remainingCVA.minus(quote.cva.times(event.params.filledAmount).div(quote.quantity));
  quote.remainingLF = quote.remainingLF.minus(quote.lf.times(event.params.filledAmount).div(quote.quantity));
  quote.remainingPartyAMM = quote.remainingPartyAMM.minus(
    quote.partyAmm.times(event.params.filledAmount).div(quote.quantity)
  );
  quote.remainingPartyBAMM = quote.remainingPartyBAMM.minus(
    quote.partyBmm.times(event.params.filledAmount).div(quote.quantity)
  );

  quote.updateTimestamp = event.block.timestamp;
  quote.save();

  // Filling the quote close
  let quoteClose = getQuoteClose(quote);
  if (quoteClose) {
    quoteClose.filledAt = event.block.timestamp;
    quoteClose.fillTransaction = event.transaction.hash;

    if (quote.closedAmount.equals(quote.quantity)) {
      quoteClose.fullyFilledAt = event.block.timestamp;
      quoteClose.fullyFilledAtTx = event.transaction.hash;

      // Updating the quote status
      quote.fullyFilledAt = event.block.timestamp;
      quote.fullyFilledAtTx = event.transaction.hash;
      quote.save();
    }
    quoteClose.save();
  }

  let history = TradeHistoryModel.load(event.params.partyA.toHexString() + "-" + event.params.quoteId.toString())!;
  const additionalVolume = event.params.filledAmount
    .times(event.params.closedPrice)
    .div(BigInt.fromString("10").pow(18));
  history.volume = history.volume.plus(additionalVolume);
  history.updateTimestamp = event.block.timestamp;
  history.quoteStatus = quote.quoteStatus;
  history.quote = event.params.quoteId;
  history.save();

  let priceCheck = new PriceCheck(event.transaction.hash.toHexString() + event.transactionLogIndex.toString());
  priceCheck.event = name;
  priceCheck.symbol = Symbol.load(quote.symbolId.toString())!.name;
  priceCheck.givenPrice = event.params.closedPrice;
  priceCheck.timestamp = event.block.timestamp;
  priceCheck.transaction = event.transaction.hash;
  priceCheck.additionalInfo = quote.id;
  priceCheck.save();

  let account = AccountModel.load(event.params.partyA.toHexString())!;
  /* 

  // Updating the account locked parameters
   account.lockedCVA = account.lockedCVA.minus(
    quote.cva.times(event.params.filledAmount).div(quote.quantity)
  );
  account.lockedLF = account.lockedLF.minus(
    quote.lf.times(event.params.filledAmount).div(quote.quantity)
  );
  account.lockedPartyAmm = account.lockedPartyAmm.minus(
    quote.partyAmm.times(event.params.filledAmount).div(quote.quantity)
  );
  account.lockedPartyBmm = account.lockedPartyBmm.minus(
    quote.partyBmm.times(event.params.filledAmount).div(quote.quantity)
  ); 
  account.save(); */

  // Updating account allocated balances
  updatePartyACurrentBalances(event.address, event.params.partyA);

  const symbol = Symbol.load(quote.symbolId.toString());
  if (symbol == null) return;

  /* let tradingFee = event.params.filledAmount
      .times(quote.openPrice!)
      .times(symbol.tradingFee)
      .div(BigInt.fromString("10").pow(36)); */

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.tradeVolume = dh.tradeVolume.plus(additionalVolume);
  dh.closeTradeVolume = dh.closeTradeVolume.plus(additionalVolume);
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.tradeVolume = udh.tradeVolume.plus(additionalVolume);
  udh.closeTradeVolume = udh.closeTradeVolume.plus(additionalVolume);
  // udh.generatedFee = udh.generatedFee.plus(tradingFee); no trading fee on close
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const usdh = getUserSymbolDailyHistoryForTimestamp(
    event.block.timestamp,
    account.accountSource,
    account.user,
    quote.symbolId
  );
  usdh.tradeVolume = usdh.tradeVolume.plus(additionalVolume);
  usdh.closeTradeVolume = usdh.closeTradeVolume.plus(additionalVolume);
  // usdh.generatedFee = usdh.generatedFee.plus(tradingFee); no trading fee on close
  usdh.updateTimestamp = event.block.timestamp;
  usdh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.tradeVolume = th.tradeVolume.plus(additionalVolume);
  th.closeTradeVolume = th.closeTradeVolume.plus(additionalVolume);
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.tradeVolume = uth.tradeVolume.plus(additionalVolume);
  uth.closeTradeVolume = uth.closeTradeVolume.plus(additionalVolume);
  // uth.generatedFee = uth.generatedFee.plus(tradingFee); no trading fee on close
  uth.updateTimestamp = event.block.timestamp;
  uth.save();

  let stv = getSymbolTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  stv.volume = stv.volume.plus(additionalVolume);
  stv.updateTimestamp = event.block.timestamp;
  stv.save();

  let dsv = getSymbolDailyTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  dsv.volume = dsv.volume.plus(additionalVolume);
  dsv.updateTimestamp = event.block.timestamp;
  dsv.save();

  if (quote.openPrice) {
    updateDailyOpenInterest(
      quote.symbolId,
      event.block.timestamp,
      unDecimal(event.params.filledAmount.times(quote.openPrice!)),
      false,
      account.accountSource
    );
  }
}

export function handleDeposit(event: Deposit): void {
  let account = AccountModel.load(event.params.user.toHexString());
  if (account == null) {
    let user = createNewUser(event.params.user, null, event.block, event.transaction);
    account = createNewAccount(event.params.user.toHexString(), user, null, event.block, event.transaction);
    user.deposit = user.deposit.plus(event.params.amount);
  }
  account.deposit = account.deposit.plus(event.params.amount);
  account.save();
  updateActivityTimestamps(account, event.block.timestamp);
  let deposit = new BalanceChange(event.transaction.hash.toHex() + "-" + event.logIndex.toHexString());
  deposit.type = "DEPOSIT";
  deposit.timestamp = event.block.timestamp;
  deposit.blockNumber = event.block.number;
  deposit.transaction = event.transaction.hash;
  deposit.amount = event.params.amount;
  deposit.account = account.id;
  deposit.collateral = getConfiguration(event).collateral;
  deposit.save();

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.deposit = dh.deposit.plus(deposit.amount);
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.deposit = udh.deposit.plus(deposit.amount);
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.deposit = th.deposit.plus(deposit.amount);
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.deposit = uth.deposit.plus(deposit.amount);
  uth.updateTimestamp = event.block.timestamp;
  uth.save();
}

export function handleWithdraw(event: Withdraw): void {
  let account = AccountModel.load(event.params.sender.toHexString());
  if (account == null) {
    let user = createNewUser(event.params.sender, null, event.block, event.transaction);
    account = createNewAccount(event.params.sender.toHexString(), user, null, event.block, event.transaction);
    user.withdraw = user.withdraw.plus(event.params.amount);
  }
  account.withdraw = account.withdraw.plus(event.params.amount);
  account.updateTimestamp = event.block.timestamp;
  account.save();
  updateActivityTimestamps(account, event.block.timestamp);
  let withdraw = new BalanceChange(event.transaction.hash.toHex() + "-" + event.logIndex.toHexString());
  withdraw.type = "WITHDRAW";
  withdraw.timestamp = event.block.timestamp;
  withdraw.blockNumber = event.block.number;
  withdraw.transaction = event.transaction.hash;
  withdraw.amount = event.params.amount;
  withdraw.account = account.id;
  withdraw.collateral = getConfiguration(event).collateral;
  withdraw.save();

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.withdraw = dh.withdraw.plus(withdraw.amount);
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.withdraw = udh.withdraw.plus(withdraw.amount);
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.withdraw = th.withdraw.plus(withdraw.amount);
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.withdraw = uth.withdraw.plus(withdraw.amount);
  uth.updateTimestamp = event.block.timestamp;
  uth.save();
}

export function handleSendQuote(event: SendQuote): void {
  let account = AccountModel.load(event.params.partyA.toHexString())!;
  account.quotesCount = account.quotesCount.plus(BigInt.fromString("1"));
  account.save();
  updateActivityTimestamps(account, event.block.timestamp);
  let user = User.load(account.user);
  if (!user) {
    user = createNewUser(Address.fromString(account.user), account.accountSource, event.block, event.transaction);
  }
  let quote = new QuoteModel(event.params.quoteId.toString());
  quote.user = user.id;
  quote.timestamp = event.block.timestamp;
  quote.updateTimestamp = event.block.timestamp;
  quote.blockNumber = event.block.number;
  quote.openPriceFundingRate = BigInt.fromString("0");
  quote.paidFundingRate = BigInt.fromString("0");
  quote.transaction = event.transaction.hash;
  if (event.params.partyBsWhiteList) {
    let partyBsWhiteList: Bytes[] = [];
    for (let i = 0, len = event.params.partyBsWhiteList.length; i < len; i++)
      partyBsWhiteList.push(event.params.partyBsWhiteList[i]);
    quote.partyBsWhiteList = partyBsWhiteList;
  }
  quote.symbolId = event.params.symbolId;
  let symbol = Symbol.load(event.params.symbolId.toString());

  quote.symbol = symbol!.id;
  quote.positionType = event.params.positionType;
  quote.orderType = event.params.orderType;
  quote.price = event.params.price;
  quote.marketPrice = event.params.marketPrice;
  quote.deadline = event.params.deadline;
  quote.quantity = event.params.quantity;

  quote.remainingCVA = event.params.cva;
  quote.remainingPartyAMM = event.params.partyAmm;
  quote.remainingPartyBAMM = event.params.partyBmm;
  quote.remainingLF = event.params.lf;

  quote.cva = event.params.cva;
  quote.partyAmm = event.params.partyAmm;
  quote.partyBmm = event.params.partyBmm;
  quote.lf = event.params.lf;

  quote.quoteStatus = QuoteStatus.PENDING;
  quote.account = account.id;
  quote.closedAmount = BigInt.fromString("0");
  quote.avgClosedPrice = BigInt.fromString("0");
  quote.collateral = getConfiguration(event).collateral;
  quote.accountSource = account.accountSource;
  quote.requestedCloseCount = BigInt.fromString("0");
  quote.requestOpenAt = event.block.timestamp;
  quote.requestOpenTransaction = event.transaction.hash;
  quote.save();

  // Updating the account pending locked parameters
  /* account.pendingCVA = account.pendingCVA.plus(quote.cva);
  account.pendingLF = account.pendingLF.plus(quote.lf);
  account.pendingPartyAmm = account.pendingPartyAmm.plus(quote.partyAmm);
  account.pendingPartyBmm = account.pendingPartyBmm.plus(quote.partyBmm); */

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.quotesCount = dh.quotesCount.plus(BigInt.fromString("1"));
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.quotesCount = udh.quotesCount.plus(BigInt.fromString("1"));
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const usdh = getUserSymbolDailyHistoryForTimestamp(
    event.block.timestamp,
    account.accountSource,
    account.user,
    quote.symbolId
  );
  usdh.quotesCount = usdh.quotesCount.plus(BigInt.fromString("1"));
  usdh.updateTimestamp = event.block.timestamp;
  usdh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.quotesCount = th.quotesCount.plus(BigInt.fromString("1"));
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.quotesCount = uth.quotesCount.plus(BigInt.fromString("1"));
  uth.updateTimestamp = event.block.timestamp;
  uth.save();

  // Updating the account allocated balances
  updatePartyACurrentBalances(event.address, event.params.partyA);
}

export function handleExpireQuote(event: ExpireQuote): void {
  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.quoteStatus = event.params.quoteStatus;
  quote.updateTimestamp = event.block.timestamp;
  quote.expiredAt = event.block.timestamp;
  quote.expiredTransaction = event.transaction.hash;
  quote.save();

  // Updating the account locked parameters

  updatePartyACurrentBalances(event.address, Address.fromString(quote.account));
}

export function handleRequestToCancelQuote(event: RequestToCancelQuote): void {
  let account = AccountModel.load(event.params.partyA.toHexString())!;
  updateActivityTimestamps(account, event.block.timestamp);

  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  if (quote) {
    quote.requestToCancelAt = event.block.timestamp;
    quote.requestToCancelTransaction = event.transaction.hash;
    quote.save();
  }
}

export function handleSetSymbolsPrices(event: SetSymbolsPrices): void {
  const liquidationDetail = getLiquidatedStateOfPartyA(event.address, event.params.partyA);
  const balanceInfoOfPartyA = getBalanceInfoOfPartyA(event.address, event.params.partyA);
  if (liquidationDetail == null || balanceInfoOfPartyA == null) return;
  let model = new PartyALiquidation(event.transaction.hash.toHexString() + event.transactionLogIndex.toString());

  model.partyA = event.params.partyA;
  model.liquidator = event.params.liquidator;
  model.liquidationType = liquidationDetail.liquidationType;
  model.timestamp = event.block.timestamp;
  model.transaction = event.transaction.hash;

  model.liquidateAllocatedBalance = balanceInfoOfPartyA.value0;
  model.liquidateCva = balanceInfoOfPartyA.value1;
  model.liquidateLf = balanceInfoOfPartyA.value2;
  model.liquidatePendingCva = balanceInfoOfPartyA.value5;
  model.liquidatePendingLf = balanceInfoOfPartyA.value6;

  model.save();

  // Liquidation price settlement
  const listOFSymbols = event.params.symbolIds.slice(0);
  const listOfPrices = event.params.prices.slice(0);
  for (let i = 0, lenList = listOFSymbols.length; i < lenList; i++) {
    let entity = PartyASymbolPrice.load(event.params.partyA.toHexString().concat("-").concat(listOFSymbols[i].toHex()));
    if (!entity) {
      entity = new PartyASymbolPrice(event.params.partyA.toHexString().concat("-").concat(listOFSymbols[i].toHex()));
    }
    entity.symbolId = listOFSymbols[i];
    entity.partyA = event.params.partyA;
    entity.requestedOpenPrice = listOfPrices[i];
    entity.timeStamp = event.block.timestamp;
    entity.trHash = event.transaction.hash;
    entity.save();
  }
}

export function handleForceCancelCloseRequest(event: ForceCancelCloseRequest): void {}

export function handleForceCancelQuote(event: ForceCancelQuote): void {
  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.quoteStatus = QuoteStatus.CANCELED;
  quote.updateTimestamp = event.block.timestamp;
  quote.forceCancelAt = event.block.timestamp;
  quote.forceCancelTransaction = event.transaction.hash;
  quote.save();

  // Updating the account locked parameters
  /* let account = AccountModel.load(quote.account)!;
  account.pendingCVA = account.lockedCVA.minus(quote.cva);
  account.pendingLF = account.lockedLF.minus(quote.lf);
  account.pendingPartyAmm = account.lockedPartyAmm.minus(quote.partyAmm);
  account.pendingPartyBmm = account.lockedPartyBmm.minus(quote.partyBmm);
  account.save(); */

  // Updating account allocated balances
  updatePartyACurrentBalances(event.address, Address.fromString(quote.account));
}

export function handleRequestToClosePosition(event: RequestToClosePosition): void {
  let account = AccountModel.load(event.params.partyA.toHexString())!;
  updateActivityTimestamps(account, event.block.timestamp);

  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.quoteStatus = QuoteStatus.CLOSE_PENDING;
  quote.updateTimestamp = event.block.timestamp;
  quote.requestedCloseCount = quote.requestedCloseCount.plus(BigInt.fromString("1"));
  quote.save();

  // Creating a quote close
  let quoteClose = new QuoteClose(quote.id + "-" + quote.requestedCloseCount.toString());
  quoteClose.quote = quote.id;
  quoteClose.requestAt = event.block.timestamp;
  quoteClose.requestCloseTransaction = event.transaction.hash;
  quoteClose.orderType = event.params.orderType;
  quoteClose.closePrice = event.params.closePrice;
  quoteClose.quantity = event.params.quantityToClose;

  quoteClose.save();
}

export function handleAcceptCancelRequest(event: AcceptCancelRequest): void {
  let quote = QuoteModel.load(event.params.quoteId.toString());
  if (quote == null) return;
  quote.quoteStatus = QuoteStatus.CANCELED;
  quote.updateTimestamp = event.block.timestamp;
  quote.cancelAt = event.block.timestamp;
  quote.cancelTransaction = event.transaction.hash;
  quote.save();

  // Updating the account locked parameters
  /* let account = AccountModel.load(quote.account)!;
  account.pendingCVA = account.pendingCVA.minus(quote.cva);
  account.pendingLF = account.pendingLF.minus(quote.lf);
  account.pendingPartyAmm = account.pendingPartyAmm.minus(quote.partyAmm);
  account.pendingPartyBmm = account.pendingPartyBmm.minus(quote.partyBmm);
  account.save(); */
  updatePartyACurrentBalances(event.address, Address.fromString(quote.account));
}

export function handleRequestToCancelCloseRequest(event: RequestToCancelCloseRequest): void {
  let account = AccountModel.load(event.params.partyA.toHexString())!;
  updateActivityTimestamps(account, event.block.timestamp);

  // Requesting cancel on the quote close
  const quote = QuoteModel.load(event.params.quoteId.toString());
  if (quote) {
    const quoteClose = getQuoteClose(quote);
    if (quoteClose) {
      quoteClose.requestCancelAt = event.block.timestamp;
      quoteClose.requestCancelTransaction = event.transaction.hash;
      quoteClose.save();
    }
  }
}

export function handleAcceptCancelCloseRequest(event: AcceptCancelCloseRequest): void {
  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.quoteStatus = QuoteStatus.OPENED;
  quote.save();

  // Cancelling the quote close

  if (quote) {
    const quoteClose = getQuoteClose(quote);
    if (quoteClose) {
      quoteClose.cancelAt = event.block.timestamp;
      quoteClose.cancelTransaction = event.transaction.hash;
      quoteClose.save();
    }
  }

  // Updating the account allocated balances
  updatePartyACurrentBalances(event.address, Address.fromString(quote.account));
}

export function handleLockQuote(event: LockQuote): void {
  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.updateTimestamp = event.block.timestamp;
  quote.partyB = event.params.partyB;
  const solver = getSolver(event.params.partyB.toHexString());
  quote.solver = solver.id;
  quote.quoteStatus = QuoteStatus.LOCKED;
  quote.save();
}

export function handleUnlockQuote(event: UnlockQuote): void {
  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  quote.updateTimestamp = event.block.timestamp;
  quote.partyB = null;
  quote.solver = "";
  quote.quoteStatus = QuoteStatus.PENDING;
  quote.save();
}

export function handleOpenPosition(event: OpenPosition): void {
  let account = AccountModel.load(event.params.partyA.toHexString())!;
  account.positionsCount = account.positionsCount.plus(BigInt.fromString("1"));
  account.updateTimestamp = event.block.timestamp;
  account.save();
  let history = new TradeHistoryModel(account.id + "-" + event.params.quoteId.toString());
  history.account = account.id;
  history.timestamp = event.block.timestamp;
  history.blockNumber = event.block.number;
  history.transaction = event.transaction.hash;
  history.volume = unDecimal(event.params.filledAmount.times(event.params.openedPrice));
  history.quoteStatus = QuoteStatus.OPENED;
  history.quote = event.params.quoteId;
  history.updateTimestamp = event.block.timestamp;
  history.save();

  let quote = QuoteModel.load(event.params.quoteId.toString())!;
  const chainQuote = getQuote(event.address, BigInt.fromString(quote.id));
  if (chainQuote == null) {
    return;
  }
  quote.openPrice = event.params.openedPrice;
  quote.openPriceFundingRate = event.params.openedPrice;
  quote.paidFundingRate = BigInt.fromString("0");

  quote.remainingCVA = chainQuote.lockedValues.cva;
  quote.remainingLF = chainQuote.lockedValues.lf;
  quote.remainingPartyAMM = chainQuote.lockedValues.partyAmm;
  quote.remainingPartyBAMM = chainQuote.lockedValues.partyBmm;
  quote.cva = chainQuote.lockedValues.cva;
  quote.lf = chainQuote.lockedValues.lf;
  quote.partyAmm = chainQuote.lockedValues.partyAmm;
  quote.partyBmm = chainQuote.lockedValues.partyBmm;
  quote.quantity = event.params.filledAmount;
  quote.updateTimestamp = event.block.timestamp;
  quote.quoteStatus = QuoteStatus.OPENED;
  quote.openedAt = event.block.timestamp;
  quote.openTransaction = event.transaction.hash;
  quote.save();

  let priceCheck = new PriceCheck(event.transaction.hash.toHexString() + event.transactionLogIndex.toString());
  priceCheck.event = "OpenPosition";
  priceCheck.symbol = Symbol.load(quote.symbolId.toString())!.name;
  priceCheck.givenPrice = event.params.openedPrice;
  priceCheck.timestamp = event.block.timestamp;
  priceCheck.transaction = event.transaction.hash;
  priceCheck.additionalInfo = quote.id;
  priceCheck.save();

  let user: User | null = User.load(account.user);

  if (!user) {
    user = createNewUser(Address.fromString(account.user), account.accountSource, event.block, event.transaction);
  }

  // Updating the account pending locked parameters
  /* account.pendingCVA = account.pendingCVA.minus(quote.cva);
  account.pendingLF = account.pendingLF.minus(quote.lf);
  account.pendingPartyAmm = account.pendingPartyAmm.minus(quote.partyAmm);
  account.pendingPartyBmm = account.pendingPartyBmm.minus(quote.partyBmm);

  // Updating the account locked parameters
  account.lockedCVA = account.lockedCVA.plus(quote.cva);
  account.lockedLF = account.lockedLF.plus(quote.lf);
  account.lockedPartyAmm = account.lockedPartyAmm.plus(quote.partyAmm);
  account.lockedPartyBmm = account.lockedPartyBmm.plus(quote.partyBmm); */

  account.save();

  // Updating totalTradeCountAnalytics if user is not null and position is 100% filled

  const quoteNotional = quote.openPrice!.times(quote.quantity);
  let totalTradeCount = user.totalTradeCount;
  user.totalTradeCount = totalTradeCount.plus(BigInt.fromI32(1));

  if (quoteNotional.gt(BigInt.fromString("10000000000000000000000000000000000000000"))) {
    let tradesOver10000 = user.tradesOver10000;

    user.tradesOver10000 = tradesOver10000.plus(BigInt.fromI32(1));
  }
  if (quoteNotional.gt(BigInt.fromString("5000000000000000000000000000000000000000"))) {
    let tradesOver5000 = user.tradesOver5000;

    user.tradesOver5000 = tradesOver5000.plus(BigInt.fromI32(1));
  }
  if (quoteNotional.gt(BigInt.fromString("2500000000000000000000000000000000000000"))) {
    let tradesOver2500 = user.tradesOver2500;

    user.tradesOver2500 = tradesOver2500.plus(BigInt.fromI32(1));
  }
  if (quoteNotional.gt(BigInt.fromString("1000000000000000000000000000000000000000"))) {
    let tradesOver1000 = user.tradesOver1000;

    user.tradesOver1000 = tradesOver1000.plus(BigInt.fromI32(1));
  }

  user.save();

  const symbol = Symbol.load(quote.symbolId.toString());
  if (symbol == null) return;

  let tradingFee = event.params.filledAmount
    .times(quote.openPrice!)
    .times(symbol.tradingFee)
    .div(BigInt.fromString("10").pow(36));

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.tradeVolume = dh.tradeVolume.plus(history.volume);
  dh.openTradeVolume = dh.openTradeVolume.plus(history.volume);
  dh.platformFee = dh.platformFee.plus(tradingFee);
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.tradeVolume = udh.tradeVolume.plus(history.volume);
  udh.openTradeVolume = udh.openTradeVolume.plus(history.volume);
  udh.generatedFee = udh.generatedFee.plus(tradingFee);
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const usdh = getUserSymbolDailyHistoryForTimestamp(
    event.block.timestamp,
    account.accountSource,
    account.user,
    quote.symbolId
  );
  usdh.tradeVolume = usdh.tradeVolume.plus(history.volume);
  usdh.openTradeVolume = usdh.openTradeVolume.plus(history.volume);
  usdh.generatedFee = usdh.generatedFee.plus(tradingFee);
  usdh.updateTimestamp = event.block.timestamp;
  usdh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.tradeVolume = th.tradeVolume.plus(history.volume);
  th.openTradeVolume = th.openTradeVolume.plus(history.volume);
  th.platformFee = th.platformFee.plus(tradingFee);
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.tradeVolume = uth.tradeVolume.plus(history.volume);
  uth.openTradeVolume = uth.openTradeVolume.plus(history.volume);
  uth.generatedFee = uth.generatedFee.plus(tradingFee);
  uth.updateTimestamp = event.block.timestamp;
  uth.save();

  let stv = getSymbolTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  stv.volume = stv.volume.plus(history.volume);
  stv.updateTimestamp = event.block.timestamp;
  stv.save();

  let dsv = getSymbolDailyTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  dsv.volume = dsv.volume.plus(history.volume);
  dsv.updateTimestamp = event.block.timestamp;
  dsv.save();

  updateDailyOpenInterest(quote.symbolId, event.block.timestamp, history.volume, true, account.accountSource);

  // Updating the account allocated balances
  updatePartyACurrentBalances(event.address, event.params.partyA);
}

export function handleFillCloseRequest(event: FillCloseRequest): void {
  handleClose(event, "FillCloseRequest");
}

export function handleEmergencyClosePosition(event: EmergencyClosePosition): void {
  handleClose(event, "EmergencyClosePosition");
}

export function handleForceClosePosition(event: ForceClosePosition): void {
  handleClose(event, "ForceClosePosition");
}

export function handleDiamondCut(event: DiamondCut): void {}

export function handleTransferAllocation(event: TransferAllocation): void {}

export function handleActiveEmergencyMode(event: ActiveEmergencyMode): void {}

export function handleDeactiveEmergencyMode(event: DeactiveEmergencyMode): void {}

export function handlePauseAccounting(event: PauseAccounting): void {}

export function handlePauseGlobal(event: PauseGlobal): void {}

export function handlePauseLiquidation(event: PauseLiquidation): void {}

export function handlePausePartyAActions(event: PausePartyAActions): void {}

export function handlePausePartyBActions(event: PausePartyBActions): void {}

export function handleRegisterPartyB(event: RegisterPartyB): void {}

export function handleSetCollateral(event: SetCollateral): void {
  let configuration = getConfiguration(event);
  configuration.collateral = event.params.collateral;
  configuration.save();
}

export function handleSetDeallocateCooldown(event: SetDeallocateCooldown): void {}

export function handleSetFeeCollector(event: SetFeeCollector): void {}

export function handleSetForceCancelCloseCooldown(event: SetForceCancelCloseCooldown): void {}

export function handleSetForceCancelCooldown(event: SetForceCancelCooldown): void {}

export function handleSetForceCloseCooldown(event: SetForceCloseCooldown): void {}

export function handleSetForceCloseGapRatio(event: SetForceCloseGapRatio): void {}

export function handleSetLiquidationTimeout(event: SetLiquidationTimeout): void {}

export function handleSetLiquidatorShare(event: SetLiquidatorShare): void {}

export function handleSetMuonConfig(event: SetMuonConfig): void {}

export function handleSetMuonIds(event: SetMuonIds): void {}

export function handleSetPartyBEmergencyStatus(event: SetPartyBEmergencyStatus): void {}

export function handleSetPendingQuotesValidLength(event: SetPendingQuotesValidLength): void {}

export function handleSetSuspendedAddress(event: SetSuspendedAddress): void {}

export function handleSetSymbolAcceptableValues(event: SetSymbolAcceptableValues): void {}

export function handleSetSymbolMaxSlippage(event: SetSymbolMaxSlippage): void {}

export function handleSetSymbolValidationState(event: SetSymbolValidationState): void {}

export function handleUnpauseAccounting(event: UnpauseAccounting): void {}

export function handleUnpauseGlobal(event: UnpauseGlobal): void {}

export function handleUnpauseLiquidation(event: UnpauseLiquidation): void {}

export function handleUnpausePartyAActions(event: UnpausePartyAActions): void {}

export function handleUnpausePartyBActions(event: UnpausePartyBActions): void {}

export function handleFullyLiquidatedPartyB(event: FullyLiquidatedPartyB): void {}

export function handleLiquidatePartyA(event: LiquidatePartyA): void {
  const executedLiquidation = new ExecutedLiquidation(event.params.partyA.toString() + event.block.hash.toHexString());
  executedLiquidation.partyA = event.params.partyA;
  executedLiquidation.liquidator = event.params.liquidator;
  executedLiquidation.timestamp = event.block.timestamp;
  executedLiquidation.save();
}

export function handleLiquidatePartyB(event: LiquidatePartyB): void {
  const balanceInfoOfPartyB = getBalanceInfoOfPartyB(event.address, event.params.partyA, event.params.partyB);
  if (balanceInfoOfPartyB == null) return;
  let model = new PartyBLiquidation(event.transaction.hash.toHexString() + event.transactionLogIndex.toString());

  model.partyA = event.params.partyA;
  model.partyB = event.params.partyB;
  model.liquidator = event.params.liquidator;
  model.timestamp = event.block.timestamp;
  model.transaction = event.transaction.hash;

  model.liquidateAllocatedBalance = balanceInfoOfPartyB.value0;
  model.liquidateCva = balanceInfoOfPartyB.value1;
  model.liquidateLf = balanceInfoOfPartyB.value2;
  model.liquidatePendingCva = balanceInfoOfPartyB.value5;
  model.liquidatePendingLf = balanceInfoOfPartyB.value6;

  model.save();
}

export function handleLiquidatePositionsPartyA(event: LiquidatePositionsPartyA): void {
  for (let i = 0; i < event.params.quoteIds.length; i++) {
    const qId = event.params.quoteIds[i];
    handleLiquidatePosition(event, qId);
  }
}

export function handleLiquidatePositionsPartyB(event: LiquidatePositionsPartyB): void {
  for (let i = 0; i < event.params.quoteIds.length; i++) {
    const qId = event.params.quoteIds[i];
    handleLiquidatePosition(event, qId);
  }
}

function handleLiquidatePosition(_event: ethereum.Event, qId: BigInt): void {
  const event = changetype<LiquidatePositionsPartyA>(_event);
  let history = TradeHistoryModel.load(event.params.partyA.toHexString() + "-" + qId.toString())!;
  const quote = QuoteModel.load(qId.toString())!;
  quote.quoteStatus = QuoteStatus.LIQUIDATED;
  quote.updateTimestamp = event.block.timestamp;
  quote.liquidatedSide = 1;
  quote.liquidatedAt = event.block.timestamp;
  quote.liquidatedTransaction = event.transaction.hash;

  // Liquidation details
  let liquidationAmount = quote.quantity!.minus(quote.closedAmount!);
  quote.liquidationAmount = liquidationAmount;

  let partyASymbolPriceEntity = PartyASymbolPrice.load(
    event.params.partyA.toHexString().concat("-").concat(quote.symbolId!.toHex())
  );
  if (partyASymbolPriceEntity) {
    quote.liquidationPrice = partyASymbolPriceEntity.requestedOpenPrice;
  } else {
    // log.debug(`Error in get entity liquidate requestedOpenPrice`, []);
  }

  quote.save();

  const chainQuote = getQuote(event.address, qId);
  if (chainQuote == null) return;
  const liquidAmount = quote.quantity.minus(quote.closedAmount);
  const liquidPrice = chainQuote.avgClosedPrice
    .times(quote.quantity)
    .minus(quote.avgClosedPrice.times(quote.closedAmount))
    .div(liquidAmount);
  const additionalVolume = liquidAmount.times(liquidPrice).div(BigInt.fromString("10").pow(18));
  history.volume = history.volume.plus(additionalVolume);
  history.quoteStatus = QuoteStatus.LIQUIDATED;
  history.updateTimestamp = event.block.timestamp;
  history.quote = qId;
  history.save();

  quote.avgClosedPrice = chainQuote.avgClosedPrice;
  quote.save();
  let account = AccountModel.load(quote.account)!;

  const dh = getDailyHistoryForTimestamp(event.block.timestamp, account.accountSource);
  dh.tradeVolume = dh.tradeVolume.plus(additionalVolume);
  dh.closeTradeVolume = dh.closeTradeVolume.plus(additionalVolume);
  dh.updateTimestamp = event.block.timestamp;
  dh.save();

  const udh = getUserDailyHistoryForTimestamp(event.block.timestamp, account.accountSource, account.user);
  udh.tradeVolume = udh.tradeVolume.plus(additionalVolume);
  udh.closeTradeVolume = udh.closeTradeVolume.plus(additionalVolume);
  udh.updateTimestamp = event.block.timestamp;
  udh.save();

  const usdh = getUserSymbolDailyHistoryForTimestamp(
    event.block.timestamp,
    account.accountSource,
    account.user,
    quote.symbolId
  );
  usdh.tradeVolume = usdh.tradeVolume.plus(additionalVolume);
  usdh.closeTradeVolume = usdh.closeTradeVolume.plus(additionalVolume);
  usdh.updateTimestamp = event.block.timestamp;
  usdh.save();

  const th = getTotalHistory(event.block.timestamp, account.accountSource);
  th.tradeVolume = th.tradeVolume.plus(additionalVolume);
  th.closeTradeVolume = th.closeTradeVolume.plus(additionalVolume);
  th.updateTimestamp = event.block.timestamp;
  th.save();

  const uth = getUserTotalHistory(event.block.timestamp, account.accountSource, account.user);
  uth.tradeVolume = uth.tradeVolume.plus(additionalVolume);
  uth.closeTradeVolume = uth.closeTradeVolume.plus(additionalVolume);
  uth.updateTimestamp = event.block.timestamp;
  uth.save();

  let stv = getSymbolTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  stv.volume = stv.volume.plus(additionalVolume);
  stv.updateTimestamp = event.block.timestamp;
  stv.save();

  let sdv = getSymbolDailyTradeVolume(quote.symbolId, event.block.timestamp, account.accountSource);
  sdv.volume = sdv.volume.plus(additionalVolume);
  sdv.updateTimestamp = event.block.timestamp;
  sdv.save();

  updateDailyOpenInterest(
    quote.symbolId,
    event.block.timestamp,
    unDecimal(liquidAmount.times(quote.openPrice!)),
    false,
    account.accountSource
  );

  // Updating the account allocated balances
  updatePartyACurrentBalances(event.address, event.params.partyA);
}

export function handleLiquidationDisputed(event: DisputeForLiquidation): void {
  let model = new PartyALiquidationDisputed(
    event.transaction.hash.toHexString() + event.transactionLogIndex.toString()
  );
  model.partyA = event.params.partyA;
  model.timestamp = event.block.timestamp;
  model.transaction = event.transaction.hash;
  model.save();

  // Updating the account allocated balances
  updatePartyACurrentBalances(event.address, event.params.partyA);
}

// let lastActionTimestamp: BigInt = BigInt.zero();

// export function handleBlockWithCall(block: ethereum.Block): void {
//   const blockTimestamp = block.timestamp;
//   if (blockTimestamp.minus(lastActionTimestamp).gt(BigInt.fromI32(600))) {
//     let oi = getOpenInterest(block.timestamp);
//     let dh = getDailyHistoryForTimestamp(blockTimestamp);
//     if (isSameDay(blockTimestamp, oi.timestamp)) {
//       oi.count = oi.count.plus(BigInt.fromString("1"));
//       oi.accumulatedAmount = oi.accumulatedAmount.plus(oi.amount);
//       dh.openInterest = oi.accumulatedAmount.div(oi.count);
//     } else {
//       dh.openInterest = oi.amount;
//       oi.count = BigInt.fromString("1");
//       oi.accumulatedAmount = oi.amount;
//     }
//     oi.save();
//     dh.save();
//     lastActionTimestamp = blockTimestamp;
//   }
// }

const FACTOR: BigInt = BigInt.fromString(`1000000000000000000`);
export function handleChargeFundingRate(event: ChargeFundingRate): void {
  const quoteIds = event.params.quoteIds;
  const rates = event.params.rates;

  let ratesBySolverBySymbolDictionary = new Map<string, Map<string, BigInt>>();
  let longRatesBySolverBySymbolDictionary = new Map<string, Map<string, BigInt>>();
  let shortRatesBySolverBySymbolDictionary = new Map<string, Map<string, BigInt>>();

  for (let i = 0; i < quoteIds.length; i++) {
    const qId = quoteIds[i];
    const quote = QuoteModel.load(qId.toString())!;
    const solver = quote.solver;
    const user = User.load(quote.user)!;
    const accountAddress = quote.account;
    const accountId = accountAddress;
    const symbol = quote.symbol;
    const rate = rates[i];

    if (solver) {
      if (!ratesBySolverBySymbolDictionary.has(solver)) {
        const ratesBySolver = new Map<string, BigInt>();
        ratesBySolver.set(symbol, rate);
        ratesBySolverBySymbolDictionary.set(solver, ratesBySolver);
      } else {
        const ratesBySolver = ratesBySolverBySymbolDictionary.get(solver)!;
        if (!ratesBySolver.has(symbol)) {
          ratesBySolver.set(symbol, rate);
        } else {
          const averagedRate = ratesBySolver.get(symbol)!.plus(rate).div(BigInt.fromString("2"));
          ratesBySolver.set(symbol, averagedRate);
        }
      }

      if (quote.positionType === 0) {
        // Long
        if (!longRatesBySolverBySymbolDictionary.has(solver)) {
          const longRatesBySolver = new Map<string, BigInt>();
          longRatesBySolver.set(symbol, rate);
          longRatesBySolverBySymbolDictionary.set(solver, longRatesBySolver);
        } else {
          const longRatesBySolver = longRatesBySolverBySymbolDictionary.get(solver)!;
          if (!longRatesBySolver.has(symbol)) {
            longRatesBySolver.set(symbol, rate);
          } else {
            const averagedRate = longRatesBySolver.get(symbol)!.plus(rate).div(BigInt.fromString("2"));
            longRatesBySolver.set(symbol, averagedRate);
          }
        }
      } else {
        if (!shortRatesBySolverBySymbolDictionary.has(solver)) {
          const shortRatesBySolver = new Map<string, BigInt>();
          shortRatesBySolver.set(symbol, rate);
          shortRatesBySolverBySymbolDictionary.set(solver, shortRatesBySolver);
        } else {
          const shortRatesBySolver = shortRatesBySolverBySymbolDictionary.get(solver)!;
          if (!shortRatesBySolver.has(symbol)) {
            shortRatesBySolver.set(symbol, rate);
          } else {
            const averagedRate = shortRatesBySolver.get(symbol)!.plus(rate).div(BigInt.fromString("2"));
            shortRatesBySolver.set(symbol, averagedRate);
          }
        }
      }
    }

    let newPrice: BigInt;

    if (quote.positionType === 0) {
      //Long
      newPrice = quote.openPriceFundingRate.plus(quote.openPriceFundingRate.times(rate).div(FACTOR));
    } else {
      newPrice = quote.openPriceFundingRate.minus(quote.openPriceFundingRate.times(rate).div(FACTOR));
    }

    const openQuantityUntilNow = quote.quantity.minus(quote.closedAmount);
    let paidFee: BigInt;
    paidFee = quote.openPriceFundingRate.times(rate).times(openQuantityUntilNow).div(FACTOR).div(FACTOR);

    quote.paidFundingRate = quote.paidFundingRate.plus(paidFee);
    quote.openPriceFundingRate = newPrice;
    quote.save();

    // Creating a new paid funding rate
    let paidFundingRate = new PaidFundingFee(event.transaction.hash.toHexString() + "_" + qId.toString());
    paidFundingRate.quote = qId.toString();
    paidFundingRate.account = accountId;
    paidFundingRate.timestamp = event.block.timestamp;
    paidFundingRate.transaction = event.transaction.hash;
    paidFundingRate.rateApplied = rate;
    paidFundingRate.user = quote.user;
    paidFundingRate.paidFee = paidFee;
    paidFundingRate.save();
  }
  // Processing ratesBySolverBySymbolDictionary
  for (let i = 0; i < ratesBySolverBySymbolDictionary.keys().length; i++) {
    const solver = ratesBySolverBySymbolDictionary.keys()[i];
    const ratesBySymbol = ratesBySolverBySymbolDictionary.get(solver)!;
    for (let j = 0; j < ratesBySymbol.keys().length; j++) {
      const symbol = ratesBySymbol.keys()[j];
      const rate = ratesBySymbol.get(symbol)!;
      let hourlySymbolFundingRateAverage = getHourlySymbolFundingRateAverage(event.block.timestamp, symbol, solver);
      hourlySymbolFundingRateAverage.lastUpdatedTimestamp = event.block.timestamp;
      // Making average of 2 rates
      if (hourlySymbolFundingRateAverage.rateApplied === BigInt.fromI32(0)) {
        hourlySymbolFundingRateAverage.rateApplied = rate;
      } else {
        hourlySymbolFundingRateAverage.rateApplied = hourlySymbolFundingRateAverage.rateApplied
          .plus(rate)
          .div(BigInt.fromI32(2));
      }

      hourlySymbolFundingRateAverage.save();
    }
  }

  // Processing longRatesBySolverBySymbolDictionary
  for (let i = 0; i < longRatesBySolverBySymbolDictionary.keys().length; i++) {
    const solver = longRatesBySolverBySymbolDictionary.keys()[i];
    const ratesBySymbol = longRatesBySolverBySymbolDictionary.get(solver)!;
    for (let j = 0; j < ratesBySymbol.keys().length; j++) {
      const symbol = ratesBySymbol.keys()[j];
      const rate = ratesBySymbol.get(symbol)!;
      let hourlySymbolFundingRateAverage = getHourlySymbolFundingRateAverage(event.block.timestamp, symbol, solver);
      hourlySymbolFundingRateAverage.lastUpdatedTimestamp = event.block.timestamp;
      // Making average of 2 rates
      if (hourlySymbolFundingRateAverage.longRateApplied === BigInt.fromI32(0)) {
        hourlySymbolFundingRateAverage.longRateApplied = rate;
      } else {
        hourlySymbolFundingRateAverage.longRateApplied = hourlySymbolFundingRateAverage.longRateApplied
          .plus(rate)
          .div(BigInt.fromI32(2));
      }

      hourlySymbolFundingRateAverage.save();
    }
  }

  // Processing shortRatesBySolverBySymbolDictionary
  for (let i = 0; i < shortRatesBySolverBySymbolDictionary.keys().length; i++) {
    const solver = shortRatesBySolverBySymbolDictionary.keys()[i];
    const ratesBySymbol = shortRatesBySolverBySymbolDictionary.get(solver)!;
    for (let j = 0; j < ratesBySymbol.keys().length; j++) {
      const symbol = ratesBySymbol.keys()[j];
      const rate = ratesBySymbol.get(symbol)!;
      let hourlySymbolFundingRateAverage = getHourlySymbolFundingRateAverage(event.block.timestamp, symbol, solver);
      hourlySymbolFundingRateAverage.lastUpdatedTimestamp = event.block.timestamp;
      // Making average of 2 rates
      if (hourlySymbolFundingRateAverage.shortRateApplied === BigInt.fromI32(0)) {
        hourlySymbolFundingRateAverage.shortRateApplied = rate;
      } else {
        hourlySymbolFundingRateAverage.shortRateApplied = hourlySymbolFundingRateAverage.shortRateApplied
          .plus(rate)
          .div(BigInt.fromI32(2));
      }

      hourlySymbolFundingRateAverage.save();
    }
  }
}

export function handleBalanceChangePartyA(event: BalanceChangePartyA): void {
  updatePartyACurrentBalances(event.address, event.params.partyA);
}

export function handleBalanceChangePartyB(event: BalanceChangePartyB): void {}
