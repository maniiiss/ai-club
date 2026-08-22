## ADDED Requirements

### Requirement: Draft patch events are incrementally renderable

The Design RPC MUST emit each accepted Canvas transaction as a `design_patch_applied` event before the next accepted transaction, and MUST include stable `operationId`, `pageId`, `transaction`, `affectedNodeIds`, and optional `draftRevisionId`, `operationIndex`, and `dirtyRects` fields. The event MUST be emitted only after sidecar validation and draft journal append succeed.

#### Scenario: Accepted patch appears before run settlement

- **WHEN** an active Design run accepts a valid transaction
- **THEN** Desktop can reduce and render that transaction immediately without waiting for `design_run_settled`
- **AND** the transaction does not create a formal revision before settlement

#### Scenario: Duplicate patch is replayed

- **WHEN** the same `operationId` or an already consumed sequence is received again
- **THEN** Desktop ignores it without changing the draft scene or rendering a second transaction

### Requirement: Rendering is frame scheduled

Desktop MUST route patch, pointer, selection, and resource invalidations through one requestAnimationFrame scheduler. Multiple invalidations received before the frame MUST result in at most one scene draw and one CanvasKit surface flush.

#### Scenario: Burst of AI patches

- **WHEN** twenty patch events arrive before the next animation frame
- **THEN** all valid transactions are reduced first and the renderer flushes no more than once for that frame

#### Scenario: Explicit capture

- **WHEN** the user requests export, upload, screenshot, or settled preview capture
- **THEN** Desktop may asynchronously call `toDataURL`; ordinary draw frames MUST NOT call it

### Requirement: Manual pen input is transient until pointerup

Desktop MUST keep pointermove geometry out of undo, RPC and revision state. The pen tool MUST sample points with a screen-distance threshold and create one canonical `path` node transaction on pointerup. Pointercancel, window blur, and Escape MUST discard the transient stroke.

#### Scenario: Completed stroke

- **WHEN** the user draws a non-empty pen stroke and releases the pointer
- **THEN** the store submits exactly one `create_node(type=path)` transaction using canonical path commands

#### Scenario: Cancelled stroke

- **WHEN** the pointer is cancelled, the window loses focus, or Escape is pressed
- **THEN** no empty path node and no revision is created

### Requirement: Drafts are recoverable and settle atomically

Sidecar MUST keep active run operations under a run-specific draft journal and MUST write canonical `design.json` and the formal revision atomically only on completed or interrupted settlement. `design_open` MUST report active or orphaned draft metadata, and `design_recover_draft` MUST support keep/discard.

When an active draft is reported, `design_open` SHOULD include a one-time `draftSnapshot` so Desktop can resume from the journal's latest scene after reconnect without treating draft content as canonical or persisting it in localStorage.

#### Scenario: Interrupted run with accepted content

- **WHEN** `design_abort` stops a run that has accepted at least one patch
- **THEN** sidecar creates one `kind=interrupted` revision, emits `design_run_settled(reason=interrupted)`, and removes the draft journal after the canonical write succeeds

#### Scenario: Orphaned draft is discarded

- **WHEN** Desktop chooses `discard` for an orphaned draft
- **THEN** sidecar removes only that run's journal and returns the last canonical committed scene

### Requirement: Structural manual edits are serialized during AI runs

Desktop MUST allow navigation, selection, pan, zoom and Inspector viewing during an AI run. Structural manual transactions MUST be queued FIFO and MUST be revalidated against the latest settled revision before submission.

#### Scenario: Manual queue drains after settlement

- **WHEN** an AI run settles and three structural manual transactions are queued
- **THEN** Desktop submits them in original order against the latest revision and stops at the first failure while retaining unsubmitted transactions

### Requirement: Settled snapshots are authoritative

`design_run_settled` MUST replace the local draft with the returned canonical snapshot. If local draft reduction fails, Desktop MUST stop applying subsequent patch events and request a fresh `design_open` snapshot before resuming.

#### Scenario: Local reduction failure

- **WHEN** a patch cannot be applied to the local draft scene
- **THEN** Desktop enters resynchronizing state, does not apply later patches locally, and converges to the next authoritative snapshot

### Requirement: Canvas payloads are renderable at the boundary

Sidecar MUST normalize supported legacy Canvas node payloads before validation and persistence, including `rectangle` to `rect`, default visibility/layout fields, legacy fill/stroke/radius fields, and string text values. After normalization, sidecar MUST reject unsupported node types or nodes missing required transform/layout state with an actionable error. Desktop MUST apply the same compatibility normalization to snapshots from older sidecars.

#### Scenario: Legacy generated scene is opened

- **WHEN** a scene contains legacy rectangle, top-level fill, missing visibility/layout, or string text fields
- **THEN** the opened scene is converted to canonical CanvasDesignDocument nodes and becomes drawable without manual file editing

#### Scenario: Unsupported node is submitted

- **WHEN** a patch submits a node type that CanvasKit does not support
- **THEN** the patch is rejected before journaling or event emission with the node ID and supported type guidance

### Requirement: Design icons have a renderable semantic representation

Design Agent MUST represent interface icons as `type: "icon"` nodes with an `icon.name` and optional library, weight, color or 24×24 custom SVG path. Sidecar and Desktop MUST preserve and normalize this semantic payload, and CanvasKit MUST resolve built-in names or custom paths into vector drawing commands without requiring a React component or image asset.

#### Scenario: Generated navigation icon is visible

- **WHEN** an Agent patch creates an icon node named `home`, `search`, `heart`, `user`, `settings` or another supported built-in name
- **THEN** Desktop renders the icon during the same draft RAF cycle as the patch and the node remains selectable in the layer tree

#### Scenario: Unknown icon name does not disappear silently

- **WHEN** a patch supplies an unknown icon name without a custom path
- **THEN** Desktop renders a visible question/fallback glyph and keeps the original semantic name for later correction

### Requirement: Design Agent first-patch latency is bounded

For a simple single-page request, Design Agent MUST be allowed to submit element patches without a mandatory planning-tool round trip. Before the first model patch, the sidecar MUST create a stable page container with target dimensions (1440×900 for an empty infinite canvas unless a finite page already defines its dimensions). The default Design session SHOULD use a low reasoning level (while preserving an explicit `off` setting), avoid loading Web search tools unless the request explicitly asks for external references or assets, and send a compact page-scoped scene summary instead of the full multi-page node set. Subsequent element refinement MUST be limited to a small number of visual-area batches rather than one model call per node.

#### Scenario: Simple page request gets an early page container

- **WHEN** the user submits a simple single-page Design request
- **THEN** the sidecar emits a first `design_patch_applied` transaction that creates the page container with stable width and height
- **AND** Desktop can render that container before the first model element patch arrives
- **AND** the first model patch contains primary navigation or content elements instead of recreating the page container

#### Scenario: External reference is explicit

- **WHEN** the user explicitly asks for a website, screenshot, reference image or online asset
- **THEN** Design may load and use the Web tools for that run; otherwise Web search tools are not included in the default Design tool context

#### Scenario: Existing canvas is large

- **WHEN** the user starts a Design run on one page of a large multi-page canvas
- **THEN** the initial model context contains a bounded summary of nodes reachable from the target page root
- **AND** the Agent can explicitly read the scene if cross-page details are required
