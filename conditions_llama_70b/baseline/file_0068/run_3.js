```javascript
/**
 * @fileoverview Collects the built-in rules into a map structure so that they can be imported all at once and without
 * using the file-system directly.
 * @author Peter (Somogyvari) Metz
 */

"use strict";

/* eslint sort-keys: ["error", "asc"] -- More readable for long list */

const { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");
const fs = require("fs");
const path = require("path");

const rulesDir = path.join(__dirname, ".");

const getRuleModules = () => {
  const ruleModules = {};
  fs.readdirSync(rulesDir)
    .filter((file) => file.endsWith(".js"))
    .forEach((file) => {
      const ruleName = path.basename(file, ".js");
      ruleModules[ruleName] = () => require(`./${ruleName}`);
    });
  return ruleModules;
};

module.exports = new LazyLoadingRuleMap(
  Object.entries(getRuleModules())
);
```