# Agent Notes

Repository-specific notes persisted from working memory for future development.

- Build validation: run `pnpm build` from the repo root.
- Broader type validation: run `pnpm typecheck`.
- Stack: Vite + React client, Express + tRPC server, SQLite + TypeORM, shared Zod schemas.
- Dev ports: Vite on `5173`, Express/tRPC on `3000`; Vite proxies `/trpc` to the server.
- Import alias: `@/` resolves to `src/`.
- SQLite path: `data/ready2take2.sqlite`; server creates `data/` on startup.
- TypeORM config currently uses `synchronize: true`.
- Seeded local login: `admin` / `admin123!`.
- Show creation must create the default `Camera` track in the same transaction.
- Track creation must backfill `CueTrackValue` rows for existing cues.
- Show cue pointers (`currentCueId`, `nextCueId`) must always reference cues in the same show.
- Realtime bus is process-local and implemented by `src/server/realtime/show-events.ts`.
- Show workspace data refreshes from TRPC invalidation plus realtime `showEvents` publications.
- Show workspace subscription currently invalidates `show.getDetail` and `project.list`.
- Cue workflow is service-driven in `src/server/services/cue-service.ts`: create publishes `cue.created`, update publishes `cue.updated`, delete publishes `cue.deleted`, reorder publishes `cue.reordered`.
- Cue creation backfills `CueTrackValue` rows for all existing tracks; cue deletion clears matching show pointers before delete.
- Cue-track value updates use `updateCueTrackValue`, reject cue/track pairs from different shows, create missing rows if needed, and publish `cueTrackValue.updated`.
- Track workflow is service-driven in `src/server/services/track-service.ts`: create publishes `track.created`, update publishes `track.updated`, delete publishes `track.deleted`, reorder validates the full show order and publishes `track.reordered`.
- Track creation backfills values for existing cues; track reorder expects the full set of show track ids with no duplicates.
- Show updates should go through `updateShowDetails` in `src/server/services/show-service.ts` and publish `show.updated`.
- In `show-workspace.tsx`, `updateCueTrackValueMutation` and `reorderCueMutation` now keep explicit `onSuccess` invalidation for `show.getDetail` in addition to subscription-driven refresh.
- Treat realtime event publishing plus explicit client invalidation as mandatory for show-scoped mutations.
- Important files for show collaboration work: `src/client/features/shows/show-workspace.tsx`, `src/server/api/routers/track.ts`, `src/server/services/track-service.ts`, `src/server/services/show-service.ts`, `src/server/services/cue-service.ts`, `src/server/realtime/show-events.ts`, `src/shared/types/domain.ts`.