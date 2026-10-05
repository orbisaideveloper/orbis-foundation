const { businessDateKey, businessDayRange } = require("./accounting-business-date.cjs");

function projectRecurringExpenseBills(profiles, bills, throughDay, voidedMonths = []) {
  const result = [...bills];
  const existing = new Set([...bills.filter((bill) => bill.billingMonth), ...voidedMonths]
    .map((bill) => `${bill.profileId}:${bill.billingMonth}`));
  for (const profile of profiles) {
    if (profile.scheduleType !== "MONTHLY" || !profile.recurringStartsAt ||
        BigInt(profile.usualAmountPaise || 0) <= 0n) continue;
    const startsOn = businessDateKey(profile.recurringStartsAt);
    if (startsOn > throughDay) continue;
    const cursor = new Date(`${startsOn.slice(0, 7)}-01T00:00:00.000Z`);
    const end = new Date(`${throughDay.slice(0, 7)}-01T00:00:00.000Z`);
    while (cursor <= end) {
      const billingMonth = cursor.toISOString().slice(0, 7);
      if (!existing.has(`${profile.id}:${billingMonth}`)) {
        result.push({ profileId: profile.id, billingMonth,
          amountPaise: BigInt(profile.usualAmountPaise), projected: true,
          occurredAt: new Date(Math.max(
            new Date(`${billingMonth}-01T00:00:00.000+05:30`).getTime(),
            businessDayRange(profile.recurringStartsAt).startsAt.getTime(),
          )),
        });
      }
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  return result;
}

module.exports = { projectRecurringExpenseBills };
