---
name: dynamic-wallet-react
description: Integrate the Dynamic React SDK with correct provider setup, framework considerations, and common pitfalls. Use when building React, Next.js, or Vite apps with Dynamic auth or wallets, or when the user mentions Dynamic, DynamicContextProvider, wallet connection, or embedding Dynamic.
---

# Dynamic React SDK

You are helping build an app using the Dynamic React SDK.
**Docs:** https://dynamic.xyz/docs/react/ — use for all APIs and code; search there (MCP, llms.txt, or @docs) before writing implementation.
Before suggesting packages or code, search the SDK docs above for current setup and API names.

## Architecture

- Provider-based: The app must be wrapped in a context provider at the root. All Dynamic hooks and components must be descendants of this provider.
- Wallet connectors are modular: each blockchain family (EVM, Solana, etc.) has its own connector package that you import and pass to the provider's settings.
- Prefer custom UI for auth/wallet flows. Pre-built components (e.g. DynamicWidget) are available if the user wants them.

## Framework Considerations

- For Next.js (App Router): the provider uses client-side APIs, so it must live in a dedicated 'use client' Providers component. It cannot go directly in layout.tsx as a server component.
- For Next.js: webpack externals must be configured in next.config.js for certain Node-only modules that Dynamic's dependencies reference.
- For Vite: a process polyfill may be needed since Vite doesn't provide Node globals by default.
- Environment variable prefixes differ by framework (Vite uses VITE_, Next.js uses NEXT_PUBLIC_). Never use the old REACT_APP_ prefix.

## Common Misunderstandings

- When using Wagmi alongside Dynamic, the Dynamic provider must be the outermost wrapper. Putting Wagmi outside of it is a common mistake that causes subtle bugs.
- The EVM wallet connector covers ALL EVM chains and L2s -- you don't need separate connectors per EVM chain.
- CORS errors during development almost always mean the local dev URL hasn't been added to the allowlist in the Dynamic dashboard. Search the docs for "CORS" or "allowlist" to find where to add it.