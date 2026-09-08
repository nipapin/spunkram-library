# Project skills

Installed into `.cursor/skills/` from public Agent Skills catalogs ([skills.sh](https://skills.sh)). Cursor loads them on demand from the `description` field.

`cep-react-panel` is local: it maps those catalogs onto this Bolt CEP repo.

## Installed

| Skill | Source | Use when |
|-------|--------|----------|
| `cep-react-panel` | this repo | Any panel / host / brand / SDK work |
| `vercel-react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) MIT | React performance: grids, previews, bundle, rerenders. Skip Next `server-*` rules here |
| `vercel-composition-patterns` | same | Context providers, boolean-prop APIs, React 19 (`ref` as prop, no `forwardRef`) |
| `web-design-guidelines` | same | UI/a11y/UX review of existing screens |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills) Apache-2.0 | Distinctive UI. Keep Gal / Spunkram tokens; do not invent a third look |
| `webapp-testing` | same | Playwright against `npm run serve` / Vite preview. Does **not** cover AE/PPro `evalScript` |
| `systematic-debugging` | [obra/superpowers](https://github.com/obra/superpowers) | Bugs and unexpected host/UI behavior — root cause before patches |
| `verification-before-completion` | same | Before claiming fixed/done |
| `writing-plans` | same | Multi-file features |
| `requesting-code-review` | same | After a non-trivial diff |

Lockfile: `skills-lock.json` at repo root.

## Intentionally not installed

Vercel deploy/optimize/React Native, Anthropic Academy/Claude API/docx/pptx, Superpowers TDD/worktrees/subagent-driven, Remotion, Azure, Lark. Wrong runtime or too heavy for this panel.

## Update

```bash
npx skills update -y
```

The CLI writes to `.agents/skills/`. Copy that tree over `.cursor/skills/` (keep `cep-react-panel`) so Cursor keeps a single copy.
