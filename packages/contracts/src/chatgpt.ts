import { Schema } from "effect";

const LimitWindow = Schema.NullOr(
  Schema.Struct({
    usedPercent: Schema.Number,
    resetsAt: Schema.NullOr(Schema.Number),
  })
);
export const ChatGPTConnection = Schema.Struct({
  enabled: Schema.Boolean,
  state: Schema.Literals([
    "disconnected",
    "pending",
    "connected",
    "expired",
    "reconnect",
  ]),
  selected: Schema.Boolean,
  generation: Schema.String,
  model: Schema.NullOr(Schema.String),
  account: Schema.NullOr(Schema.String),
  plan: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  login: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      code: Schema.String,
      url: Schema.String,
      expiresAt: Schema.Number,
    })
  ),
  limits: Schema.NullOr(
    Schema.Struct({ primary: LimitWindow, secondary: LimitWindow })
  ),
});
export const ChatGPTModels = Schema.Array(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    isDefault: Schema.Boolean,
  })
);
export type ChatGPTConnectionView = typeof ChatGPTConnection.Type;
