# Revive — demo videos

Two files, both regenerable:

- **`Revive-Product-Demo.mp4`** (primary, ~48s, 1080p) — a real walkthrough of the
  product being used: homepage, run the live demo, the token dies, the re-approval
  screen, the run resumes, the result, and the comparison. Made for your voiceover.
- **`Revive-Demo.mp4`** (~30s) — a shorter reel built around the real terminal
  recovery. Good as a quick proof clip.

## Voiceover script for the product demo

Talk over it in your own words; these are cues, scene by scene.

**Homepage (0–3s)**
> This is Revive. Long-running AI agents break when their OAuth token expires
> partway through a run. Revive keeps them going.

**Playground (3–7s)**
> Here's a live demo. Two identical agents run side by side. One plain, one
> wrapped with Revive.

**Run + the token dies (7–15s)**
> I run them. A few steps in, the refresh token dies. On the left, with no
> recovery, the agent keeps retrying with the dead token and gives up. On the
> right, Revive catches it, confirms the token is actually dead, and pauses the
> run instead of losing it.

**Re-approval screen (15–27s)**
> Revive sends a re-approval link. This is what a person sees: they sign back in
> and approve. It's the provider's real sign-in, so no secrets pass through us.

**Resume + result (27–40s)**
> Revive puts the new token back into the same run, and it picks up from the exact
> step it stopped on. Eight of eight steps, no restart. The plain agent is stuck
> at four.

**Why it's different (40–48s)**
> And this is the part nobody else does. Auth tools notice the dead token but stop
> there. Workflow tools can resume a run but don't know a token died. Revive is the
> only one that does both.

## Tips
- Record it as a Loom and talk over the MP4, or screen-record yourself clicking
  through `localhost:3000` live (more natural, your cursor).
- Keep it under a minute. The token-death moment and the resume are the two beats
  that matter.

## Regenerate

```bash
cd video
node capture.js          # drives localhost:3000, writes product_frames/ + manifest.json
# then re-run the ffmpeg assembly (see project notes) to rebuild Revive-Product-Demo.mp4
```
Requires the dev server running on :3000.
