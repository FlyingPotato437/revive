"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { Highlight, themes, type Language } from "prism-react-renderer";
import { useEffect, useState } from "react";

export function DocsCodeBlock({
  code,
  language,
  label,
}: {
  code: string;
  language: Language;
  label: string;
}) {
  const [dark, setDark] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code.trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="docs-code" data-theme={dark ? "dark" : "light"}>
      <div className="docs-code-header">
        <span>{label}</span>
        <span className="docs-code-language">{language === "typescript" ? "TypeScript" : language === "bash" ? "Shell" : language}</span>
        <button type="button" onClick={() => void copy()} aria-label={`Copy ${label}`}>
          {copied ? <Check size={12} weight="bold" /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <Highlight theme={dark ? themes.vsDark : themes.vsLight} code={code.trim()} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre>
            <code>
              {tokens.map((line, lineIndex) => (
                <span key={lineIndex} {...getLineProps({ line, className: "docs-code-line" })}>
                  <span className="docs-code-number" aria-hidden>{lineIndex + 1}</span>
                  <span className="docs-code-content">{line.map((token, tokenIndex) => <span key={tokenIndex} {...getTokenProps({ token })} />)}</span>
                </span>
              ))}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  );
}
