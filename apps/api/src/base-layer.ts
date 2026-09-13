import { makeTokenCipher, TokenCipher } from "@delulu/core";
import {
  AdminService,
  AgentWorkspaceService,
  AnalyticsService,
  ApiKeyVerifier,
  AsTokenService,
  AuthorizationService,
  AutomationEngine,
  AutomationKvNamespace,
  AutomationKvService,
  AutomationService,
  AutomationSessionService,
  BillingOwnerTransfers,
  BillingProviderConfig,
  BillingProviderService,
  BillingReconciliation,
  BillingService,
  BillingWebhookApplication,
  CalendarWebhookConfig,
  CancellationService,
  ClerkAdminService,
  ClerkSyncService,
  ClerkTokenVerifier,
  ConnectionStateService,
  ConnectionsService,
  DeploymentConfig,
  DmDispatchService,
  EntitlementPolicy,
  IdentityService,
  JobService,
  LifecycleService,
  MaintenanceScheduler,
  MediaService,
  MembershipService,
  MessagingService,
  makeAnalyticsCacheLayer,
  makeMemoryAnalyticsCacheLayer,
  OAuthFlowService,
  PooledQuotaReservations,
  PostService,
  ProductAnalytics,
  QuotaGuard,
  R2Service,
  RateLimiterService,
  ReviewService,
  SetupService,
  SignedIngress,
  TranscriptionCheckoutConfig,
  TranscriptionCheckoutService,
  TranscriptionService,
  WebhookDeliveryService,
  WebhookIngressService,
  WebhookSecrets,
  WorkspaceAccessService,
  WorkspaceFileService,
} from "@delulu/services";
import { PgClient } from "@effect/sql-pg";
import { String as EffectString, Layer, Redacted } from "effect";
import type { AppServices } from "./app";
import {
  AutomationProviderLive,
  PaymentWebhookSinkLive,
} from "./automation-providers";
import {
  agentRuntimeProviderLayer,
  authConfigLayer,
  databaseUrl,
  domainConfigLayers,
  type Env,
  postHogConfigLayer,
} from "./env";
import { jobTransportLayer } from "./job-runtime";
import { LiveInsightsProviderLive } from "./live-insights";
import { messagingProvidersLayer } from "./messaging-providers";

/**
 * Build the per-request service environment from the Worker `env`. Rate limiting
 * uses the Cloudflare bindings when present, else an in-memory limiter (local
 * dev / `wrangler dev`). Postgres comes via Hyperdrive in production.
 */
export interface BaseLayerOverrides {
  readonly clerk?: Layer.Layer<ClerkTokenVerifier>;
  readonly clerkAdmin?: Layer.Layer<ClerkAdminService>;
  readonly rateLimiter?: Layer.Layer<RateLimiterService>;
}

export const makePgLayer = (env: Env) =>
  PgClient.layer({
    url: Redacted.make(databaseUrl(env)),
    transformQueryNames: EffectString.camelToSnake,
    transformResultNames: EffectString.snakeToCamel,
    transformJson: false,
  });

