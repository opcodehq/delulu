# X publishing

X accounts support posts, threads, quote posts and native Articles. When an X
account publishes a content group, the composer shows X controls inline: a
**Post / Article** switch and a reply-audience pill above the editor, and a
quote action in the first post's toolbar. Settings are saved per account; X
accounts that share one content group share the same format and quote, because
Articles and threads need different content shapes.

## CLI and MCP

Both use the shared `applyTwitterPostOptions` helper in `@delulu/client`, so
the options and their errors are the same:

| Option | CLI | MCP (`create_post`, `update_post`) |
| --- | --- | --- |
| Quote a post | `--quote <url-or-id>` | `x.quotePost` |
| Who can reply | `--replies everyone\|following\|mentioned` | `x.replyRestriction` |
| Native Article | `--article <title>` | `x.articleTitle` |

The options apply only to X targets; other platforms in the same post are
unchanged, and the request is rejected when no X account is selected. An
Article title switches the target to an Article and clears any quote and reply
limit, as the composer does. MCP `update_post` keeps each target's saved
settings and merges `x` changes onto them.

## Quote posts

Use a numeric post ID or an HTTPS post URL from `x.com` or `twitter.com`.
IDs remain strings to preserve precision. Only the first segment quotes the
original post; subsequent thread segments reply to the preceding segment.
Reply restrictions apply to each created segment.

## Native Articles

Select **Article**, enter a title in the heading field above the body, and write
the body in the editor. Use **Add cover** above the title for the optional cover
image. Switching an existing thread to Article folds its
segments into one body, separated by blank lines, and clears any quote and reply
restriction.
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
- Client tests verify composer payload settings survive encoding and cover the
  shared CLI/MCP option rules.
- CLI tests cover flag parsing and that X settings reach only X targets before
  any upload. MCP tests call `create_post` through an in-memory MCP client and
  check `update_post` keeps saved settings; both use a fake API, not a server.
- Connections tests cover first-segment quotes, reply settings, Article covers,
  draft recovery, invalid combinations and uncertain-write handling.
- Postgres services tests cover settings round trips, incomplete drafts and
  publish validation.
- Browser tests use the actual composer with fixtures, on desktop and mobile
  dark mode, covering inline quotes, reply audience, thread-to-Article folding
  and touch targets. They do not prove real OAuth or X publishing.

Provider references: [Create Posts](https://docs.x.com/x-api/posts/create-post)
and [Articles](https://docs.x.com/x-api/articles/introduction).
