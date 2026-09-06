export const ACCOUNTING_LANGUAGES = [
  {
    value: "EN",
    shortLabel: "EN",
    label: "English",
    nativeLabel: "English",
    htmlLang: "en-IN",
  },
  {
    value: "BN",
    shortLabel: "BN",
    label: "Bengali",
    nativeLabel: "বাংলা",
    htmlLang: "bn-IN",
  },
  {
    value: "HI",
    shortLabel: "HI",
    label: "Hindi",
    nativeLabel: "हिन्दी",
    htmlLang: "hi-IN",
  },
] as const;

export type AccountingLanguage =
  (typeof ACCOUNTING_LANGUAGES)[number]["value"];

export const ACCOUNTING_LANGUAGE_STORAGE_KEY =
  "orbis-accounting-public-language";

export const DEFAULT_ACCOUNTING_LANGUAGE: AccountingLanguage = "EN";

const ACCOUNTING_PRODUCT_NAME = "ORBiS Accounting AI";

type AccountingTranslationKey =
  | "language.aria"
  | "language.title"
  | "language.subtitle"
  | "appearance.aria"
  | "appearance.title"
  | "appearance.subtitle"
  | "appearance.classic.label"
  | "appearance.classic.description"
  | "appearance.signature.label"
  | "appearance.signature.description"
  | "appearance.signatureDark.label"
  | "appearance.signatureDark.description"
  | "public.liveUnavailable"
  | "public.currentMode"
  | "public.liveUnavailableMessage"
  | "public.publishPreview"
  | "public.liveUserMode"
  | "public.currentDraft"
  | "public.livePublished"
  | "public.readOnlyNotice"
  | "public.readOnlyBlocked"
  | "public.accountingEyebrow"
  | "public.title"
  | "public.publicUserPreview"
  | "public.tagline"
  | "public.signatureExperience"
  | "greeting.aria"
  | "greeting.kicker"
  | "greeting.morning"
  | "greeting.afternoon"
  | "greeting.evening"
  | "greeting.companion"
  | "version.notPublished";

const COPY: Record<
  AccountingLanguage,
  Record<AccountingTranslationKey, string>
