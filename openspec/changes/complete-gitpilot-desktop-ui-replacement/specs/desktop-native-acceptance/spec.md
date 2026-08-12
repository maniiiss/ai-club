## ADDED Requirements

### Requirement: Native window matrix is mandatory
The target UI SHALL pass native Tauri validation at 1100×720, 1440×900 and 800×500 before replacement is considered complete.

#### Scenario: Validate supported window sizes
- **WHEN** the target UI is opened at each required size
- **THEN** title bar, navigation, conversation, input, execution panel, bottom panel and status bar remain usable without unintended overflow
- **AND** a reference screenshot is recorded for each size

### Requirement: Core desktop interactions are verified
The acceptance run MUST verify window controls, project and task actions, scrolling, drag and drop, model selection, execution inspection, overlays, terminal and tray recovery.

#### Scenario: Complete interaction checklist
- **WHEN** a release candidate is evaluated in the native application
- **THEN** every core interaction has a recorded pass or actionable failure
- **AND** build success alone cannot mark the replacement complete

### Requirement: Automated harness protects behavior
The replacement SHALL include component or contract tests for the app lifecycle, panel state, sidebar actions, long-content handling, overlay focus and keyboard shortcuts.

#### Scenario: Run Desktop harness
- **WHEN** Desktop tests execute
- **THEN** they verify target UI behavior without changing RPC or sidecar contracts
- **AND** failures identify the affected feature boundary

### Requirement: Release artifacts use the accepted UI
The Windows MSI and NSIS artifacts SHALL contain the same accepted target UI assets and configuration.

#### Scenario: Build Windows packages
- **WHEN** MSI and NSIS packages are generated after acceptance
- **THEN** both packages launch the target UI
- **AND** the packaged application passes title bar, tray, directory selection and sidecar startup smoke tests
