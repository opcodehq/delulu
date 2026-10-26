# X publishing

X accounts support posts, threads, quote posts and native Articles. Open the
account's settings in the composer to choose a format, quote target and reply
restriction. Settings are saved per account, including when a post uses shared
content or a platform-specific content group.

## Quote posts

Use a numeric post ID or an HTTPS post URL from `x.com` or `twitter.com`.
IDs remain strings to preserve precision. Only the first segment quotes the
original post; subsequent thread segments reply to the preceding segment.
Reply restrictions apply to each created segment.

## Native Articles

Select **Article**, enter a title, and write the body in one editor segment.
The initial integration preserves paragraph text and accepts one optional image
as the cover. Rich-text formatting and embedded posts are not yet supported.
Articles cannot be combined with quotes, threads or reply restrictions.
Incomplete Article drafts can be saved; scheduling/publishing requires a title
and body. Provider access still depends on the connected X account and API app.

The worker uses the installed X SDK's Article draft and publish endpoints. It
saves the draft ID in durable target state before publishing, and reuses that ID
on a resumed attempt. Unknown write outcomes and failed progress persistence
stop automatic retries. No live provider calls are made by local tests.

## Verification

- Core tests cover quote URL validation, ID precision and settings contracts.
- Client tests verify composer payload settings survive encoding.
- Connections tests cover first-segment quotes, reply settings, Article covers,
  draft recovery, invalid combinations and uncertain-write handling.
- Postgres services tests cover settings round trips, incomplete drafts and
  publish validation.
- Browser tests use the actual editor/settings dialog with fixtures, on desktop
  and mobile dark mode. They do not prove real OAuth or X publishing.

Provider references: [Create Posts](https://docs.x.com/x-api/posts/create-post)
and [Articles](https://docs.x.com/x-api/articles/introduction).
