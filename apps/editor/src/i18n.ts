import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import { en, ko } from "./locales.ts";
import { readUiLanguage } from "./preferences.ts";

export type MessageKey = keyof typeof en;
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
    returnNull: false;
    keySeparator: false;
    nsSeparator: false;
  }
}

export const i18n = createInstance();
// Both languages are bundled. Initialization is synchronous, including in headless UI tests.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ko: { translation: ko } },
  lng: typeof window === "undefined" ? "en" : readUiLanguage(),
  supportedLngs: ["en", "ko"], fallbackLng: "en",
  keySeparator: false, nsSeparator: false,
  initAsync: false, returnNull: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

function applyPageLanguage(): void {
  if (typeof document !== "undefined") document.documentElement.lang = i18n.resolvedLanguage ?? "en";
}
i18n.on("languageChanged", applyPageLanguage);
applyPageLanguage();
