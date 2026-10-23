# Advanced Authentication Platform

A TypeScript/Express authentication API using PostgreSQL, Prisma 7, Redis, and BullMQ.

> **Phase 1:** The repository provides a local development foundation. OAuth, passkeys/WebAuthn, real SMS delivery, password-reset email delivery, and production deployment are not complete.

## Features

- Email/password signup and login using Argon2id.
- Single-use email verification tokens, resend throttling, and email queue/worker using Resend.
- JWT access tokens and opaque refresh tokens with rotation, reuse detection, and persistent sessions.
- List and revoke sessions, logout, and logout-all.
- TOTP MFA setup and login challenges, recovery codes, code regeneration, and MFA disable.
- Phone normalization and OTP verification using Redis/BullMQ; delivery is mocked.
- Redis-backed rate limiting, audit events, Zod validation, structured Pino logs, Helmet, centralized errors, and health checks.

## Prerequisites

- Git
- Node.js and npm compatible with the versions required by package.json dependencies
- Docker Desktop or Docker Engine with Docker Compose

## Clone and install

```bash
git clone https://github.com/pianist22/Advanced-Auth.git
cd advanced-auth-platform
npm ci
cp .env.example .env
```

In PowerShell, create the environment file with `Copy-Item .env.example .env`. Fill its required values before starting; the app validates the environment at startup.

## Environment

The app loads `.env` from the project root. It is gitignored; never commit real credentials.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | development/test/production; default development |
| `PORT` | No | HTTP port; default 5000 |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `REDIS_HOST` | Yes | Redis hostname; localhost for host-run local Compose |
| `REDIS_PORT` | No | Redis port; default 6379 |
| `REDIS_PASSWORD` | No | Redis password, if configured |
| `JWT_ACCESS_SECRET` | Yes | HMAC signing secret; minimum 32 characters |
| `LOG_LEVEL` | No | Pino level; default info |
| `DUMMY_PASSWORD_HASH` | Yes | Argon2 hash used for login timing protection |
| `MFA_ENCRYPTION_KEY` | Yes | Base64 key decoding to exactly 32 bytes |
| `RESEND_API_KEY` | Optional at startup | Required for email delivery |
| `EMAIL_FROM` | Optional at startup | Verified Resend sender; required for delivery |
| `APP_BASE_URL` | No | Optional URL; no default |

The example file contains `JWT_REFRESH_SECRET`, but current validation and token code do not use it. Refresh tokens are opaque random values.

For the provided Compose database:

```dotenv
DATABASE_URL=postgresql://auth_user:auth_password@localhost:5432/auth_db?schema=public
```

Generate required local values from the project root:

```bash
npx tsx src/scripts/generate-dummy-password-hash.ts
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set the first output as `DUMMY_PASSWORD_HASH` and the second as `MFA_ENCRYPTION_KEY`. Back up and keep the MFA key stable; existing encrypted TOTP secrets cannot be decrypted if it is lost or changed.

Example shape (replace all placeholders):

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://auth_user:auth_password@localhost:5432/auth_db?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
JWT_ACCESS_SECRET=<32-or-more-random-characters>
LOG_LEVEL=debug
DUMMY_PASSWORD_HASH=<generated-argon2-hash>
MFA_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
RESEND_API_KEY=<resend-api-key>
EMAIL_FROM=<verified-sender-address>
APP_BASE_URL=http://localhost:5000
```

## Start PostgreSQL and Redis

```bash
docker compose up -d
docker compose ps
docker compose logs -f postgres redis
```

Stop containers while retaining data with `docker compose down`. To also delete local database/Redis volumes, use `docker compose down -v`; this deletes their data. Compose exposes PostgreSQL on port 5432 and Redis on 6379. The fixed credentials are for local development only.

## Prisma setup

Prisma 7 configuration is in `prisma.config.ts`: it loads dotenv, selects `prisma/schema.prisma` and `prisma/migrations`, and reads `DATABASE_URL`. The schema uses PostgreSQL; Prisma Client is initialized with the PostgreSQL adapter.

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:studio
```

The migration script runs `prisma migrate dev`. To create a named migration after changing the schema:

```bash
npm run prisma:migrate -- --name describe_your_change
```

## Run API and workers

The API checks PostgreSQL and Redis before listening:

```bash
npm run dev
```

Root URL: `http://localhost:5000/` unless `PORT` changes. Run each worker in its own terminal:

