## ADDED Requirements

### Requirement: Desktop checks for updates without requiring login
GitPilot Desktop SHALL perform a delayed background update check after application startup and SHALL keep the check independent from Agent connection and platform login state.

#### Scenario: Startup check succeeds before login
- **WHEN** the application starts while the user is logged out and the public endpoint has no newer version
- **THEN** the application remains usable and does not show a blocking login or update error

#### Scenario: Offline startup
- **WHEN** the startup update check cannot reach the endpoint
- **THEN** the application continues starting and records no blocking error in the workbench

### Requirement: User can manually check and review an update
The Desktop settings UI SHALL provide a manual check action and SHALL display the new version, publication date, release notes and an explicit install confirmation before downloading.

#### Scenario: Manual check finds an update
- **WHEN** the user selects “检查更新” and a newer signed release is returned
- **THEN** the settings UI displays update details and offers an install action

#### Scenario: Manual check finds no update
- **WHEN** the user manually checks and the endpoint returns `204 No Content`
- **THEN** the UI reports that the current version is up to date

### Requirement: Desktop downloads and installs through the Tauri updater
After confirmation, Desktop SHALL use the Tauri updater to download with progress callbacks, install only after successful signature verification, and relaunch through the Tauri process plugin.

#### Scenario: Download and install signed update
- **WHEN** the user confirms a valid update and the download completes
- **THEN** the UI shows progress, Tauri verifies the signature, installs the update and relaunches the application

#### Scenario: Invalid signature
- **WHEN** the downloaded updater artifact fails signature verification
- **THEN** installation is aborted, the current application remains installed and the UI shows an actionable error

#### Scenario: Download failure
- **WHEN** the update download fails or is interrupted
- **THEN** the UI leaves the current version running and offers retry without corrupting local application data

### Requirement: Desktop protects active work during installation
The Desktop SHALL refuse to start installation while an Agent run is streaming or an application PowerShell session is active, and SHALL allow the user to retry after the application becomes idle.

#### Scenario: Agent is running
- **WHEN** an update is available while the Agent is streaming
- **THEN** the install action is disabled and the UI explains that the current run must finish or be stopped first

#### Scenario: Application is idle
- **WHEN** an update is available and no Agent or terminal activity is active
- **THEN** the user can confirm download and installation

### Requirement: Desktop update configuration is signed and environment safe
The release build SHALL compile the Tauri updater public key and production endpoint, SHALL never contain the private signing key, and SHALL disable real update calls in non-Tauri preview mode.

#### Scenario: Preview mode
- **WHEN** the React UI runs outside Tauri
- **THEN** update actions use a safe mock or explanatory unavailable state and do not invoke native updater APIs

#### Scenario: Release build configuration
- **WHEN** a release build is produced
- **THEN** the updater artifact generation flag, endpoint, public key and relaunch permission are present, while the signing private key is absent from tracked files and packaged resources
