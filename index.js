import { buildIndex, loadIndex, search } from "./semantic.js";
import { ask, getModel } from "./llm.js";

async function main() {
  const folder = process.argv[2];

  if (!folder) {
    console.log("❌ Usage:");
    console.log("node index.js <folder>");
    process.exit(1);
  }

  // 🔥 STEP 1: build index (sekali aja)
  await buildIndex(folder);

  // 🔥 STEP 2: load index
  const index = loadIndex();

  // 🔥 STEP 3: query
  const query = "jelaskan struktur project ini dan fungsi utama";

  console.log("\n🔍 Searching context...");
  const results = await search(query, index);

  const context = results
    .map((r) => `FILE: ${r.file}\n${r.content}`)
    .join("\n\n");

  // 🔥 STEP 4: ask LLM
  const model = getModel();

  const response = await ask(
    model,
    [{ role: "user", content: query }],
    context,
  );

  console.log("\n🤖 AI Response:\n");
  console.log(response);
}

main();
