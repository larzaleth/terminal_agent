import { isSafePath } from "../../utils/utils.js";
import {
  ripgrepSearch,
  fallbackGrepSearch,
  GREP_MAX_MATCHES,
} from "../search-utils.js";
import { exists, UNSAFE_PATH_MSG } from "./base.js";

export default async function ({ pattern, dir = ".", include, isRegex = false }) {
  try {
    if (!isSafePath(dir)) return UNSAFE_PATH_MSG;
    if (!pattern) return "❌ Error: Search pattern cannot be empty.";
    if (!(await exists(dir))) return `❌ Error: Directory '${dir}' not found.`;

    const rgResult = await ripgrepSearch({
      pattern,
      dir,
      include,
      isRegex,
      maxMatches: GREP_MAX_MATCHES,
    });
    if (rgResult?.error) {
      return `❌ Error during search: ${rgResult.error}`;
    }
    if (rgResult) {
      if (rgResult.matches.length === 0) {
        return `❌ No matches found for '${pattern}'${include ? ` in files matching '${include}'` : ""}.`;
      }

      let result = `✅ Found ${rgResult.matches.length} matches:\n\n${rgResult.matches.join("\n")}`;
      if (rgResult.limited) {
        result += `\n\n⚠️ Showing first ${GREP_MAX_MATCHES} matches. Use 'include' to narrow your search.`;
      }
      return result;
    }

    const fallbackResult = await fallbackGrepSearch({
      pattern,
      dir,
      include,
      isRegex,
      maxMatches: GREP_MAX_MATCHES,
    });
    if (!fallbackResult.sawFiles) {
      return `❌ No files found in '${dir}'${include ? ` matching '${include}'` : ""}.`;
    }
    if (fallbackResult.matches.length === 0) {
      return `❌ No matches found for '${pattern}' in ${fallbackResult.filesScanned} files.`;
    }

    let result = `✅ Found ${fallbackResult.matches.length} matches:\n\n${fallbackResult.matches.join("\n")}`;
    if (fallbackResult.limited) {
      result += `\n\n⚠️ Showing first ${GREP_MAX_MATCHES} matches. Use 'include' to narrow your search.`;
    }
    return result;
  } catch (err) {
    return `❌ Error during search: ${err.message}`;
  }
}
