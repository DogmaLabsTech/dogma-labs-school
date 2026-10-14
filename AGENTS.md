# dogma-labs-school — agent brief

**Dogma Labs School** is Benny's fork of
[THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) (MIT), an
open-source multi-agent AI classroom: one prompt in, a whole course out
(slides, quizzes, interactives, narration, a Pro agent workbench). The plan is
a paid, per-user AI classroom on a dogmalabs.tech subdomain.

- **Status: parked.** The fork has no Dogma Labs commits yet: `main` is
  upstream as of 2026-09-17 (`a8726ec4`). No service runs it, and nothing is
  deployed.
- **The upstream clone is gone.** The read-only `Projects/OpenMAIC` clone was
  deleted on 2026-10-14; this fork is the only local copy. To compare with
  upstream, add it as a remote (`git remote add upstream
  https://github.com/THU-MAIC/OpenMAIC.git`) and never push to it.
- Below its header, `README.md` is upstream's text and still says "OpenMAIC".
  The npm package is still named `openmaic`.

## Stack

Next.js 16 · React 19 · TypeScript 5 · LangGraph · Tailwind 4 · pnpm 10
workspace (`packages/`) · Node >= 22.19 (`.nvmrc` says 22) · Vitest ·
Playwright.

## Commands

```bash
pnpm install        # postinstall builds every workspace package in packages/
pnpm dev            # next dev
pnpm build          # asserts the vendored maic importer, then next build
pnpm lint           # eslint
pnpm check          # prettier --check
pnpm test           # vitest run
pnpm test:e2e       # playwright
```

Tests run on Benny's ROG, not on homebase. From the repo root, use
`crabbox run -- pnpm test`.

Docker: `Dockerfile` and `docker-compose.yml` are upstream's.

## Environment

Copy `.env.example` to `.env.local`. Every LLM provider is optional (OpenAI,
Anthropic, Google, DeepSeek, Qwen, Kimi, MiniMax, GLM, Azure and others), but
at least one key is needed to generate anything. Never commit keys.

## Key folders

- `app/`: Next.js routes (`classroom/`, `workbench/`, `workspace/`,
  `generation-preview/`, `api/`).
- `lib/`: everything else, including `agent/`, `agent-runtime/`,
  `orchestration/`, `ai/` (providers), `pbl/`, `quiz/`, `whiteboard/`,
  `video-export/`, `storage/` and `i18n/`.
- `packages/`: workspace packages (`@openmaic/*`, `pptxgenjs`,
  `mathml2omml`, `docs`), built by `postinstall`.
- `render-service/` is the video render service, `skills/` holds the built-in
  course skills and `eval/` holds the model eval harnesses (`pnpm eval:*`).
- `tests/` (Vitest) and `e2e/` (Playwright).

## Rules and gotchas

- Public repo (a GitHub fork). Default branch is `main`. The ~200 remote
  branches are upstream's, not ours.
- `.github/workflows/` are upstream's (CI, package publishing, issue triage).
  Check them before pushing, because some of them publish packages.
- Keep Dogma Labs changes easy to rebase on upstream: small, separate
  commits and no mass reformatting.
- Issues are disabled on the GitHub fork.
- `vercel.json` is upstream's. There is no Dogma Labs deployment.

## Remote

`origin` is https://github.com/DogmaLabsTech/dogma-labs-school (a fork of
THU-MAIC/OpenMAIC).
