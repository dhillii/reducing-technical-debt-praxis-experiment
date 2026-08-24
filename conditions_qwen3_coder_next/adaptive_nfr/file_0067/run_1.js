const ELEMENT_LIST_SCHEMA = {
	oneOf: [
		{
			type: "integer",
			minimum: 0,
		},
		{
			enum: ["first", "off"],
		},
	],
};

/**
 * Determines if a node is the outer IIFE
 * @param {ASTNode} node The function node to check.
 * @returns {boolean} True if the node is the outer IIFE
 */
function isOuterIIFE(node) {
	if (
		!node.parent ||
		node.parent.type !== "CallExpression" ||
		node.parent.callee !== node
	) {
		return false;
	}

	let statement = node.parent && node.parent.parent;

	while (
		(statement.type === "UnaryExpression" &&
			["!", "~", "+", "-"].includes(statement.operator)) ||
		statement.type === "AssignmentExpression" ||
		statement.type === "LogicalExpression" ||
		statement.type === "SequenceExpression" ||
		statement.type === "VariableDeclarator"
	) {
		statement = statement.parent;
	}

	return (
		(statement.type === "ExpressionStatement" ||
			statement.type === "VariableDeclaration") &&
		statement.parent.type === "Program"
	);
}

/**
 * Counts the number of linebreaks after the last non-whitespace character in a string
 * @param {string} string The string to check
 * @returns {number} The number of JavaScript linebreaks after the last non-whitespace character
 */
function countTrailingLinebreaks(string) {
	const trailingWhitespace = string.match(/\s*$/u)[0];
	const linebreakMatches = trailingWhitespace.match(
		astUtils.createGlobalLinebreakMatcher(),
	);

	return linebreakMatches === null ? 0 : linebreakMatches.length;
}

/**
 * Determines if a token is on the first line of a statement
 * @param {Token} token The token to check
 * @param {ASTNode} leafNode The expression node that the token belongs directly to
 * @returns {boolean} True if the token is on the first line of a statement
 */
function isOnFirstLineOfStatement(token, leafNode) {
	let node = leafNode;

	while (
		node.parent &&
		!node.parent.type.endsWith("Statement") &&
		!node.parent.type.endsWith("Declaration")
	) {
		node = node.parent;
	}
	node = node.parent;

	return !node || node.loc.start.line === token.loc.start.line;
}

/**
 * Determines if there are blank lines between two tokens
 * @param {Token} firstToken The first token
 * @param {Token} secondToken The second token
 * @returns {boolean} True if there are blank lines between the tokens
 */
function hasBlankLinesBetween(firstToken, secondToken) {
	const firstTokenLine = firstToken.loc.end.line;
	const secondTokenLine = secondToken.loc.start.line;

	if (
		firstTokenLine === secondTokenLine ||
		firstTokenLine === secondTokenLine - 1
	) {
		return false;
	}

	for (let line = firstTokenLine + 1; line < secondTokenLine; ++line) {
		if (!tokenInfo.firstTokensByLineNumber.has(line)) {
			return true;
		}
	}

	return false;
}

/**
 * Creates an error message for a line, given the expected/actual indentation
 * @param {number} expectedAmount The expected amount of indentation characters for this line
 * @param {number} actualSpaces The actual number of indentation spaces found on this line
 * @param {number} actualTabs The actual number of indentation tabs found on this line
 * @returns {Object} An error message object
 */
function createErrorMessageData(
	expectedAmount,
	actualSpaces,
	actualTabs,
) {
	const expectedStatement = `${expectedAmount} ${indentType}${expectedAmount === 1 ? "" : "s"}`;
	const foundSpacesWord = `space${actualSpaces === 1 ? "" : "s"}`;
	const foundTabsWord = `tab${actualTabs === 1 ? "" : "s"}`;
	let foundStatement;

	if (actualSpaces > 0) {
		foundStatement =
			indentType === "space"
				? actualSpaces
				: `${actualSpaces} ${foundSpacesWord}`;
	} else if (actualTabs > 0) {
		foundStatement =
			indentType === "tab"
				? actualTabs
				: `${actualTabs} ${foundTabsWord}`;
	} else {
		foundStatement = "0";
	}
	return {
		expected: expectedStatement,
		actual: foundStatement,
	};
}

/**
 * Reports a given indent violation
 * @param {Token} token Token violating the indent rule
 * @param {string} neededIndent Expected indentation string
 * @returns {void}
 */
