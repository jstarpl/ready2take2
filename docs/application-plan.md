# Ready2Take2 Application Plan

## Goal

Build a live-production coordination app for video crews. The system lets authenticated users collaborate on projects, manage shows, organize cues into tracks, and keep a shared view of the current and next cue during a live recording.

## Core Product Scope

### Primary use cases

- Sign in with a simple username and password.
- Create and manage projects.
- Create shows within a project.
- Create tracks within a show.
- Create, edit, reorder, and delete cues within a show.
- Edit per-track technical identifiers for each cue.
- Keep two show-level pointers: current cue and next cue.
- Propagate updates in near real time to other users viewing the same show.

### Required domain rules

- A project has many shows.
- A show has many tracks.
- A show has many cues.
- A cue belongs directly to one show.
- A cue stores a nullable `technicalIdentifier` value for every track in the same show.
- A cue-track value belongs to exactly one cue and one track.
- A new show is created with one default track named `Camera`.
- A cue contains:
  - `comment: string`
  - `cueOffsetMs: number | null`
- A cue-track value contains:
  - `technicalIdentifier: string | null`
- Cues are ordered and user-sortable.
- A show has nullable `currentCueId` and `nextCueId` pointers.
- Real-time changes only need to sync viewers looking at the same show.

## Recommended Architecture

### Frontend

- Vite
- React + TypeScript
- Valtio for local state storage
- Tailwind CSS + shadcn/ui
- TanStack Query via tRPC React integration
- Zod shared validation schemas

### Backend

- Node.js + TypeScript
- Express server hosting both HTTP API and WebSocket server
- tRPC for type-safe procedures
- tRPC subscriptions over WebSockets for show-scoped live updates
- TypeORM for persistence
- SQLite for local database storage
- Zod for input validation at the procedure boundary

### Why this shape

- Vite gives fast frontend iteration without constraining backend design.
- tRPC keeps client and server contracts aligned for a TypeScript-heavy project.
- SQLite is sufficient for a single-site or small-team deployment and keeps setup simple.
- TypeORM supports entity modeling and migrations cleanly for this domain.
- WebSocket subscriptions fit collaborative show updates better than polling.

## High-Level Module Layout

```text
src/
  client/
    app/
    components/
    features/
      auth/
      projects/
      shows/
      tracks/
      cues/
    lib/
    routes/
  server/
    api/
      routers/
      procedures/
    auth/
    db/
      entities/
      migrations/
    realtime/
    services/
    index.ts
  shared/
    schemas/
    types/
```

## Data Model

### User

- `id`
- `username` unique
- `passwordHash`
- `displayName`
- `createdAt`
- `updatedAt`

### Session

- `id`
- `userId`
- `expiresAt`
- `createdAt`

This can be persisted in SQLite and stored in an httpOnly cookie.

### Project

- `id`
- `name`
- `description` nullable
- `createdByUserId`
- `createdAt`
- `updatedAt`

### Show

- `id`
- `projectId`
- `name`
- `status` optional enum such as `draft | live | archived`
- `currentCueId` nullable
- `nextCueId` nullable
- `createdAt`
- `updatedAt`

### Track

- `id`
- `showId`
- `name`
- `position`
- `createdAt`
- `updatedAt`

### Cue

- `id`
- `showId`
- `comment`
- `cueOffsetMs`
- `orderKey`
- `createdAt`
- `updatedAt`

### CueTrackValue

- `id`
- `cueId`
- `trackId`
- `technicalIdentifier` nullable
- unique constraint on (`cueId`, `trackId`)
- `createdAt`
- `updatedAt`

This join entity represents the track-specific technical identifier for a cue. Every cue should have one `CueTrackValue` row for every track in the same show.

## Ordering Strategy

Use a string `orderKey` on show-level cues instead of dense integer indexing.

### Reasoning

- Drag-and-drop reorder becomes cheaper.
- Inserting between two cues does not require rewriting every later cue.
- Collaborative reordering is easier to merge.
- Ordering stays independent from track structure because cues are shared across all tracks in a show.

### Practical approach

- Start with simple lexicographic keys.
- On reorder, generate a key between neighboring items.
- Add a maintenance service that can rebalance keys for one show if keys become too dense.

