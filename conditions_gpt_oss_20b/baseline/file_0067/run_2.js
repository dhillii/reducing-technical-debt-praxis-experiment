/**
 * Check and decide whether to check for indentation for blockless nodes
 * Scenarios are for or while statements without braces around them
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

/**
 * Check indentation for lists of elements (arrays, objects, function params)
 * @param {ASTNode[]} elements List of elements that should be offset
 * @param {Token} startToken The start token of the list that element should be aligned against, e.g. '['
 * @param {Token} endToken The end token of the list, e.g. ']'
 * @param {number|string} offset The amount that the elements should be offset
 * @returns {void}
 */
function addElementListIndent(elements, startToken, endToken, offset) {
	/**
	 * Gets the first token of a given element, including surrounding parentheses.
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

	const offsetValue = typeof offset === "number" ? offset : 1;
	const firstTokenOfFirstElement = elements[0] ? getFirstToken(elements[0]) : null;

	// Offset the entire list
	offsets.setDesiredOffsets(
		[startToken.range[1], endToken.range[0]],
		startToken,
		offsetValue,
	);
	offsets.setDesiredOffset(endToken, startToken, 0);

	// If the preference is "first" but there is no first element (e.g. sparse arrays w/ empty first slot), fall back to 1 level.
	if (offset === "first" && elements.length && !elements[0]) {
		return;
	}

	elements.forEach((element, index) => {
		if (!element) {
			return;
		}

		const firstToken = getFirstToken(element);

		if (offset === "off") {
			offsets.ignoreToken(firstToken);
		}

		if (index === 0) {
			return;
		}

		if (offset === "first" && tokenInfo.isFirstTokenOfLine(firstToken)) {
			offsets.matchOffsetOf(firstTokenOfFirstElement, firstToken);
			return;
		}

		const previousElement = elements[index - 1];
		if (!previousElement) {
			return;
		}

		const previousLastToken = sourceCode.getLastToken(previousElement);
		if (
			previousLastToken.loc.end.line -
				countTrailingLinebreaks(previousLastToken.value) >
			startToken.loc.end.line
		) {
			const firstTokenOfPrevious = getFirstToken(previousElement);
			offsets.setDesiredOffsets(
				[previousElement.range[1], element.range[1]],
				firstTokenOfPrevious,
				0,
			);
		}
	});
}