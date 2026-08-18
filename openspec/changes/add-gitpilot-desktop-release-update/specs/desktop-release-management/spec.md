## ADDED Requirements

### Requirement: Admin can manage desktop releases separately from platform announcements
The system SHALL provide an independent desktop release domain with DRAFT, PUBLISHED and REVOKED states, stable channel metadata, release notes, publisher and publication timestamps.

#### Scenario: Create a desktop release draft
- **WHEN** an authorized administrator submits a unique semver version and stable channel metadata
- **THEN** the backend creates a DRAFT release and returns its identifier and normalized metadata

#### Scenario: Reject duplicate channel version
- **WHEN** an administrator submits a version already used by the same channel
- **THEN** the backend rejects the request without creating a second release

#### Scenario: Published release is immutable
- **WHEN** an administrator attempts to edit a PUBLISHED release
- **THEN** the backend rejects mutation and requires a new release version

### Requirement: Admin can upload and validate signed release artifacts
The system SHALL accept Windows x64 MSI, NSIS installer, updater archive and `.sig` artifacts through an authorized multipart API, stream them into private MinIO storage, and persist object metadata including size, content type and SHA-256.

#### Scenario: Upload artifact to a draft
- **WHEN** an authorized administrator uploads a supported artifact to a DRAFT release
- **THEN** the backend stores the object under a release-scoped key and returns artifact metadata without exposing the MinIO object key

#### Scenario: Publish with incomplete artifact matrix
- **WHEN** an administrator publishes a release missing an installer or updater signature for a supported bundle type
- **THEN** the backend rejects publication and leaves the release in DRAFT

#### Scenario: Reject artifact upload after publication
- **WHEN** an administrator uploads or replaces an artifact on a PUBLISHED release
- **THEN** the backend rejects the operation

### Requirement: Public updater manifest is compatible with Tauri 2
The system SHALL expose an unauthenticated updater endpoint that selects a higher PUBLISHED stable release by target, architecture and bundle type, returns `204 No Content` when no matching update exists, and otherwise returns Tauri dynamic manifest fields `version`, `notes`, `pub_date`, `url` and `signature`.

#### Scenario: No update is available
- **WHEN** a client checks with a current version equal to or newer than the latest matching release
- **THEN** the endpoint returns `204 No Content`

#### Scenario: Matching signed update is available
- **WHEN** a client checks with an older version and a matching Windows x64 bundle type exists
- **THEN** the endpoint returns the release metadata, a public artifact download URL and the exact stored `.sig` contents

#### Scenario: Unsupported target is requested
- **WHEN** a client checks for a platform, architecture or bundle type without a published artifact
- **THEN** the endpoint returns `204 No Content` and does not fall back to another platform artifact

### Requirement: Public downloads are limited to published artifacts
The system SHALL provide unauthenticated latest-release metadata and download URLs for the public `/gitpilot` page, while keeping MinIO private and refusing downloads for DRAFT or REVOKED releases.

#### Scenario: Public page loads latest stable release
- **WHEN** an unauthenticated client requests latest Windows x64 stable metadata
- **THEN** the response includes version, release notes, publication time, installer sizes, SHA-256 values and download URLs

#### Scenario: Revoked artifact download is requested
- **WHEN** a client requests an artifact belonging to a REVOKED release
- **THEN** the backend denies the request and does not issue a storage URL

### Requirement: Release administration is permission protected and auditable
The system SHALL protect desktop release write operations with dedicated permissions and record publish, revoke and artifact upload operations in the existing operation log mechanism.

#### Scenario: Unauthorized user publishes a release
- **WHEN** a user without desktop release management permission calls a publish endpoint
- **THEN** the backend returns a permission error and makes no state change

#### Scenario: Administrator revokes a release
- **WHEN** an authorized administrator revokes a PUBLISHED release
- **THEN** the release becomes REVOKED and the operation is recorded with the release identifier and actor
