import fs from "fs";
import { execSync } from "child_process";
import readline from "readline/promises";

// Helper for user confirmation
async function confirmExecution(cmd) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await rl.question(`\n⚠️ Agent ingin menjalankan perintah: \`${cmd}\`\nApakah Anda mengizinkan? (Y/n) > `);
  rl.close();
  return answer.trim().toLowerCase() !== "n"; // Default yes
}

export const tools = {
  read_file: async ({ path }) => {
    try {
      console.log(`\n📄 [Tool] Membaca file: ${path}...`);
      return fs.readFileSync(path, "utf-8");
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  write_file: async ({ path, content }) => {
    try {
      console.log(`\n✍️ [Tool] Menulis ke file: ${path}...`);
      fs.writeFileSync(path, content);
      return `Success: File written to ${path}`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  list_dir: async ({ dir }) => {
    try {
      console.log(`\n📂 [Tool] Melihat direktori: ${dir}...`);
      return fs.readdirSync(dir).join("\n");
    } catch (err) {
      return `Error: ${err.message}`;
    }
  },

  run_command: async ({ cmd }) => {
    const isAllowed = await confirmExecution(cmd);
    if (!isAllowed) {
      console.log("❌ [Tool] Perintah dibatalkan oleh user.");
      return "Error: User denied permission to run this command.";
    }

    try {
      console.log(`\n🚀 [Tool] Mengeksekusi: ${cmd}...`);
      const output = execSync(cmd, { shell: true, stdio: "pipe" });
      return output.toString() || "Success: Command executed with no output.";
    } catch (err) {
      return `Error: Command failed with exit code ${err.status}\nOutput: ${err.stdout?.toString()}\nError: ${err.stderr?.toString()}`;
    }
  },
};

// Declarations to pass to Gemini API
export const toolDeclarations = [
  {
    name: "read_file",
    description: "Read the content of a specific file. Use this to read the code or configuration to understand the context. Provide the absolute or relative path.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Path to the file to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a specific file. Use this to edit, update, or create a code file. Provide the full file content.",
    parameters: {
      type: "OBJECT",
      properties: {
        path: {
          type: "STRING",
          description: "Path to the file to write to",
        },
        content: {
          type: "STRING",
          description: "The complete content to be written inside the file",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "list_dir",
    description: "List contents of a directory to see files and folders inside it. Use this to explore the project structure.",
    parameters: {
      type: "OBJECT",
      properties: {
        dir: {
          type: "STRING",
          description: "Path of the directory to list",
        },
      },
      required: ["dir"],
    },
  },
  {
    name: "run_command",
    description: "Execute a terminal shell command. Use this to run scripts, compile code, list processes, or install dependencies.",
    parameters: {
      type: "OBJECT",
      properties: {
        cmd: {
          type: "STRING",
          description: "The command to run in the terminal (e.g. 'npm install', 'node index.js')",
        },
      },
      required: ["cmd"],
    },
  },
];