```bash
npm run worker:email:dev
npm run worker:sms:dev
```

The email worker sends verification email with Resend and requires `RESEND_API_KEY` and `EMAIL_FROM`. The SMS worker simulates delivery and sends no text. After building, the compiled workers are `npm run worker:email` and `npm run worker:sms`.

## API routes

Authentication routes are mounted at `/api/v1/auth`. Protected routes require `Authorization: Bearer <access-token>`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/v1/auth/signup` | Create account and queue verification email |
| POST | `/api/v1/auth/email/verify` | Verify email token |
| POST | `/api/v1/auth/email/resend` | Resend verification email |
| POST | `/api/v1/auth/login` | Password login; may require MFA |
| POST | `/api/v1/auth/refresh` | Rotate refresh token |
| POST | `/api/v1/auth/logout` | Revoke current session (auth required) |
| GET | `/api/v1/auth/sessions` | List sessions (auth required) |
| DELETE | `/api/v1/auth/sessions/:sessionId` | Revoke one session (auth required) |
| POST | `/api/v1/auth/sessions/revoke-others` | Revoke other sessions (auth required) |
| POST | `/api/v1/auth/logout-all` | Revoke all sessions (auth required) |
| POST | `/api/v1/auth/phone` | Add phone (auth required) |
| POST | `/api/v1/auth/phone/verify/request` | Request phone OTP (auth required) |
| POST | `/api/v1/auth/phone/verify` | Verify phone OTP (auth required) |
| POST | `/api/v1/auth/password/forgot` | Request password reset |
| POST | `/api/v1/auth/password/reset` | Reset password using token |
| POST | `/api/v1/auth/mfa/totp/setup` | Start TOTP setup (auth required) |
| POST | `/api/v1/auth/mfa/totp/verify` | Verify/enable TOTP (auth required) |
| POST | `/api/v1/auth/mfa/recovery/verify` | Verify recovery code (auth required) |
| POST | `/api/v1/auth/mfa/challenge/verify` | Complete MFA login challenge |
| POST | `/api/v1/auth/mfa/disable` | Disable MFA (auth required) |
| POST | `/api/v1/auth/mfa/recovery/regenerate` | Regenerate recovery codes (auth required) |

Health endpoints: `GET /health/live` and `GET /health/ready`. The root `GET /` returns a welcome response. Zod request schemas live under `src/modules/auth`; there is no OpenAPI specification.

## Tests and build

```bash
npm test
npm run test:watch
npm run typecheck
npm run build
npx tsx src/scripts/test-db.ts
npx tsx src/scripts/test-redis.ts
```

The database and Redis checks need working services and valid environment settings.

## Troubleshooting

- **Invalid environment:** Check `DATABASE_URL`, `REDIS_HOST`, a 32+ character `JWT_ACCESS_SECRET`, `DUMMY_PASSWORD_HASH`, and `MFA_ENCRYPTION_KEY`.
- **PostgreSQL unavailable:** Check `docker compose ps`, credentials/port in `DATABASE_URL`, and port 5432 conflicts.
- **Redis unavailable:** Check Redis status, host/port, and optional password.
- **Prisma URL/client error:** Ensure root `.env` has `DATABASE_URL`; run `npm run prisma:generate`.
- **Email fails:** Start the email worker and set a valid Resend API key and verified sender.
- **MFA key error:** Base64 must decode to 32 bytes; keep it unchanged while encrypted data exists.
- **No phone message:** SMS is simulated, not real delivery.

## Security notes

- Never commit `.env`, API keys, database credentials, signing secrets, or the MFA key.
- Compose credentials are local-only; replace them and restrict network access before shared use.
- Back up `MFA_ENCRYPTION_KEY` securely and keep it stable.
- Recovery codes are returned only when generated; store them safely. The database stores hashes.
- Treat access and refresh tokens as secrets.
- CORS currently allows all origins while credentials are enabled; restrict origins before exposure.
- No production deployment configuration or production security review is included.

## Phase 1 limitations

**Phase 1 is a development foundation, not a production-ready identity service.**

