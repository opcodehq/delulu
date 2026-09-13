# Administrative Machine Runner

This is the security boundary for rare work that genuinely requires a full Linux machine, native binaries, package installation, or a full browser. It is deliberately not part of the ordinary API Worker or Content HQ onboarding path.

No provider is configured by default. Before implementing or enabling a deployment, rotate the previously exposed provider credential and keep the replacement only on this separately deployed service.

Every execution must require an administrator decision and carry:

- a Delulu workspace-scoped, short-lived capability;
- an explicit maximum runtime and idle timeout;
- an artifact export allowlist;
- an immutable audit identifier;
- immediate termination after the requested task finishes.

The Content HQ runtime may return `requires_machine`, but it must never provision this runner or receive its control-plane credentials. There is no automatic fallback.
