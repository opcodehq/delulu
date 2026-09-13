export * from "./admin.js";
export * from "./agent.js";
export * from "./analytics.js";
export * from "./automations.js";
export * from "./billing.js";
export * from "./connections.js";
export * from "./health.js";
export * from "./me.js";
export * from "./media.js";
export * from "./posts.js";
export * from "./reviews.js";
export * from "./shared.js";

import { createAdminEffects } from "./admin.js";
import { createAgentEffects } from "./agent.js";
import { createAnalyticsEffects } from "./analytics.js";
import { createAutomationEffects } from "./automations.js";
import { createBillingEffects } from "./billing.js";
import { createConnectionEffects } from "./connections.js";
import { createHealthEffects } from "./health.js";
import { createMeEffects } from "./me.js";
import { createMediaEffects } from "./media.js";
import { createPostEffects } from "./posts.js";
import { createReviewEffects } from "./reviews.js";
import { defineResourceEffects } from "./shared.js";

export const createResourceEffects = defineResourceEffects((runtime) => ({
  health: createHealthEffects(runtime),
  me: createMeEffects(runtime),
  posts: createPostEffects(runtime),
  reviews: createReviewEffects(runtime),
  media: createMediaEffects(runtime),
  connections: createConnectionEffects(runtime),
  admin: createAdminEffects(runtime),
  agent: createAgentEffects(runtime),
  analytics: createAnalyticsEffects(runtime),
  automations: createAutomationEffects(runtime),
  billing: createBillingEffects(runtime),
}));
