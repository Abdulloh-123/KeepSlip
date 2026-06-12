# KeepSlip Analytics Events

Analytics is first-party and stored in Supabase. Events should never include raw receipt text, receipt image paths, email addresses, search text, or payment details.

## Product Events

- `app_open`
- `auth_signup_started`
- `auth_signup_succeeded`
- `auth_signup_failed`
- `auth_signin_started`
- `auth_signin_succeeded`
- `auth_signin_failed`
- `auth_state_changed`
- `tab_selected`
- `add_receipt_opened`
- `receipt_add_method_selected`
- `photo_permission_result`
- `scan_screen_opened`
- `camera_permission_result`
- `receipt_upload_started`
- `receipt_upload_succeeded`
- `receipt_upload_failed`
- `receipt_scan_started`
- `receipt_scan_succeeded`
- `receipt_scan_failed`
- `search_completed`
- `profile_save_started`
- `profile_save_succeeded`
- `profile_save_failed`
- `receipts_export_started`
- `receipts_export_succeeded`
- `receipts_export_failed`
- `account_delete_started`
- `account_delete_succeeded`
- `account_delete_failed`
- `sign_out_started`
- `receipt_detail_loaded`
- `receipt_share_started`
- `receipt_share_succeeded`
- `receipt_delete_started`
- `receipt_delete_succeeded`
- `receipt_delete_failed`
- `original_receipt_open_started`
- `original_receipt_open_succeeded`
- `original_receipt_open_failed`

## Error Events

Errors are written to `app_errors` with:

- `error_name`
- `error_message`
- `stack`
- `screen`
- `severity`
- `app_version`
- `platform`
- sanitized `properties`
