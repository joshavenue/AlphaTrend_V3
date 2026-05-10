<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# AlphaTrend V3 Rules

This repo is the implementation frame for AlphaTrend V3.

Before changing behavior, read the canonical planning archive under:

```text
/Users/jojo/Desktop/V3/Markdowns/
```

Minimum read order:

1. `V3_Directory.md`
2. `Build_Instruction.md`
3. The relevant `Phase_*.md`
4. The relevant `V3_*_Contract.md`

Phase 0 is infrastructure-only. Do not add provider scoring, dashboard ranking,
alerts, portfolio logic, LLM stock-picking, social sentiment, or broker
execution unless a later phase contract explicitly authorizes it.

Development commands run on Hetzner inside `/srv/alphatrend`. The macbook may
keep a source mirror at `/Users/jojo/Desktop/V3/AlphaTrend_V3`, but provider
secrets must stay out of local files. Do not run npm, migrations, provider
smokes, jobs, or Vercel CLI commands from the macbook unless the runtime model
is explicitly changed.
