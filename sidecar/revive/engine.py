"""The Revive engine — a durable run loop that survives a dead refresh token.

Real mechanics (no simulation):
  * a step calls a protected resource with the current access token;
  * on 401 the engine performs a REAL refresh against the provider;
  * if the refresh token is truly dead, the engine CLASSIFIES the error,
    durably CHECKPOINTS the exact step, opens a RENDEZVOUS (re-consent), and
    PARKS the run — returning control without losing progress;
  * `resume()` rotates the credential lease and continues the same logical run
    from the exact step, potentially on a different worker process.

`kind="approval"` rendezvous (human-in-the-loop) uses the identical park/resume
path — that is the Parley generalization.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from .checkpoint import Checkpoint, CheckpointStore
from .classifier import Verdict, classify
from .providers import AuthError, Provider, Token, TokenError
from .rendezvous import Channel, Kind, Rendezvous, console_channel


# --- step model ------------------------------------------------------------

@dataclass
class StepContext:
    access_token: str
    state: dict[str, Any]
    step_id: str
    action_id: str


class NeedsApproval(Exception):
    """A step can raise this to request out-of-band human approval (Parley)."""

    def __init__(self, prompt: str, context: Optional[dict] = None):
        self.prompt = prompt
        self.context = context or {}
        super().__init__(prompt)


@dataclass
class Step:
    id: str
    fn: Callable[[StepContext], None]
    side_effect: bool = False
    reconcile: Optional[Callable[[StepContext], bool]] = None


class AmbiguousSideEffect(RuntimeError):
    """A previous attempt may have committed and must be reconciled first."""


class WrongRecoveryIdentity(RuntimeError):
    """The reauthorized provider identity does not own the failed connection."""


class StaleCredentialGeneration(RuntimeError):
    """A worker attempted to continue with a fenced credential generation."""


# --- results ---------------------------------------------------------------

@dataclass
class Parked:
    rendezvous: Rendezvous
    checkpoint: Checkpoint


@dataclass
class Completed:
    state: dict
    steps_done: int
    recovered_ms: Optional[float] = None
    splices: int = 0


Event = Callable[[str, str], None]


def _noop(tag: str, msg: str) -> None:
    pass


class Engine:
    def __init__(self, provider: Provider, store: CheckpointStore,
                 base_url: str = "http://localhost:8750",
                 channel: Channel = console_channel,
                 on_event: Event = _noop, max_transient_retries: int = 3,
                 reporter=None):
        self.provider = provider
        self.store = store
        self.base_url = base_url
        self.channel = channel
        self.emit = on_event
        self.max_transient_retries = max_transient_retries
        self.reporter = reporter  # optional revive.Reporter; lifecycle metadata only

    def _report(self, run_id: str, event: str, **fields) -> None:
        if self.reporter is not None:
            try:
                self.reporter.emit(run_id, event, **fields)
            except Exception:  # noqa: BLE001 - reporting must never break recovery
                pass

    # --- run -------------------------------------------------------------
    def run(self, run_id: str, steps: list[Step], token: Token,
            scopes: list[str], start_index: int = 0,
            state: Optional[dict] = None) -> Parked | Completed:
        state = state if state is not None else {}
        splices = state.get("_splices", 0)
        if start_index == 0 and not state.get("_reported_open"):
            state["_reported_open"] = True
            self._report(run_id, "opened", steps_total=len(steps),
                         lease_generation=token.generation)
        if token.lease_id:
            self.store.ensure_lease(token.lease_id, token.generation)
            try:
                self.store.assert_lease_generation(token.lease_id, token.generation)
            except ValueError as error:
                raise StaleCredentialGeneration(str(error)) from error
        for i in range(start_index, len(steps)):
            if token.lease_id:
                try:
                    self.store.assert_lease_generation(token.lease_id, token.generation)
                except ValueError as error:
                    raise StaleCredentialGeneration(str(error)) from error
            step = steps[i]
            action_id = f"{run_id}:{step.id}"
            transient = 0
            while True:
                ctx = StepContext(token.access_token, state, step.id, action_id)
                if step.side_effect:
                    action_state = self.store.action_state(action_id)
                    if action_state == "completed":
                        self.emit("dedupe", f"{step.id} already committed · skipping duplicate")
                        break
                    if action_state == "started":
                        if step.reconcile and step.reconcile(ctx):
                            self.store.complete_action(action_id)
                            self.emit("reconcile", f"{step.id} confirmed committed upstream")
                            break
                        raise AmbiguousSideEffect(
                            f"{step.id} may have committed; provide a reconcile callback before retrying"
                        )
                    self.store.start_action(action_id, run_id, step.id)
                try:
                    step.fn(ctx)
                    if step.side_effect:
                        self.store.complete_action(action_id)
                    break
                except AuthError:
                    if step.side_effect:
                        self.store.reset_action(action_id)
                    # access token expired -> attempt a REAL refresh
                    self.emit("auth", "access token expired — attempting silent refresh")
                    try:
                        refreshed = self.provider.refresh(token.refresh_token)
                        token = Token(
                            refreshed.access_token, refreshed.refresh_token,
                            refreshed.expires_in, token.subject, token.tenant,
                            token.lease_id, token.generation,
                        )
                        self.emit("refresh", f"silent refresh ok → {token.fingerprint}")
                        continue  # retry the same step with the fresh token
                    except TokenError as te:
                        result = classify(te.payload)
                        self.emit("classify",
                                  f"{result.verdict.value.upper()} · {result.code} · "
                                  f"{result.title} · conf {result.confidence:.2f}")
                        if result.verdict == Verdict.TRANSIENT and transient < self.max_transient_retries:
                            transient += 1
                            time.sleep(0.2 * transient)
                            continue
                        if result.needs_human or result.verdict == Verdict.DEAD:
                            return self._park(run_id, i, step, state, token, scopes,
                                              Kind.AUTH,
                                              f"{result.code}: {result.title} — re-authorize to resume",
                                              {
                                                  "classifier": result.to_dict(),
                                                  "expected_subject": token.subject,
                                                  "expected_tenant": token.tenant,
                                                  "lease_id": token.lease_id,
                                                  "lease_generation": token.generation,
                                              })
                        # refreshable/unknown-but-not-human: retry once more
                        continue
                except NeedsApproval as na:
                    return self._park(run_id, i, step, state, token, scopes,
                                      Kind.APPROVAL, na.prompt, na.context)
            self.emit("ok", f"{step.id} ✓")
        self.store.set_status(run_id, "done")
        return Completed(state=state, steps_done=len(steps), splices=splices)

    # --- park ------------------------------------------------------------
    def _park(self, run_id: str, i: int, step: Step, state: dict, token: Token,
              scopes: list[str], kind: Kind, prompt: str, context: dict) -> Parked:
        cp = Checkpoint(run_id=run_id, step_index=i, step_id=step.id,
                        cursor=dict(state), token_fingerprint=token.fingerprint,
                        scopes=scopes, status="parked")
        self.store.save(cp)
        self.emit("checkpoint", f"durable checkpoint at step {i + 1} ({step.id})")
        rdv = Rendezvous.new(run_id, kind, prompt, self.base_url,
                             {**context, "step_index": i, "step_id": step.id})
        self.store.save_rendezvous(rdv.to_dict())
        self.channel(rdv)
        self.emit("rendezvous", f"{kind.value} rendezvous opened · {rdv.url}")
        self._report(run_id, "parked", cause_code=context.get("classifier", {}).get("code"),
                     failed_step=step.id, steps_done=i,
                     lease_generation=context.get("lease_generation"))
        return Parked(rendezvous=rdv, checkpoint=cp)

    # --- resume ----------------------------------------------------------
    def resume(self, run_id: str, steps: list[Step], reply: dict,
               token: Optional[Token] = None) -> Parked | Completed:
        cp = self.store.load(run_id)
        if cp is None:
            raise ValueError(f"no checkpoint for run {run_id}")
        if cp.status != "parked":
            raise ValueError(f"run {run_id} is not parked (status={cp.status})")
        rdv_data = self.store.load_rendezvous(run_id)
        if rdv_data is None:
            raise ValueError(f"no recovery rendezvous for run {run_id}")
        kind = Kind(rdv_data["kind"])
        context = rdv_data.get("context") or {}
        if kind == Kind.AUTH:
            self._verify_recovery_identity(context, reply)
        if not self.store.consume_rendezvous(run_id, reply):
            raise ValueError("recovery rendezvous is expired or already consumed")
        t0 = cp.taken_at
        state = dict(cp.cursor)

        if kind == Kind.AUTH:
            # Re-consent minted a new refresh token; advance the credential lease.
            new_refresh = reply["refresh_token"]
            refreshed = self.provider.refresh(new_refresh)
            lease_id = context.get("lease_id")
            old_generation = int(context.get("lease_generation") or 1)
            new_generation = old_generation + 1
            if lease_id:
                try:
                    new_generation = self.store.rotate_lease(lease_id, old_generation)
                except ValueError as error:
                    raise StaleCredentialGeneration(str(error)) from error
            token = Token(
                refreshed.access_token, refreshed.refresh_token,
                refreshed.expires_in,
                reply.get("provider_subject") or context.get("expected_subject"),
                reply.get("provider_tenant") or context.get("expected_tenant"),
                lease_id, new_generation,
            )
            state["_splices"] = state.get("_splices", 0) + 1
            state["_lease_generation"] = new_generation
            self.emit("rotate",
                      f"credential lease rotated → generation token {token.fingerprint}")
        else:
            # approval / input: inject the human reply and continue
            state.setdefault("_replies", {})[rdv_data["id"]] = reply
            state["_reply"] = reply  # the step pops this to proceed idempotently
            if token is None:
                raise ValueError("resume of a non-auth rendezvous needs the run's token")

        self.store.set_status(run_id, "running")
        self.emit("resume", f"resuming step {cp.step_index + 1} ({cp.step_id}) from checkpoint")
        self._report(run_id, "resumed", steps_done=cp.step_index,
                     lease_generation=state.get("_lease_generation"))
        result = self.run(run_id, steps, token, cp.scopes,
                          start_index=cp.step_index, state=state)
        if isinstance(result, Completed):
            result.recovered_ms = (time.time() - t0) * 1000.0
            result.splices = state.get("_splices", 0)
            self._report(run_id, "recovered", steps_done=result.steps_done,
                         steps_total=len(steps), recovered_ms=result.recovered_ms,
                         lease_generation=state.get("_lease_generation"))
        return result

    @staticmethod
    def _verify_recovery_identity(context: dict, reply: dict) -> None:
        expected_subject = context.get("expected_subject")
        expected_tenant = context.get("expected_tenant")
        actual_subject = reply.get("provider_subject")
        actual_tenant = reply.get("provider_tenant")
        if expected_subject and actual_subject != expected_subject:
            raise WrongRecoveryIdentity(
                f"provider subject mismatch: expected {expected_subject!r}"
            )
        if expected_tenant and actual_tenant != expected_tenant:
            raise WrongRecoveryIdentity(
                f"provider tenant mismatch: expected {expected_tenant!r}"
            )
