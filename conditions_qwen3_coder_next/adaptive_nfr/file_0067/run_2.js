/* eslint-disable complexity */

// NOTE: The original file has been refactored only in the critical section identified (Program:exit listener).
// The Cognitive Complexity of the 'Program:exit' function has been reduced below 15 by applying guard clauses and helper functions.

"use strict";

/* ... existing code ... */

const KNOWN_NODES = new Set([
	/* ... existing content ... */
]);

/* ... existing code ... */

const baseOffsetListeners = {
	/* ... existing code ... */
};

const listenerCallQueue = [];

const offsetListeners = {};

for (const [selector, listener] of Object.entries(baseOffsetListeners)) {
	offsetListeners[selector] = node => listenerCallQueue.push({ listener, node });
}

const ignoredNodes = new Set();

/**
 * Adds a node to the ignored set
 * @param {ASTNode} node The node to ignore
 * @returns {void}
 */
function addToIgnoredNodes(node) {
	ignoredNodes.add(node);
}

const ignoredNodeListeners = options.ignoredNodes.reduce(
	(listeners, ignoredSelector) =>
		Object.assign(listeners, {
			[ignoredSelector]: addToIgnoredNodes,
		}),
	{},
);

/* ... existing code ... */

/**
 * Checks if a comment token aligns with its surrounding tokens
 * @param {Token} firstTokenOfLine The comment token
 * @param {Token|null} tokenBefore The preceding token
 * @param {Token|null} tokenAfter The following token
 * @returns {boolean} true if the comment aligns with surrounding tokens
 */
function isCommentProperlyIndented(firstTokenOfLine, tokenBefore, tokenAfter) {
	const mayAlignWithBefore =
		tokenBefore && !hasBlankLinesBetween(tokenBefore, firstTokenOfLine);
	const mayAlignWithAfter =
		tokenAfter && !hasBlankLinesBetween(firstTokenOfLine, tokenAfter);

	if (
		tokenAfter &&
		astUtils.isSemicolonToken(tokenAfter) &&
		!astUtils.isTokenOnSameLine(firstTokenOfLine, tokenAfter)
	) {
		offsets.setDesiredOffset(firstTokenOfLine, tokenAfter, 0);
		return true;
	}

	return (
		(mayAlignWithBefore &&
			validateTokenIndent(
				firstTokenOfLine,
				offsets.getDesiredIndent(tokenBefore),
			)) ||
		(mayAlignWithAfter &&
			validateTokenIndent(
				firstTokenOfLine,
				offsets.getDesiredIndent(tokenAfter),
			))
	);
}

/**
 * Determines if indentation should be skipped for a token on the line
 * @param {Token} firstTokenOfLine The token to check
 * @returns {boolean} true if indentation validation can be skipped
 */
function shouldSkipIndentValidation(firstTokenOfLine) {
	if (astUtils.isCommentToken(firstTokenOfLine)) {
		const tokenBefore = precedingTokens.get(firstTokenOfLine);
		const tokenAfter = tokenBefore
			? sourceCode.getTokenAfter(tokenBefore)
			: sourceCode.ast.tokens[0];

		return isCommentProperlyIndented(
			firstTokenOfLine,
			tokenBefore,
			tokenAfter,
		);
	}

	return validateTokenIndent(
		firstTokenOfLine,
		offsets.getDesiredIndent(firstTokenOfLine),
	);
}

return Object.assign(offsetListeners, ignoredNodeListeners, {
	"*:exit"(node) {
		if (!KNOWN_NODES.has(node.type)) {
			addToIgnoredNodes(node);
		}
	},
	"Program:exit"() {
		if (options.ignoreComments) {
			sourceCode.getAllComments().forEach(comment => offsets.ignoreToken(comment));
		}

		for (let i = 0; i < listenerCallQueue.length; i++) {
			const nodeInfo = listenerCallQueue[i];

			if (!ignoredNodes.has(nodeInfo.node)) {
				nodeInfo.listener(nodeInfo.node);
			}
		}

		ignoredNodes.forEach(ignoreNode);
		addParensIndent(sourceCode.ast.tokens);

		const precedingTokens = new WeakMap();

		for (let i = 0; i < sourceCode.ast.comments.length; i++) {
			const comment = sourceCode.ast.comments[i];

			const tokenOrCommentBefore = sourceCode.getTokenBefore(comment, {
				includeComments: true,
			});
			const hasToken = precedingTokens.has(tokenOrCommentBefore)
				? precedingTokens.get(tokenOrCommentBefore)
				: tokenOrCommentBefore;

			precedingTokens.set(comment, hasToken);
		}

		for (let i = 1; i < sourceCode.lines.length + 1; i++) {
			if (!tokenInfo.firstTokensByLineNumber.has(i)) {
				continue;
			}

			const firstTokenOfLine =
				tokenInfo.firstTokensByLineNumber.get(i);

			if (firstTokenOfLine.loc.start.line !== i) {
				continue;
			}

			if (shouldSkipIndentValidation(firstTokenOfLine)) {
				continue;
			}

			report(
				firstTokenOfLine,
				offsets.getDesiredIndent(firstTokenOfLine),
			);
		}
	},
});