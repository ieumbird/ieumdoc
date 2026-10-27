/** Pass a literal Windows command line through cmd's /s /c outer-quote convention. */
export function windowsCommand(command: string, args: string[]): string[] {
  const quote = (value: string) => `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, "$1$1")}"`;
  return ["/d", "/s", "/c", `"${[command, ...args].map(quote).join(" ")}"`];
}
