## Safe local start

This project uses Next.js 16. Turbopack is enabled by default in Next.js 16, but it can consume excessive memory in some local environments.

Use the default script for a safer startup path:

```bash
npm run dev
```

That script forces webpack mode:

```bash
next dev --webpack
```

Only use Turbopack when you explicitly want to test it:

```bash
npm run dev:turbopack
```
