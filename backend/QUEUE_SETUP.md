# Scheduling Email Sending

Scheduling invitation emails are sent **immediately (synchronously)** inside the HTTP request when a supervisor clicks "Send Emails" (`POST /api/scheduling/{id}/send-emails`). There is no background queue and no queue worker is required.

## How it works

1. The request builds the invite details (schedule URL, dates, location, important message, logo) and iterates every student that has an email address.
2. For each student, `SchedulingController::sendEmails` renders the invite view (`emails.scheduling-invite`) and sends it with a direct `Mail::html()` call (single-part HTML — Gmail-classer-friendly), then sets `scheduled_students.email_sent = true` on success.
3. The response returns `{ sent, failed, errors }` so the UI can report how many went out and which addresses failed.

## email_sent flag

- `false` = email not sent
- `true` = email delivered to Gmail/SMTP successfully

## Troubleshooting: emails not arriving

1. **Check SMTP credentials** in `.env` (`MAIL_MAILER`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION`). The send endpoint returns a 400 if SMTP credentials are missing.
2. **Check the send response.** The "Send Emails" dialog shows how many were sent and how many failed; the failed list is also returned in `errors`.
3. **Check `storage/logs/laravel.log`** for `local.ERROR` entries around the send time (failed sends are logged per student).
4. **Gmail specifics.** Use an app password (not the account password) and `MAIL_FROM_ADDRESS` must be the same Gmail account that authenticates (`MAIL_USERNAME`). Do **not** use a `From` address on a domain Gmail rejects (e.g. `ui.edu.ng` has DMARC `p=reject` — messages get dropped silently). Emails must be **single-part HTML**: multipart/alternative messages (HTML + plain-text fallback) are silently discarded by Gmail from residential senders.

## Note on the old queue tables

The `jobs` / `failed_jobs` tables still exist (created by `create_jobs_table` migration) but are **no longer used** for scheduling emails. They can be kept for future background work or dropped if unwanted.

## Synchronous vs. large lists

Because emails are sent one-by-one inside the request, a very large student list will keep the request open until all emails have been handed to the mail server. The UI dialog already warns "This may take a moment."