> = {
  EN: {
    "language.aria": "Accounting language",
    "language.title": "Language",
    "language.subtitle": "Choose the language for the public Accounting experience.",
    "appearance.aria": "Accounting appearance",
    "appearance.title": "Preview appearance",
    "appearance.subtitle": "All three appearances ship with the Accounting app.",
    "appearance.classic.label": "Classic / Existing",
    "appearance.classic.description":
      "Keep the existing Accounting workspace presentation.",
    "appearance.signature.label": "Signature Emerald",
    "appearance.signature.description":
      "Premium emerald, teal, white and soft-gold public design.",
    "appearance.signatureDark.label": "Signature Emerald Dark",
    "appearance.signatureDark.description":
      "The Signature Emerald public design in a dark appearance.",
    "public.liveUnavailable": "Live user mode unavailable",
    "public.currentMode": "Current Mode",
    "public.liveUnavailableMessage":
      "No published Accounting version exists yet. Review and publish the current draft first; Live User Mode will then resolve that published snapshot.",
    "public.publishPreview": "Publish Preview",
    "public.liveUserMode": "Live User Mode",
    "public.currentDraft": "CURRENT DRAFT",
    "public.livePublished": "LIVE PUBLISHED",
    "public.readOnlyNotice":
      "Admin inspection is read-only. Navigation and public layout remain visible, but Accounting writes are blocked in this preview.",
    "public.readOnlyBlocked":
      "Public inspection is read-only. No accounting data was changed.",
    "public.accountingEyebrow": "ORBiS Public Accounting",
    "public.title": ACCOUNTING_PRODUCT_NAME,
    "public.publicUserPreview": "Public User Preview",
    "public.tagline":
      "Smarter Accounting · Clear numbers · Brighter business growth",
    "public.signatureExperience": "Signature Emerald public experience",
    "greeting.aria": "Personal welcome",
    "greeting.kicker": "Your accounting, beautifully in control",
    "greeting.morning": "Good morning",
    "greeting.afternoon": "Good afternoon",
    "greeting.evening": "Good evening",
    "greeting.companion": "ORBiS is with you — ready whenever you are.",
    "version.notPublished": "Not published",
  },
  BN: {
    "language.aria": "অ্যাকাউন্টিং ভাষা",
    "language.title": "ভাষা",
    "language.subtitle": "পাবলিক অ্যাকাউন্টিং অভিজ্ঞতার ভাষা বেছে নিন।",
    "appearance.aria": "অ্যাকাউন্টিং ডিজাইন",
    "appearance.title": "প্রিভিউ ডিজাইন",
    "appearance.subtitle": "তিনটি ডিজাইনই অ্যাকাউন্টিং অ্যাপের সঙ্গে থাকবে।",
    "appearance.classic.label": "ক্লাসিক / বর্তমান",
    "appearance.classic.description":
      "বর্তমান অ্যাকাউন্টিং ওয়ার্কস্পেসের ডিজাইন অপরিবর্তিত রাখুন।",
    "appearance.signature.label": "সিগনেচার এমেরাল্ড",
    "appearance.signature.description":
      "প্রিমিয়াম এমেরাল্ড, টিল, সাদা ও সফট-গোল্ড পাবলিক ডিজাইন।",
    "appearance.signatureDark.label": "সিগনেচার এমেরাল্ড ডার্ক",
    "appearance.signatureDark.description":
      "সিগনেচার এমেরাল্ড পাবলিক ডিজাইনের ডার্ক সংস্করণ।",
    "public.liveUnavailable": "লাইভ ইউজার মোড এখনও উপলব্ধ নয়",
    "public.currentMode": "বর্তমান মোড",
    "public.liveUnavailableMessage":
      "এখনও কোনো প্রকাশিত অ্যাকাউন্টিং ভার্সন নেই। বর্তমান ড্রাফট রিভিউ করে প্রকাশ করুন; তারপর লাইভ ইউজার মোড সেই প্রকাশিত স্ন্যাপশট দেখাবে।",
    "public.publishPreview": "পাবলিশ প্রিভিউ",
    "public.liveUserMode": "লাইভ ইউজার মোড",
    "public.currentDraft": "বর্তমান ড্রাফট",
    "public.livePublished": "লাইভ প্রকাশিত",
    "public.readOnlyNotice":
      "অ্যাডমিন প্রিভিউটি শুধু দেখার জন্য। নেভিগেশন ও পাবলিক লেআউট দেখা যাবে, কিন্তু এই প্রিভিউ থেকে অ্যাকাউন্টিং ডেটা লেখা বা বদলানো যাবে না।",
    "public.readOnlyBlocked":
      "পাবলিক প্রিভিউ শুধু দেখার জন্য। কোনো অ্যাকাউন্টিং ডেটা পরিবর্তন করা হয়নি।",
    "public.accountingEyebrow": "ORBiS পাবলিক অ্যাকাউন্টিং",
    "public.title": ACCOUNTING_PRODUCT_NAME,
    "public.publicUserPreview": "পাবলিক ইউজার প্রিভিউ",
    "public.tagline":
      "স্মার্ট অ্যাকাউন্টিং · পরিষ্কার হিসাব · আরও উজ্জ্বল ব্যবসায়িক বৃদ্ধি",
    "public.signatureExperience": "সিগনেচার এমেরাল্ড পাবলিক অভিজ্ঞতা",
    "greeting.aria": "ব্যক্তিগত স্বাগতম",
    "greeting.kicker": "আপনার হিসাব, সুন্দরভাবে নিয়ন্ত্রণে",
    "greeting.morning": "সুপ্রভাত",
    "greeting.afternoon": "শুভ অপরাহ্ণ",
    "greeting.evening": "শুভ সন্ধ্যা",
    "greeting.companion": "ORBiS আপনার সঙ্গে আছে — আপনি প্রস্তুত হলেই শুরু করা যাবে।",
    "version.notPublished": "এখনও প্রকাশিত নয়",
  },
  HI: {
    "language.aria": "अकाउंटिंग भाषा",
    "language.title": "भाषा",
    "language.subtitle": "पब्लिक अकाउंटिंग अनुभव की भाषा चुनें।",
    "appearance.aria": "अकाउंटिंग डिज़ाइन",
    "appearance.title": "प्रीव्यू डिज़ाइन",
    "appearance.subtitle": "तीनों डिज़ाइन अकाउंटिंग ऐप के साथ उपलब्ध रहेंगे।",
    "appearance.classic.label": "क्लासिक / मौजूदा",
    "appearance.classic.description":
      "मौजूदा अकाउंटिंग वर्कस्पेस का डिज़ाइन वैसा ही रखें।",
    "appearance.signature.label": "सिग्नेचर एमराल्ड",
    "appearance.signature.description":
      "प्रीमियम एमराल्ड, टील, सफेद और सॉफ्ट-गोल्ड पब्लिक डिज़ाइन।",
    "appearance.signatureDark.label": "सिग्नेचर एमराल्ड डार्क",
    "appearance.signatureDark.description":
      "सिग्नेचर एमराल्ड पब्लिक डिज़ाइन का डार्क रूप।",
    "public.liveUnavailable": "लाइव यूज़र मोड अभी उपलब्ध नहीं है",
    "public.currentMode": "करंट मोड",
    "public.liveUnavailableMessage":
      "अभी कोई प्रकाशित अकाउंटिंग वर्ज़न नहीं है। मौजूदा ड्राफ्ट को रिव्यू करके प्रकाशित करें; उसके बाद लाइव यूज़र मोड वही प्रकाशित स्नैपशॉट दिखाएगा।",
    "public.publishPreview": "पब्लिश प्रीव्यू",
    "public.liveUserMode": "लाइव यूज़र मोड",
    "public.currentDraft": "करंट ड्राफ्ट",
    "public.livePublished": "लाइव प्रकाशित",
    "public.readOnlyNotice":
      "एडमिन प्रीव्यू केवल देखने के लिए है। नेविगेशन और पब्लिक लेआउट दिखेंगे, लेकिन इस प्रीव्यू से अकाउंटिंग डेटा लिखा या बदला नहीं जा सकता।",
    "public.readOnlyBlocked":
      "पब्लिक प्रीव्यू केवल देखने के लिए है। कोई अकाउंटिंग डेटा बदला नहीं गया।",
    "public.accountingEyebrow": "ORBiS पब्लिक अकाउंटिंग",
    "public.title": ACCOUNTING_PRODUCT_NAME,
    "public.publicUserPreview": "पब्लिक यूज़र प्रीव्यू",
    "public.tagline":
      "स्मार्ट अकाउंटिंग · साफ़ हिसाब · बेहतर बिज़नेस ग्रोथ",
    "public.signatureExperience": "सिग्नेचर एमराल्ड पब्लिक अनुभव",
    "greeting.aria": "व्यक्तिगत स्वागत",
    "greeting.kicker": "आपका हिसाब, खूबसूरती से नियंत्रण में",
    "greeting.morning": "सुप्रभात",
    "greeting.afternoon": "शुभ दोपहर",
    "greeting.evening": "शुभ संध्या",
    "greeting.companion": "ORBiS आपके साथ है — जब आप तैयार हों, हम शुरू कर सकते हैं।",
    "version.notPublished": "अभी प्रकाशित नहीं",
  },
};

