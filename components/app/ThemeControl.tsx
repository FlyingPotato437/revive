"use client";

import { CaretDown, Check, Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

type ThemePreference = "system" | "light" | "dark";

const choices = [
  { value: "system" as const, label: "System", detail: "Follow this computer", icon: Desktop },
  { value: "light" as const, label: "Light", detail: "Always use light", icon: Sun },
  { value: "dark" as const, label: "Dark", detail: "Always use dark", icon: Moon },
];

export function ThemeControl() {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("revive-theme");
    if (stored === "light" || stored === "dark" || stored === "system") setPreference(stored);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = preference === "system" ? (media.matches ? "dark" : "light") : preference;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  useEffect(() => () => {
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themePreference;
    document.documentElement.style.removeProperty("color-scheme");
  }, []);

  function choose(value: ThemePreference) {
    window.localStorage.setItem("revive-theme", value);
    setPreference(value);
    setOpen(false);
  }

  const selected = choices.find((choice) => choice.value === preference) || choices[0];
  const SelectedIcon = selected.icon;

  return <div className="theme-control relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" className="theme-control-trigger">
      <SelectedIcon size={13} />
      <span className="hidden lg:inline">{selected.label}</span>
      <CaretDown size={10} className={open ? "rotate-180" : ""} />
    </button>
    {open && <div role="menu" aria-label="Dashboard appearance" className="theme-control-menu">
      <p>Appearance</p>
      {choices.map((choice) => { const Icon = choice.icon; const active = choice.value === preference; return <button role="menuitemradio" aria-checked={active} type="button" key={choice.value} onClick={() => choose(choice.value)}><Icon size={14} /><span><strong>{choice.label}</strong><small>{choice.detail}</small></span>{active && <Check size={12} weight="bold" />}</button>; })}
    </div>}
  </div>;
}
