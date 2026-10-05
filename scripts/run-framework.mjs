import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command)) throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
// The optional local translator starts quietly with the Windows development app.
if (command === 'dev' && process.platform === 'win32' && existsSync(new URL('../.sites-runtime/translation-venv/Scripts/python.exe', import.meta.url))) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./start-translation.ps1', import.meta.url))], { windowsHide: true, stdio: 'inherit' });
  if (result.status !== 0) console.warn('Local translation service could not start; Italian lyrics remain available.');
}

if (managedLinux && command === "build") {
  const result = spawnSync("bash", [
    fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(managedLinux
  ? "../node_modules/vite/bin/vite.js"
  : "../node_modules/vinext/dist/cli.js", import.meta.url);
process.argv = [process.execPath, fileURLToPath(cli), command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []), ...args];
await import(cli.href);
