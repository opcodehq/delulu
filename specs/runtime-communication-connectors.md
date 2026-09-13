# Cloudflare OS communication connectors

## Conclusion

Cloudflare OS does not provide a ready-made, bidirectional communication layer for Slack,
WhatsApp, Telegram, Discord, X, SMS, and general email. At the pinned revision, it provides two
channel-adjacent components:

- The Slack Gatekeeper gives an agent read-only access to workspace content. It can list and
  search channels, direct messages, threads, members, and messages, but it explicitly never sends
  or modifies Slack data. It is useful as research context, not as a bot transport. [Slack
  Gatekeeper README](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/gatekeeper-slack/README.md#L1-L7)
- The Email Gatekeeper receives inbound mail for a Gadget through Cloudflare Email Routing and a
  bound hook. It is a mailbox primitive, not a general agent-chat adapter, and production still
  requires domain routing and an Email Worker route. [Email Gatekeeper
  overview](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/gatekeeper-email/README.md#L1-L18),
  [production setup](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/gatekeeper-email/README.md#L91-L121)

There are no channel packages for WhatsApp, Telegram, Discord, X, or SMS in the pinned official
source tree. The clean supported route is therefore to own those channel adapters in Delulu and
connect them to the OS runtime through its generic external-message gateway. [Pinned Gatekeeper
source tree](https://github.com/cloudflare/cloudflare-os/tree/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages)

## What the external-message gateway provides

The external-message gateway is a transport-neutral RPC boundary for a trusted communication
Worker. Its request includes:

- `callerEmail`, selecting the existing OS account;
- `gadgetKey`, selecting or creating the durable workspace;
- `chatKey`, selecting or creating the durable conversation;
- `messageKey`, deduplicating the source event;
- `prompt` and a title; and
- a persistent `chatGatewayRpcTarget` that receives the eventual response.

The contract explicitly says the callback is at-least-once and its implementation must be
idempotent. It does not define channel authorization, channel onboarding, webhook verification,
media download, outbound provider calls, or provider credentials. [External gateway
contract](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-shared/src/external-message-gateway.ts#L3-L51)

The backend prefixes workspace, chat, and message keys with a binding-owned `source`. This
isolates multiple gateway deployments from one another and prevents their identifiers colliding
with web-created workspaces. The external gateway, rather than OS, decides which workspace gets a
message. [Gateway implementation](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/external-message-gateway.ts#L9-L37)

After submission, OS:

- rejects blank prompts and callers without an existing account;
- creates the workspace on first use and enforces owner/collaborator access;
- reuses a chat selected by the stable external chat key;
- continues with the latest model used in that chat; and
- starts a new agent turn or appends to the existing conversation.

[External-message routing](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/overseer.ts#L6500-L6613)

Response targets and their states are persisted with the durable workspace. Repeated source
message IDs reuse the prior delivery; a ready response is delivered again after an unacknowledged
attempt. The record becomes `delivered` only after the callback returns successfully. This is a
solid recovery mechanism, but exactly-once external delivery remains the adapter's responsibility.
[Response deduplication and delivery](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/overseer.ts#L3593-L3611),
[callback acknowledgement](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/overseer.ts#L3643-L3689)

The current implementation permits only one undelivered response target per chat. A channel
adapter must serialize messages for a conversation, queue a later event, or use separate chat keys;
submitting overlapping turns to the same chat can fail. [Response-target
registration](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/overseer.ts#L3568-L3590)

## What Gatekeepers provide

Gatekeepers are capability adapters for resources the agent itself may read or change. They wrap a
service API, handle authorization, restrict access to the selected resource, audit activity, and
place consequential actions behind human approval. They are deployed as separate Workers and are
installed into durable workspaces. [Gatekeeper security
model](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/README.md#L64-L79),
[runtime layout](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/README.md#L108-L116)

That makes a Gatekeeper the right boundary for Delulu content, files, analytics, and publishing
capabilities. It does not make every Gatekeeper an inbound communication transport. In particular,
the bundled Slack implementation is intentionally read-only, while inbound email uses its own
Gadget hook path rather than the external-message gateway.

## Recommended Delulu architecture

```text
Provider webhook or event stream
              |
              v
Delulu communication Worker
  - verifies provider authenticity
  - resolves a verified Delulu user and workspace
  - normalizes text and archived media
  - intercepts approval commands
  - deduplicates and serializes each conversation
              |
              | service-binding RPC
              v
OS external-message gateway
  - durable workspace and chat routing
  - source-message deduplication
  - agent execution and recovery
              |
              | persistent at-least-once callback
              v
Delulu response target / outbox
  - records the response atomically
  - sends once through the provider API
  - retries uncertain failures safely
```

Use one normalized `onMessage` pipeline across providers, with small adapters for signature
verification, inbound parsing, media acquisition, and outbound delivery. The normalized mapping
should be:

- `callerEmail`: resolved only from a verified Delulu channel ownership record. Never trust an
  email supplied by the external event.
- `gadgetKey`: `workspace:<workspaceId>`.
- `chatKey`: `<channel>:<connectionId>:<conversationId>`.
- `messageKey`: the provider's immutable event or message ID.
- response target: a durable Delulu outbox target keyed by channel, connection, conversation, and
  source message.

The gateway contract marks `callerEmail` as trusted account authority, so the communication Worker
must remain service-binding-only and must reject unknown or unlinked senders before RPC submission.
An account-linking flow belongs in Delulu; the pinned OS gateway rejects callers that do not
already exist rather than provisioning them. [Trusted caller
boundary](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-shared/src/external-message-gateway.ts#L17-L33),
[existing-account requirement](https://github.com/cloudflare/cloudflare-os/blob/c04843f97cd07a8c869312058fc59a00b5d5b5cb/packages/workshop-backend/src/overseer.ts#L6507-L6517)

Provider OAuth tokens, bot tokens, signing secrets, and social publishing credentials should stay
in Delulu's encrypted connector store and channel Workers. They should never be placed in an OS
chat, prompt, attachment, workspace file, or agent-visible environment. The agent should use the
typed Delulu Content Gatekeeper for approved reads and writes, while the communication Worker owns
message transport.

## Practical decision

Removing the current third-party communication SDK is viable, but Cloudflare OS does not replace
it with turnkey multi-channel onboarding. Delulu must implement and operate the provider-specific
adapters. The OS runtime contributes the valuable common center: personalized durable workspaces,
conversation continuity, idempotent external-message admission, agent execution, recovery, and a
persistent response callback.

For the first channel, use a webhook-capable provider and build one thin adapter end to end. Reuse
the normalized handler and durable outbox for later channels. Email can optionally use the bundled
inbound Email Gatekeeper, but using the same Delulu communication gateway for email as well will
keep identity linking, approvals, auditing, and response delivery consistent across every channel.
