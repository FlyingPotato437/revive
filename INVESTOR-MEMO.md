# Revive — Investment Memo (one-pager)

*Run-level dead-reauth-resume for long-running agents.*
Seed · Pre-product-market-fit · June 2026

---

### Thesis
Unattended AI agents now run for days and **outlive their OAuth refresh tokens**.
When the refresh token dies mid-run, the run silently breaks — and *re-authenticating
doesn't repair the live run.* Revive is the neutral sidecar that classifies the
token death, checkpoints the exact step, routes an out-of-band re-consent, and
**hot-splices a fresh token back into the same run** so it resumes with no restart.

### Problem (real, primary-sourced, unsolved)
The failure is filed verbatim across every major agent runtime — all **open**:
- **OpenAI Codex #14144** — after a *successful* re-auth, the same session keeps failing `invalid_grant`.
- **Claude Code #12447 / #28827** — OAuth token expires during long autonomous tasks; halts, needs a restart.
- **GitHub Copilot CLI #2779** — tokens expire mid-autopilot (`AADSTS9010010`); manual reload required.

The cost: silent data loss, 3am pages, and re-running multi-hour jobs from zero.

### Why now
1. Agents only recently became long enough to **outlive refresh-token rotation** (Entra 90-day inactivity; Google 6-month).
2. **MCP elicitation (spec 2025-11-25)** just standardized URL-mode out-of-band re-consent — the transport Revive's step 3 needs.
3. Durable-execution checkpointing went mainstream — the rails are finally there to splice onto.

### Product (built, runs today)
A drop-in sidecar (`pip install revive-sidecar`, zero-dep core) with a real
LangGraph adapter using LangGraph's own `interrupt()`/checkpointer. Demonstrated
recovering a real LangGraph agent on the same thread, 0 restarts. The four-part
splice: **classify → checkpoint → re-consent → splice.**

### The wedge & moat
The fix lives between two funded categories, and **neither side's roadmap reaches the middle**:
- **OAuth-lifecycle vendors** (Scalekit, Nango, Arcade) detect a dead token but operate at the *connection* level — Scalekit's own docs: dead tokens *"must be reauthorized,"* full stop. No run resume.
- **Durable-execution** (Temporal, Trigger.dev, Restate) resume the same run — but have **no auth-death trigger and no re-consent.**
- **WorkOS publicly admits** the MCP 2025-11-25 spec *"does not address resuming agent runs after token death, or hot-splicing new tokens."*

Moat = the compounding **per-provider error→recovery corpus** + the **neutral cross-framework** position neither category occupies. Validation: 3 independent adversarial analysts could **not** find a shipping product that does the full splice (0/3 refuted).

### Market
Bottoms-up: every team running unattended Graph/Workspace automation on a durable
framework. The adjacent thesis is hot — **Arcade $60M A (Jun 2026), Composio $25M A,
Scalekit $5.5M, Nango $7.5M, Stytch→Twilio** (for an "intelligent identity layer for AI
agents"). Capital is landing on the two sides of the splice; the splice itself is open.

### Go-to-market
1. **Design partners from the bug threads** — a pre-qualified list of people feeling this weekly. "We built the fix."
2. **Open-source core** (classifier + adapters) for distribution & trust; monetize hosted re-consent routing, the corpus, dashboards, SSO.
3. Land on Microsoft Graph, expand to Workspace/Slack/OIDC; expand product from `auth` to any out-of-band human input (**Parley** — approvals, step-up, missing input — same engine, already in code).

### Risks (honest)
- **"Feature, not a company."** → Answer: the park-route-resume engine generalizes to all human-in-the-loop (Parley); the corpus compounds; neutrality is structural.
- **Hyperscalers adjacent** (Google ADK pause/resume, AWS AgentCore Identity) could reach across. → Win the neutral cross-cloud position and the standard before they do.
- **Provider taxonomies shift.** → That's the moat: maintaining the corpus is the work nobody else wants to own.

### The ask
Raising a seed to: hire 2 infra engineers, ship Graph + Workspace GA + the Temporal
adapter, land 10 design partners into paid, and open-source the core.

---

## Pitch deck outline (10 slides)

1. **Title** — Revive: when the refresh token dies, the run shouldn't.
2. **The moment of pain** — the Codex/Claude Code/Copilot bug quotes on screen.
3. **Why it's unsolved** — the two-category diagram; nobody owns the splice.
4. **Demo** — live: a real LangGraph agent dies on a dead token and self-heals, 0 restarts.
5. **Why now** — token rotation × long-running agents × MCP elicitation × durable execution.
6. **Product** — the four-part splice; drop-in sidecar; the recovery corpus.
7. **Moat** — neutral cross-framework + compounding per-provider corpus; 0/3 refutation.
8. **Market & GTM** — bottoms-up TAM; bug-thread design partners; OSS-led distribution.
9. **Wedge → platform** — Revive (auth) → Parley (any out-of-band human input).
10. **Team & ask** — why us; the raise and the 18-month plan.
