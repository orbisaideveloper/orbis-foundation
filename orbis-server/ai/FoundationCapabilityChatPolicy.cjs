const FILE_CREATE_WORDS =
  /(?:create|make|build|write|generate|বানাও|বানাতে|বানিয়ে|বানিয়ে|তৈরি|লিখতে|রাইট)/i;
const EXCEL_WORDS = /(?:excel|xlsx|spreadsheet|এক্সেল)/i;
const PDF_WORDS = /(?:pdf|পিডিএফ)/i;

function getFoundationCapabilityStatus(message) {
  const text = String(message || "");
  if (!FILE_CREATE_WORDS.test(text)) return null;

  const asksExcel = EXCEL_WORDS.test(text);
  const asksPdf = PDF_WORDS.test(text);
  if (!asksExcel && !asksPdf) return null;

  const bengali = /[\u0980-\u09FF]/.test(text);
  if (asksExcel && asksPdf) {
    return bengali
      ? "এই chat-এ এখন Excel/XLSX বা PDF file লিখে তৈরি করে download দেওয়ার পথটি সংযুক্ত নেই। Excel-এর জন্য backend capability আছে, কিন্তু customer chat থেকে file তৈরি ও দেওয়া এখনও চালু হয়নি; PDF write capability-ও এখনও নেই। চাইলে আমি আগে sheet-এর column ও formula plan করে দিতে পারি।"
      : "This chat cannot yet create and deliver downloadable Excel/XLSX or PDF files. Excel has a backend capability, but customer-chat file creation is not connected yet; PDF writing is not available yet. I can plan the columns and formulas first.";
  }
  if (asksExcel) {
    return bengali
      ? "Excel/XLSX file তৈরির backend capability আছে, কিন্তু এই customer chat থেকে file তৈরি ও download দেওয়ার পথটি এখনও সংযুক্ত হয়নি। চাইলে আমি আগে sheet-এর column, formula ও layout plan করে দিতে পারি।"
      : "An Excel/XLSX creation backend capability exists, but this customer chat is not connected to create and deliver the file yet. I can plan the sheet columns, formulas, and layout first.";
  }
  return bengali
    ? "এই chat-এ PDF লিখে তৈরি ও download দেওয়ার capability এখনও নেই। চাইলে আগে PDF-এর content ও layout plan করে দিতে পারি।"
    : "This chat does not yet have a capability to write and deliver a PDF file. I can plan the PDF content and layout first.";
}

module.exports = { getFoundationCapabilityStatus };
