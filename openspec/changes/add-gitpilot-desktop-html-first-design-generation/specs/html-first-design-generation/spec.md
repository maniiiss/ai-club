## ADDED Requirements

### Requirement: Design runs SHALL use staged HTML-first jobs

The sidecar SHALL represent an initial Design run as ordered stages for design system, shared components, screen planning, screen generation and settlement. Independent screens SHALL be allowed to run concurrently, while each screen SHALL expose bounded visual-region jobs. The initial path SHALL NOT require a Pi ReAct tool call to decide the next stage.

#### Scenario: Start an initial design run

- **WHEN** Desktop sends a valid `design_prompt` for an existing page
- **THEN** the sidecar emits a run-start event, creates the page/frame metadata, and starts design-system and component planning stages before screen-region generation

#### Scenario: Generate independent screens concurrently

- **WHEN** a screen plan contains two or more screens without dependencies
- **THEN** the sidecar starts their screen jobs concurrently and emits separate progress and settlement events for each screen

### Requirement: HTML preview artifacts SHALL be first-class run outputs

Each generated screen or region SHALL be able to publish a validated HTML artifact before its screenshot is ready. The screenshot SHALL be treated as a derived artifact rendered from that HTML and SHALL NOT be the canonical editable scene.

#### Scenario: HTML becomes ready before screenshot

- **WHEN** a region passes HTML validation but screenshot rendering is still running
- **THEN** the sidecar emits `design_artifact_ready` with `kind: html`, and Desktop displays the region preview without waiting for the screenshot

#### Scenario: Download a generated screen

- **WHEN** the user requests an HTML or screenshot download for a settled screen
- **THEN** the sidecar returns the persisted artifact associated with the screen/run and does not regenerate the design

### Requirement: HTML previews SHALL render inside a restricted sandbox

The system SHALL sanitize generated HTML, reject unsafe protocols and event handlers, enforce a document/resource limit, and render it in a context without access to local files, Shell, Tauri commands, Desktop RPC bridges or arbitrary URL proxying. A Content Security Policy and resource allowlist SHALL be applied to every preview.

#### Scenario: Generated HTML contains unsafe behavior

- **WHEN** HTML contains a `javascript:` URL, inline event handler, unapproved iframe or local file reference
- **THEN** the sidecar rejects or removes the unsafe construct before persistence and emits a structured region error

#### Scenario: External resource fails

- **WHEN** an allowed font, icon or image resource times out or returns an error
- **THEN** the renderer uses the configured fallback resource, marks the affected node as degraded, and allows other regions to continue

### Requirement: Generated elements SHALL expose stable DOM locators

Every editable component root SHALL include a unique `data-gitpilot-node-id`; every visual region SHALL include a `data-gitpilot-region-id`. Locator identity SHALL be based on semantic IDs and screen identity, not DOM order, random CSS class names or pixel coordinates. The sidecar SHALL persist locator-to-Canvas-node mappings and the HTML source hash.

#### Scenario: Locate an element for a follow-up edit

- **WHEN** an edit references a known `data-gitpilot-node-id`
- **THEN** the sidecar resolves the exact element and returns a structured DOM operation target with its region and source hash

#### Scenario: Locator is duplicated or missing

- **WHEN** a generated region contains duplicate IDs or an edit references a locator that does not exist
- **THEN** the sidecar rejects that region/edit with a conflict and does not apply a fuzzy or coordinate-based fallback

### Requirement: Region progress SHALL be observable and ordered

The protocol SHALL provide events for screen creation, region start, HTML readiness, Canvas mirror readiness, screenshot readiness and screen settlement. Every event SHALL carry project, design, request, run and monotonically increasing sequence metadata. Repeated operation IDs or stale sequences SHALL be idempotently ignored.

#### Scenario: Render a region progressively

- **WHEN** a region transitions from started to HTML-ready to Canvas-ready
- **THEN** Desktop displays the latest accepted state at each transition and does not wait for the full screen to settle

#### Scenario: Receive a duplicate event

- **WHEN** Desktop receives an event with a sequence at or below the last accepted sequence or an already applied operation ID
- **THEN** it ignores the event without duplicating nodes, revisions or progress entries

### Requirement: HTML SHALL have a bounded Canvas mirror

The system SHALL convert the supported HTML subset into editable Canvas nodes for containers, common flex/absolute layouts, text, buttons, inputs, images, icons, backgrounds, borders, radius, opacity and simple shadows. Unsupported CSS effects SHALL remain in HTML preview and SHALL be marked read-only instead of being approximated silently.

#### Scenario: Convert a supported region

- **WHEN** a region contains supported container, text, button and icon elements with valid computed bounds
- **THEN** the sidecar emits a `design_patch_applied` Canvas transaction whose nodes retain locator, source hash and editable metadata

#### Scenario: Convert an unsupported effect

- **WHEN** a region contains a CSS effect outside the supported mirror subset, such as a complex filter or pseudo-element
- **THEN** HTML preview remains available, the affected Canvas representation is marked read-only, and other supported nodes are still mirrored

### Requirement: Initial generation and follow-up editing SHALL use different execution modes

Initial HTML-first generation SHALL use structured model calls without Design custom tools. Existing Pi AgentSession tools SHALL remain available for follow-up edits, clarification, approval and repair after a run has produced a screen.

#### Scenario: Generate the first screen

- **WHEN** an initial run starts
- **THEN** the model receives a constrained schema prompt and returns stage output without calling `design_read_scene`, `design_apply_patch` or planning tools

#### Scenario: Modify an existing screen

- **WHEN** the user asks to change a generated button, text or component
- **THEN** the system may start a follow-up AgentSession that uses the locator and `design_apply_patch`, subject to revision and source-hash checks

### Requirement: HTML and Canvas state SHALL be journaled and recoverable

The sidecar SHALL persist validated HTML state, artifact metadata and Canvas mirror operations before emitting their corresponding events. `design_open` SHALL report active, orphaned or absent drafts; keep SHALL create an interrupted revision from accepted work, and discard SHALL remove draft artifacts and restore the canonical scene.

#### Scenario: Sidecar restarts after an accepted region

- **WHEN** the sidecar restarts after HTML and Canvas journal entries were written but before settlement
- **THEN** `design_open` returns the draft run, last sequence and accepted regions so Desktop can resume or request keep/discard recovery

#### Scenario: Discard an orphaned draft

- **WHEN** the user chooses `discard` for an orphaned run
- **THEN** draft HTML, screenshot artifacts, mirror operations and checkpoints are deleted, and the canonical revision remains unchanged

### Requirement: AI visual feedback SHALL be anchored to real work

Desktop SHALL anchor the AI cursor or pen indication to the active region bounds or the latest accepted node/dirty rectangle. It SHALL NOT draw a free-floating path when no region job or accepted patch provides an anchor. RAF scheduling SHALL merge HTML preview state, Canvas patches, selection changes and pointer movement into bounded frames.

#### Scenario: Region has an active generation job

- **WHEN** `design_region_started` includes a valid region rectangle
- **THEN** Desktop displays the progress indicator within that region and moves it only according to accepted region or node updates

#### Scenario: No generation anchor exists

- **WHEN** a run is thinking without a region boundary or has been interrupted
- **THEN** Desktop displays textual run status or a static indicator and does not render a random canvas stroke
