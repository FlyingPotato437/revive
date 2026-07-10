"use client";

// "Your numbers, our math" — an honest exposure calculator. Every output is
// computed live from the three sliders; nothing is a claimed customer result.

import { useState } from "react";

function money(value: number): string {
  return value >= 1000 ? `$${Math.round(value).toLocaleString("en-US")}` : `$${value.toFixed(0)}`;
}

export function SavingsMath() {
  const [actionsPerDay, setActionsPerDay] = useState(500);
  const [failurePct, setFailurePct] = useState(0.5);
  const [costPerIncident, setCostPerIncident] = useState(30);

  const incidentsPerMonth = Math.round(actionsPerDay * 30 * (failurePct / 100));
  const exposure = incidentsPerMonth * costPerIncident;
  const engineerHours = Math.round(incidentsPerMonth * 0.5);

  return (
    <div className="grid overflow-hidden rounded-[14px] border border-[#151922] bg-[#fbfcf8] lg:grid-cols-[1fr_1fr]">
      <div className="border-b border-[#d9ddd6] p-7 sm:p-9 lg:border-b-0 lg:border-r">
        <div className="font-mono text-[10px] tracking-[.1em] text-[#727b89]">YOUR NUMBERS</div>
        <Slider
          label="Actions your agents take per day"
          value={actionsPerDay}
          display={actionsPerDay.toLocaleString("en-US")}
          min={50} max={10000} step={50}
          onChange={setActionsPerDay}
        />
        <Slider
          label="Share that fail mid-action"
          value={failurePct}
          display={`${failurePct}%`}
          min={0.1} max={3} step={0.1}
          onChange={setFailurePct}
          hint="timeouts, dead logins, crashed runs — most teams see 0.3–1%"
        />
        <Slider
          label="Cost when one goes wrong"
          value={costPerIncident}
          display={money(costPerIncident)}
          min={5} max={500} step={5}
          onChange={setCostPerIncident}
          hint="a duplicate charge refund, an apology email, cleanup time"
        />
      </div>
      <div className="flex flex-col justify-center gap-7 bg-[#151922] p-7 sm:p-9">
        <div>
          <div className="font-mono text-[10px] tracking-[.1em] text-[#8ea0ff]">RISKY MOMENTS EVERY MONTH</div>
          <div className="mt-2 font-mono text-[clamp(34px,4vw,48px)] font-semibold leading-none tracking-[-.03em] text-white">{incidentsPerMonth.toLocaleString("en-US")}</div>
          <p className="mt-2 text-[12px] leading-5 text-[#9aa6c8]">failed actions where a blind retry could run the same thing twice</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="font-mono text-[10px] tracking-[.1em] text-[#8ea0ff]">EXPOSURE COVERED</div>
            <div className="mt-1.5 font-mono text-[26px] font-semibold tracking-[-.02em] text-white">{money(exposure)}<span className="text-[13px] text-[#9aa6c8]"> /mo</span></div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[.1em] text-[#8ea0ff]">CLEANUP AVOIDED</div>
            <div className="mt-1.5 font-mono text-[26px] font-semibold tracking-[-.02em] text-white">~{engineerHours}<span className="text-[13px] text-[#9aa6c8]"> hrs/mo</span></div>
          </div>
        </div>
        <p className="border-t border-[#2a3040] pt-4 text-[10.5px] leading-5 text-[#7b87a6]">
          Computed from your inputs above, nothing else. Revive makes each of those moments safe — the action runs
          exactly once or pauses for a person. Plans start at $20/month.
        </p>
      </div>
    </div>
  );
}

function Slider({ label, value, display, min, max, step, onChange, hint }: {
  label: string; value: number; display: string; min: number; max: number; step: number;
  onChange: (value: number) => void; hint?: string;
}) {
  return (
    <label className="mt-7 block first-of-type:mt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-[#151922]">{label}</span>
        <span className="font-mono text-[15px] font-semibold text-[#2e49c8]">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 h-1 w-full cursor-pointer appearance-none rounded-full bg-[#dfe3dc] accent-[#4967f2]"
        aria-label={label}
      />
      {hint && <span className="mt-1.5 block text-[10.5px] text-[#8a929d]">{hint}</span>}
    </label>
  );
}