export const makeBaseLayer = (
  env: Env,
  overrides: BaseLayerOverrides = {}
): Layer.Layer<AppServices> => {
  // Transform column names only, NOT keys inside jsonb values. Content graphs
  // contain data-derived ids that recursive key transforms can corrupt.
  const Pg = makePgLayer(env);
  const Config = authConfigLayer(env);
  const Deployment = DeploymentConfig.layer({
    mode:
      env.DELULU_DEPLOYMENT_MODE === "self_hosted" ? "self_hosted" : "hosted",
    registrationEnabled: env.DELULU_REGISTRATION_ENABLED !== "false",
    version: env.DELULU_VERSION ?? "development",
    communityApiRatePerMinute: Number(
      env.DELULU_COMMUNITY_API_RATE_PER_MINUTE ?? 120
    ),
  });
  const Entitlements = EntitlementPolicy.layer.pipe(Layer.provide(Deployment));
  // Server-side product analytics. Disabled (fully inert) when POSTHOG_KEY is
  // unset. Flushes buffered events on layer dispose, which upstream runs inside
  // ctx.waitUntil for both the fetch and scheduled handlers. Defined early so it
  // can be provided into services that capture events (ClerkSync, billing).
  const Telemetry = ProductAnalytics.layer.pipe(
    Layer.provide(postHogConfigLayer(env))
  );
  const AsToken = AsTokenService.layer;
  const Clerk = overrides.clerk ?? ClerkTokenVerifier.layer;
  const [ClerkAdminConfig, ConnectionConfig, R2Config] =
    domainConfigLayers(env);
  const Authorization = AuthorizationService.layer;
  const Jobs = JobService.layer.pipe(Layer.provide(jobTransportLayer(env)));
  const ClerkAdmin =
    overrides.clerkAdmin ??
    ClerkAdminService.layer.pipe(Layer.provide(ClerkAdminConfig));
  const ConnectionState = ConnectionStateService.layer.pipe(
    Layer.provide(ConnectionConfig)
  );
  const Cipher = Layer.succeed(
    TokenCipher,
    TokenCipher.of(makeTokenCipher(env.ENCRYPTION_SECRET ?? ""))
  );
  const R2 = R2Service.layer.pipe(Layer.provide(R2Config));
  const AgentRuntime = agentRuntimeProviderLayer(env);
  const AgentWorkspaces = AgentWorkspaceService.layer.pipe(
    Layer.provide([AgentRuntime, Cipher])
  );
  const WorkspaceFiles = WorkspaceFileService.layer.pipe(
    Layer.provide([R2, QuotaGuard.layer.pipe(Layer.provide(Entitlements))])
  );
  const Access = WorkspaceAccessService.layer.pipe(
    Layer.provide([MembershipService.layer, Authorization, Entitlements])
  );
  const Posts = PostService.layer.pipe(Layer.provide(Jobs));
  const Reviews = ReviewService.layer.pipe(Layer.provide(Jobs));
  const Media = MediaService.layer.pipe(
    Layer.provide([
      Jobs,
      R2,
      QuotaGuard.layer.pipe(Layer.provide(Entitlements)),
    ])
  );
  const AutomationKvBinding = env.AUTOMATION_KV
    ? Layer.succeed(
        AutomationKvNamespace,
        AutomationKvNamespace.of(env.AUTOMATION_KV)
      )
    : AutomationKvService.memoryLayer();
  const Messaging = MessagingService.layer.pipe(
    Layer.provide([messagingProvidersLayer(env), Jobs])
  );
  const Lifecycle = LifecycleService.layer.pipe(
    Layer.provide([Messaging, Jobs])
  );
  const Connections = ConnectionsService.layer.pipe(
    Layer.provide([ConnectionState, Cipher, AutomationKvBinding, Lifecycle])
  );
  const Admin = AdminService.layer.pipe(Layer.provide([ClerkAdmin, Jobs]));
  const AnalyticsCache = env.EDGE_CACHE_KV
    ? makeAnalyticsCacheLayer(env.EDGE_CACHE_KV)
    : makeMemoryAnalyticsCacheLayer();
  const LiveInsights = LiveInsightsProviderLive.pipe(Layer.provide(Cipher));
  const Analytics = AnalyticsService.layer.pipe(
    Layer.provide([AnalyticsCache, LiveInsights])
  );
  const Billing = BillingService.layer;
  const BillingTransfers = BillingOwnerTransfers.layer;
  const BillingProviderConfigLayer = Layer.succeed(
    BillingProviderConfig,
    BillingProviderConfig.of({
      apiKey: env.DODO_PAYMENTS_API_KEY ?? "",
      environment:
        env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
          ? "live_mode"
          : "test_mode",
      appBaseUrl: env.APP_BASE_URL ?? "http://localhost:3000",
    })
  );
  const BillingProvider = BillingProviderService.layer.pipe(
    Layer.provide(BillingProviderConfigLayer)
  );
  const Cancellations = CancellationService.layer.pipe(
    Layer.provide([
      BillingProvider,
      BillingProviderConfigLayer,
      Messaging,
      R2,
      Jobs,
    ])
  );
  const CalendarConfig = Layer.succeed(
    CalendarWebhookConfig,
    CalendarWebhookConfig.of({
      secret: env.CAL_WEBHOOK_SECRET ?? "",
      eventSlug: env.CAL_RETENTION_EVENT_SLUG ?? "retention",
    })
  );
  const BillingWebhooks = BillingWebhookApplication.layer.pipe(
    Layer.provide([Telemetry, Jobs])
  );
  const BillingReconcile = BillingReconciliation.layer;
  const Maintenance = MaintenanceScheduler.layer;
  const Transcriptions = TranscriptionService.layer;
  const TranscriptionCheckoutConfigLayer = Layer.succeed(
    TranscriptionCheckoutConfig,
    TranscriptionCheckoutConfig.of({
      apiKey: env.DODO_PAYMENTS_API_KEY ?? "",
      environment:
        env.DODO_PAYMENTS_ENVIRONMENT === "live_mode"
          ? "live_mode"
          : "test_mode",
      returnUrl: env.APP_BASE_URL ?? "http://localhost:3000",
    })
  );
  const TranscriptionCheckout = TranscriptionCheckoutService.layer.pipe(
    Layer.provide(TranscriptionCheckoutConfigLayer)
  );
  const Setup = SetupService.layer.pipe(
    Layer.provide([ClerkAdmin, Entitlements])
  );
  const QuotaReservations = PooledQuotaReservations.layer.pipe(
    Layer.provide(Jobs)
  );
  const AutomationKv = AutomationKvService.layer.pipe(
    Layer.provide(AutomationKvBinding)
  );
  const Automations = AutomationService.layer.pipe(
    Layer.provide([AutomationKv, Jobs])
  );
  const AutomationSessions = AutomationSessionService.layer.pipe(
    Layer.provide(AutomationKv)
  );
  const AutomationProviders = AutomationProviderLive.pipe(
    Layer.provide(Cipher)
  );
  const DmDispatch = DmDispatchService.layer.pipe(
    Layer.provide(AutomationProviders)
  );
  const AutomationRuntime = AutomationEngine.layer.pipe(
    Layer.provide([
      Automations,
      AutomationSessions,
      DmDispatch,
      AutomationProviders,
    ])
  );
  const WebhookDeliveries = WebhookDeliveryService.layer;
  const ClerkSync = ClerkSyncService.layer.pipe(
    Layer.provide([IdentityService.layer, Telemetry])
  );
  const PaymentSink = PaymentWebhookSinkLive.pipe(
    Layer.provide([BillingWebhooks, Messaging, Setup])
  );
  const WebhookSecretConfig = Layer.succeed(
    WebhookSecrets,
    WebhookSecrets.of({
      metaAppSecret: env.META_APP_SECRET ?? "",
      metaVerifyToken: env.META_VERIFY_TOKEN ?? "",
      clerkSigningSecret: env.CLERK_WEBHOOK_SECRET ?? "",
      dodoSigningSecret: env.DODO_WEBHOOK_SECRET ?? "",
      timestampToleranceSeconds: 300,
    })
  );
  const WebhookVerification = SignedIngress.layer.pipe(
    Layer.provide(WebhookSecretConfig)
  );
  const WebhookIngress = WebhookIngressService.layer.pipe(
    Layer.provide([
      WebhookDeliveries,
      AutomationRuntime,
      ClerkSync,
      PaymentSink,
    ])
  );

  const RateLimiter =
    overrides.rateLimiter ??
    (env.RL_API_20 && env.RL_API_60 && env.RL_API_120 && env.RL_SESSION_300
      ? RateLimiterService.workersLayer({
          api20: env.RL_API_20,
          api60: env.RL_API_60,
          api120: env.RL_API_120,
          session300: env.RL_SESSION_300,
        })
      : RateLimiterService.inMemoryLayer());
  const OAuthFlow = OAuthFlowService.layer.pipe(
    Layer.provide(MembershipService.layer)
  );

  return Layer.mergeAll(
    Cipher,
    IdentityService.layer,
    MembershipService.layer,
    ApiKeyVerifier.layer,
    OAuthFlow,
    QuotaGuard.layer.pipe(Layer.provide(Entitlements)),
    RateLimiter,
    Telemetry,
    Deployment,
    Entitlements,
    AsToken,
    Clerk,
    Config,
    Authorization,
    Jobs,
    ClerkAdmin,
    ConnectionState,
    R2,
    AgentRuntime,
    AgentWorkspaces,
    WorkspaceFiles,
    Access,
    Posts,
    Reviews,
    Media,
    Connections,
    Admin,
    Analytics,
    Automations,
    Billing,
    BillingProvider,
    Cancellations,
    CalendarConfig,
    Messaging,
    Lifecycle,
    BillingTransfers,
    BillingWebhooks,
    BillingReconcile,
    Maintenance,
    Transcriptions,
    TranscriptionCheckout,
    Setup,
    QuotaReservations,
    WebhookVerification,
    WebhookIngress
  ).pipe(
    Layer.provide(AsToken),
    Layer.provide(Config),
    Layer.provide(Entitlements),
    Layer.provideMerge(Pg),
    // Postgres connection-build failures become defects (500), not a typed
    // requirement leak into the handler.
    Layer.orDie
  );
};
