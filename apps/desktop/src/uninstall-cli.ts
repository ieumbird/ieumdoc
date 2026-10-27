// Called by NSIS before deleting the installed executable; never runs during an update.
import { CliIntegration } from "./cli-integration.ts";
import { windowsEnvironment } from "./windows-environment.ts";

if (process.platform !== "win32" || !process.env.LOCALAPPDATA || process.argv[2] !== "--uninstall") {
  throw new Error("This entry point is for the Windows uninstaller only.");
}
const integration = new CliIntegration(process.execPath, process.env.LOCALAPPDATA, windowsEnvironment());
integration.setEnabled(false, true).catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
