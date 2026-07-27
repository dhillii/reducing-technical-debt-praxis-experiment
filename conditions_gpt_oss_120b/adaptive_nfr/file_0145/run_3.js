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
		if (typeof rule === "string")
			return { use: [{ loader: rule }] };
		if (!rule) throw new Error("Unexcepted null when object was expected as rule");
		if (typeof rule !== "object")
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

		let newRule = {};
		let useSource;
		let resourceSource;

		if (rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			newRule.resource = safeNormalizeCondition(condition);
		}

		if (rule.resource) {
			checkResourceSource("resource");
			newRule.resource = safeNormalizeCondition(rule.resource);
		}

		if (rule.resourceQuery) newRule.resourceQuery = safeNormalizeCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = safeNormalizeCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = safeNormalizeCondition(rule.issuer);

		if (rule.loader && rule.loaders)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

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

		const ignored = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
		Object.keys(rule).filter(k => ignored.indexOf(k) < 0).forEach(k => (newRule[k] = rule[k]));

		function checkUseSource(newSource) {
			if (useSource && useSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + useSource + ")")));
			useSource = newSource;
		}
		function checkResourceSource(newSource) {
			if (resourceSource && resourceSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + resourceSource + ")")));
			resourceSource = newSource;
		}
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
		return error.message + " in " + conditionAsText;
	}

	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((arr, items) => arr.concat(items), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") return RuleSet.normalizeUseItem(result);
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return { loader: useItemString.substr(0, idx), options: useItemString.substr(idx + 1) };
		}
		return { loader: useItemString };
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
			.filter(k => ["options", "query"].indexOf(k) < 0)
			.forEach(k => (newItem[k] = item[k]));
		return newItem;
	}

	/** @private */
	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw Error("Unexcepted " + typeof condition + " when condition was expected (" + condition + ")");

		const handlers = {
			or: handleOr,
			include: handleOr,
			test: handleOr,
			and: handleAnd,
			not: handleNot,
			exclude: handleNot
		};

		const matchers = [];
		Object.keys(condition).forEach(key => {
			const handler = handlers[key];
			if (handler) {
				const matcher = handler(condition[key]);
				if (matcher) matchers.push(matcher);
			} else {
				throw new Error("Unexcepted property " + key + " in condition");
			}
		});

		if (matchers.length === 0) throw new Error("Excepted condition but got " + condition);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/** @private */
	static exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	/** @private */
	_run(data, rule, result) {
		const checks = [
			{ prop: "resource", dataProp: "resource", fn: r => r(data.resource) },
			{ prop: "resourceQuery", dataProp: "resourceQuery", fn: r => r(data.resourceQuery) },
			{ prop: "compiler", dataProp: "compiler", fn: r => r(data.compiler) },
			{ prop: "issuer", dataProp: "issuer", fn: r => r(data.issuer) }
		];

		for (const { prop, dataProp, fn } of checks) {
			if (rule[prop] && !data[dataProp]) return false;
			if (rule[prop] && !fn(rule[prop])) return false;
		}

		const metaKeys = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => metaKeys.indexOf(k) < 0)
			.forEach(k => result.push({ type: k, value: rule[k] }));

		if (rule.use) {
			rule.use.forEach(use => {
				result.push({
					type: "use",
					value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
					enforce: rule.enforce
				});
			});
		}

		if (rule.rules) rule.rules.forEach(r => this._run(data, r, result));
		if (rule.oneOf) {
			for (const r of rule.oneOf) {
				if (this._run(data, r, result)) break;
			}
		}
		return true;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error("Can't find options with ident '" + ident + "'");
		return options;
	}
};

function notMatcher(matcher) {
	return str => !matcher(str);
}
function orMatcher(items) {
	return str => items.some(item => item(str));
}
function andMatcher(items) {
	return str => items.every(item => item(str));
}

/** @private */
function handleOr(value) {
	if (!value) return null;
	return RuleSet.normalizeCondition(value);
}

/** @private */
function handleAnd(value) {
	if (!Array.isArray(value)) return null;
	const items = value.map(c => RuleSet.normalizeCondition(c));
	return andMatcher(items);
}

/** @private */
function handleNot(value) {
	if (!value) return null;
	const matcher = RuleSet.normalizeCondition(value);
	return notMatcher(matcher);
}

/** @private */
function safeNormalizeCondition(cond) {
	try {
		return RuleSet.normalizeCondition(cond);
	} catch (error) {
		throw new Error(RuleSet.buildErrorMessage(cond, error));
	}
}