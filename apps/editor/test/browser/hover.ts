import type { Page } from "@playwright/test";

/** Exercise hover interactions even when Chromium reports no hover device. */
export async function withBlockHover<T>(page: Page, check: () => Promise<T>): Promise<T> {
  const removed = await page.evaluateHandle(() => {
    const entries: { sheet: CSSStyleSheet; index: number; text: string }[] = [];
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList;
      try { rules = sheet.cssRules; } catch { continue; }
      const noHover = (rule: CSSRule): rule is CSSMediaRule => rule instanceof CSSMediaRule &&
        rule.conditionText.replaceAll(" ", "") === "(hover:none)";
      // Locate the actual product sheet; never inject a copy of its display declarations.
      if (![...rules].some(rule => noHover(rule) && [...rule.cssRules].some(child =>
        child instanceof CSSStyleRule && child.selectorText === ".block-hover-outline"))) continue;
      for (let index = rules.length - 1; index >= 0; index--) {
        const rule = rules[index];
        if (noHover(rule)) entries.push({ sheet, index, text: rule.cssText });
      }
    }
    if (!entries.length) throw Error("Missing product (hover: none) stylesheet rules");
    for (const { sheet, index } of entries) sheet.deleteRule(index);
    return entries;
  });
  try {
    return await check();
  } finally {
    try {
      // Reverse the descending removals to restore every rule at its original index.
      await removed.evaluate(entries => {
        for (const { sheet, index, text } of entries.reverse()) sheet.insertRule(text, index);
        for (const { sheet, index, text } of entries) {
          if (sheet.cssRules[index].cssText !== text) throw Error("Hover media rule was not restored at its original index");
        }
      });
    } finally {
      await removed.dispose();
    }
  }
}
