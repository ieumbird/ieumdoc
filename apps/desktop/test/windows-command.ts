/** Pass a literal Windows command line through cmd's /s /c outer-quote convention. */
export function windowsCommand(command: string, args: string[]): string[] {
  const quote = (value: string) => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
  // Quoting a bare PATH name makes cmd expand batch %~dp0 against cwd. A terminal invokes
  // ieumdoc unquoted; full paths still need quotes, as do all user arguments below.
  const executable = /^[a-z0-9_.-]+$/i.test(command) ? command : quote(command);
  return ["/d", "/s", "/c", `"${[executable, ...args.map(quote)].join(" ")}"`];
}
