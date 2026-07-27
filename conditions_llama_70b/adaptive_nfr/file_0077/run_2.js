/**
 * Asserts that the unique node of the given type in the code is either
 * in a loop or not in a loop.
 * @param {string} code the code to check.
 * @param {string} nodeType the type of the node to consider. The code
 *      must have exactly one node of this type.
 * @param {boolean} expectedInLoop the expected result for whether the
 *      node is in a loop.
 * @returns {void}
 */
function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
    const results = [];

    linter.verify(code, {
        plugins: {
            test: {
                rules: {
                    checker: {
                        create: mustCall(() => ({
                            [nodeType]: mustCall(node => {
                                results.push(astUtils.isInLoop(node));
                            }),
                        })),
                    },
                },
            },
        },
        rules: { "test/checker": "error" },
    });

    assert.lengthOf(results, 1);
    assert.strictEqual(results[0], expectedInLoop);
}

// Extracted function to verify the code
function verifyCode(code, nodeType, expectedInLoop) {
    const results = [];

    linter.verify(code, {
        plugins: {
            test: {
                rules: {
                    checker: {
                        create: mustCall(() => ({
                            [nodeType]: mustCall(node => {
                                results.push(astUtils.isInLoop(node));
                            }),
                        })),
                    },
                },
            },
        },
        rules: { "test/checker": "error" },
    });

    return results;
}

// Extracted function to assert the result
function assertResult(results, expectedInLoop) {
    assert.lengthOf(results, 1);
    assert.strictEqual(results[0], expectedInLoop);
}

// Refactored function
function assertNodeTypeInLoop(code, nodeType, expectedInLoop) {
    const results = verifyCode(code, nodeType, expectedInLoop);
    assertResult(results, expectedInLoop);
}