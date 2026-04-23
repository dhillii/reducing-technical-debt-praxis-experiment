"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	/* ---------- Normalization ---------- */
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

		const newRule = {};
		let useSource;
		let resourceSource;

		// ----- resource conditions -----
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._ensureSingleSource("resource", "test + include + exclude", resourceSource);
			resourceSource = "test + include + exclude";
			newRule.resource = RuleSet._buildCondition({ test: rule.test, include: rule.include, exclude: rule.exclude });
		}
		if (rule.resource) {
			RuleSet._ensureSingleSource("resource", "resource", resourceSource);
			resourceSource = "resource";
			newRule.resource = RuleSet._buildCondition(rule.resource);
		}
		if (rule.resourceQuery) newRule.resourceQuery = RuleSet._buildCondition(rule.resourceQuery);
		if (rule.compiler) newRule.compiler = RuleSet._buildCondition(rule.compiler);
		if (rule.issuer) newRule.issuer = RuleSet._buildCondition(rule.issuer);

		// ----- loader / use handling -----
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;
		if (typeof loader === "string" && !rule.options && !rule.query) {
			RuleSet._ensureSingleSource("use", "loader", useSource);
			useSource = "loader";
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			RuleSet._ensureSingleSource("use", "loader + options/query", useSource);
			useSource = "loader + options/query";
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			RuleSet._ensureSingleSource("use", "loaders", useSource);
			useSource = "loaders";
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}
		if (rule.use) {
			RuleSet._ensureSingleSource("use", "use", useSource);
			useSource = "use";
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		// ----- nested rules -----
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		// ----- copy unknown keys -----
		const known = [
			"resource", "resourceQuery", "compiler", "test", "include", "exclude",
			"issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"
		];
		Object.keys(rule).filter(k => known.indexOf(k) < 0).forEach(k => {
			newRule[k] = rule[k];
		});

		// ----- collect references -----
		if (Array.isArray(newRule.use)) {
			newRule.use.forEach(item => {
				if (item.ident) refs[item.ident] = item.options;
			});
		}
		return newRule;
	}

	/** Ensure a rule has only one source for a given category */
	static _ensureSingleSource(category, newSource, currentSource) {
		if (currentSource && currentSource !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(category, new Error(`Rule can only have one ${category} source (provided ${newSource} and ${currentSource})`)));
		}
	}

	/** Build a normalized condition and wrap errors */
	static _buildCondition(condition) {
		try {
			return RuleSet.normalizeCondition(condition);
		} catch (e) {
			throw new Error(RuleSet.buildErrorMessage(condition, e));
		}
	}

	/* ---------- Condition Normalization ---------- */
	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) return orMatcher(condition.map(c => RuleSet.normalizeCondition(c)));
		if (typeof condition !== "object") throw Error(`Unexcepted ${typeof condition} when condition was expected (${condition})`);

		const matchers = [];
		Object.keys(condition).forEach(key => {
			const value = condition[key];
			switch (key) {
				case "or":
				case "include":
				case "test":
					if (value) matchers.push(RuleSet.normalizeCondition(value));
					break;
				case "and":
					if (value) matchers.push(andMatcher(value.map(c => RuleSet.normalizeCondition(c))));
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

	/* ---------- Use Normalization ---------- */
	static normalizeUse(use, ident) {
		if (Array.isArray(use)) {
			return use
				.map((item, idx) => RuleSet.normalizeUse(item, `${ident}-${idx}`))
				.reduce((a, b) => a.concat(b), []);
		}
		return [RuleSet.normalizeUseItem(use, ident)];
	}

	static normalizeUseItem(use, ident) {
		if (typeof use === "function") return use;
		if (typeof use === "string") return RuleSet.normalizeUseItemString(use);

		if (use.options && use.query) throw new Error("Provided options and query in use");
		if (!use.loader) throw new Error("No loader specified");

		const newItem = { ...use };
		newItem.options = use.options || use.query;

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}
		delete newItem.options;
		delete newItem.query;
		return newItem;
	}

	static normalizeUseItemString(str) {
		const idx = str.indexOf("?");
		if (idx >= 0) {
			return { loader: str.substring(0, idx), options: str.substring(idx + 1) };
		}
		return { loader: str };
	}

	static normalizeUseItemFunction(use, data) {
		const result = use(data);
		if (typeof result === "string") return RuleSet.normalizeUseItemString(result);
		return result;
	}

	/* ---------- Execution ---------- */
	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!RuleSet._testConditions(data, rule)) return false;

		RuleSet._applyProperties(rule, result);
		if (rule.use) RuleSet._applyUse(rule.use, data, result, rule.enforce);
		if (rule.rules) RuleSet._runNestedRules(data, rule.rules, result);
		if (rule.oneOf) RuleSet._runOneOf(data, rule.oneOf, result);

		return true;
	}

	/** Test all condition properties of a rule */
	static _testConditions(data, rule) {
		if (rule.resource && !data.resource) return false;
		if (rule.resourceQuery && !data.resourceQuery) return false;
		if (rule.compiler && !data.compiler) return false;
		if (rule.issuer && !data.issuer) return false;
		if (rule.resource && !rule.resource(data.resource)) return false;
		if (data.issuer && rule.issuer && !rule.issuer(data.issuer)) return false;
		if (data.resourceQuery && rule.resourceQuery && !rule.resourceQuery(data.resourceQuery)) return false;
		if (data.compiler && rule.compiler && !rule.compiler(data.compiler)) return false;
		return true;
	}

	/** Push non‑rule specific properties to the result */
	static _applyProperties(rule, result) {
		const excluded = ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"];
		Object.keys(rule)
			.filter(k => excluded.indexOf(k) < 0)
			.forEach(k => result.push({ type: k, value: rule[k] }));
	}

	/** Add use entries to the result */
	static _applyUse(useArray, data, result, enforce) {
		useArray.forEach(use => {
			const value = typeof use === "function"
				? RuleSet.normalizeUseItemFunction(use, data)
				: use;
			result.push({ type: "use", value, enforce });
		});
	}

	/** Recursively run nested `rules` */
	static _runNestedRules(data, rules, result) {
		rules.forEach(r => this.prototype._run(data, r, result));
	}

	/** Run `oneOf` rules until one matches */
	static _runOneOf(data, oneOf, result) {
		for (let i = 0; i < oneOf.length; i++) {
			if (this.prototype._run(data, oneOf[i], result)) break;
		}
	}

	/* ---------- Helpers ---------- */
	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
		return `${error.message} in ${conditionAsText}`;
	}

	findOptionsByIdent(ident) {
		const options = this.references[ident];
		if (!options) throw new Error(`Can't find options with ident '${ident}'`);
		return options;
	}
};

/* ---------- Matcher utilities ---------- */
function notMatcher(matcher) {
	return str => !matcher(str);
}
function orMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (items[i](str)) return true;
		}
		return false;
	};
}
function andMatcher(items) {
	return str => {
		for (let i = 0; i < items.length; i++) {
			if (!items[i](str)) return false;
		}
		return true;
	};
}