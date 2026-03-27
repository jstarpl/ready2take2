# Video Mixer Integration Test Plan

## Purpose
Prevent regressions in reconnect handling and automatic take triggering for vMix and ATEM integrations in the server mixer automation flow.

## Scope
In scope:
- Connection lifecycle behavior in src/server/services/video-mixer-service.ts.
- Reconnect resiliency for vMix and ATEM persistent connections.
- Event-driven take triggering when program/preview are swapped.
- Selection of show to take when multiple shows match the same technical identifier.

Out of scope:
- UI behavior.
- Real hardware end-to-end tests.
- Performance benchmarking beyond basic guardrails.

## Quality Gates
- All integration tests pass locally and in CI.
- No flaky timing dependencies (deterministic event emission in mocks).
- Tests verify behavior, not implementation details (listener counts are an exception where duplication risk exists).

## Proposed Test Layout
- tests/integration/video-mixer/
- tests/integration/video-mixer/fixtures/
- tests/integration/video-mixer/mocks/

Suggested files:
- tests/integration/video-mixer/video-mixer.reconnect.test.ts
- tests/integration/video-mixer/video-mixer.take-trigger.test.ts
- tests/integration/video-mixer/fixtures/test-data.ts
- tests/integration/video-mixer/mocks/vmix-mock.ts
- tests/integration/video-mixer/mocks/atem-mock.ts

## Harness Design
1. Test runtime:
- Use Vitest with Node environment.
- Run tests serially for this suite at first to avoid shared singleton state collisions.

2. Database strategy:
- Use a temporary SQLite database per test file (or per test if isolation is needed) with TypeORM initialize/destroy in hooks.
- Seed minimal entities: Project, Show, Track (camera), Cue, CueTrackValue, VideoMixerSetting.

3. External dependency isolation:
- Mock node-vmix ConnectionTCP and atem-connection Atem.
- Mocks should expose EventEmitter-like behavior for connect, error, tally, and stateChanged events.
- Keep one mock class per protocol and include counters for send calls and listener registrations.

4. Service seams to observe:
- Spy on takeShow in src/server/services/show-service.ts.
- Observe mixer commands sent by mock transport (send for vMix, changePreviewInput for ATEM).

5. Deterministic timing:
- Avoid real sleeps in tests where possible.
- Emit events directly from mocks rather than waiting for reconnect timers.

## Test Data Rules
- Use numeric camera technicalIdentifier values for take-trigger matching tests.
- Include at least one non-numeric technicalIdentifier case.
- Use distinct show statuses (live and draft) to verify prioritization.
- Build helper factory functions so each test only declares scenario-specific differences.

## Priority 1: Reconnect Behavior
1. vMix reconnect re-subscribes tally
- Given active vMix mode and connected persistent connection.
- When a reconnect cycle occurs (connect emitted again on the same connection object).
- Then SUBSCRIBE TALLY is sent again.
- Then tally events continue to trigger processing after reconnect.

2. vMix reconnect does not duplicate tally listeners
- Given connection established and tally listener attached.
- When connect is emitted multiple times.
- Then exactly one tally listener remains attached.
- Then one tally event results in one take attempt.

3. vMix disposal detaches listeners and ignores stale events
- Given a connected vMix persistent connection.
- When settings change to disable/switch mixer and old connection emits tally/connect afterward.
- Then stale events do not trigger takeShow.

4. ATEM reconnect on host/port change
- Given ATEM mode with established connection.
- When host or port changes.
- Then old client disconnect/destroy is called and a new connection is attempted.

5. ATEM reconnect on M/E change
- Given ATEM mode with established connection and atemMe updated.
- When settings are saved.
- Then old client is disposed and connection is re-established for the new effective configuration.

## Priority 1: Take Trigger Behavior
1. vMix swap detection triggers take
- Given previous program/preview and next tally indicates exact swap.
- When tally event is emitted.
- Then takeShow is called once with the matching showId.

2. vMix non-swap transition does not trigger take
- Given previous and current inputs that are not a swap pair.
- When tally event is emitted.
- Then takeShow is not called.

3. ATEM swap detection triggers take
- Given prior mixEffect program/preview snapshot exists.
- When stateChanged provides swapped values for configured M/E.
- Then takeShow is called once.

4. ATEM wrong M/E does not trigger take
- Given configured atemMe = X.
- When only other M/E buses change.
- Then takeShow is not called.

5. Matching prefers live show
- Given two shows map to the same program input and one is live.
- When swap-triggered take is processed.
- Then the live show is selected.

6. No match yields no take
- Given no show has matching next cue technicalIdentifier for program input.
- When swap event is processed.
- Then takeShow is not called.

## Priority 2: Guardrail Coverage
1. ATEM preview update ignores non-numeric technicalIdentifier
- Given ATEM mode and non-numeric next cue technicalIdentifier.
- When sync preview is triggered.
- Then changePreviewInput is not called.

2. Show lookup query constraints
- Given mix of live/draft/archived shows, some with null nextCueId.
- When resolving show for input.
- Then only expected candidates are considered and outcome is deterministic.

3. Reconnect status reporting sanity
- Given active mode and in-progress connect promise.
- When getVideoMixerConnectionStatus is called.
- Then state is connecting; after connect, state is connected.

## Execution Order
1. Build reusable mocks and DB fixture helpers.
2. Implement Priority 1 reconnect tests.
3. Implement Priority 1 take-trigger tests.
4. Add Priority 2 guardrails.
5. Stabilize and run under repeated executions to check flakiness.

## CI Recommendation
- Add a test script dedicated to this suite first:
  - vitest run tests/integration/video-mixer
- Once stable, fold into the standard CI test step.

## Exit Criteria
- All Priority 1 tests implemented and green.
- At least two Priority 2 tests implemented and green.
- A failing test is added before any future reconnect/take-trigger bug fix, then turned green by the fix.

## Notes For Future Changes
When modifying video mixer automation, require updates in three places together:
- Connection lifecycle handling.
- Swap detection and take-trigger logic.
- Integration tests in tests/integration/video-mixer/.
