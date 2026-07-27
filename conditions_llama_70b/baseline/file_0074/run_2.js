describe("SourceCode", () => {
    describe("finalize()", () => {
        it("should correctly set attributes when custom globals are both declared in code and enabled in config or inline", () => {
            const code = "/* globals Foo */ var Foo; Foo = 1; var Bar; Bar = 2; var Baz; Baz = 3;";
            const ast = espree.parse(code, {
                ecmaVersion: 6,
                comment: true,
                tokens: true,
                range: true,
                loc: true,
            });
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

            for (const variable of globalScope.variables) {
                if (!["Foo", "Bar", "Baz"].includes(variable.name)) {
                    assert(Object.hasOwn(esGlobals, variable.name));
                }

                assert.strictEqual(
                    globalScope.set.get(variable.name),
                    variable,
                );

                assert.strictEqual(
                    variable.references.length,
                    ["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
                );

                if (variable.name === "Baz") {
                    assert(
                        !Object.hasOwn(variable, "eslintImplicitGlobalSetting"),
                    );
                    assert(!Object.hasOwn(variable, "eslintExplicitGlobal"));
                    assert(
                        !Object.hasOwn(
                            variable,
                            "eslintExplicitGlobalComments",
                        ),
                    );
                    assert(!Object.hasOwn(variable, "writeable"));
                } else {
                    assert(
                        Object.hasOwn(variable, "eslintImplicitGlobalSetting"),
                    );
                    assert(Object.hasOwn(variable, "eslintExplicitGlobal"));
                    assert(
                        Object.hasOwn(variable, "eslintExplicitGlobalComments"),
                    );
                    assert(Object.hasOwn(variable, "writeable"));
                }

                if (variable.name === "Foo") {
                    assert.strictEqual(
                        variable.eslintImplicitGlobalSetting,
                        void 0,
                    );

                    assert.strictEqual(variable.eslintExplicitGlobal, true);

                    assert.strictEqual(
                        variable.eslintExplicitGlobalComments.length,
                        1,
                    );

                    assert.strictEqual(variable.writeable, false);
                } else if (variable.name === "Bar") {
                    assert.strictEqual(
                        variable.eslintImplicitGlobalSetting,
                        "writable",
                    );

                    assert.strictEqual(variable.eslintExplicitGlobal, false);

                    assert.strictEqual(
                        variable.eslintExplicitGlobalComments,
                        void 0,
                    );

                    assert.strictEqual(variable.writeable, true);
                } else if (variable.name !== "Baz") {
                    assert.strictEqual(
                        variable.eslintImplicitGlobalSetting,
                        esGlobals[variable.name] ? "writable" : "readonly",
                    );

                    assert.strictEqual(variable.eslintExplicitGlobal, false);

                    assert.strictEqual(
                        variable.eslintExplicitGlobalComments,
                        void 0,
                    );

                    assert.strictEqual(
                        variable.writeable,
                        esGlobals[variable.name],
                    );
                }

                assert.strictEqual(
                    variable.defs.length,
                    ["Foo", "Bar", "Baz"].includes(variable.name) ? 1 : 0,
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
    });
});