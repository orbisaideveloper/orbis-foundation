export interface LotterySellerCalculationInput {
  dispatchQuantity: string | number | bigint;
  morningReturnQuantity: string | number | bigint;
  dayReturnQuantity: string | number | bigint;
  eveningReturnQuantity: string | number | bigint;
  ticketRatePaise: string | number | bigint;
  commissionPaise: string | number | bigint;
  tdsRateBps: number;
}

export interface LotterySellerCalculation {
  dispatch: bigint;
  morningReturn: bigint;
  dayReturn: bigint;
  eveningReturn: bigint;
  totalReturn: bigint;
  netSale: bigint;
  grossAmountPaise: bigint;
  commissionPaise: bigint;
  tdsPaise: bigint;
  partyPayablePaise: bigint;
  hasInvalidReturn: boolean;
  hasInvalidCommission: boolean;
}

function naturalBigInt(value: string | number | bigint): bigint {
  const normalized = String(value);
  return /^\d+$/.test(normalized) ? BigInt(normalized) : 0n;
}

export function roundedBasisPoints(amountPaise: bigint, rateBps: number): bigint {
  return (amountPaise * BigInt(rateBps) + 5_000n) / 10_000n;
}

export function calculateLotterySeller(
  input: LotterySellerCalculationInput,
): LotterySellerCalculation {
  const dispatch = naturalBigInt(input.dispatchQuantity);
  const morningReturn = naturalBigInt(input.morningReturnQuantity);
  const dayReturn = naturalBigInt(input.dayReturnQuantity);
  const eveningReturn = naturalBigInt(input.eveningReturnQuantity);
  const totalReturn = morningReturn + dayReturn + eveningReturn;
  const hasInvalidReturn = totalReturn > dispatch;
  const netSale = hasInvalidReturn ? 0n : dispatch - totalReturn;
  const ticketRatePaise = naturalBigInt(input.ticketRatePaise);
  const grossAmountPaise = netSale * ticketRatePaise;
  const commissionPaise = naturalBigInt(input.commissionPaise);
  const hasInvalidCommission = commissionPaise > grossAmountPaise;
  const tdsPaise = hasInvalidCommission
    ? 0n
    : roundedBasisPoints(commissionPaise, input.tdsRateBps);
  const partyPayablePaise = hasInvalidCommission
    ? 0n
    : grossAmountPaise - commissionPaise + tdsPaise;

  return {
    dispatch,
    morningReturn,
    dayReturn,
    eveningReturn,
    totalReturn,
    netSale,
    grossAmountPaise,
    commissionPaise,
    tdsPaise,
    partyPayablePaise,
    hasInvalidReturn,
    hasInvalidCommission,
  };
}

export function sumLotterySellerCalculations(
  calculations: Iterable<LotterySellerCalculation>,
) {
  const totals = {
    dispatch: 0n,
    morningReturn: 0n,
    dayReturn: 0n,
    eveningReturn: 0n,
    totalReturn: 0n,
    netSale: 0n,
    grossAmountPaise: 0n,
    commissionPaise: 0n,
    tdsPaise: 0n,
    partyPayablePaise: 0n,
  };

  for (const calculation of calculations) {
    totals.dispatch += calculation.dispatch;
    totals.morningReturn += calculation.morningReturn;
    totals.dayReturn += calculation.dayReturn;
    totals.eveningReturn += calculation.eveningReturn;
    totals.totalReturn += calculation.totalReturn;
    totals.netSale += calculation.netSale;
    totals.grossAmountPaise += calculation.grossAmountPaise;
    totals.commissionPaise += calculation.commissionPaise;
    totals.tdsPaise += calculation.tdsPaise;
    totals.partyPayablePaise += calculation.partyPayablePaise;
  }

  return totals;
}
