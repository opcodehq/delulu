# Communication providers

Provider-neutral contracts for Delulu communication adapters.

The package defines the normalized inbound message, outbound text request,
send result, and typed provider failure used at the boundary between a channel
adapter and the durable agent runtime. It deliberately contains no credentials,
persistence, webhook routes, or agent logic.

Adapters should preserve the provider event ID as `messageKey`, use a stable
provider account identifier as `connectionKey`, and use the remote participant
or thread identifier as `conversationKey`. This gives receivers deterministic
routing and idempotency without depending on provider-specific payload shapes.

For outbound writes, `deliveryState` is part of every failure:

- `not_sent`: the provider rejected the request before accepting it.
- `unknown`: the request may have been accepted; automatic retry is unsafe.
- `not_applicable`: the operation does not produce an external message.
