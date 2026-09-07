function normalizePartyEmail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function normalizePartyPhone(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/[()\s.-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

function verifiedContactSelectors(user) {
  const selectors = [];
  const email =
    user?.emailVerified === true ? normalizePartyEmail(user.email) : null;
  const phone =
    user?.phoneVerified === true ? normalizePartyPhone(user.phone) : null;

  if (email) selectors.push({ emailNormalized: email });
  if (phone) selectors.push({ phoneNormalized: phone });

  return { selectors, email, phone };
}

module.exports = {
  normalizePartyEmail,
  normalizePartyPhone,
  verifiedContactSelectors,
};