If you want to reduce implementation complexity for the first version, use integer `position` and normalize positions after every reorder. That is simpler, but it creates more writes and more collision handling during concurrent edits.

## Referential Rules

### Show cue pointers

- `currentCueId` and `nextCueId` must refer to cues that belong to the same show.
- When a cue is deleted:
  - if it is the current cue, clear `currentCueId`
  - if it is the next cue, clear `nextCueId`
- Validation for pointer assignment should live in the service layer, not only in the UI.

### Cue-track value integrity

- Every cue in a show should have one `CueTrackValue` per track in that show.
- Creating a cue should create all missing `CueTrackValue` rows for the show's tracks.
- Creating a track should create all missing `CueTrackValue` rows for the show's cues.
- Deleting a track should delete the related `CueTrackValue` rows.
- Validation must reject any attempt to connect a cue and track from different shows.

### Default track creation

- Creating a show runs in a transaction.
- The same transaction creates the default `Camera` track.

## Authentication Plan

Keep authentication minimal and explicit.

### Version 1

- Username + password login
- Password hashing with `argon2`
- Session cookie stored server-side in SQLite
- Protected tRPC procedures require a valid session

### Optional later improvements

- Password reset flow
- Role-based permissions
- Project-level membership and access control

For the initial release, a single authenticated team space is enough unless the product must separate crews by account boundary.

## Realtime Synchronization Plan

### Scope

Only users currently viewing the same show need synchronized updates.

### Transport

- tRPC WebSocket subscriptions
- Show-specific channels such as `show:{showId}`

### Events to publish

- `show.updated`
- `track.created`
- `track.updated`
- `track.deleted`
- `cue.created`
- `cue.updated`
- `cue.deleted`
- `cue.reordered`
- `cueTrackValue.updated`
- `show.currentCueChanged`
- `show.nextCueChanged`

### Client behavior

- Subscribe when entering a show detail page.
- Apply small cache updates through TanStack Query utilities.
- If event payload is incomplete or ordering changed significantly, invalidate and refetch the show query.

### Consistency model

- Server remains the source of truth.
- Mutations return canonical saved records.
- Subscriptions broadcast committed changes after successful DB transactions.

## tRPC API Shape

### Auth router

- `auth.login`
- `auth.logout`
- `auth.me`

### Project router

- `project.list`
- `project.create`
- `project.update`
- `project.delete`
- `project.getById`

### Show router

- `show.listByProject`
- `show.create`
- `show.update`
- `show.delete`
- `show.getDetail`
- `show.setCurrentCue`
- `show.setNextCue`
- `show.subscribe`

### Track router

- `track.create`
- `track.update`
- `track.delete`
- `track.reorder`

### Cue router

- `cue.create`
- `cue.update`
- `cue.delete`
- `cue.reorder`

### Cue-track value router

- `cueTrackValue.update`
- `cueTrackValue.bulkUpsertForCue`

## Zod Schema Strategy

Put all external input contracts in shared Zod schemas.

### Key schemas

- login input
- project create and update
- show create and update
- track create and update
- cue create and update
- cue-track value update
- cue-track value bulk update
- set current cue
- set next cue
- cue reorder payload

### Validation rules

- `comment` can be empty but should have a max length
- `cueOffsetMs` integer and `>= 0` or it can be `null`
- `technicalIdentifier` can be `null`, but if present should be a bounded string
- any cue-track update must verify cue and track belong to the same show
- show pointer assignments allow `null`

## UI Plan

### Primary views

#### Login page

- Username
- Password
- Submit

#### Project list page

- List projects
- Create project dialog
- Navigate into a project

#### Project detail page

- List shows in the project
- Create show dialog

#### Show workspace page

- Header with show name and connection state
- Current cue panel
- Next cue panel
- Cue list ordered at the show level
- Track columns rendered inside each cue row, or as a cue editor matrix
- Cue editor drawer or dialog
- Per-track technical identifier inputs for the selected cue
- Controls for assigning current and next cue

### shadcn/ui components likely useful

- `Button`
- `Card`
- `Dialog`
- `Drawer`
- `Form`
- `Input`
- `Textarea`
- `Table`
- `Badge`
- `DropdownMenu`
- `ScrollArea`
- `Separator`
- `Sonner` or toast equivalent

