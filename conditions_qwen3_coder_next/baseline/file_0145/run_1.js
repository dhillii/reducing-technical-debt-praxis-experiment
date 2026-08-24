static normalizeRule(rule, refs, ident) {
		if(typeof rule === "string")
			return {
				use: [{
					loader: rule
				}]
			};
		if(!rule)
			throw new Error("Unexcepted null when object was expected as rule");
		if(typeof rule !== "object")
			throw new Error("Unexcepted " + typeof rule + " when object was expected as rule (" + rule + ")");

		let newRule = {};
		let useSource;
		let resourceSource;

		if(rule.test || rule.include || rule.exclude) {
			checkResourceSource("test + include + exclude");
			newRule.resource = RuleSet.normalizeCondition({
				test: rule.test,
				include: rule.include,
				exclude: rule.exclude
			});
		}

		if(rule.resource) {
			checkResourceSource("resource");
			newRule.resource = RuleSet.normalizeCondition(rule.resource);
		}

		if(rule.resourceQuery) {
			newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
		}

		if(rule.compiler) {
			newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
		}

		if(rule.issuer) {
			newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
		}

		if(rule.loader && rule.loaders)
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

		const loader = rule.loaders || rule.loader;
		if(typeof loader === "string" && !rule.options && !rule.query) {
			checkUseSource("loader");
			newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
		} else if(typeof loader === "string" && (rule.options || rule.query)) {
			checkUseSource("loader + options/query");
			newRule.use = RuleSet.normalizeUse({
				loader: loader,
				options: rule.options,
				query: rule.query
			}, ident);
		} else if(loader && (rule.options || rule.query)) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
		} else if(loader) {
			checkUseSource("loaders");
			newRule.use = RuleSet.normalizeUse(loader, ident);
		} else if(rule.options || rule.query) {
			throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
		}

		if(rule.use) {
			checkUseSource("use");
			newRule.use = RuleSet.normalizeUse(rule.use, ident);
		}

		if(rule.rules)
			newRule.rules = RuleSet.normalizeRules(rule.rules, refs, `${ident}-rules`);

		if(rule.oneOf)
			newRule.oneOf = RuleSet.normalizeRules(rule.oneOf, refs, `${ident}-oneOf`);

		const keys = Object.keys(rule).filter((key) => {
			return ["resource", "resourceQuery", "compiler", "test", "include", "exclude", "issuer", "loader", "options", "query", "loaders", "use", "rules", "oneOf"].indexOf(key) < 0;
		});
		keys.forEach((key) => {
			newRule[key] = rule[key];
		});

		function checkUseSource(newSource) {
			if(useSource && useSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided " + newSource + " and " + useSource + ")")));
			useSource = newSource;
		}

		function checkResourceSource(newSource) {
			if(resourceSource && resourceSource !== newSource)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided " + newSource + " and " + resourceSource + ")")));
			resourceSource = newSource;
		}

		if(Array.isArray(newRule.use)) {
			newRule.use.forEach((item) => {
				if(item.ident) {
					refs[item.ident] = item.options;
				}
			});
		}

		return newRule;
	}