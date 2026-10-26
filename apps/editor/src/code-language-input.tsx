import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu.tsx";

// Suggestions only: arbitrary fence names and the existing highlighting set remain supported.
const languages = ["", "javascript", "typescript", "python", "bash", "powershell", "json", "yaml",
  "html", "css", "sql", "c", "cpp", "csharp", "java", "go", "rust"];

export function CodeLanguageInput({ language, readOnly, onChange }: {
  language: string; readOnly: boolean; onChange: (language: string) => void;
}) {
  const { t } = useTranslation();
  // NodeView props arrive after React's controlled-input restoration. Mirror edits in the
  // same event, or restoring the old attribute value breaks Chromium's composing range.
  // Composition stays local until commit; the document does not own its intermediate text.
  const [input, setInput] = useState(language);
  const composing = useRef(false);
  useEffect(() => setInput(language), [language]);
  const change = (value: string) => {
    const next = value.replace(/[\s`]/g, "");
    setInput(next);
    if (next !== language) onChange(next);
  };
  return (
    <div className="code-language-control" contentEditable={false}>
      <Input className="code-language" data-testid="code-language" value={input} readOnly={readOnly}
        aria-label={t("Code language")} placeholder={t("Language")} spellCheck={false} autoComplete="off"
        onChange={(event) => {
          if (composing.current) setInput(event.target.value);
          else change(event.target.value);
        }}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={(event) => { composing.current = false; change(event.currentTarget.value); }} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" />} className="code-language-trigger"
          aria-label={t("Choose code language")} disabled={readOnly}>
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="code-language-popup" align="end">
          {languages.map(item => <DropdownMenuItem key={item} onClick={() => change(item)}>
            {item || t("Plain text")}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