### Interaction decisions

- Use drag-and-drop for cue ordering.
- Edit track-specific technical identifiers inline or in a focused editor.
- Highlight the cue referenced as current or next.
- Show optimistic pending state for edits, but prefer authoritative server reconciliation after mutation.

## Service Layer Responsibilities

Keep non-trivial logic out of routers.

### Show service

- create show with default track
- validate cue ownership for current and next pointers
- publish show update events

### Cue service

- create cue
- reorder cue within show
- clear show pointers on delete when needed
- create default cue-track values for all tracks in the show
- publish cue events

### Cue-track value service

- update a cue's track-specific technical identifier
- bulk initialize missing cue-track values
- enforce same-show relationship between cue and track
- publish cue-track update events

### Auth service

- verify password hash
- create and invalidate sessions
- resolve current user from cookie

## Transactions

Use DB transactions for operations that must stay consistent.

### Required transactional operations

- create show + default `Camera` track
- create cue + cue-track values for every track in the show
- create track + cue-track values for every cue in the show
- delete cue + clear affected show pointers
- reorder operations that rewrite multiple order values
- assigning current and next cue if validation depends on latest show state

## Suggested Initial Milestones

### Milestone 1: foundation

- Set up Vite React TypeScript app
- Add Express backend in the same repo
- Configure TypeORM + SQLite
- Add Tailwind and shadcn/ui
- Add tRPC client and server wiring
- Add Zod shared schemas

### Milestone 2: authentication

- User entity and session entity
- Login and logout flows
- Protected procedures
- Basic authenticated shell UI

### Milestone 3: projects and shows

- Project CRUD
- Show CRUD
- Default `Camera` track on show creation
- Project and show navigation

### Milestone 4: tracks and cues

- Track CRUD
- Cue CRUD
- Cue-track value editing
- Reorder cues
- Pointer assignment for current and next cue

### Milestone 5: realtime collaboration

- WebSocket server
- Show-scoped subscriptions
- Query cache synchronization
- Connection and reconnection handling in UI

### Milestone 6: hardening

- Migrations
- Validation refinement
- Error boundaries and toasts
- Basic audit fields and activity logging if needed
- End-to-end test coverage for critical workflows

## Testing Plan

### Unit tests

- Zod schema validation
- ordering key generation
- show pointer validation
- auth password verification

### Integration tests

- create show creates default `Camera` track
- create cue creates one cue-track value per show track
- create track creates one cue-track value per existing cue
- setting current and next cue rejects cues from another show
- deleting pointed cue clears corresponding show pointer
- cue-track updates reject mismatched cue and track pairs
- reorder mutations persist correctly

### Realtime tests

- one user edits a cue and another subscriber receives update
- current and next cue changes propagate to active viewers

### End-to-end tests

- login
- create project
- create show
- add cues
- edit per-track technical identifiers
- reorder cues
- assign current and next cue

## Main Risks And Decisions

### SQLite concurrency

SQLite is fine for a small team and modest write frequency. If many operators edit the same show heavily at the same time, you may eventually want PostgreSQL. The app design should keep the database layer abstract enough to migrate later.

### Ordering complexity

Fractional ordering is better for collaboration, but it adds implementation detail. If the first release needs speed, start with integer positions and migrate later only if reorder contention becomes a problem.

### Permissions

If every logged-in user can edit everything, implementation stays simple. If you need operators, producers, and read-only viewers, define roles early because it affects routers and UI controls.

## Recommended First Build Decision

For the first implementation, use:

- monorepo-style single package if you want speed over separation
- React + Vite frontend
- Express + tRPC backend in the same repo
- SQLite + TypeORM
- session-cookie auth with argon2
- integer cue positions first, unless collaborative reordering is the highest-risk area

That combination minimizes setup friction while still matching your stack and the collaboration requirement.

## Next Implementation Step

Scaffold the repository as a full-stack TypeScript app with:

- Vite frontend
- Express + tRPC backend
- shared schema package area
- TypeORM datasource and first migration
- shadcn/ui and Tailwind setup
- initial entities for `User`, `Session`, `Project`, `Show`, `Track`, and `Cue`
