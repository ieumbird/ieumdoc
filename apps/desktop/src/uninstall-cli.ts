// Called by NSIS before deleting the installed executable; never runs during an update.
import { CliIntegration } from "./cli-integration.ts";
import { windowsEnvironment } from "./windows-environment.ts";
import { writeFileSync } from "node:fs";

if (process.platform !== "win32" || !process.env.LOCALAPPDATA || process.argv[2] !== "--uninstall") {
  throw new Error("This entry point is for the Windows uninstaller only.");
}
const integration = new CliIntegration(process.execPath, process.env.LOCALAPPDATA, windowsEnvironment());
integration.setEnabled(false, true).then(state => {
  if (state.conflict) throw new Error(`PATH registration removed; files were preserved: ${state.conflict}`);
}).catch(error => {
  // Electron's GUI executable does not reliably expose stderr to NSIS nsExec. NSIS creates
  // this temporary file and removes it after reading; the durable warning is written by NSIS.
  if (process.argv[3]) {
    try { writeFileSync(process.argv[3], `${error.message}\r\n`, "utf16le"); }
    catch { /* NSIS still reports the exit code and that no diagnostic was available. */ }
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
