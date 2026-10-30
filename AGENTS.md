# dogma-labs-school: agent brief

**Dogma Labs School** is Benny's fork of [THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (MIT), an open-source multi-agent AI classroom: one prompt in, a whole course out (slides, quizzes, interactives, narration, a Pro agent workbench). The plan is a paid, per-user AI classroom on a dogmalabs.tech subdomain.

- **Status: parked.** The fork has no Dogma Labs commits yet: `main` is upstream as of 2026-09-17 (`a8726ec4`). No service runs it, and nothing is deployed.
- Below its header, `README.md` is upstream's text and still says "OpenMAIC". The npm package is still named `openmaic`.

## Stack

Next.js 16 · React 19 · TypeScript 5 · LangGraph · Tailwind 4 · pnpm 10 workspace (`packages/`) · Node >= 22.19 (`.nvmrc` says 22) · Vitest · Playwright.

## Commands

```bash
pnpm install        # postinstall builds every workspace package in packages/
pnpm dev            # next dev
pnpm build          # asserts the vendored maic importer, then next build
pnpm lint           # eslint
pnpm check          # prettier --check
pnpm test           # vitest run (the full suite, T2)
pnpm test:fast      # only the vitest tests your change touches (T1); full suite when it can't tell
pnpm test:e2e       # playwright
```

Tests run on Benny's ROG, not on homebase. From the repo root, use `crabbox run -- pnpm test:fast` while working and `crabbox run -- pnpm test` once on the final commit. `pnpm test:fast --dry-run` prints the plan; `--base=<ref>` compares against another ref; playwright stays T2 (`pnpm test:e2e --only-changed`). Script: `scripts/test-fast.mjs`.

Docker: `Dockerfile` and `docker-compose.yml` are upstream's.

## Environment

Copy `.env.example` to `.env.local`. At least one LLM provider key is needed to generate anything.

## Key folders

- `app/`: Next.js routes (`classroom/`, `workbench/`, `workspace/`, `generation-preview/`, `api/`).
- `lib/`: everything else, including `agent/`, `agent-runtime/`, `orchestration/`, `ai/` (providers), `pbl/`, `quiz/`, `whiteboard/`, `video-export/`, `storage/` and `i18n/`.
- `packages/`: workspace packages (`@openmaic/*`, `pptxgenjs`, `mathml2omml`, `docs`), built by `postinstall`.
- `render-service/` is the video render service, `skills/` holds the built-in course skills and `eval/` holds the model eval harnesses (`pnpm eval:*`).
- `tests/` (Vitest) and `e2e/` (Playwright).

## Repo facts

- Public repo (a GitHub fork). Default branch is `main`. The ~200 remote branches are upstream's, not ours.
- Issues are disabled on the GitHub fork (checked with the GitHub API, 2026-10-28).
- `vercel.json` is upstream's. There is no Dogma Labs deployment.
- `origin` is https://github.com/DogmaLabsTech/dogma-labs-school (a fork of THU-MAIC/OpenMAIC).

**Memory:** this project's rules and lessons are not in this file. They come from the start-of-session hook, the brain `memory` tool, or `brain memory dogma-labs-school "<task>"`.
