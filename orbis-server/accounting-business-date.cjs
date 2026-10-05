// Modern Indian accounting dates use UTC+05:30 (Asia/Kolkata).
const INDIA_OFFSET_MS = 330 * 60 * 1000;

function businessDateKey(value) {
  return new Date(new Date(value).getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
}

function businessDayRange(value) {
  const day = businessDateKey(value);
  const startsAt = new Date(`${day}T00:00:00.000+05:30`);
  return { startsAt, endsAt: new Date(startsAt.getTime() + 24 * 60 * 60 * 1000) };
}

module.exports = { businessDateKey, businessDayRange };
