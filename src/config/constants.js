// ===========================
// 🔹 FILE PATHS & DIRECTORIES
// ===========================
export const INDEX_FILE = "index.json";
export const MEMORY_FILE = "memory.json";
export const CACHE_DIR = ".agent_cache";
export const COST_REPORT_FILE = "cost-report.json";
export const GLOBAL_ENV_FILENAME = ".myagent.env";

// ===========================
// 🔹 DEFAULTS
// ===========================
export const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const CACHE_MAX_ENTRIES = 5000;

export const EMBEDDING_MODEL = "text-embedding-004";
export const EMBEDDING_BATCH_SIZE = 10;
export const EMBEDDING_CONCURRENCY = 5;
export const TOOL_CONCURRENCY = 5;

// Smart chunking: split code by lines with overlap for better context preservation.
export const CHUNK_MAX_LINES = 40;
export const CHUNK_OVERLAP_LINES = 5;

// RAG search defaults
export const RAG_TOP_K = 3;
export const RAG_THRESHOLD = 0.7;
export const RAG_CONTEXT_MAX_CHARS = 3000;

// Agent loop
export const MAX_ITERATIONS_DEFAULT = 25;
export const MAX_MEMORY_TURNS_DEFAULT = 20;
export const MAX_TOOL_OUTPUT_CHARS = 8000;
export const MAX_COMMAND_OUTPUT_CHARS = 5000;
export const COMMAND_TIMEOUT_MS = 60_000;
export const COMMAND_MAX_BUFFER = 1024 * 1024 * 10;

// Planner skip heuristic — cheap short requests don't need a plan.
export const PLANNER_MIN_WORDS = 15;

// Directories & extensions to ignore when walking the filesystem.
export const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "vendor", ".cache", "coverage",
  ".agent_cache",
]);

export const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".bmp",
  ".woff", ".woff2", ".ttf", ".eot", ".svg",
  ".mp3", ".mp4", ".avi", ".mov", ".webm",
  ".zip", ".gz", ".tar", ".rar", ".7z",
  ".pdf", ".exe", ".dll", ".so", ".dylib",
  ".pyc", ".lock", ".map",
]);

export const CODE_EXTS = [".js", ".ts", ".json", ".jsx", ".tsx", ".mjs", ".cjs", ".py", ".md"];
