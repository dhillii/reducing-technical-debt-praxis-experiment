/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
/*
<rules>: <rule>
<rules>: [<rule>]
<rule>: {
	resource: {
		test: <condition>,
		include: <condition>,
		exclude: <condition>,
	},
	resource: <condition>, -> resource.test
	test: <condition>, -> resource.test
	include: <condition>, -> resource.include
	exclude: <condition>, -> resource.exclude
	resourceQuery: <condition>,
	compiler: <condition>,
	issuer: <condition>,
	use: "loader", -> use[0].loader
	loader: <>, -> use[0].loader
	loaders: <>, -> use
	options: {}, -> use[0].options,
	query: {}, -> options
	parser: {},
	use: [
		"loader" -> use[x].loader
	],
	use: [
		{
			loader: "loader",
			options: {}
		}
	],
	rules: [
		<rule>
	],
	oneOf: [
		<rule>
	]
}

<condition>: /regExp/
<condition>: function(arg) {}
<condition>: "starting"
<condition>: [<condition>] // or
<condition>: { and: [<condition>] }
<condition>: { or: [<condition>] }
<condition>: { not: [<condition>] }
<condition>: { test: <condition>, include: <condition>, exclude: <condition> }


normalized:

{
	resource: function(),
	resourceQuery: function(),
	compiler: function(),
	issuer: function(),
	use: [
		{
			loader: string,
			options: string,
			<any>: <any>
		}
	],
	rules: [<rule>],
	oneOf: [<rule>],
	<any>: <any>,
}

*/

"use strict";

