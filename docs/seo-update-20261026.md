# Search visibility update — 2026-10-26

Public `/support` now provides static account, heart, report and privacy help,
index/follow metadata, a self canonical, ContactPage and breadcrumb markup.
It is included in the sitemap. Ticket lists and detail dialogs retain authenticated
API access and are marked data-nosnippet. Old policy versions remain noindex.

`/safety` has a descriptive title, visible purpose/quick links, matching social
metadata and WebPage/breadcrumb markup. Existing operational and policy rules
are preserved. Only these two sitemap lastmod values changed.

Published only support.html, safety.html and sitemap.xml to the active release
`/opt/seollem-ai-lounge/releases/20261026T050137Z-876042f`, after matching each
original file's SHA-256 against the local HEAD version. No service restart,
database, environment or nginx changes. Backup and hash manifest:
`/opt/seollem-ai-lounge/seo-backups/20261026T104659Z`.

Checks passed: SEO test, operations test (including ticket ownership), public
200/index/follow/self-canonical responses and unauthenticated ticket API 401.
Google Search Console accepted sitemap resubmission. Individual URL indexing
request failed because reCAPTCHA could not connect; it was not accepted and
must not be described as queued. Actual indexing remains Google's decision.
