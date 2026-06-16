---
name: cross-agent-harness
description: Create or retrofit a repository with a cross-agent harness contract that works beyond Codex-specific runtime features. Use when Codex needs to add or improve AGENTS.md, docs/agent-harness-contract.md, architecture and design indexes, execution-plan folders, or a lightweight validation script so multiple coding agents can understand the same repository workflow.
---

# Cross-Agent Harness

## Overview

Use this skill to package repository-native harness guidance that remains readable to multiple coding agents, not just Codex. Keep the skill thin: use it to choose, copy, and adapt the template assets, while leaving the real long-term protocol in repository files.

## Workflow

1. Inspect the target repository for existing `AGENTS.md`, `docs/`, `scripts/`, and testing conventions.
2. Read `references/usage.md` before copying any template files.
3. Copy the minimal template from `assets/template/` into the target repository, adapting paths and commands to the project.
4. Keep `AGENTS.md` short and move durable rules into `docs/agent-harness-contract.md` and related docs.
5. Run `python scripts/validate_harness.py` in the target repository.
6. If the target repository keeps Python tests, run `python -m pytest tests/test_validate_harness.py -q`.

## Adaptation Rules

- Preserve the target repository's established architecture, commands, and directory naming where possible.
- Treat the template as a starting point, not a blind overwrite.
- Do not copy process caches or local runtime artifacts into the target repository.
- Keep platform-specific runtime language out of the repository protocol unless the target project explicitly wants it.
- If the repository already has architecture or planning docs, integrate with them instead of creating parallel systems.

## Resources

- Read `references/usage.md` for packaging and migration guidance.
- Copy from `assets/template/` when creating the repository-native harness structure.
