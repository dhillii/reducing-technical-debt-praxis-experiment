```javascript
/**
 * @fileoverview Collects the built‑in rules into a map structure so that they can be imported all at once
 * without using the file‑system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Generates a map entry for each rule file in the current directory.
 * Files that are not rule modules (e.g., this index file or non‑JS files) are ignored.
 *
 * @returns {Record<string, () => unknown>}
 */
function buildRuleMap() {
  const entries = fs
    .readdirSync(__dirname, { withFileTypes: true })
    .filter(
      (dirent) =>
        dirent.isFile() &&
        dirent.name.endsWith(".js") &&
        dirent.name !== "index.js"
    )
    .map((dirent) => {
      const ruleName = path.basename(dirent.name, ".js");
      return [ruleName, () => require(`./${ruleName}`)];
    });

  return Object.fromEntries(entries);
}

module.exports = new LazyLoadingRuleMap(buildRuleMap());
```