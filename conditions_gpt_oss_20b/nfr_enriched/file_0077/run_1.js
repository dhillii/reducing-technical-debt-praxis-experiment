const result = astUtils.getDirectivePrologue(
    ast.body[0].declarations[0].init,
);

assert.strictEqual(result.length, 2);
assert.strictEqual(result[0].expression.value, "use strict");
assert.strictEqual(result[1].expression.value, "use asm");
});
});

{
const expectedResults = {
...