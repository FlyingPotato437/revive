"""FastAPI resume receiver — production shape for Python runtimes.

Receives signed ``recovery.resume_requested`` callbacks from the Revive control
plane, verifies the HMAC, resumes the parked run from its checkpoint, and acks
so the case transitions identity_verified -> resumed -> completed.

Register the deployed URL once per workspace:

    curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint \
      -H "authorization: Bearer $REVIVE_API_KEY" -H "content-type: application/json" \
      -d '{"url": "https://agents.example.com/revive/resume", "secret": "'$REVIVE_RESUME_SECRET'"}'

    # verify the wiring end to end before relying on it:
    curl -X POST https://revivelabs.app/api/v1/workspace/resume-endpoint/test \
      -H "authorization: Bearer $REVIVE_API_KEY"

Run:  REVIVE_RESUME_SECRET=… uvicorn examples.resume_receiver_fastapi:app --port 8752

Requires: pip install fastapi uvicorn (plus your framework, e.g. langgraph).
All verification/dedup logic lives in the dependency-free revive.receiver —
this file only adapts it to FastAPI.
"""
from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from revive.receiver import ResumeReceiver


def resume_run(data: dict) -> dict | None:
    """Resume the parked run identified by the callback. MUST have resumed the
    run before returning — the acknowledgement tells the control plane to mark
    the case ``resumed``. Raise on failure and delivery will be retried.

    data: caseId, workspaceId, runId, checkpointId, connectionId, actionKey,
          idempotencyKey, generation

    LangGraph runtimes typically do:

        graph, config = runs[data["runId"]]  # your checkpointer-backed registry
        result = graph.invoke(Command(resume={
            "connection_id": data["connectionId"],
            "lease_generation": data["generation"],
        }), config)

    The resume payload stays opaque — the node's credential_resolver exchanges
    (connection_id, lease_generation) for the rotated token at execution time,
    so raw credentials never enter checkpoint history.
    """
    raise NotImplementedError("wire this to your run registry")


receiver = ResumeReceiver(secret=os.environ["REVIVE_RESUME_SECRET"], resume=resume_run)
app = FastAPI()


@app.post("/revive/resume")
async def revive_resume(request: Request) -> JSONResponse:
    body = await request.body()  # raw bytes — the signature covers them exactly
    status, response = receiver.handle(request.headers, body)
    return JSONResponse(response, status_code=status)
