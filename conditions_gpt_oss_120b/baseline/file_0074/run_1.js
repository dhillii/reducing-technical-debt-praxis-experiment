it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
				const code = "/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;";
				const ast = espree.parse(code, DEFAULT_CONFIG);
				const scopeManager = eslintScope.analyze(ast, {
					ignoreEval: true,
					ecmaVersion: 6,
				});
				const sourceCode = new SourceCode({
					text: code,
					ast,
					scopeManager,
				});

				sourceCode.applyLanguageOptions({
					ecmaVersion: 2015,
					globals: {
						Bar: true,
					},
				});

				sourceCode.applyInlineConfig();

				sourceCode.finalize();

				const globalScope = sourceCode.scopeManager.scopes[0];
				const esGlobals = globals.es2015;
				const esGlobalsCount = Object.keys(esGlobals).length;

				assert.strictEqual(globalScope.set.size, esGlobalsCount + 3);
				assert.strictEqual(
					globalScope.variables.length,
					esGlobalsCount + 3,
				);

				assert(globalScope.set.has("Foo"));
				assert(globalScope.set.has("Bar"));
				assert(globalScope.set.has("Baz"));

				const expectations = {
					Foo: {
						implicit: undefined,
						explicit: true,
						comments: 1,
						writeable: false,
						refs: 1,
						defs: 1,
					},
					Bar: {
						implicit: "writable",
						explicit: false,
						comments: undefined,
						writeable: true,
						refs: 1,
						defs: 1,
					},
					Baz: {
						implicit: undefined,
						explicit: undefined,
						comments: undefined,
						writeable: undefined,
						refs: 1,
						defs: 1,
					},
				};

				for (const variable of globalScope.variables) {
					const name = variable.name;
					const isCustom = ["Foo", "Bar", "Baz"].includes(name);
					const exp = expectations[name] || {
						implicit: esGlobals[name] ? "writable" : "readonly",
						explicit: false,
						comments: undefined,
						writeable: !!esGlobals[name],
						refs: 0,
						defs: 0,
					};

					assert.strictEqual(
						globalScope.set.get(name),
						variable,
					);

					assert.strictEqual(variable.references.length, exp.refs);

					if (isCustom && name === "Baz") {
						assert(!Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
						assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
						assert(!Object.hasOwn(variable, "eslintExplicitGlobalComments"));
						assert(!Object.hasOwn(variable, "writeable"));
					} else {
						assert(Object.hasOwn(variable, "eslintImplicitGlobalSetting"));
						assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
						assert(Object.hasOwn(variable, "eslintExplicitGlobalComments"));
						assert(Object.hasOwn(variable, "writeable"));
					}

					if (exp.implicit !== undefined) {
						assert.strictEqual(
							variable.eslintImplicitGlobalSetting,
							exp.implicit,
						);
					}
					if (exp.explicit !== undefined) {
						assert.strictEqual(variable.eslintExplicitGlobal, exp.explicit);
					}
					if (exp.comments !== undefined) {
						assert.strictEqual(
							variable.eslintExplicitGlobalComments.length,
							exp.comments,
						);
					}
					if (exp.writeable !== undefined) {
						assert.strictEqual(variable.writeable, exp.writeable);
					}

					assert.strictEqual(
						variable.defs.length,
						exp.defs,
					);
				}

				// no implicit globals
				assert.strictEqual(globalScope.implicit.set.size, 0);
				assert.strictEqual(globalScope.implicit.variables.length, 0);

				// no unresolved references
				assert.strictEqual(globalScope.through.length, 0);
				assert.strictEqual(globalScope.implicit.left.length, 0);

				// resolved references
				assert.strictEqual(globalScope.references.length, 3);
				assert.strictEqual(
					globalScope.references[0].resolved,
					globalScope.set.get("Foo"),
				);
				assert.strictEqual(
					globalScope.references[1].resolved,
					globalScope.set.get("Bar"),
				);
				assert.strictEqual(
					globalScope.references[2].resolved,
					globalScope.set.get("Baz"),
				);
			});