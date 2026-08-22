## 1. OpenSpec and shared protocol

- [x] 1.1 Create the independent change artifacts and validate the spec-driven change
- [x] 1.2 Extend Desktop and CLI Design event/command/response types with draft metadata, settle reason, recovery metadata, and `design_recover_draft`
- [x] 1.3 Add protocol compatibility tests for optional fields and old `isDraft`/`revisionId` events

## 2. Desktop draft reducer and frame scheduling

- [x] 2.1 Add committed/draft/transient/manualQueue state to the Design store with project/run/sequence/operation guards
- [x] 2.2 Add resynchronization through `design_open` after local patch reduction failure and authoritative settled replacement
- [x] 2.3 Implement `RenderScheduler` with injectable RAF, dirty-rect coalescing, visibility pause and unit tests
- [x] 2.4 Route CanvasKit board redraws through the scheduler and remove `toDataURL` from normal draw frames
- [x] 2.5 Add explicit asynchronous capture and update export/upload/settled preview callers

## 3. Manual drawing and queued edits

- [x] 3.1 Add pen tool transient sampling and canonical path transaction on pointerup
- [x] 3.2 Drop pen transient on pointercancel, blur and Escape; add board interaction tests
- [x] 3.3 Queue structural manual transactions while AI is active and drain FIFO after completed/interrupted settlement
- [x] 3.4 Add renderer tests proving transient geometry does not enter canonical scene or revision history

## 4. Sidecar journal and recovery

- [x] 4.1 Implement run-scoped draft journal, checkpoint/replay and atomic canonical settlement
- [x] 4.2 Ensure patch validation/dedupe/journal ordering precedes `design_patch_applied`
- [x] 4.3 Implement interrupted settlement on abort and orphaned draft keep/discard RPC
- [x] 4.4 Return draft metadata from `design_open` and update Agent prompt for small visual-area patch batches
- [x] 4.6 Normalize legacy Canvas node payloads at the sidecar/Desktop boundary and reject non-renderable canonical nodes
- [ ] 4.5 Add CLI integration tests for journal ordering, replay, idempotency, abort and recovery (当前已覆盖 Agent 异常 interrupted 收口、journal replay、orphaned keep/discard；active Agent patch/abort 仍需带真实凭据的 harness)

## 5. Documentation and verification

- [x] 5.1 Synchronize architecture and Design technical documentation with the implemented module boundaries
- [x] 5.2 Run Desktop tests/build, CLI tests/build, encoding check and targeted CanvasKit/RPC regression tests
- [x] 5.4 Add regression coverage for legacy rectangle/fill/text payloads and visible-scene diagnostics
- [ ] 5.3 Complete Windows Tauri smoke checks for burst patches, pen input, stop/reconnect, recovery and project switching (当前环境未提供可运行的 Tauri Windows 窗口)
