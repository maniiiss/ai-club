## ADDED Requirements

### Requirement: Target UI uses an independent visual tree
GitPilot Desktop SHALL render a target workbench tree whose visual structure does not reuse the Legacy business shell.

#### Scenario: Select target UI
- **WHEN** the target Desktop UI is enabled during migration
- **THEN** the application renders the target title bar, workbench shell, navigation, conversation, execution and overlay composition
- **AND** it does not render Legacy business layout components inside that composition

### Requirement: Desktop lifecycle remains singular
The replacement SHALL preserve a single connection, event subscription and global shortcut lifecycle regardless of UI migration state.

#### Scenario: Mount target workbench
- **WHEN** the target workbench mounts
- **THEN** sidecar connection and global keyboard listeners are registered exactly once
- **AND** switching or replacing a visual region does not duplicate them

### Requirement: Business boundaries remain stable
The replacement MUST preserve the existing store actions, RPC messages, session files and Tauri command contracts.

#### Scenario: Switch project task
- **WHEN** a user selects a project task in the target navigation
- **THEN** the existing session switch action receives the same session path and cwd semantics as before replacement

### Requirement: Legacy implementation is removed after acceptance
The project SHALL remove the Legacy render tree, Legacy DOM selectors, old token aliases and the compatibility UI switch after all target regions pass acceptance.

#### Scenario: Complete migration cleanup
- **WHEN** all target UI regions pass automated and native acceptance
- **THEN** no production source references the Legacy UI switch or Legacy-only DOM class names
- **AND** rollback remains possible through scoped source-control commits
