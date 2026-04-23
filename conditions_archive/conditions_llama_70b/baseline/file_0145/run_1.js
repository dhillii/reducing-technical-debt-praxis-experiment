```javascript
"use strict";

module.exports = class RuleSet {
  constructor(rules) {
    this.references = Object.create(null);
    this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
  }

  static normalizeRules(rules, refs, ident) {
    if (Array.isArray(rules)) {
      return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
    } else if (rules) {
      return [RuleSet.normalizeRule(rules, refs, ident)];
    } else {
      return [];
    }
  }

  static normalizeRule(rule, refs, ident) {
    if (typeof rule === "string") {
      return { use: [{ loader: rule }] };
    }

    if (!rule) {
      throw new Error("Unexpected null when object was expected as rule");
    }

    if (typeof rule !== "object") {
      throw new Error(`Unexpected ${typeof rule} when object was expected as rule (${rule})`);
    }

    const newRule = {};
    let useSource;
    let resourceSource;

    const conditionKeys = ["test", "include", "exclude"];
    const condition = {};

    conditionKeys.forEach((key) => {
      if (rule[key]) {
        condition[key] = rule[key];
      }
    });

    if (Object.keys(condition).length > 0) {
      newRule.resource = RuleSet.normalizeCondition(condition);
    }

    if (rule.resource) {
      newRule.resource = RuleSet.normalizeCondition(rule.resource);
    }

    const otherConditions = ["resourceQuery", "compiler", "issuer"];
    otherConditions.forEach((key) => {
      if (rule[key]) {
        newRule[key] = RuleSet.normalizeCondition(rule[key]);
      }
    });

    const loader = rule.loaders || rule.loader;
    if (loader) {
      newRule.use = RuleSet.normalizeUse(loader, ident, rule.options, rule.query);
    } else if (rule.use) {
      newRule.use = RuleSet.normalizeUse(rule.use, ident);
    }

    if (rule.rules) {
      newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    }

    if (rule.oneOf) {
      newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
    }

    Object.keys(rule).forEach((key) => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "loader", "loaders", "use", "rules", "oneOf", "options", "query"].includes(key)) {
        newRule[key] = rule[key];
      }
    });

    if (Array.isArray(newRule.use)) {
      newRule.use.forEach((item) => {
        if (item.ident) {
          refs[item.ident] = item.options;
        }
      });
    }

    return newRule;
  }

  static normalizeUse(use, ident, options, query) {
    if (Array.isArray(use)) {
      return use.map((item, idx) => RuleSet.normalizeUseItem(item, `${ident}-${idx}`, options, query));
    }

    return [RuleSet.normalizeUseItem(use, ident, options, query)];
  }

  static normalizeUseItem(item, ident, options, query) {
    if (typeof item === "function") {
      return item;
    }

    if (typeof item === "string") {
      const idx = item.indexOf("?");
      if (idx >= 0) {
        return {
          loader: item.substr(0, idx),
          options: item.substr(idx + 1),
        };
      }
      return { loader: item };
    }

    const newItem = {};

    if (item.options && item.query) {
      throw new Error("Provided options and query in use");
    }

    if (!item.loader) {
      throw new Error("No loader specified");
    }

    newItem.options = item.options || item.query || options || query;

    if (typeof newItem.options === "object" && newItem.options) {
      if (newItem.options.ident) {
        newItem.ident = newItem.options.ident;
      } else {
        newItem.ident = ident;
      }
    }

    Object.keys(item).forEach((key) => {
      if (key !== "options" && key !== "query") {
        newItem[key] = item[key];
      }
    });

    return newItem;
  }

  static normalizeCondition(condition) {
    if (!condition) {
      throw new Error("Expected condition but got falsy value");
    }

    if (typeof condition === "string") {
      return (str) => str.indexOf(condition) === 0;
    }

    if (typeof condition === "function") {
      return condition;
    }

    if (condition instanceof RegExp) {
      return condition.test.bind(condition);
    }

    if (Array.isArray(condition)) {
      return (str) => condition.some((c) => RuleSet.normalizeCondition(c)(str));
    }

    if (typeof condition !== "object") {
      throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
    }

    const matchers = [];

    Object.keys(condition).forEach((key) => {
      const value = condition[key];
      switch (key) {
        case "or":
        case "include":
        case "test":
          if (value) {
            matchers.push(RuleSet.normalizeCondition(value));
          }
          break;
        case "and":
          if (value) {
            matchers.push((str) => value.every((c) => RuleSet.normalizeCondition(c)(str)));
          }
          break;
        case "not":
        case "exclude":
          if (value) {
            matchers.push((str) => !RuleSet.normalizeCondition(value)(str));
          }
          break;
        default:
          throw new Error(`Unexpected property ${key} in condition`);
      }
    });

    if (matchers.length === 0) {
      throw new Error(`Expected condition but got ${condition}`);
    }

    if (matchers.length === 1) {
      return matchers[0];
    }

    return (str) => matchers.every((matcher) => matcher(str));
  }

  exec(data) {
    const result = [];
    this._run(data, { rules: this.rules }, result);
    return result;
  }

  _run(data, rule, result) {
    if (rule.resource && !data.resource) return false;
    if (rule.resourceQuery && !data.resourceQuery) return false;
    if (rule.compiler && !data.compiler) return false;
    if (rule.issuer && !data.issuer) return false;

    if (rule.resource && !rule.resource(data.resource)) return false;
    if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
    if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
    if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;

    Object.keys(rule).forEach((key) => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use"].includes(key)) {
        result.push({ type: key, value: rule[key] });
      }
    });

    if (rule.use) {
      rule.use.forEach((use) => {
        result.push({
          type: "use",
          value: typeof use === "function" ? use() : use,
        });
      });
    }

    if (rule.rules) {
      rule.rules.forEach((r) => this._run(data, r, result));
    }

    if (rule.oneOf) {
      for (let i = 0; i < rule.oneOf.length; i++) {
        if (this._run(data, rule.oneOf[i], result)) break;
      }
    }

    return true;
  }

  findOptionsByIdent(ident) {
    const options = this.references[ident];
    if (!options) throw new Error(`Can't find options with ident '${ident}'`);
    return options;
  }
};
```