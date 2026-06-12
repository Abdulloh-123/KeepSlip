# App Store Submission Checklist

## Build Readiness

- Confirm Supabase migrations are applied before the submitted build is tested.
- Confirm the `ocr-receipt` Edge Function is deployed and receipt scanning works on a real iPhone.
- Confirm email import is not exposed in the first App Store version.
- Create an App Review test account and include the email/password in App Review Notes.
- Include a short note that KeepSlip scans paper receipts, imports receipt photos/files, stores them privately, and lets users search/export/delete their receipts.

## Privacy Answers

KeepSlip uses first-party analytics and diagnostics stored in Supabase.

Declare collection for:

- User ID: used for app functionality, analytics, and diagnostics.
- User Content: receipt images/PDFs and receipt details, used for app functionality.
- Purchases or financial info: receipt totals and line items, used for app functionality.
- Usage Data: product events such as app opens, screen usage, search result counts, and receipt upload outcomes.
- Diagnostics: error messages, stack traces, app version, platform, and crash/fatal error state.

Do not mark this as third-party tracking unless the data is used to track users across other companies' apps or websites. KeepSlip analytics is first-party operational analytics, not advertising tracking.

## App Review Notes

Suggested note:

> KeepSlip lets users scan paper receipts, upload receipt photos or files, review extracted totals and line items, search receipts, export CSV data, and delete their account. Email import is not included in version 1.0. Test account: [add email/password]. Backend services use Supabase for authentication, private receipt storage, OCR processing, first-party product analytics, and diagnostics.

## Manual Release Commands

Run these after the code is committed and pushed:

```bash
supabase db push
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```
