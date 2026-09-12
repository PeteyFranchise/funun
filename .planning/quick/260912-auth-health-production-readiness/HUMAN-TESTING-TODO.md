# Human testing TODO — Auth Health

Complete after migration 218 is explicitly approved, applied, and structurally verified:

- Confirm an authorized IT or Leadership account can open Auth Health and an ordinary member cannot.
- Generate one controlled failed sign-in and confirm only an `AUTH-XXXXXXXXXXXX` reference and allowlisted operational fields appear.
- Confirm no email, user ID, IP address, user agent, URL, provider error, credential, or token is displayed or stored.
- Exercise the 24-hour/7-day, failure-type, and workspace-intent filters on desktop and mobile.
- Copy a support reference and confirm only the correlation reference reaches the clipboard.
- Invoke the retention cron with a valid secret and confirm an unauthorized request is rejected.
- Confirm the cron reports inactive before migration activation and reports an integer deletion count afterward.
- Seed an approved synthetic row older than 30 days in a non-production rehearsal environment and confirm it is pruned while newer rows remain.
- Confirm screen-reader labels and keyboard focus order for filters and copy controls.