module.exports = class RuleSet {
	constructor(rules) {
		this.references = Object.create(null);
		this.rules = RuleSet.normalizeRules(rules, this.references, "ref-");
	}

	/* ---------- Normalization entry points ---------- */

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
		if (typeof rule !== "object") throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

		const newRule = {};
		const useSource = { value: null };
		const resourceSource = { value: null };

		// resource related conditions
		RuleSet._processResource(rule, newRule, resourceSource);
		RuleSet._processCondition(rule, newRule, "resourceQuery");
		RuleSet._processCondition(rule, newRule, "compiler");
		RuleSet._processCondition(rule, newRule, "issuer");

		// loader / use handling
		RuleSet._processLoaderAndUse(rule, newRule, refs, ident, useSource);

		// nested rules
		if (rule.rules) newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);
		if (rule.oneOf) newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		// copy unknown properties
		RuleSet._copyExtraProperties(rule, newRule);

		// collect references from use items
		RuleSet._collectRefs(newRule.use, refs);

		return newRule;
	}

	/* ---------- Helper methods for normalizeRule ---------- */

	/** Process test/include/exclude and resource properties */
	static _processResource(rule, newRule, resourceSource) {
		if (rule.test || rule.include || rule.exclude) {
			RuleSet._checkResourceSource(resourceSource, "test + include + exclude");
			const condition = { test: rule.test, include: rule.include, exclude: rule.exclude };
			try {
				newRule.resource = RuleSet.normalizeCondition(condition);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(condition, error));
			}
		}
		if (rule.resource) {
			RuleSet._checkResourceSource(resourceSource, "resource");
			try {
				newRule.resource = RuleSet.normalizeCondition(rule.resource);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
			}
		}
	}

	/** Generic condition processing for keys like resourceQuery, compiler, issuer */
	static _processCondition(rule, newRule, key) {
		if (rule[key]) {
			try {
				newRule[key] = RuleSet.normalizeCondition(rule[key]);
			} catch (error) {
				throw new Error(RuleSet.buildErrorMessage(rule[key], error));
			}
		}
	}

	/** Handle loader / loaders / use definitions and enforce single source */
	static _processLoaderAndUse(rule, newRule, refs, ident, useSource) {
		if (rule.loader && rule.loaders) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));
		}
		const loader = rule.loaders || rule.loader;

		if (typeof loader === "string" && !rule.options && !rule.query) {
			RuleSet._checkUseSource(useSource, "loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if (typeof loader === "string" && (rule.options || rule.query)) {
			RuleSet._checkUseSource(useSource, "loader + options/query");
			newRule.use = RuleSet.normalizeUse({ loader, options: rule.options, query: rule.query }, ident);
		} else if (loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if (loader) {
			RuleSet._checkUseSource(useSource, "loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if (rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if (rule.use) {
			RuleSet._checkUseSource(useSource, "use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}
	}

	/** Ensure only one resource source is used */
	static _checkResourceSource(resourceSource, newSource) {
		if (resourceSource.value && resourceSource.value !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(resourceSource, new Error(`Rule can only have one resource source (provided ${newSource} and ${resourceSource.value})`)));
		}
		resourceSource.value = newSource;
	}

	/** Ensure only one use source is used */
	static _checkUseSource(useSource, newSource) {
		if (useSource.value && useSource.value !== newSource) {
			throw new Error(RuleSet.buildErrorMessage(useSource, new Error(`Rule can only have one result source (provided ${newSource} and ${useSource.value})`)));
		}
		useSource.value = newSource;
	}

	/** Copy properties not part of the known rule schema */
	static _copyExtraProperties(source, target) {
		const known = ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"];
		Object.keys(source).filter(key => known.indexOf(key) < 0).forEach(key => {
			target[key] = source[key];
		});
	}

	/** Store ident -> options mapping for later lookup */
	static _collectRefs(useArray, refs) {
		if (Array.isArray(useArray)) {
			useArray.forEach(item => {
				if (item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}
	}

	/* ---------- Error handling ---------- */

	static buildErrorMessage(condition, error) {
		const conditionAsText = JSON.stringify(condition, (key, value) => (value === undefined ? "undefined" : value), 2);
		return `${error.message} in ${conditionAsText}`;
	}

	/* ---------- Use normalization ---------- */

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
		if (typeof result === "string") {
			return RuleSet.normalizeUseItem(result);
		}
		return result;
	}

	static normalizeUseItemString(useItemString) {
		const idx = useItemString.indexOf("?");
		if (idx >= 0) {
			return {
				loader: useItemString.substring(0, idx),
				options: useItemString.substring(idx + 1)
			};
		}
		return { loader: useItemString };
	}

	static normalizeUseItem(item, ident) {
		if (typeof item === "function") return item;
		if (typeof item === "string") return RuleSet.normalizeUseItemString(item);

		if (item.options && item.query) throw new Error("Provided options and query in use");
		if (!item.loader) throw new Error("No loader specified");

		const newItem = {};
		newItem.options = item.options || item.query;

		if (typeof newItem.options === "object" && newItem.options) {
			newItem.ident = newItem.options.ident || ident;
		}

		Object.keys(item)
			.filter(key => ["options", "query"].indexOf(key) < 0)
			.forEach(key => {
				newItem[key] = item[key];
			});

		return newItem;
	}

	/* ---------- Condition normalization ---------- */

	static normalizeCondition(condition) {
		if (!condition) throw new Error("Expected condition but got falsy value");
		if (typeof condition === "string") return str => str.indexOf(condition) === 0;
		if (typeof condition === "function") return condition;
		if (condition instanceof RegExp) return condition.test.bind(condition);
		if (Array.isArray(condition)) {
			const items = condition.map(c => RuleSet.normalizeCondition(c));
			return orMatcher(items);
		}
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
					if (value) {
						const items = value.map(c => RuleSet.normalizeCondition(c));
						matchers.push(andMatcher(items));
					}
					break;
				case "not":
				case "exclude":
					if (value) {
						const matcher = RuleSet.normalizeCondition(value);
						matchers.push(notMatcher(matcher));
					}
					break;
				default:
					throw new Error(`Unexcepted property ${key} in condition`);
			}
		});
		if (matchers.length === 0) throw new Error(`Excepted condition but got ${condition}`);
		if (matchers.length === 1) return matchers[0];
		return andMatcher(matchers);
	}

	/* ---------- Execution ---------- */

	exec(data) {
		const result = [];
		this._run(data, { rules: this.rules }, result);
		return result;
	}

	_run(data, rule, result) {
		if (!this._matches(rule, data)) return false;
		this._pushProperties(rule, result);
		if (rule.use) this._pushUse(rule.use, data, result, rule.enforce);
		if (rule.rules) this._runNested(rule.rules, data, result);
		if (rule.oneOf) this._runOneOf(rule.oneOf, data, result);
		return true;
	}

	/** Evaluate all condition functions */
	_matches(rule, data) {
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

	/** Append non‑structural rule properties to result */
	_pushProperties(rule, result) {
		const keys = Object.keys(rule).filter(key => ["resource", "resourceQuery", "compiler", "issuer", "rules", "oneOf", "use", "enforce"].indexOf(key) < 0);
		keys.forEach(key => {
			result.push({ type: key, value: rule[key] });
		});
	}

	/** Append use entries to result, normalizing functions */
	_pushUse(useArray, data, result, enforce) {
		useArray.forEach(use => {
			result.push({
				type: "use",
				value: typeof use === "function" ? RuleSet.normalizeUseItemFunction(use, data) : use,
				enforce
			});
		});
	}

	/** Recursively run nested rules */
	_runNested(rules, data, result) {
		for (let i = 0; i < rules.length; i++) {
			this._run(data, rules[i], result);
		}
	}

	/** Run oneOf rules, stopping after first match */
	_runOneOf(rules, data, result) {
		for (let i = 0; i < rules.length; i++) {
			if (this._run(data, rules[i], result)) break;
		}
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