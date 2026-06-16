# Cross-Agent Harness Skill Usage

## Purpose

This skill packages a repository-native harness protocol that can be understood by multiple coding agents. The skill itself is intentionally thin; the reusable value lives in the template files under `assets/template/`.

## When To Use

Use this skill when a repository needs one or more of the following:

- A short `AGENTS.md` entrypoint instead of a long, mixed-purpose file.
- A durable `docs/agent-harness-contract.md` that explains how agents should work in the repository.
- A stable architecture and design-document entry structure.
- An execution-plan area that keeps plans in the repository instead of in chat.
- A lightweight validation script that checks whether the harness structure exists.

## Packaging Model

Keep the split clear:

- `SKILL.md`: trigger conditions and usage workflow.
- `references/usage.md`: migration and packaging guidance.
- `assets/template/`: the actual repository files that should be copied or adapted.

Do not move the full repository protocol into `SKILL.md`. Other agents will never see that file unless Codex invokes the skill, so the durable protocol must stay in repository documents.

## Copy Strategy

When creating or retrofitting a target repository:

1. Start with `assets/template/AGENTS.md`.
2. Copy `assets/template/docs/`.
3. Copy `assets/template/scripts/validate_harness.py`.
4. Copy `assets/template/tests/test_validate_harness.py` only if the target repository can run Python tests or is willing to add them.
5. Edit commands, module maps, and architecture details to match the target repository.

## What To Customize

- Replace generic architecture text with the target repository's real modules and boundaries.
- Update validation commands in `AGENTS.md` and `docs/agent-harness-contract.md`.
- Update `docs/design-docs/index.md` to point at the repository's real design documents.
- If the repository already has plan folders, reuse them and align the template wording.

## What Not To Copy

- `.pytest_cache`
- `__pycache__`
- `.git`
- temporary local logs
- editor-specific caches

## Validation

After copying and adapting the template, run:

```powershell
python scripts/validate_harness.py
python -m pytest tests/test_validate_harness.py -q
```

If the target repository does not use Python tests, keep `validate_harness.py` and either:

- omit the test file, or
- port the tests to the repository's preferred harness.
