# Contributing

Thanks for taking the time to improve `dsh-usage-unified`.

## What this project is

A DSH plugin that reads every session log on the machine and renders one usage dashboard (trends, per-model split, session ranking, exports, optional local cost estimate).

## Stack

TypeScript, Node ^22.19 || >=24, npm. Build output in `lib/` is committed and must match the source.

## Development setup

```bash
git clone https://github.com/satan9394/dsh-usage-unified.git
cd dsh-usage-unified
npm ci
```

## Before you open a PR

Run the same checks CI runs:

```bash
npm run typecheck
npm test
npm run build
git diff --exit-code -- lib   # committed build output must match source
```

`npm run smoke:local` and `npm run verify:realdata` read this machine's real `~/.dsh` data; they are local-only and are not expected to run in CI.

## Workflow

1. Open an issue first for anything larger than a typo — describe the problem, the expected behaviour and how you reproduced it.
2. Fork the repository and branch from `main` (`fix/...`, `feat/...`, `docs/...`).
3. Use Conventional Commits (`fix(index): ...`, `feat(ui): ...`, `docs: ...`).
4. In the PR, state the motivation, the checks you ran, and any user-visible behaviour change. Screenshots help for UI changes.
5. Keep changes focused: one concern per PR.

## Code conventions

- TypeScript strict mode; no `any` unless the surrounding code already does it and the reason is documented.
- New behaviour needs a test. Bug fixes should include a regression test that fails without the fix.
- Do not edit `lib/` by hand — run `npm run build` and commit the regenerated output together with the source change.
- Keep the plugin network-free: it reads local session logs only.

## Security

Please do not open a public issue for a vulnerability. Use the private channel described in [SECURITY.md](SECURITY.md).
