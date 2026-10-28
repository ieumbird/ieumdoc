import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, MENU_ITEM_CLASS } from "@/components/ui/dropdown-menu.tsx";
import { codeLanguageOptions } from "./code-language-options.ts";

export function CodeLanguageInput({ language, readOnly, onChange }: {
  language: string; readOnly: boolean; onChange: (language: string) => void;
}) {
  const { t } = useTranslation();
  const options = codeLanguageOptions.includes(language) ? codeLanguageOptions : [...codeLanguageOptions, language];
  const label = language || t("Plain text");
  return (
    <div className="code-language-control" contentEditable={false}>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />} className="code-language"
          data-testid="code-language" aria-label={t("Code language: {{language}}", { language: label })}
          title={label} disabled={readOnly}>
          <span className="code-language-label">{label}</span><ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="code-language-popup" align="start" aria-labelledby={undefined} aria-label={t("Choose code language")}>
          <Menu.RadioGroup disabled={readOnly} value={language} onValueChange={value => { if (value !== language) onChange(value as string); }}>
            {options.map(item => <Menu.RadioItem key={item} value={item} closeOnClick className={MENU_ITEM_CLASS}
              label={item || t("Plain text")}>
              <Check aria-hidden="true" className={item === language ? "" : "invisible"} />
              {item || t("Plain text")}
            </Menu.RadioItem>)}
          </Menu.RadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