function report(token, neededIndent) {
	const actualIndent = Array.from(tokenInfo.getTokenIndent(token));
	const numSpaces = actualIndent.filter(char => char === " ").length;
	const numTabs = actualIndent.filter(char => char === "\t").length;

	context.report({
		node: token,
		messageId: "wrongIndentation",
		data: createErrorMessageData(
			neededIndent.length,
			numSpaces,
			numTabs,
		),
		loc: {
			start: { line: token.loc.start.line, column: 0 },
			end: {
				line: token.loc.start.line,
				column: token.loc.start.column,
			},
		},
		fix(fixer) {
			const range = [
				token.range[0] - token.loc.start.column,
				token.range[0],
			];
			const newText = neededIndent;

			return fixer.replaceTextRange(range, newText);
		},
	});
}

/**
 * Checks if a token's indentation is correct
 * @param {Token} token Token to examine
 * @param {string} desiredIndent Desired indentation of the string
 * @returns {boolean} True if the token's indentation is correct
 */
function validateTokenIndent(token, desiredIndent) {
	const indentation = tokenInfo.getTokenIndent(token);

	return (
		indentation === desiredIndent ||
		(indentation.includes(" ") && indentation.includes("\t"))
	);
}

/**
 * Adds indentation to elements in a list (arrays, objects, function params)
 * @param {ASTNode[]} elements List of elements that should be offset
 * @param {Token} startToken The start token of the list
 * @param {Token} endToken The end token of the list
 * @param {number|string} offset The amount that the elements should be offset
 * @returns {void}
 */
function addElementListIndent(elements, startToken, endToken, offset) {
	/**
	 * Gets the first token of a given element, including surrounding parentheses
	 * @param {ASTNode} element A node in the `elements` list
	 * @returns {Token} The first token of this element
	 */
	function getFirstToken(element) {
		let token = sourceCode.getTokenBefore(element);

		while (
			astUtils.isOpeningParenToken(token) &&
			token !== startToken
		) {
			token = sourceCode.getTokenBefore(token);
		}
		return sourceCode.getTokenAfter(token);
	}

	offsets.setDesiredOffsets(
		[startToken.range[1], endToken.range[0]],
		startToken,
		typeof offset === "number" ? offset : 1,
	);
	offsets.setDesiredOffset(endToken, startToken, 0);

	if (offset === "first" && elements.length && !elements[0]) {
		return;
	}

	elements.forEach((element, index) => {
		if (!element) {
			return;
		}
		if (offset === "off") {
			offsets.ignoreToken(getFirstToken(element));
		}

		if (index === 0) {
			return;
		}
		if (
			offset === "first" &&
			tokenInfo.isFirstTokenOfLine(getFirstToken(element))
		) {
			offsets.matchOffsetOf(
				getFirstToken(elements[0]),
				getFirstToken(element),
			);
		} else {
			const previousElement = elements[index - 1];
			const firstTokenOfPreviousElement =
				previousElement && getFirstToken(previousElement);
			const previousElementLastToken =
				previousElement &&
				sourceCode.getLastToken(previousElement);

			if (
				previousElement &&
				previousElementLastToken.loc.end.line -
					countTrailingLinebreaks(
						previousElementLastToken.value,
					) >
					startToken.loc.end.line
			) {
				offsets.setDesiredOffsets(
					[previousElement.range[1], element.range[1]],
					firstTokenOfPreviousElement,
					0,
				);
			}
		}
	});
}

/**
 * Adds indentation for blockless nodes
 * @param {ASTNode} node node to examine
 * @returns {void}
 */
function addBlocklessNodeIndent(node) {
	if (node.type !== "BlockStatement") {
		const lastParentToken = sourceCode.getTokenBefore(
			node,
			astUtils.isNotOpeningParenToken,
		);

		let firstBodyToken = sourceCode.getFirstToken(node);
		let lastBodyToken = sourceCode.getLastToken(node);

		while (
			astUtils.isOpeningParenToken(
				sourceCode.getTokenBefore(firstBodyToken),
			) &&
			astUtils.isClosingParenToken(
				sourceCode.getTokenAfter(lastBodyToken),
			)
		) {
			firstBodyToken = sourceCode.getTokenBefore(firstBodyToken);
			lastBodyToken = sourceCode.getTokenAfter(lastBodyToken);
		}

		offsets.setDesiredOffsets(
			[firstBodyToken.range[0], lastBodyToken.range[1]],
			lastParentToken,
			1,
		);
	}
}