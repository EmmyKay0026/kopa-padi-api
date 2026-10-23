# SMTP fallback

ZeptoMail remains primary. Nodemailer is disabled unless `SMTP_FALLBACK_ENABLED=true`.
No live configuration is changed by installing this feature.

Configure these names in the backend's protected runtime environment, never in frontend variables or Git:

| Name | Setting |
|---|---|
| `SMTP_FALLBACK_ENABLED` | `false` by default; explicitly set `true` to enable. |
| `SMTP_HOST` | Relay DNS hostname matching its trusted TLS certificate; no URL, credentials or IP literal. |
| `SMTP_PORT` | Explicit provider port, usually 587 for STARTTLS or 465 for implicit TLS. |
| `SMTP_SECURE` | `false` for required STARTTLS; `true` for implicit TLS. Plaintext delivery is never enabled. |
| `SMTP_USER`, `SMTP_PASSWORD` | Separate relay credentials from the secret manager. |

The relay uses existing `ZEPTO_MAIL_FROM_ADDRESS` and optional `ZEPTO_MAIL_FROM_NAME`; authorize that sender with the SMTP provider. Keep the existing ZeptoMail configuration. Enable only after verifying outbound access, sender authentication and a safe capture-only test. Certificate verification remains enabled; a private CA must be trusted through the approved Node trust-store configuration, never a TLS bypass.

On primary HTTP rejection, SMTP is attempted once within the remaining `ZEPTO_MAIL_TIMEOUT_MS` budget (default 10 seconds, bounded 100–30000ms total). Accepted primary messages never fall through. Network/abort failures and HTTP 408/504 are ambiguous: they stay on the existing outbox retry path without an immediate SMTP duplicate. Missing primary configuration also fails normally rather than hiding a configuration error.

Both providers failing retains the existing outbox failure/retry behavior (five logical attempts maximum). SMTP acceptance marks the same row accepted; it does not prove delivery/receipt. Consent and recipient validation still run before the shared transport, including on retries. A crash after remote acceptance may still cause an at-least-once duplicate. The fallback cannot guarantee exactly-once delivery.

SMTP diagnostics, credentials, recipient addresses, message content and server replies are not logged. SMTP pooling, debug logging, URL attachment access and filesystem attachment access are disabled. A deadline closes the one-shot transport. STARTTLS/implicit TLS options follow the [official Nodemailer SMTP documentation](https://nodemailer.com/smtp).

Delivery failures now persist/log an allowlisted `delivery` diagnostic: primary HTTP status, fallback stage (`connect`, `authenticate`, `send`, etc.), approved network/SMTP error code and numeric SMTP status. When both providers fail, both safe summaries are retained. Provider bodies, raw errors, causes, stack traces and credentials remain excluded. Existing stored failures gain no new detail until another authorized attempt occurs. This change does not replay messages, reset attempts or change fallback/retry rules. Worker `status: completed` means its execution finished; inspect `result.sent` and `result.failed` for delivery outcomes.

Do not enable real SMTP in the local P2 harness. Its guarded launcher explicitly disables fallback. Unit tests use mocked transports; all recipients are synthetic. Do not test by replaying existing production safety notifications or sending emergency alerts. Roll back configuration by disabling fallback and using the existing ZeptoMail/outbox path; do not reset pending/sent/terminal rows.
