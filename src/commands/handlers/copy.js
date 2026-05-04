import chalk from "chalk";

// /copy is a UI-only command: when invoked under the TUI, App.js intercepts
// it before this runs and uses the reducer state directly. When invoked
// from the plain-CLI mode, there's no message buffer yet, so we just
// print a hint.
export async function copyCommand() {
  console.log(
    chalk.yellow(
      `\n📋 /copy is a TUI-only command. Run it inside the interactive session.\n` +
        chalk.dim(
          `  /copy last  → copy last assistant reply\n` +
          `  /copy tool  → copy focused tool block result\n` +
          `  /copy turn  → copy current (or last) turn\n` +
          `  /copy all   → copy entire transcript\n`
        )
    )
  );
}
