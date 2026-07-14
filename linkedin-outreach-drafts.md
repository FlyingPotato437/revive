# LinkedIn outreach — drafts for review

**Nothing has been sent.** Read, edit, then tell me to fire.

Two channels, because LinkedIn treats them differently:
- **Open Profile** → free direct DM, unlimited length, no connection needed.
- **Everyone else** → connection request + note, hard capped at **300 characters**.

Your profile does the credibility work here in a way the cold emails never did — NBC, 50K-download library, IEEE citations, Berkeley. That's why these lead with who you are and then get out of the way.

---

## BUCKET A — Advice (built the adjacent thing, raised on it)

### 1. Sam Partee — Co-founder, Arcade.dev — **DM (Open Profile, verified)**
2nd degree · mutual: Aditya Mittal · 8.6K followers
*Arcade is literally agent auth. Closest analog to Revive that exists. Best single target on this list.*

> Hi Sam — I'm a freshman at Berkeley. Before this I built OpenOceans (coastal sensor platform, ~1,300 stations, ended up on NBC) and a coral-bleaching library that's at 50K+ downloads.
>
> I'm building Revive now. When an agent run dies because a token expired mid-run, it pauses instead of failing, gets the right human to re-auth, and resumes that exact run from its checkpoint rather than replaying it.
>
> Arcade is the closest thing to what I'm doing, which is either a very good sign or a very bad one, and I honestly can't tell which. The question I keep going around in circles on: is *recovery* a real product, or is it just a feature that auth infra like yours eventually absorbs?
>
> You'd know that better than almost anyone. Any chance you'd trade 15 minutes? Happy to just send the questions over if that's easier.

---

### 2. Nate Barbettini — Founder, Arcade.dev — **connect + note**
3rd degree

> Hi Nate — Berkeley freshman, building Revive: when an agent run dies on an expired token, we pause, get a human to re-auth, and resume that exact run from its checkpoint.
>
> Arcade is the closest thing to it, which is either a great sign or a terrible one. Would love your read on whether recovery is a product or a feature. (298 chars)

---

### 3. Alex Salazar — CEO, Arcade.dev — **connect + note**
3rd degree
*You emailed him this morning and got nothing. Different channel, different ask — this one isn't a pitch, and that's the point.*

> Hi Alex — I emailed you this morning and got the silence I probably deserved, so trying once here with a better question instead of a pitch.
>
> I'm building agent-run recovery (dead token → pause → re-auth → resume the same run). Is that a product, or a feature Arcade absorbs? Genuinely want to know. (297 chars)

---

### 4. Paul Klein IV — Founder, Browserbase — **connect + note**
3rd degree · 12K followers
*Browserbase lives with dead sessions constantly. He'll have a fast opinion.*

> Hi Paul — Berkeley freshman building Revive. Browser sessions die mid-run constantly; we pause the run, get a human to re-auth, and resume from the checkpoint instead of replaying it.
>
> You've lived closer to this failure than almost anyone. Worth 15 min of your time? (263 chars)

---

### 5. Karan Vaidya — Co-founder, Composio — **connect + note**
3rd degree · 31K followers · a16z scout
*NOTE: the "Soham Ganatra" I first found was the wrong person — Bengaluru, Wolken Software. Karan is the real Composio co-founder.*

> Hi Karan — Berkeley freshman, building Revive: agent run dies on an expired token, we pause it, get a re-auth from the right human, and resume the exact run from its checkpoint.
>
> Composio solved the connect side. Curious whether you think the recovery side is real, or just noise. (277 chars)

---

## BUCKET B — Customers / practitioners (people who actually hit the bug)

### 6. Pascal Matthiesen — Member of Technical Staff, Arcade.dev — **DM**
*His headline is literally "Human trying to control Agents." He has the problem in his job title.*

> Hi Pascal — your headline made me laugh, because "human trying to control agents" is basically my whole company.
>
> I'm a Berkeley freshman building Revive: when an agent run dies mid-way because a token expired, we pause it, get a human to re-auth, and resume that exact run from its checkpoint instead of replaying the whole thing.
>
> I'm trying to find out whether this is a real, expensive, everyday problem or whether I've talked myself into it. You'd know. Would you be up for 15 minutes? I'm not selling you anything — you work at the company most likely to make me redundant.

---

### 7. Sterling Dreyer — Founding Engineer, Arcade.dev — **DM**

> Hi Sterling — Berkeley freshman building Revive: agent run dies on a dead token, we pause it, get a human to re-auth, and resume the exact run from its checkpoint rather than replaying side effects.
>
> You've built the auth layer under agents at Arcade, so you've almost certainly watched runs die this way. The bit I can't tell from outside: when it happens in production, does anyone actually recover the run, or does it just get re-kicked from scratch and quietly written off?
>
> Would you trade 15 minutes? Happy to just send questions instead.

---

### 8. Cristina Danita — Agent Engineer, Sierra (Stanford Math/CS) — **connect + note**
2nd degree · mutual connection
*Sierra = production customer-facing agents. She's the practitioner, not the founder. Different, more honest answer.*

> Hi Cristina — Berkeley freshman building Revive (agent runs that die on expired tokens: pause, re-auth, resume the same run).
>
> You're actually shipping agents at Sierra. Does this failure show up in real life, or is it a problem I've invented? Would love 15 min. (255 chars)

---

### 9. Shub Argha — Member of Technical Staff, Arcade.dev — **connect + note**
2nd degree · mutual: Nathan Hirsch · 4K followers

> Hi Shub — Berkeley freshman building Revive: when an agent run dies on an expired token, we pause, re-auth, and resume the same run from its checkpoint.
>
> You ship agent tooling at Arcade daily. Is dead-token recovery a real pain or a solved problem? Would love 15 min. (266 chars)

---

## Sequencing (LinkedIn throttles hard)

Do **not** fire all nine at once — that's the exact pattern that gets an account restricted, and yours is only 422 connections.

- **Today:** Sam Partee (DM), Pascal (DM), Paul Klein (connect+note) — 3 total
- **Tomorrow:** Sterling (DM), Nate, Karan — 3
- **Day 3:** Alex, Cristina, Shub — 3

Roughly 8–10 invites/day max, spaced out. That keeps you well inside limits.

## What still needs finding

Bucket B is thin — it's mostly Arcade people, who are adjacent-competitors, not customers. Real customer targets are engineers at **Decagon, Lindy, 11x, Vapi, Sierra, Skyvern**. Say the word and I'll go build that list properly.
