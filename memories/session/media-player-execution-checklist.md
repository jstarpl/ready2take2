## Bottom Show Media Player — Phased Execution Checklist

Scope: Add a Spotify-like, bottom-fixed player to show workspace using existing show detail data. Keep behavior client-local in v1, with clickable cue markers on a full-width seek timeline. No backend/API/schema additions.

### Phase 0 — Contract
- [ ] Confirm mount boundary in `src/client/features/shows/show-workspace.tsx`.
- [ ] Lock prop contract and state ownership (workspace = data/realtime, player = local playback state).
- [ ] Lock fixed-footer spacing and z-index rules.

### Phase 1 — Shell
- [ ] Add feature-local player component under `src/client/features/shows/`.
- [ ] Mount from ShowWorkspace when show data exists.
- [ ] Implement fixed bottom shell with timeline row + controls row.
- [ ] Add bottom padding to avoid overlap with cue grid.

### Phase 2 — Selection + Playback Engine
- [ ] Start with no selected media.
- [ ] Populate options from `show.mediaFiles`.
- [ ] Resolve playable URL from `publicPath`.
- [ ] Implement media event wiring (`loadedmetadata`, `timeupdate`, `play`, `pause`, `ended`, `error`).
- [ ] Reset selection/playback state if selected file disappears after refresh.

### Phase 3 — Transport UX
- [ ] Large central play/pause.
- [ ] Left rewind buttons: `-10s`, `-5s`, `-1s`.
- [ ] Right forward buttons: `+1s`, `+5s`, `+10s`.
- [ ] Clamp all seeks to valid duration range.

### Phase 4 — Timeline + Cue Markers
- [ ] Full-width seek slider using native range input.
- [ ] Marker layer derived from cues with non-null `cueOffsetMs`.
- [ ] Clickable markers seek playback only.
- [ ] Marker/playhead visual distinction.

### Phase 5 — Video Preview
- [ ] Show small preview only for video media.
- [ ] Hide/collapse preview region for non-video.
- [ ] Keep controls layout stable across media type changes.

### Phase 6 — Regression and Validation
- [ ] Confirm compatibility with existing media sheet upload/delete flow.
- [ ] Confirm cue edit + reorder remains usable.
- [ ] Validate no-media/no-cue-offset/error states.
- [ ] Validate responsive overlap behavior.
- [ ] Run `pnpm build` and `pnpm typecheck`.

### Locked decisions
- [ ] No default selected file.
- [ ] Marker clicks do not change `currentCueId`/`nextCueId`.
- [ ] Selection persistence remains local only.
- [ ] Backend playback sync/persistence out of scope for v1.