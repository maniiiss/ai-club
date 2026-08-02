## ADDED Requirements

### Requirement: Styles have one ownership layer
Every visual property SHALL be owned by exactly one of the semantic token layer, the UI primitive layer or the feature-local style layer.

#### Scenario: Adjust sidebar row width
- **WHEN** a developer changes the width, truncation or action area of a sidebar row
- **THEN** the change is contained in the navigation feature styles
- **AND** no global Legacy selector or unrelated primitive override is required

### Requirement: Target UI is visually distinct
The target UI SHALL implement the Graphite Workbench hierarchy for navigation, reading, execution and status surfaces instead of preserving the Legacy page composition.

#### Scenario: Compare target screenshot with baseline
- **WHEN** target and Legacy screenshots are captured at the same supported window size
- **THEN** panel hierarchy, navigation rows, conversation treatment, input surface and execution treatment visibly follow the target design

### Requirement: Long content remains within its region
Project names, task names, model names, paths, command summaries and status labels MUST remain within their current container width without displacing fixed controls.

#### Scenario: Render a long task name
- **WHEN** a task label exceeds the available sidebar width
- **THEN** the label is truncated with an ellipsis
- **AND** action buttons remain visible in their fixed action area
- **AND** hover or keyboard focus exposes the complete label

### Requirement: Primitive behavior is accessible
Buttons, menus, dialogs, sheets, commands and resizers SHALL provide visible focus, keyboard operation, accessible labels and reduced-motion behavior.

#### Scenario: Navigate icon controls by keyboard
- **WHEN** a keyboard user focuses title bar, sidebar or execution icon controls
- **THEN** each control has a visible focus indicator and an accessible name
- **AND** activation performs the same action as pointer input

### Requirement: Global style debt is removed
Production feature components MUST NOT depend on old `--color-*` aliases, Legacy business selectors or unscoped `!important` rules.

#### Scenario: Run cleanup audit
- **WHEN** the final style audit runs
- **THEN** reverse search finds no Legacy token references or Legacy business selectors in target components
- **AND** any remaining third-party override is isolated and documented
