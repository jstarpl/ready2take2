# AGENTS.md

## Project Summary

Ready2Take2 is a full-stack TypeScript scaffold for live production coordination. It combines a Vite/React client with an Express/tRPC server, SQLite persistence through TypeORM, shared Zod schemas, and show-scoped realtime updates over WebSockets.

## Development Commands

- `pnpm dev`: starts both the Vite client and the server watcher.
- `pnpm dev:client`: runs Vite on `http://localhost:5173`.
- `pnpm dev:server`: runs the server with `tsx watch` on `http://localhost:3000`.
- `pnpm build`: builds the client and compiles the server. Use this as the primary validation command.
- `pnpm typecheck`: runs TypeScript checks for client and server.
- `pnpm start`: starts the compiled server from `dist/server/index.js`.

## Default Local State

- SQLite database path: `data/ready2take2.sqlite`.
- The server creates the `data/` directory at startup.
- TypeORM uses `synchronize: true`; schema changes are currently code-first rather than migration-driven.
- Seeded local credentials:
  - username: `admin`
  - password: `admin123!`

## Architecture Map

- `src/client`: React client.
- `src/client/app`: app shell, global providers, and app-level styling.
- `src/client/features`: domain UI grouped by feature.
- `src/client/lib/trpc.ts`: tRPC client wiring.
- `src/client/routes/app-routes.tsx`: route definitions.
- `src/server/index.ts`: Express bootstrap, HTTP API, and WebSocket setup.
- `src/server/api/routers`: tRPC routers by domain.
- `src/server/services`: business logic and transaction-heavy operations.
- `src/server/db/entities`: TypeORM entities/schemas.
- `src/server/realtime/show-events.ts`: in-memory show-scoped event bus.
- `src/shared/schemas`: shared Zod contracts used across client and server.
- `src/shared/types/domain.ts`: shared domain and realtime event types.

## Important Technical Conventions

- Import alias `@/` resolves to `src/`.
- The client talks to the server through `/trpc`; Vite proxies that path to `http://localhost:3000` in development.
- Realtime updates are show-scoped. The server publishes events through `showEvents`, and the client typically responds by invalidating tRPC queries instead of hand-maintaining detailed cache patches.
- Treat realtime event publishing and tight client invalidation as mandatory for any show-scoped mutation. When adding or changing a show, cue, track, cue-track value, or cue pointer mutation, update the server-side event publication and the client refresh path together.
- Show creation must also create the default `Camera` track in the same transaction.
- Track creation must backfill `CueTrackValue` rows for existing cues.
- Cue/show pointer integrity matters: `currentCueId` and `nextCueId` must reference cues within the same show.
- Existing code uses direct service functions for cross-entity rules; avoid pushing business invariants into UI-only logic.

## Realtime Notes

- The event bus is process-local. It is suitable for local development and a single server instance, but not a distributed deployment.
- Existing repository knowledge says cue edits publish `cue.updated` and cue-track value edits publish `cueTrackValue.updated`.
- The show workspace currently invalidates `show.getDetail` and `project.list` on subscription events.

## Cue And Track Mutation Workflow

- The show workspace drives edits through tRPC mutations in `src/client/features/shows/show-workspace.tsx` and refreshes state mainly by invalidating `show.getDetail` after mutation success or after any subscription event.
- `cue.create` goes through `src/server/api/routers/cue.ts` into `createCueWithTrackValues` in `src/server/services/cue-service.ts`. It creates the cue and one `CueTrackValue` row per existing track in a transaction, then publishes `cue.created`.
- `cue.update` goes through `updateCue` in `src/server/services/cue-service.ts` and publishes `cue.updated`.
- `cue.delete` goes through `deleteCueAndClearPointers` in `src/server/services/cue-service.ts`. It clears `currentCueId` and `nextCueId` if needed before deleting the cue, then publishes `cue.deleted`.
- `cue.reorder` goes through `reorderCues` in `src/server/services/cue-service.ts`. It rewrites `orderKey` values for the submitted cue order and publishes `cue.reordered`.
- `cueTrackValue.update` goes through `updateCueTrackValue` in `src/server/services/cue-service.ts`. It rejects cue/track pairs from different shows, creates the row if missing, and publishes `cueTrackValue.updated` for both create and update paths.
- `track.create`, `track.update`, `track.delete`, and `track.reorder` go through `src/server/services/track-service.ts`. Track create backfills missing `CueTrackValue` rows, track update publishes `track.updated`, track delete publishes `track.deleted`, and track reorder validates the submitted order and publishes `track.reordered`.
- `show.update` should go through a service and publish `show.updated`; keep that event in place if the show edit flow changes.
- On the client, `updateCueTrackValueMutation` and `reorderCueMutation` should keep explicit `onSuccess` invalidation for `show.getDetail`, even though the show subscription also invalidates on incoming events.
- When extending cue or track mutations, update the router, service, shared schema, emitted `ShowEvent` type, and subscription-driven refresh behavior together so realtime collaboration stays coherent.

## Editing Guidance For Future Agents

- Prefer small, targeted changes. Preserve the current stack and file layout unless the task requires structural work.
- Put domain rules in server services or routers, not only in React components.
- Keep shared request/response validation in `src/shared/schemas` when API contracts change.
- When changing persistence rules, inspect the related entity, service, router, and shared schema together.
- When touching show collaboration flows, inspect both the mutation path and the corresponding realtime publication.
- If a show-scoped mutation exists without a matching realtime event or explicit client invalidation path, treat that as an incomplete implementation.
- Prefer moving non-trivial track mutation rules out of `src/server/api/routers/track.ts` into a service if you need to add invariants or realtime behavior.
- Maintain existing import style and path alias usage.

## Validation Expectations

- Run `pnpm build` after meaningful code changes.
- Run `pnpm typecheck` when changes affect shared types, routers, or broad refactors.
- If you change anything in show collaboration behavior, verify both the mutation success path and subscription-driven refresh behavior.

## High-Value Files

- `src/server/index.ts`
- `src/server/services/show-service.ts`
- `src/server/services/track-service.ts`
- `src/server/services/cue-service.ts`
- `src/server/realtime/show-events.ts`
- `src/client/features/shows/show-workspace.tsx`
- `src/client/lib/trpc.ts`
- `src/shared/types/domain.ts`
- `docs/application-plan.md`