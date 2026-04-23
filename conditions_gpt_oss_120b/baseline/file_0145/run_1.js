"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	static normalizeRules(rules, refs, ident) {
		if (Array.isArray(rules)) {
			return rules.map((rule, idx) => RuleSet.normalizeRule(rule, refs, `${ident}-${idx}`));
		}
		if (rules) {
			return [RuleSet.normalizeRule(rules, refs, ident)];
		}
		return [];
	}

	static normalizeRule(rule, refs, ident) {
		if (typeof rule === "string") {
			return { use: [{ loader: rule }] };
		}
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object") throw new Error(`Unexcepted ${typeof rule} when object was expected as rule (${rule})`);

		let newRule = {};
		let useSource;
		let resourceSource;

		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			newRule.resource = normalizeConditionWrapper(condition);
		}

		if (rule.resource) {
			checkResourceSource("resource");
			newRule.resource = normalizeConditionWrapper(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = normalizeConditionWrapper(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = normalizeConditionWrapper(rule.compiler);
		if (rule.issuer) newRule.issuer = normalizeConditionWrapper(rule.issuer);

		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if (rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		const extraKeys = Object.keys(rule).filter(
			(k) => !["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].includes(k)
		);
		extraKeys.forEach((k) => (newRule[k] = rule[k]));

		function checkUseSource(src) {
			if (useSource && useSource !== src) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one result source (provided ${src} and ${useSource})`)));
			}
			useSource = src;
		}
		function checkResourceSource(src) {
			if (resourceSource && resourceSource !== src) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error(`Rule can only have one resource source (provided ${src} and ${resourceSource})`)));
			}
			resourceSource = src;
		}
		function normalizeConditionWrapper(cond) {
			try {
				return RuleSet.normalizeCondition(cond);
			} catch (e) {
				throw new Error(RuleSet.buildErrorMessage(cond, e));
			}
		}
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	static buildErrorMessage(condition, error) {
		const txt = JSON.stringify(
			condition,
			(_, v) => (v === undefined ? "undefined" : v),
			2
		);
		return `${error.message} in ${txt}`;
	}

	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((a, b) => a.concat(b), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") return RuleSet.normalizeUseItem(result);
		return result;
	}

	static normalizeUseItemString(str) {
		const idx = str.indexOf("?");
		if (idx >= 0) {
			return { loader: str.substring(0, idx), options: str.substring(idx + 1) };
		}
		return { loader: str };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") return item;
		if (typeof item === "string") return RuleSet.normalizeUseItemString(item);

		if (item.options && item.query) throw new Error("Provided options and query in use");
		if (!item.loader) throw new Error("No loader specified");

		const newItem = { options: item.options || item.query };
		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}
		Object.keys(item)
			.filter((k) => !["options", "query"].includes(k))
			.forEach((k) => (newItem[k] = item[k]));
		return newItem;
	}

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return (s) => s.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) {
			const items = condition.map((c) => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

		const matchers = [];
		Object.keys(condition).forEach((key) => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) matchers.push(andMatcher(value.map((c) => RuleSet.normalizeCondition(c))));
					break;
				case "not":
				case "exclude":
					if (value) matchers.push(notMatcher(RuleSet.normalizeCondition(value)));
					break;
				default:
					throw new Error(`Unexcepted property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!this._matches(rule, data)) return false;
		this._applyProperties(rule, result);
		this._processUse(rule, result, data);
		this._processSubRules(rule, data, result);
		this._processOneOf(rule, data, result);
		return true;
	}

	_matches(rule, data) {
		if (rule.resource && (!data.resource || !rule.resource(data.resource))) return false;
		if (rule.resourceQuery && (!data.resourceQuery || !rule.resourceQuery(data.resourceQuery))) return false;
		if (rule.compiler && (!data.compiler || !rule.compiler(data.compiler))) return false;
		if (rule.issuer && (!data.issuer || !rule.issuer(data.issuer))) return false;
		return true;
	}

	_applyProperties(rule, result) {
		Object.keys(rule)
			.filter((k) => !["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].includes(k))
			.forEach((k) => result.push({ type: k, value: rule[k] }));
	}

	_processUse(rule, result, data) {
		if (!rule.use) return;
		rule.use.forEach((use) => {
			const value = typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use;
			result.push({ type: "use", value, enforce: rule.enforce });
		});
	}

	_processSubRules(rule, data, result) {
		if (!rule.rules) return;
		rule.rules.forEach((sub) => this._run(data, sub, result));
	}

	_processOneOf(rule, data, result) {
		if (!rule.oneOf) return;
		for (let i = 0; i < rule.oneOf.length; i++) {
			if (this._run(data, rule.oneOf[i], result)) break;
		}
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

function notMatcher(matcher) {
	return (s) => !matcher(s);
}
function orMatcher(items) {
	return (s) => {
		for (let i = 0; i < items.length; i++) if (items[i](s)) return true;
		return false;
	};
}
function andMatcher(items) {
	return (s) => {
		for (let i = 0; i < items.length; i++) if (!items[i](s)) return false;
		return true;
	};
};