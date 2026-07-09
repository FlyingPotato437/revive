# Revive — Design-Partner Target List

**Goal:** 15–20 conversations → 3–5 active design partners. Not selling yet. Offer free white-glove setup in exchange for feedback + a testimonial quote.

**What Revive does (one-liner for outreach):** resumes background jobs / agent runs that die when OAuth tokens or sessions expire — instead of failing silently and forcing a full manual reauth.

Status legend: `todo` → `sent` → `replied` → `call` → `active` / `dead`

---

## Tier 1 — AI-agent / autonomous-CRM startups (BEST fit)
Small teams, OAuth-dependent to the core, feel the pain daily, won't build reauth infra themselves.

| Company | Why they fit | Where to reach | Angle | Status |
|---|---|---|---|---|
| **Coffee** (coffee.ai) | Agentic CRM; scans Gmail + calendar the instant you OAuth Google/MS365. Token death = product breaks. | Founder via site contact / X / LinkedIn | "Your agent dies when a customer's Google token expires — I resume it, no reconnect." | todo |
| **Carly** (usecarly.com) | AI agent, 70+ integrations across 25 categories. Many token lifecycles = many failure points. | Site contact / founder X | Same. Emphasize breadth of integrations = breadth of breakage. | todo |
| **Reevo** (reevo.ai) | Revenue OS: prospecting, dialing, email, scheduling — all OAuth-connected. | Site / LinkedIn | "Silent sync gaps lose you data + trust; Revive catches + resumes." | todo |

## Tier 2 — Browser / RPA automation (session-death pain = literally your pitch)
| Company | Why they fit | Where to reach | Angle | Status |
|---|---|---|---|---|
| **BrowserAct** | Their own DEV.to post: agent hits login wall, pauses, resumes. Resume-on-auth-death is their world. | DEV.to author + site | "You do human-handoff on login walls — Revive automates the resume." | todo |
| **ui.vision** | Open-source RPA, macOS/Win/Linux. Scripts crash on session death, manual restart next day. | GitHub / community forum | Meet them in their forum, offer resume layer. | todo |

*(Vercel agent-browser, Cloudflare Browser Run — too big, will build own. Skip as customers; watch as competitors.)*

## Tier 3 — Integration / unified-API platforms (PARTNER, not customer)
They solve normalized token refresh but flag connections for reauth when refresh token dies — that dead-end IS your wedge. Pitch as a channel/complement, not a sale.
| Company | Note |
|---|---|
| **Nango** (nango.dev) | Writes about invalid_grant / dead refresh tokens. Their gap = your product. Partner talk. |
| **Truto** (truto.one) | B2B OAuth token mgmt content. Same. |
| **Unified.to** | Normalizes OAuth across 460+ APIs; flags for reauth on death. Complement. |

## Tier 4 — Community threads to engage (WARM, high-intent — real people with the exact pain)
Reply helpfully first, then soft-pitch. Higher reply rate than cold email.
| Thread / person | Where | Move |
|---|---|---|
| Expiring offline token breaks background jobs | Shopify Community thread | Reply with fix + "built a tool for exactly this" |
| GitHub issue #12447 — OAuth expiry disrupts autonomous workflows | anthropics/claude-code | Commenters = your buyers. DM/reply. |
| "The Agentic Auth Problem Nobody Is Solving" — **Venkat Peri**, Advisor360 | Medium (Mar 2026) | Comment + LinkedIn DM the author; he gets it. |
| hoop.dev blog: "Your OAuth tokens are expiring, your automation broke" | hoop.dev | Aligned audience; engage author. |

## Tier 5 — Where to fish for more (post + search)
- **Reddit:** r/SaaS, r/webdev, r/AI_Agents, r/rpa — search "OAuth expired", "token reconnect", "reauth"
- **Indie Hackers** — search OAuth / integration pain
- **YC** — Bookface (if you have access) + Launch YC; DM founders of agent/automation startups
- **X search:** `"token expired" (agent OR automation OR sync) -filter:replies` — reply to fresh complaints same-day

---

## This week
1. Email Tier 1 founders (Coffee, Carly, Reevo) — 3 cold emails.
2. Reply in 2 Tier-4 threads (Shopify, GitHub #12447).
3. Post 1 "build in public" note on X + Indie Hackers describing the problem, ask "who has this?"
