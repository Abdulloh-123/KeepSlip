export function friendlyErrorMessage(
  fallback = "Something went wrong. Please try again."
): string {
  return fallback;
}

export const ERROR_COPY = {
  auth: "We couldn't sign you in. Check your email and password, then try again.",
  signUp: "We couldn't create your account. Check your details, then try again.",
  loadReceipts: "We couldn't load your receipts. Please try again.",
  loadReceipt: "We couldn't load this receipt. Please try again.",
  search: "Search isn't working right now. Please try again.",
  scan: "We couldn't read this receipt. Try again with better lighting or upload the file instead.",
  upload: "We couldn't process this file. Try another photo or PDF.",
  originalFile: "We couldn't open the original file. Please try again.",
  deleteReceipt: "We couldn't delete this receipt. Please try again.",
  deleteAccount: "We couldn't delete your account. Please try again.",
};
