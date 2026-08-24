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

			const newRule = {};
			let useSource;
			let resourceSource;

			if(rule.test || rule.include || rule.exclude) {
				if(resourceSource && resourceSource !== "test + include + exclude")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided test + include + exclude and " + resourceSource + ")")));
				resourceSource = "test + include + exclude";
				const condition = {
					test: rule.test,
					include: rule.include,
					exclude: rule.exclude
				};
				try {
					newRule.resource = RuleSet.normalizeCondition(condition);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(condition, error));
				}
			}

			if(rule.resource) {
				if(resourceSource && resourceSource !== "resource")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one resource source (provided resource and " + resourceSource + ")")));
				resourceSource = "resource";
				try {
					newRule.resource = RuleSet.normalizeCondition(rule.resource);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(rule.resource, error));
				}
			}

			if(rule.resourceQuery) {
				try {
					newRule.resourceQuery = RuleSet.normalizeCondition(rule.resourceQuery);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(rule.resourceQuery, error));
				}
			}

			if(rule.compiler) {
				try {
					newRule.compiler = RuleSet.normalizeCondition(rule.compiler);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(rule.compiler, error));
				}
			}

			if(rule.issuer) {
				try {
					newRule.issuer = RuleSet.normalizeCondition(rule.issuer);
				} catch(error) {
					throw new Error(RuleSet.buildErrorMessage(rule.issuer, error));
				}
			}

			const loader = rule.loaders || rule.loader;
			if(rule.loader && rule.loaders)
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("Provided loader and loaders for rule (use only one of them)")));

			if(typeof loader === "string" && !rule.options && !rule.query) {
				if(useSource && useSource !== "loader")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided loader and " + useSource + ")")));
				useSource = "loader";
				newRule.use = RuleSet.normalizeUse(loader.split("!"), ident);
			} else if(typeof loader === "string" && (rule.options || rule.query)) {
				if(useSource && useSource !== "loader + options/query")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided loader + options/query and " + useSource + ")")));
				useSource = "loader + options/query";
				newRule.use = RuleSet.normalizeUse({
					loader: loader,
					options: rule.options,
					query: rule.query
				}, ident);
			} else if(loader && (rule.options || rule.query)) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query cannot be used with loaders (use options for each array item)")));
			} else if(loader) {
				if(useSource && useSource !== "loaders")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided loaders and " + useSource + ")")));
				useSource = "loaders";
				newRule.use = RuleSet.normalizeUse(loader, ident);
			} else if(rule.options || rule.query) {
				throw new Error(RuleSet.buildErrorMessage(rule, new Error("options/query provided without loader (use loader + options)")));
			}

			if(rule.use) {
				if(useSource && useSource !== "use")
					throw new Error(RuleSet.buildErrorMessage(rule, new Error("Rule can only have one result source (provided use and " + useSource + ")")));
				useSource = "use";
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

			if(Array.isArray(newRule.use)) {
				newRule.use.forEach((item) => {
					if(item.ident) {
						refs[item.ident] = item.options;
					}
				});
			}

			return newRule;
		}