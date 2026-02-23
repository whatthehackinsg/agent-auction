# frontend/AGENTS.md

Apply root `AGENTS.md` first, then this file.

## Scope

This directory is the Next.js spectator UI.

- Framework: Next.js 16 (App Router)
- Styling: Tailwind v4
- UI/runtime libs include React 19, SWR, Framer Motion, GSAP, and Three/R3F.

## Commands

Run from `frontend/`:

```bash
npm run dev
npm run lint
npm run build
```

## Local Rules

- Preserve spectator/read-only product intent unless explicitly expanding scope.
- Keep chain-state reads aligned with deployed addresses and contract ABI fields.
- Reuse existing UI primitives and utility patterns before adding new ones.
- Keep data-fetching behavior predictable and resilient (loading/error states required).

## UI Style
- Theme: doodle-inspired, playful, and approachable.
- Theme: pixel art style with a modern twist (clean lines, vibrant colors).
- Follow existing design patterns and component styles for consistency.

## Verification

- There is no dedicated test script in this package right now.
- Required quality gate is `npm run lint && npm run build`.

## Pointers

- App routes: `frontend/src/app/`
- Shared hooks: `frontend/src/hooks/`
- Replay and settlement views: `frontend/src/app/auctions/[id]/`
