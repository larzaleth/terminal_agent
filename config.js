import fs from "fs";
import path from "path";

// Default configuration
const defaultConfig = {
  model: "gemini-2.5-flash",
  systemInstruction: `You are a highly capable AI coding agent running on the user's terminal.
You have access to tools via Function Calling that allow you to read files, write files, list directories, and run commands.
When a user asks you to do something, THINK step-by-step.
If you need to explore the codebase, use list_dir and read_file.
If you need to make changes, use write_file.
If you need to test or install dependencies, use run_command.
Always explain briefly what you are doing before executing a tool. Keep your answers concise unless asked.`,
};

export function loadConfig() {
  const customConfigPath = path.join(process.cwd(), "agent.config.json");
  
  if (fs.existsSync(customConfigPath)) {
    try {
      const customConfig = JSON.parse(fs.readFileSync(customConfigPath, "utf-8"));
      return { ...defaultConfig, ...customConfig };
    } catch (err) {
      console.warn(`⚠️ Gagal membaca agent.config.json: ${err.message}. Menggunakan config bawaan.`);
    }
  }

  return defaultConfig;
}

export const config = loadConfig();