export function isAccountingLanguage(
  value: string | null | undefined,
): value is AccountingLanguage {
  return ACCOUNTING_LANGUAGES.some((item) => item.value === value);
}

export function readAccountingLanguage(
  storage?: Pick<Storage, "getItem">,
): AccountingLanguage {
  const source =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : undefined);
  if (!source) return DEFAULT_ACCOUNTING_LANGUAGE;
  const stored = source.getItem(ACCOUNTING_LANGUAGE_STORAGE_KEY);
  return isAccountingLanguage(stored)
    ? stored
    : DEFAULT_ACCOUNTING_LANGUAGE;
}

export function writeAccountingLanguage(
  language: AccountingLanguage,
  storage?: Pick<Storage, "setItem">,
): void {
  const target =
    storage ??
    (typeof window !== "undefined" ? window.localStorage : undefined);
  target?.setItem(ACCOUNTING_LANGUAGE_STORAGE_KEY, language);
}

export function accountingText(
  language: AccountingLanguage,
  key: AccountingTranslationKey,
): string {
  return COPY[language][key] ?? COPY.EN[key];
}

export function accountingHtmlLang(language: AccountingLanguage): string {
  return (
    ACCOUNTING_LANGUAGES.find((item) => item.value === language)?.htmlLang ??
    "en-IN"
  );
}


export function accountingGreetingForHour(
  language: AccountingLanguage,
  hour: number,
): string {
  const normalizedHour =
    Number.isFinite(hour) && hour >= 0 && hour < 24 ? hour : 12;
  if (normalizedHour < 12) {
    return accountingText(language, "greeting.morning");
  }
  if (normalizedHour < 17) {
    return accountingText(language, "greeting.afternoon");
  }
  return accountingText(language, "greeting.evening");
}
