import chalk from "chalk";
import { getCacheStats, clearCache, cleanExpiredCache } from "../../rag/cache.js";

export async function cacheCommand(args) {
  const sub = args[0];
  if (sub === "stats") {
    const stats = getCacheStats();
    console.log(chalk.cyan("\n💾 Cache Statistics:"));
    console.log(chalk.white(`  Total Items: ${stats.totalItems}`));
    console.log(chalk.green(`  Valid Items: ${stats.validItems}`));
    console.log(chalk.yellow(`  Expired Items: ${stats.expiredItems}`));
    console.log(chalk.white(`  Total Size: ${stats.totalSizeKB} KB`));
    console.log(chalk.dim(`  TTL: ${stats.ttlHours} hour(s)\n`));
  } else if (sub === "clear") {
    clearCache();
  } else if (sub === "clean") {
    cleanExpiredCache();
  } else {
    console.log(chalk.yellow(`
💾 Cache Commands:
  ${chalk.white("/cache stats")}   Show cache statistics
  ${chalk.white("/cache clear")}   Clear all cached data
  ${chalk.white("/cache clean")}   Remove expired cache entries
`));
  }
}
