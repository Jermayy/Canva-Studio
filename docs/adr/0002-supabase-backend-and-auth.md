# 0002 · Supabase for database, auth, realtime and storage

- **Status:** Accepted
- **Date:** 2026-11-10

## Context

Users need accounts with at least baseline-standard authentication, with each user's designs isolated in an online database and live updates across devices. This is a solo project: running our own server, auth, backups and patching is costly.

## Options considered

1. **Supabase.** Managed Postgres (playbook default: relational), Auth with hashed passwords, rate limits, MFA support, RLS for per-user isolation, Realtime and Storage. The client talks to it directly, protected by RLS.
2. **Firebase.** Similar managed features but NoSQL and Google-specific.
3. **Self-hosted Fastify + Postgres + Argon2id.** Full control, but we'd own auth security, rate limiting, backups and uptime.

## Decision

Supabase, chosen by the user. There is no custom API layer: PostgREST plus RLS is the API. A trigger owns `user_id`, `created_at`, `updated_at`, and enforces version increments, so clients cannot forge them. The desktop app embeds only the publishable key; it refuses to start with a secret key.

## Consequences

- Per-user isolation depends entirely on the RLS policies in `supabase/migrations`, so treat changes there as security-sensitive.
- Vendor lock-in is moderate: data is plain Postgres plus an S3-style bucket, and the app uses Supabase only behind `RemoteDesignStore` and `AuthService`, so swapping is contained.
- Backups and point-in-time recovery depend on the Supabase plan; check this before production use (playbook 05).
