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
      return {
        use: [{ loader: rule }]
      };
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

    newRule.resource = RuleSet.normalizeResource(rule);
    newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
    newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
    newRule.issuer = RuleSet.normalizeCondition(rule.issuer);

    newRule.use = RuleSet.normalizeUse(rule, refs, ident);

    if (rule.rules) {
      newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
    }

    if (rule.oneOf) {
      newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);
    }

    Object.keys(rule).forEach(key => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use"].includes(key)) {
        newRule[key] = rule[key];
      }
    });

    return newRule;
  }

  static normalizeResource(rule) {
    if (rule.test || rule.include || rule.exclude) {
      const condition = {
        test: rule.test,
        include: rule.include,
        exclude: rule.exclude
      };
      return RuleSet.normalizeCondition(condition);
    }

    if (rule.resource) {
      return RuleSet.normalizeCondition(rule.resource);
    }

    return undefined;
  }

  static normalizeUse(rule, refs, ident) {
    if (rule.use) {
      return RuleSet.normalizeUseArray(rule.use, refs, ident);
    }

    if (rule.loader && rule.loaders) {
      throw new Error("Provided loader and loaders for rule (use only one of them)");
    }

    const loader = rule.loaders || rule.loader;

    if (typeof loader === "string" && !rule.options && !rule.query) {
      return RuleSet.normalizeUseArray([loader], refs, ident);
    }

    if (typeof loader === "string" && (rule.options || rule.query)) {
      return RuleSet.normalizeUseArray([{ loader, options: rule.options || rule.query }], refs, ident);
    }

    if (loader && (rule.options || rule.query)) {
      throw new Error("Options/query cannot be used with loaders (use options for each array item)");
    }

    if (loader) {
      return RuleSet.normalizeUseArray(loader, refs, ident);
    }

    if (rule.options || rule.query) {
      throw new Error("Options/query provided without loader (use loader + options)");
    }

    return undefined;
  }

  static normalizeUseArray(use, refs, ident) {
    if (Array.isArray(use)) {
      return use.map((item, idx) => RuleSet.normalizeUseItem(item, refs, `${ident}-${idx}`));
    }

    return [RuleSet.normalizeUseItem(use, refs, ident)];
  }

  static normalizeUseItem(item, refs, ident) {
    if (typeof item === "function") {
      return item;
    }

    if (typeof item === "string") {
      return RuleSet.normalizeUseItemString(item, refs, ident);
    }

    const newItem = {};

    if (item.options && item.query) {
      throw new Error("Provided options and query in use");
    }

    if (!item.loader) {
      throw new Error("No loader specified");
    }

    newItem.options = item.options || item.query;

    if (typeof newItem.options === "object" && newItem.options) {
      if (newItem.options.ident) {
        newItem.ident = newItem.options.ident;
      } else {
        newItem.ident = ident;
      }
    }

    Object.keys(item).forEach(key => {
      if (key !== "options" && key !== "query") {
        newItem[key] = item[key];
      }
    });

    return newItem;
  }

  static normalizeUseItemString(useItemString, refs, ident) {
    const idx = useItemString.indexOf("?");
    if (idx >= 0) {
      return {
        loader: useItemString.substr(0, idx),
        options: useItemString.substr(idx + 1)
      };
    }
    return {
      loader: useItemString
    };
  }

  static normalizeCondition(condition) {
    if (!condition) {
      throw new Error("Expected condition but got falsy value");
    }

    if (typeof condition === "string") {
      return str => str.indexOf(condition) === 0;
    }

    if (typeof condition === "function") {
      return condition;
    }

    if (condition instanceof RegExp) {
      return condition.test.bind(condition);
    }

    if (Array.isArray(condition)) {
      return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
    }

    if (typeof condition !== "object") {
      throw new Error(`Unexpected ${typeof condition} when condition was expected (${condition})`);
    }

    const matchers = [];

    Object.keys(condition).forEach(key => {
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
            matchers.push(andMatcher(value.map(c => RuleSet.normalizeCondition(c))));
          }
          break;
        case "not":
        case "exclude":
          if (value) {
            matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
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

    return andMatcher(matchers);
  }

  static buildErrorMessage(condition, error) {
    const conditionAsText = JSON.stringify(condition, (key, value) => {
      return value === undefined ? "undefined" : value;
    }, 2);
    return error.message + " in " + conditionAsText;
  }

  exec(data) {
    const result = [];
    this._run(data, {
      rules: this.rules
    }, result);
    return result;
  }

  _run(data, rule, result) {
    if (rule.resource && !data.resource) {
      return false;
    }

    if (rule.resourceQuery && !data.resourceQuery) {
      return false;
    }

    if (rule.compiler && !data.compiler) {
      return false;
    }

    if (rule.issuer && !data.issuer) {
      return false;
    }

    if (rule.resource && !rule.resource(data.resource)) {
      return false;
    }

    if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) {
      return false;
    }

    if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) {
      return false;
    }

    if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) {
      return false;
    }

    Object.keys(rule).forEach(key => {
      if (!["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use"].includes(key)) {
        result.push({
          type: key,
          value: rule[key]
        });
      }
    });

    if (rule.use) {
      rule.use.forEach(use => {
        result.push({
          type: "use",
          value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use
        });
      });
    }

    if (rule.rules) {
      rule.rules.forEach(r => this._run(data, r, result));
    }

    if (rule.oneOf) {
      for (let i = 0; i < rule.oneOf.length; i++) {
        if (this._run(data, rule.oneOf[i], result)) {
          break;
        }
      }
    }

    return true;
  }

  findOptionsByIdent(ident) {
    const options = this.references[ident];
    if (!options) {
      throw new Error(`Can't find options with ident '${ident}'`);
    }
    return options;
  }
};

function notMatcher(matcher) {
  return function(str) {
    return !matcher(str);
  };
}

function orMatcher(items) {
  return function(str) {
    for (let i = 0; i < items.length; i++) {
      if (items[i](str)) {
        return true;
      }
    }
    return false;
  };
}

function andMatcher(items) {
  return function(str) {
    for (let i = 0; i < items.length; i++) {
      if (!items[i](str)) {
        return false;
      }
    }
    return true;
  };
}