export function normalizeProviderName(provider) {
  if (!provider) return "gemini";
  return provider === "claude" ? "anthropic" : provider;
}

export function getProviderApiKeySpec(provider) {
  switch (normalizeProviderName(provider)) {
    case "openai":
      return {
        provider: "openai",
        label: "OpenAI",
        envVar: "OPENAI_API_KEY",
        setupUrl: "https://platform.openai.com/api-keys",
      };
    case "anthropic":
      return {
        provider: "anthropic",
        label: "Anthropic",
        envVar: "ANTHROPIC_API_KEY",
        setupUrl: "https://console.anthropic.com/settings/keys",
      };
    case "gemini":
    default:
      return {
        provider: "gemini",
        label: "Gemini",
        envVar: "GEMINI_API_KEY",
        setupUrl: "https://aistudio.google.com/app/apikey",
      };
  }
}

export function upsertEnvValue(source, key, value) {
  const line = `${key}=${value}`;
  const text = typeof source === "string" ? source : "";
  const rows = text === "" ? [] : text.split(/\r?\n/);
  const matcher = new RegExp(`^\\s*(?:export\\s+)?${escapeRegExp(key)}=`);

  let replaced = false;
  const nextRows = rows.map((row) => {
    if (!matcher.test(row)) return row;
    replaced = true;
    return line;
  });

  if (!replaced) nextRows.push(line);

  while (nextRows.length > 0 && nextRows[nextRows.length - 1] === "") {
    nextRows.pop();
  }

  return `${nextRows.join("\n")}\n`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
