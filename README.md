# Ready2Take2

<p align="center" width="100%">
	<img src="docs/logo_on_white.svg" width="50%">
</p>

A web application simplifying coordination between the director and camera operators. Inspired by available commercial solutions, Ready2Take2 tries to help the team produce a tightly timed, planned show without taking away control. The director can plan shots and cues based on an earlier recording, then they can step through the cues while all camera operators can follow along the progression of the show on mobile devices and screens. Countdowns provide information on length of the shot.

Progression through the cues is manual triggered by the director or by reacting to transitions happening in the switcher.

## Quick start

Easiest way to get going is to use [Docker Compose](https://docs.docker.com/compose/install/). Create [docker-compose.yaml](./docker-compose.yaml) file:
```yaml
services:
  ready2take2:
    image: jstarpl/ready2take2:latest
    container_name: ready2take2
    restart: unless-stopped
    ports:
      - "3000:3000"
      - "8000:8000/udp"
    volumes:
      - ./data:/app/data
```

Run
```bash
docker-compose up -d
```

Open the app at `http://localhost:3000` and sign in with the default credentials:
- Username: `admin`
- Password: `admin123!`

## OSC control

Ready2Take2 listens for incoming OSC messages over UDP on port `8000` by default.
You can change this with the `OSC_PORT` environment variable.

Supported incoming OSC addresses:

- `/production/take`
	- Executes a **Take** for the show with a current cue.
- `/production/moveNext/forward`
	- Moves the next cue one cue forward.
- `/production/moveNext/backward`
	- Moves the next cue one cue backward.

Example (`oscsend`):

```bash
oscsend localhost 8000 /production/take
oscsend localhost 8000 /production/moveNext/forward
oscsend localhost 8000 /production/moveNext/backward
```


## Fast start for development

1. Install dependencies:
	 - `pnpm install`
2. Start client + server in one command:
	 - `pnpm dev`
3. Open the app:
	 - Client: `http://localhost:5173`
	 - Server: `http://localhost:3000`

## Validation commands

- `pnpm build` builds the client and compiles the server
- `pnpm typecheck` runs TypeScript checks for client and server
- `pnpm start` starts the compiled server (`dist/server/index.js`)

## Stack

- Vite + React
- Express + tRPC
- SQLite + TypeORM
- Zod
- Tailwind + shadcn-style UI foundation

## Existing features

- Auth
	- Username/password login with server-side session cookie
	- Seeded admin account for local development
- Projects and shows
	- Create projects and shows
	- Show creation automatically creates a default `Camera` track
- Show workspace
	- Create, update, delete, and reorder cues
	- Set `current` and `next` cue pointers
	- `Take` action (and `F12` shortcut) to advance cue pointers
	- Edit per-track technical identifiers for each cue
	- Create/remove tracks with automatic cue-track value backfill/integrity handling
	- Return feed view at `/shows/return-feed-view` for a large-screen current/next/following cue output
	- Optional URL hash zoom control for return feed view (`#zoom=150` = 150% scale)
- Collaboration and refresh
	- Show-scoped realtime events over WebSockets/tRPC subscriptions
	- Client refresh through query invalidation on mutation success and subscription events
- Media
	- Upload and delete show-scoped media files
	- Select media for the workspace and control playback in the bottom media player
	- Cue List View route for a focused cue display/filter workflow

## Core concepts

- Project
	- Top-level container for shows.
- Show
	- Production workspace holding tracks, cues, media files, and two pointers: `currentCueId`, `nextCueId`.
- Track
	- Column-like dimension (for example: camera, audio, graphics) shared across all cues in a show.
- Cue
	- Ordered show event with `cueId`, `comment`, and optional `cueOffsetMs`.
- CueTrackValue
	- Per-cue/per-track technical identifier value.
	- Every cue should have one value row for every track in the same show.
- Show-scoped realtime
	- Mutations publish events for a single show, and clients viewing that show refresh from those events.

## Return feed view

Ready2Take2 includes a dedicated return feed output route intended for TVs, confidence monitors, or projector screens:

- Route: `/shows/return-feed-view`
- Behavior:
	- Displays the active show name, current cue, next cue, and following cues.
	- Updates automatically via realtime events.
	- Shows countdown timing for upcoming cues when offsets are available.

### Zoom parameter

You can scale the return feed output by adding a `zoom` value in the URL hash.

- Format: `#zoom=<percent>`
- Example: `http://localhost:5173/shows/return-feed-view#zoom=150`
- Effect: sets the page root font size to the given percentage (`150` = 150%, `100` = default size).

This is useful when calibrating readability on displays with different sizes or resolutions.

## Default development login

The server seeds a default user on first start:

- username: `admin`
- password: `admin123!`

## Notes

- SQLite data is stored under `data/ready2take2.sqlite`
- Uploaded media is stored under `data/uploads`
- Import alias `@/` resolves to `src/`
- This is a scaffold, not a finished production app