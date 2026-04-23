/**
 * @fileoverview A class to manage state of generating a code path.
 * @author Toru Nagashima
 */

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const CodePathSegment = require("./code-path-segment"),
	ForkContext = require("./fork-context");

//-----------------------------------------------------------------------------
// Contexts
//-----------------------------------------------------------------------------

/**
 * Represents the context in which a `break` statement can be used.
 *
 * A `break` statement without a label is only valid in a few places in
 * JavaScript: any type of loop or a `switch` statement. Otherwise, `break`
 * without a label causes a syntax error. For these contexts, `breakable` is
 * set to `true` to indicate that a `break` without a label is valid.
 *
 * However, a `break` statement with a label is also valid inside of a labeled
 * statement. For example, this is valid:
 *
 *     a : {
 *         break a;
 *     }
 *
 * The `breakable` property is set false for labeled statements to indicate
 * that `break` without a label is invalid.
 */
class BreakContext {
	/**
	 * Creates a new instance.
	 * @param {BreakContext} upperContext The previous `BreakContext`.
	 * @param {boolean} breakable Indicates if we are inside a statement where
	 *      `break` without a label will exit the statement.
	 * @param {string|null} label The label for the statement.
	 * @param {ForkContext} forkContext The current fork context.
	 */
	constructor(upperContext, breakable, label, forkContext) {
		/** The previous `BreakContext` */
		this.upper = upperContext;
		/** Indicates if we are inside a statement where `break` without a label will exit the statement. */
		this.breakable = breakable;
		/** The label associated with the statement. */
		this.label = label;
		/** The fork context for the `break`. */
		this.brokenForkContext = ForkContext.newEmpty(forkContext);
	}
}

/**
 * Represents the context for `ChainExpression` nodes.
 */
class ChainContext {
	/**
	 * Creates a new instance.
	 * @param {ChainContext} upperContext The previous `ChainContext`.
	 */
	constructor(upperContext) {
		/** The previous `ChainContext` */
		this.upper = upperContext;
		/** The number of choice contexts inside of the `ChainContext`. */
		this.choiceContextCount = 0;
	}
}

/**
 * Represents a choice in the code path.
 *
 * Choices are created by logical operators such as `&&`, loops, conditionals,
 * and `if` statements. This is the point at which the code path has a choice of
 * which direction to go.
 *
 * The result of a choice might be in the left (test) expression of another choice,
 * and in that case, may create a new fork. For example, `a || b` is a choice
 * but does not create a new fork because the result of the expression is
 * not used as the test expression in another expression. In this case,
 * `isForkingAsResult` is false. In the expression `a || b || c`, the `a || b`
 * expression appears as the test expression for `|| c`, so the
 * result of `a || b` creates a fork because execution may or may not
 * continue to `|| c`. `isForkingAsResult` for `a || b` in this case is true
 * while `isForkingAsResult` for `|| c` is false. (`isForkingAsResult` is always
 * false for `if` statements, conditional expressions, and loops.)
 *
 * All of the choices except one (`??`) operate on a true/false fork, meaning if
 * true go one way and if false go the other (tracked by `trueForkContext` and
 * `falseForkContext`). The `??` operator doesn't operate on true/false because
 * the left expression is evaluated to be nullish or not, so only if nullish do
 * we fork to the right expression (tracked by `nullishForkContext`).
 */
class ChoiceContext {
	/**
	 * Creates a new instance.
	 * @param {ChoiceContext} upperContext The previous `ChoiceContext`.
	 * @param {string} kind The kind of choice. If it's a logical or assignment expression, this
	 *      is `"&&"` or `"||"` or `"??"`; if it's an `if` statement or
	 *      conditional expression, this is `"test"`; otherwise, this is `"loop"`.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice
	 *      creates a fork.
	 * @param {ForkContext} forkContext The containing `ForkContext`.
	 */
	constructor(upperContext, kind, isForkingAsResult, forkContext) {
		/** The previous `ChoiceContext` */
		this.upper = upperContext;
		/** The kind of choice. */
		this.kind = kind;
		/** Indicates if the result of the choice forks the code path. */
		this.isForkingAsResult = isForkingAsResult;
		/** The fork context for the `true` path of the choice. */
		this.trueForkContext = ForkContext.newEmpty(forkContext);
		/** The fork context for the `false` path of the choice. */
		this.falseForkContext = ForkContext.newEmpty(forkContext);
		/** The fork context for when the choice result is `null` or `undefined`. */
		this.nullishForkContext = ForkContext.newEmpty(forkContext);
		/** Indicates if any of `trueForkContext`, `falseForkContext`, or
		 * `nullishForkContext` have been updated with segments from a child context.
		 */
		this.processed = false;
	}
}

/**
 * Base class for all loop contexts.
 */
class LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string} type The AST node's `type` for the loop.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, type, label, breakContext) {
		/** The previous `LoopContext` */
		this.upper = upperContext;
		/** The AST node's `type` for the loop. */
		this.type = type;
		/** The label for the loop from an enclosing `LabeledStatement`. */
		this.label = label;
		/** The fork context for when `break` is encountered. */
		this.brokenForkContext = breakContext.brokenForkContext;
	}
}

/**
 * Represents the context for a `while` loop.
 */
class WhileLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "WhileStatement", label, breakContext);
		/** The hardcoded literal boolean test condition for the loop. */
		this.test = void 0;
		/** Segments representing the test condition where `continue` will jump to. */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `do-while` loop.
 */
class DoWhileLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 * @param {ForkContext} forkContext The enclosing fork context.
	 */
	constructor(upperContext, label, breakContext, forkContext) {
		super(upperContext, "DoWhileStatement", label, breakContext);
		/** The hardcoded literal boolean test condition for the loop. */
		this.test = void 0;
		/** The segments at the start of the loop body. */
		this.entrySegments = null;
		/** The fork context to follow when a `continue` is found. */
		this.continueForkContext = ForkContext.newEmpty(forkContext);
	}
}

/**
 * Represents the context for a `for` loop.
 */
class ForLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForStatement", label, breakContext);
		/** The hardcoded literal boolean test condition for the loop. */
		this.test = void 0;
		/** The end of the init expression. */
		this.endOfInitSegments = null;
		/** The start of the test expression. */
		this.testSegments = null;
		/** The end of the test expression. */
		this.endOfTestSegments = null;
		/** The start of the update expression. */
		this.updateSegments = null;
		/** The end of the update expression. */
		this.endOfUpdateSegments = null;
		/** The segments representing the test condition where `continue` will jump to. */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `for-in` loop.
 *
 * Terminology:
 * - "left" means the part of the loop to the left of the `in` keyword. For
 *   example, in `for (var x in y)`, the left is `var x`.
 * - "right" means the part of the loop to the right of the `in` keyword. For
 *   example, in `for (var x in y)`, the right is `y`.
 */
class ForInLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForInStatement", label, breakContext);
		/** Segments that came immediately before the start of the loop. */
		this.prevSegments = null;
		/** Segments representing the start of everything to the left of the `in` keyword. */
		this.leftSegments = null;
		/** Segments representing the end of everything to the left of the `in` keyword. */
		this.endOfLeftSegments = null;
		/** Segments representing the left expression where `continue` will jump to. */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `for-of` loop.
 */
class ForOfLoopContext extends LoopContextBase {
	/**
	 * Creates a new instance.
	 * @param {LoopContext|null} upperContext The previous `LoopContext`.
	 * @param {string|null} label The label for the loop from an enclosing `LabeledStatement`.
	 * @param {BreakContext} breakContext The context for breaking the loop.
	 */
	constructor(upperContext, label, breakContext) {
		super(upperContext, "ForOfStatement", label, breakContext);
		/** Segments that came immediately before the start of the loop. */
		this.prevSegments = null;
		/** Segments representing the start of everything to the left of the `of` keyword. */
		this.leftSegments = null;
		/** Segments representing the end of everything to the left of the `of` keyword. */
		this.endOfLeftSegments = null;
		/** Segments representing the left expression where `continue` will jump to. */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for any loop.
 * @typedef {WhileLoopContext|DoWhileLoopContext|ForLoopContext|ForInLoopContext|ForOfLoopContext} LoopContext
 */

/**
 * Represents the context for a `switch` statement.
 */
class SwitchContext {
	/**
	 * Creates a new instance.
	 * @param {SwitchContext} upperContext The previous context.
	 * @param {boolean} hasCase Indicates if there is at least one `case` statement.
	 *      `default` doesn't count.
	 */
	constructor(upperContext, hasCase) {
		/** The previous context. */
		this.upper = upperContext;
		/** Indicates if there is at least one `case` statement. */
		this.hasCase = hasCase;
		/** The `default` keyword. */
		this.defaultSegments = null;
		/** The default case body starting segments. */
		this.defaultBodySegments = null;
		/** Indicates if a `default` case and is empty exists. */
		this.foundEmptyDefault = false;
		/** Indicates that a `default` exists and is the last case. */
		this.lastIsDefault = false;
		/** The number of fork contexts created. */
		this.forkCount = 0;
	}
}

/**
 * Represents the context for a `try` statement.
 */
class TryContext {
	/**
	 * Creates a new instance.
	 * @param {TryContext} upperContext The previous context.
	 * @param {boolean} hasFinalizer Indicates if the `try` statement has a
	 *      `finally` block.
	 * @param {ForkContext} forkContext The enclosing fork context.
	 */
	constructor(upperContext, hasFinalizer, forkContext) {
		/** The previous context. */
		this.upper = upperContext;
		/** Indicates if the `try` statement has a `finally` block. */
		this.hasFinalizer = hasFinalizer;
		/** Tracks the traversal position inside of the `try` statement. */
		this.position = "try";
		/** Fork context for `return` when a `finally` block exists. */
		this.returnedForkContext = hasFinalizer
			? ForkContext.newEmpty(forkContext)
			: null;
		/** Fork context for `throw`. */
		this.thrownForkContext = ForkContext.newEmpty(forkContext);
		/** Indicates if the last segment in the `try` block is reachable. */
		this.lastOfTryIsReachable = false;
		/** Indicates if the last segment in the `catch` block is reachable. */
		this.lastOfCatchIsReachable = false;
	}
}

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Adds given segments into the `dest` array.
 * If the `others` array does not include the given segments, adds to the `all`
 * array as well.
 *
 * This adds only reachable and used segments.
 * @param {CodePathSegment[]} dest A destination array (`returnedSegments` or `thrownSegments`).
 * @param {CodePathSegment[]} others Another destination array (`returnedSegments` or `thrownSegments`).
 * @param {CodePathSegment[]} all The unified destination array (`finalSegments`).
 * @param {CodePathSegment[]} segments Segments to add.
 * @returns {void}
 */
function addToReturnedOrThrown(dest, others, all, segments) {
	for (let i = 0; i < segments.length; ++i) {
		const segment = segments[i];
		dest.push(segment);
		if (!others.includes(segment)) {
			all.push(segment);
		}
	}
}

/**
 * Gets a loop context for a `continue` statement based on a given label.
 * @param {CodePathState} state The state to search within.
 * @param {string|null} label The label of a `continue` statement.
 * @returns {LoopContext} A loop-context for a `continue` statement.
 */
function getContinueContext(state, label) {
	if (!label) {
		return state.loopContext;
	}
	let context = state.loopContext;
	while (context) {
		if (context.label === label) {
			return context;
		}
		context = context.upper;
	}
	/* c8 ignore next */
	return null;
}

/**
 * Gets a context for a `break` statement.
 * @param {CodePathState} state The state to search within.
 * @param {string|null} label The label of a `break` statement.
 * @returns {BreakContext} A context for a `break` statement.
 */
function getBreakContext(state, label) {
	let context = state.breakContext;
	while (context) {
		if (label ? context.label === label : context.breakable) {
			return context;
		}
		context = context.upper;
	}
	/* c8 ignore next */
	return null;
}

/**
 * Gets a context for a `return` statement. Handles the special case of a
 * `try` with a `finally` block.
 * @param {CodePathState} state The state to search within
 * @returns {TryContext|CodePathState} A context for a `return` statement.
 */
function getReturnContext(state) {
	let context = state.tryContext;
	while (context) {
		if (context.hasFinalizer && context.position !== "finally") {
			return context;
		}
		context = context.upper;
	}
	return state;
}

/**
 * Gets a context for a `throw` statement. Handles the special case of a
 * `try` with a `finally` block.
 * @param {CodePathState} state The state to search within.
 * @returns {TryContext|CodePathState} A context for a `throw` statement.
 */
function getThrowContext(state) {
	let context = state.tryContext;
	while (context) {
		if (
			context.position === "try" ||
			(context.hasFinalizer && context.position === "catch")
		) {
			return context;
		}
		context = context.upper;
	}
	return state;
}

/**
 * Removes a given value from a given array.
 * @param {any[]} elements An array to remove the specific element.
 * @param {any} value The value to be removed.
 * @returns {void}
 */
function removeFromArray(elements, value) {
	elements.splice(elements.indexOf(value), 1);
}

/**
 * Disconnect given segments.
 *
 * This is used in a process for switch statements.
 * @param {CodePathSegment[]} prevSegments Forward segments to disconnect.
 * @param {CodePathSegment[]} nextSegments Backward segments to disconnect.
 * @returns {void}
 */
function disconnectSegments(prevSegments, nextSegments) {
	for (let i = 0; i < prevSegments.length; ++i) {
		const prevSegment = prevSegments[i];
		const nextSegment = nextSegments[i];
		removeFromArray(prevSegment.nextSegments, nextSegment);
		removeFromArray(prevSegment.allNextSegments, nextSegment);
		removeFromArray(nextSegment.prevSegments, prevSegment);
		removeFromArray(nextSegment.allPrevSegments, prevSegment);
	}
}

/**
 * Creates looping path between two arrays of segments, ensuring that there are
 * paths going between matching segments in the arrays.
 * @param {CodePathState} state The state to operate on.
 * @param {CodePathSegment[]} unflattenedFromSegments Segments which are source.
 * @param {CodePathSegment[]} unflattenedToSegments Segments which are destination.
 * @returns {void}
 */
function makeLooped(state, unflattenedFromSegments, unflattenedToSegments) {
	const fromSegments = CodePathSegment.flattenUnusedSegments(
		unflattenedFromSegments,
	);
	const toSegments = CodePathSegment.flattenUnusedSegments(
		unflattenedToSegments,
	);
	const end = Math.min(fromSegments.length, toSegments.length);
	for (let i = 0; i < end; ++i) {
		const fromSegment = fromSegments[i];
		const toSegment = toSegments[i];
		if (toSegment.reachable) {
			fromSegment.nextSegments.push(toSegment);
		}
		if (fromSegment.reachable) {
			toSegment.prevSegments.push(fromSegment);
		}
		fromSegment.allNextSegments.push(toSegment);
		toSegment.allPrevSegments.push(fromSegment);
		if (toSegment.allPrevSegments.length >= 2) {
			CodePathSegment.markPrevSegmentAsLooped(toSegment, fromSegment);
		}
		state.notifyLooped(fromSegment, toSegment);
	}
}

/**
 * Finalizes segments of `test` chunk of a ForStatement.
 *
 * - Adds `false` paths to paths which are leaving from the loop.
 * - Sets `true` paths to paths which go to the body.
 * @param {LoopContext} context A loop context to modify.
 * @param {ChoiceContext} choiceContext A choice context of this loop.
 * @param {CodePathSegment[]} head The current head paths.
 * @returns {void}
 */
function finalizeTestSegmentsOfFor(context, choiceContext, head) {
	if (!choiceContext.processed) {
		choiceContext.trueForkContext.add(head);
		choiceContext.falseForkContext.add(head);
		choiceContext.nullishForkContext.add(head);
	}
	if (context.test !== true) {
		context.brokenForkContext.addAll(choiceContext.falseForkContext);
	}
	context.endOfTestSegments = choiceContext.trueForkContext.makeNext(0, -1);
}

/**
 * Handles logical choice contexts (`&&`, `||`, `??`) during pop.
 * @param {ChoiceContext} ctx The popped choice context.
 * @param {ForkContext} forkCtx The current fork context.
 * @param {ChoiceContext} parentCtx The parent choice context (may be null).
 * @returns {ChoiceContext} The processed context.
 */
function handleLogicalChoicePop(ctx, forkCtx, parentCtx) {
	if (!ctx.processed) {
		ctx.trueForkContext.add(forkCtx.head);
		ctx.falseForkContext.add(forkCtx.head);
		ctx.nullishForkContext.add(forkCtx.head);
	}
	if (ctx.isForkingAsResult) {
		parentCtx.trueForkContext.addAll(ctx.trueForkContext);
		parentCtx.falseForkContext.addAll(ctx.falseForkContext);
		parentCtx.nullishForkContext.addAll(ctx.nullishForkContext);
		parentCtx.processed = true;
		return ctx;
	}
	return ctx;
}

/**
 * Handles test choice contexts (`test`) during pop.
 * @param {ChoiceContext} ctx The popped choice context.
 * @param {ForkContext} forkCtx The current fork context.
 * @returns {ChoiceContext} The processed context.
 */
function handleTestChoicePop(ctx, forkCtx) {
	if (!ctx.processed) {
		ctx.trueForkContext.clear();
		ctx.trueForkContext.add(forkCtx.head);
	} else {
		ctx.falseForkContext.clear();
		ctx.falseForkContext.add(forkCtx.head);
	}
	return ctx;
}

/**
 * Merges true and false fork contexts after a choice has been processed.
 * @param {ChoiceContext} ctx The popped choice context.
 * @param {ForkContext} forkCtx The current fork context.
 */
function mergeChoiceForks(ctx, forkCtx) {
	const combined = ctx.trueForkContext;
	combined.addAll(ctx.falseForkContext);
	forkCtx.replaceHead(combined.makeNext(0, -1));
}

/**
 * Handles while and for loops after popping their choice context.
 * @param {CodePathState} state The current state.
 * @param {LoopContext} loopCtx The loop context.
 * @param {ForkContext} forkCtx The current fork context.
 * @param {ForkContext} brokenForkCtx The broken fork context.
 */
function handleWhileOrForLoop(state, loopCtx, forkCtx, brokenForkCtx) {
	// Connect loop body back to continue destination.
	makeLooped(state, forkCtx.head, loopCtx.continueDestSegments);
}

/**
 * Handles do-while loops after popping their choice context.
 * @param {CodePathState} state The current state.
 * @param {DoWhileLoopContext} loopCtx The loop context.
 * @param {ChoiceContext} choiceCtx The choice context.
 * @param {ForkContext} forkCtx The current fork context.
 * @param {ForkContext} brokenForkCtx The broken fork context.
 */
function handleDoWhileLoop(state, loopCtx, choiceCtx, forkCtx, brokenForkCtx) {
	if (!choiceCtx.processed) {
		choiceCtx.trueForkContext.add(forkCtx.head);
		choiceCtx.falseForkContext.add(forkCtx.head);
	}
	if (loopCtx.test !== true) {
		brokenForkCtx.addAll(choiceCtx.falseForkContext);
	}
	const trueSegments = choiceCtx.trueForkContext.segmentsList;
	for (let i = 0; i < trueSegments.length; ++i) {
		makeLooped(state, trueSegments[i], loopCtx.entrySegments);
	}
}

/**
 * Handles for-in and for-of loops after popping.
 * @param {CodePathState} state The current state.
 * @param {LoopContext} loopCtx The loop context.
 * @param {ForkContext} forkCtx The current fork context.
 * @param {ForkContext} brokenForkCtx The broken fork context.
 */
function handleForInOrOfLoop(state, loopCtx, forkCtx, brokenForkCtx) {
	brokenForkCtx.add(forkCtx.head);
	makeLooped(state, forkCtx.head, loopCtx.leftSegments);
}

/**
 * Finalizes a switch context after popping.
 * @param {CodePathState} state The current state.
 * @param {SwitchContext} ctx The switch context.
 */
function finalizeSwitchContext(state, ctx) {
	const forkCtx = state.forkContext;
	const brokenForkCtx = state.popBreakContext().brokenForkContext;

	if (ctx.forkCount === 0) {
		if (!brokenForkCtx.empty) {
			brokenForkCtx.add(forkCtx.makeNext(-1, -1));
			forkCtx.replaceHead(brokenForkCtx.makeNext(0, -1));
		}
		return;
	}

	const lastSegments = forkCtx.head;
	state.forkBypassPath();
	const lastCaseSegments = forkCtx.head;

	brokenForkCtx.add(lastSegments);

	if (!ctx.lastIsDefault) {
		if (ctx.defaultBodySegments) {
			disconnectSegments(ctx.defaultSegments, ctx.defaultBodySegments);
			makeLooped(state, lastCaseSegments, ctx.defaultBodySegments);
		} else {
			brokenForkCtx.add(lastCaseSegments);
		}
	}

	for (let i = 0; i < ctx.forkCount; ++i) {
		state.forkContext = state.forkContext.upper;
	}
	state.forkContext.replaceHead(brokenForkCtx.makeNext(0, -1));
}

/**
 * Handles the pop of a try context when there is no finally block.
 * @param {CodePathState} state The current state.
 * @param {TryContext} ctx The try context.
 */
function handleCatchOnlyTry(state, ctx) {
	state.popForkContext();
}

/**
 * Handles the pop of a try context with a finally block.
 * @param {CodePathState} state The current state.
 * @param {TryContext} ctx The try context.
 */
function handleFinallyTry(state, ctx) {
	const originalReturned = ctx.returnedForkContext;
	const originalThrown = ctx.thrownForkContext;

	if (originalReturned.empty && originalThrown.empty) {
		return;
	}

	const headSegments = state.forkContext.head;
	state.forkContext = state.forkContext.upper;
	const half = Math.trunc(headSegments.length / 2);
	const normalSegments = headSegments.slice(0, half);
	const leavingSegments = headSegments.slice(half);

	if (!originalReturned.empty) {
		getReturnContext(state).returnedForkContext.add(leavingSegments);
	}
	if (!originalThrown.empty) {
		getThrowContext(state).thrownForkContext.add(leavingSegments);
	}
	state.forkContext.replaceHead(normalSegments);

	if (!ctx.lastOfTryIsReachable && !ctx.lastOfCatchIsReachable) {
		state.forkContext.makeUnreachable();
	}
}

/**
 * Handles the creation of a for-body segment.
 * @param {CodePathState} state The current state.
 */
function handleForBody(state) {
	const ctx = state.loopContext;
	const choiceCtx = state.choiceContext;
	const forkCtx = state.forkContext;

	if (ctx.updateSegments) {
		ctx.endOfUpdateSegments = forkCtx.head;
		if (ctx.testSegments) {
			makeLooped(state, ctx.endOfUpdateSegments, ctx.testSegments);
		}
	} else if (ctx.testSegments) {
		finalizeTestSegmentsOfFor(ctx, choiceCtx, forkCtx.head);
	} else {
		ctx.endOfInitSegments = forkCtx.head;
	}

	let bodySegments = ctx.endOfTestSegments;
	if (!bodySegments) {
		const prevFork = ForkContext.newEmpty(forkCtx);
		prevFork.add(ctx.endOfInitSegments);
		if (ctx.endOfUpdateSegments) {
			prevFork.add(ctx.endOfUpdateSegments);
		}
		bodySegments = prevFork.makeNext(0, -1);
	}
	ctx.continueDestSegments = ctx.continueDestSegments || bodySegments;
	forkCtx.replaceHead(bodySegments);
}

/**
 * Handles the creation of a logical right-hand operand segment.
 * @param {CodePathState} state The current state.
 */
function handleLogicalRight(state) {
	const currentCtx = state.choiceContext;
	const forkCtx = state.forkContext;

	if (currentCtx.processed) {
		let prevFork;
		switch (currentCtx.kind) {
			case "&&":
				prevFork = currentCtx.trueForkContext;
				break;
			case "||":
				prevFork = currentCtx.falseForkContext;
				break;
			case "??":
				prevFork = currentCtx.nullishForkContext;
				break;
			default:
				throw new Error("unreachable");
		}
		forkCtx.replaceHead(prevFork.makeNext(0, -1));
		prevFork.clear();
		currentCtx.processed = false;
	} else {
		switch (currentCtx.kind) {
			case "&&":
				currentCtx.falseForkContext.add(forkCtx.head);
				currentCtx.nullishForkContext.add(forkCtx.head);
				break;
			case "||":
				currentCtx.trueForkContext.add(forkCtx.head);
				break;
			case "??":
				currentCtx.trueForkContext.add(forkCtx.head);
				currentCtx.falseForkContext.add(forkCtx.head);
				break;
			default:
				throw new Error("unreachable");
		}
		forkCtx.replaceHead(forkCtx.makeNext(-1, -1));
	}
}

//------------------------------------------------------------------------------
// Public Interface
//------------------------------------------------------------------------------

/**
 * A class which manages state to analyze code paths.
 */
class CodePathState {
	/**
	 * Creates a new instance.
	 * @param {IdGenerator} idGenerator An id generator to generate id for code
	 *   path segments.
	 * @param {Function} onLooped A callback function to notify looping.
	 */
	constructor(idGenerator, onLooped) {
		/** The ID generator to use when creating new segments. */
		this.idGenerator = idGenerator;
		/** A callback function to call when there is a loop. */
		this.notifyLooped = onLooped;
		/** The root fork context for this state. */
		this.forkContext = ForkContext.newRoot(idGenerator);
		/** Context for logical expressions, conditional expressions, `if` statements,
		 * and loops.
		 */
		this.choiceContext = null;
		/** Context for `switch` statements. */
		this.switchContext = null;
		/** Context for `try` statements. */
		this.tryContext = null;
		/** Context for loop statements. */
		this.loopContext = null;
		/** Context for `break` statements. */
		this.breakContext = null;
		/** Context for `ChainExpression` nodes. */
		this.chainContext = null;
		/** Tracks the current segments in the state. */
		this.currentSegments = [];
		/** Tracks the starting segment for this path. */
		this.initialSegment = this.forkContext.head[0];
		/** The final segments of the code path which are either `return` or `throw`. */
		this.finalSegments = [];
		/** The final segments of the code path which are `return`. */
		this.returnedForkContext = [];
		/** The final segments of the code path which are `throw`. */
		this.thrownForkContext = [];

		const final = this.finalSegments;
		const returned = this.returnedForkContext;
		const thrown = this.thrownForkContext;

		returned.add = addToReturnedOrThrown.bind(null, returned, thrown, final);
		thrown.add = addToReturnedOrThrown.bind(null, thrown, returned, final);
	}

	/** @type {CodePathSegment[]} */
	get headSegments() {
		return this.forkContext.head;
	}

	/** @type {ForkContext} */
	get parentForkContext() {
		const current = this.forkContext;
		return current && current.upper;
	}

	/**
	 * Creates and stacks new forking context.
	 * @param {boolean} forkLeavingPath A flag which shows being in a
	 *   "finally" block.
	 * @returns {ForkContext} The created context.
	 */
	pushForkContext(forkLeavingPath) {
		this.forkContext = ForkContext.newEmpty(this.forkContext, forkLeavingPath);
		return this.forkContext;
	}

	/**
	 * Pops and merges the last forking context.
	 * @returns {ForkContext} The last context.
	 */
	popForkContext() {
		const last = this.forkContext;
		this.forkContext = last.upper;
		this.forkContext.replaceHead(last.makeNext(0, -1));
		return last;
	}

	/** Creates a new path. */
	forkPath() {
		this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
	}

	/** Creates a bypass path. */
	forkBypassPath() {
		this.forkContext.add(this.parentForkContext.head);
	}

	//--------------------------------------------------------------------------
	// ConditionalExpression, LogicalExpression, IfStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context for ConditionalExpression, LogicalExpression, AssignmentExpression (logical assignments only),
	 * IfStatement, WhileStatement, DoWhileStatement, or ForStatement.
	 *
	 * @param {string} kind A kind string.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice creates a fork.
	 */
	pushChoiceContext(kind, isForkingAsResult) {
		this.choiceContext = new ChoiceContext(
			this.choiceContext,
			kind,
			isForkingAsResult,
			this.forkContext,
		);
	}

	/**
	 * Pops the last choice context and finalizes it.
	 * @returns {ChoiceContext} The popped context.
	 */
	popChoiceContext() {
		const popped = this.choiceContext;
		const forkCtx = this.forkContext;
		const head = forkCtx.head;
		this.choiceContext = popped.upper;

		switch (popped.kind) {
			case "&&":
			case "||":
			case "??":
				handleLogicalChoicePop(popped, forkCtx, this.choiceContext);
				break;
			case "test":
				handleTestChoicePop(popped, forkCtx);
				break;
			case "loop":
				return popped;
			default:
				throw new Error("unreachable");
		}
		mergeChoiceForks(popped, forkCtx);
		return popped;
	}

	/** Creates a code path segment to represent right-hand operand of a logical expression. */
	makeLogicalRight() {
		handleLogicalRight(this);
	}

	/** Makes a code path segment of the `if` block. */
	makeIfConsequent() {
		const ctx = this.choiceContext;
		const forkCtx = this.forkContext;
		if (!ctx.processed) {
			ctx.trueForkContext.add(forkCtx.head);
			ctx.falseForkContext.add(forkCtx.head);
			ctx.nullishForkContext.add(forkCtx.head);
		}
		ctx.processed = false;
		forkCtx.replaceHead(ctx.trueForkContext.makeNext(0, -1));
	}

	/** Makes a code path segment of the `else` block. */
	makeIfAlternate() {
		const ctx = this.choiceContext;
		const forkCtx = this.forkContext;
		ctx.trueForkContext.clear();
		ctx.trueForkContext.add(forkCtx.head);
		ctx.processed = true;
		forkCtx.replaceHead(ctx.falseForkContext.makeNext(0, -1));
	}

	//--------------------------------------------------------------------------
	// ChainExpression
	//--------------------------------------------------------------------------

	/** Pushes a new `ChainExpression` context to the stack. */
	pushChainContext() {
		this.chainContext = new ChainContext(this.chainContext);
	}

	/** Pop a `ChainExpression` context from the stack. */
	popChainContext() {
		const ctx = this.chainContext;
		this.chainContext = ctx.upper;
		for (let i = ctx.choiceContextCount; i > 0; --i) {
			this.popChoiceContext();
		}
	}

	/** Create a choice context for optional access. */
	makeOptionalNode() {
		if (this.chainContext) {
			this.chainContext.choiceContextCount += 1;
			this.pushChoiceContext("??", false);
		}
	}

	/** Create a fork for optional chaining. */
	makeOptionalRight() {
		if (this.chainContext) {
			this.makeLogicalRight();
		}
	}

	//--------------------------------------------------------------------------
	// SwitchStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of SwitchStatement and stacks it.
	 * @param {boolean} hasCase `true` if the switch statement has one or more
	 *   case parts.
	 * @param {string|null} label The label text.
	 */
	pushSwitchContext(hasCase, label) {
		this.switchContext = new SwitchContext(this.switchContext, hasCase);
		this.pushBreakContext(true, label);
	}

	/** Pops the last context of SwitchStatement and finalizes it. */
	popSwitchContext() {
		const ctx = this.switchContext;
		this.switchContext = ctx.upper;
		finalizeSwitchContext(this, ctx);
	}

	/**
	 * Makes a code path segment for a `SwitchCase` node.
	 * @param {boolean} isCaseBodyEmpty `true` if the body is empty.
	 * @param {boolean} isDefaultCase `true` if the body is the default case.
	 */
	makeSwitchCaseBody(isCaseBodyEmpty, isDefaultCase) {
		const ctx = this.switchContext;
		if (!ctx.hasCase) {
			return;
		}
		const parentFork = this.forkContext;
		const fork = this.pushForkContext();
		fork.add(parentFork.makeNext(0, -1));

		if (isDefaultCase) {
			ctx.defaultSegments = parentFork.head;
			if (isCaseBodyEmpty) {
				ctx.foundEmptyDefault = true;
			} else {
				ctx.defaultBodySegments = fork.head;
			}
		} else if (!isCaseBodyEmpty && ctx.foundEmptyDefault) {
			ctx.foundEmptyDefault = false;
			ctx.defaultBodySegments = fork.head;
		}
		ctx.lastIsDefault = isDefaultCase;
		ctx.forkCount += 1;
	}

	//--------------------------------------------------------------------------
	// TryStatement
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of TryStatement and stacks it.
	 * @param {boolean} hasFinalizer `true` if the try statement has a
	 *   `finally` block.
	 */
	pushTryContext(hasFinalizer) {
		this.tryContext = new TryContext(
			this.tryContext,
			hasFinalizer,
			this.forkContext,
		);
	}

	/** Pops the last context of TryStatement and finalizes it. */
	popTryContext() {
		const ctx = this.tryContext;
		this.tryContext = ctx.upper;
		if (ctx.position === "catch") {
			handleCatchOnlyTry(this, ctx);
			return;
		}
		handleFinallyTry(this, ctx);
	}

	/** Makes a code path segment for a `catch` block. */
	makeCatchBlock() {
		const ctx = this.tryContext;
		const forkCtx = this.forkContext;
		const originalThrown = ctx.thrownForkContext;

		ctx.position = "catch";
		ctx.thrownForkContext = ForkContext.newEmpty(forkCtx);
		ctx.lastOfTryIsReachable = forkCtx.reachable;

		originalThrown.add(forkCtx.head);
		const thrownSegs = originalThrown.makeNext(0, -1);
		this.pushForkContext();
		this.forkBypassPath();
		this.forkContext.add(thrownSegs);
	}

	/** Makes a code path segment for a `finally` block. */
	makeFinallyBlock() {
		const ctx = this.tryContext;
		let forkCtx = this.forkContext;
		const originalReturned = ctx.returnedForkContext;
		const originalThrown = ctx.thrownForkContext;
		const leavingHead = forkCtx.head;

		if (ctx.position === "catch") {
			this.popForkContext();
			forkCtx = this.forkContext;
			ctx.lastOfCatchIsReachable = forkCtx.reachable;
		} else {
			ctx.lastOfTryIsReachable = forkCtx.reachable;
		}
		ctx.position = "finally";

		if (originalReturned.empty && originalThrown.empty) {
			return;
		}
		const segments = forkCtx.makeNext(-1, -1);
		for (let i = 0; i < forkCtx.count; ++i) {
			const prev = [leavingHead[i]];
			for (let j = 0; j < originalReturned.segmentsList.length; ++j) {
				prev.push(originalReturned.segmentsList[j][i]);
			}
			for (let j = 0; j < originalThrown.segmentsList.length; ++j) {
				prev.push(originalThrown.segmentsList[j][i]);
			}
			segments.push(
				CodePathSegment.newNext(this.idGenerator.next(), prev),
			);
		}
		this.pushForkContext(true);
		this.forkContext.add(segments);
	}

	/** Makes a code path segment from the first throwable node to the `catch`
	 * block or the `finally` block.
	 */
	makeFirstThrowablePathInTryBlock() {
		const forkCtx = this.forkContext;
		if (!forkCtx.reachable) {
			return;
		}
		const ctx = getThrowContext(this);
		if (
			ctx === this ||
			ctx.position !== "try" ||
			!ctx.thrownForkContext.empty
		) {
			return;
		}
		ctx.thrownForkContext.add(forkCtx.head);
		forkCtx.replaceHead(forkCtx.makeNext(-1, -1));
	}

	//--------------------------------------------------------------------------
	// Loop Statements
	//--------------------------------------------------------------------------

	/**
	 * Creates a context object of a loop statement and stacks it.
	 * @param {string} type The type of the node which was triggered.
	 * @param {string|null} label A label of the node which was triggered.
	 */
	pushLoopContext(type, label) {
		const forkCtx = this.forkContext;
		const breakCtx = this.pushBreakContext(true, label);
		switch (type) {
			case "WhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new WhileLoopContext(
					this.loopContext,
					label,
					breakCtx,
				);
				break;
			case "DoWhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new DoWhileLoopContext(
					this.loopContext,
					label,
					breakCtx,
					forkCtx,
				);
				break;
			case "ForStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new ForLoopContext(
					this.loopContext,
					label,
					breakCtx,
				);
				break;
			case "ForInStatement":
				this.loopContext = new ForInLoopContext(
					this.loopContext,
					label,
					breakCtx,
				);
				break;
			case "ForOfStatement":
				this.loopContext = new ForOfLoopContext(
					this.loopContext,
					label,
					breakCtx,
				);
				break;
			default:
				throw new Error(`unknown type: "${type}"`);
		}
	}

	/** Pops the last context of a loop statement and finalizes it. */
	popLoopContext() {
		const ctx = this.loopContext;
		this.loopContext = ctx.upper;
		const forkCtx = this.forkContext;
		const brokenForkCtx = this.popBreakContext().brokenForkContext;

		switch (ctx.type) {
			case "WhileStatement":
			case "ForStatement":
				this.popChoiceContext();
				handleWhileOrForLoop(this, ctx, forkCtx, brokenForkCtx);
				break;
			case "DoWhileStatement":
				const choiceCtx = this.popChoiceContext();
				handleDoWhileLoop(this, ctx, choiceCtx, forkCtx, brokenForkCtx);
				break;
			case "ForInStatement":
			case "ForOfStatement":
				handleForInOrOfLoop(this, ctx, forkCtx, brokenForkCtx);
				break;
			default:
				throw new Error("unreachable");
		}
		if (brokenForkCtx.empty) {
			forkCtx.replaceHead(forkCtx.makeUnreachable(-1, -1));
		} else {
			forkCtx.replaceHead(brokenForkCtx.makeNext(0, -1));
		}
	}

	/** Makes a code path segment for the test part of a WhileStatement. */
	makeWhileTest(test) {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const testSegments = forkCtx.makeNext(0, -1);
		ctx.test = test;
		ctx.continueDestSegments = testSegments;
		forkCtx.replaceHead(testSegments);
	}

	/** Makes a code path segment for the body part of a WhileStatement. */
	makeWhileBody() {
		const ctx = this.loopContext;
		const choiceCtx = this.choiceContext;
		const forkCtx = this.forkContext;
		if (!choiceCtx.processed) {
			choiceCtx.trueForkContext.add(forkCtx.head);
			choiceCtx.falseForkContext.add(forkCtx.head);
		}
		if (ctx.test !== true) {
			ctx.brokenForkContext.addAll(choiceCtx.falseForkContext);
		}
		forkCtx.replaceHead(choiceCtx.trueForkContext.makeNext(0, -1));
	}

	/** Makes a code path segment for the body part of a DoWhileStatement. */
	makeDoWhileBody() {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const bodySegments = forkCtx.makeNext(-1, -1);
		ctx.entrySegments = bodySegments;
		forkCtx.replaceHead(bodySegments);
	}

	/** Makes a code path segment for the test part of a DoWhileStatement. */
	makeDoWhileTest(test) {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		ctx.test = test;
		if (!ctx.continueForkContext.empty) {
			ctx.continueForkContext.add(forkCtx.head);
			const testSegments = ctx.continueForkContext.makeNext(0, -1);
			forkCtx.replaceHead(testSegments);
		}
	}

	/** Makes a code path segment for the test part of a ForStatement. */
	makeForTest(test) {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const endOfInit = forkCtx.head;
		const testSegments = forkCtx.makeNext(-1, -1);
		ctx.test = test;
		ctx.endOfInitSegments = endOfInit;
		ctx.continueDestSegments = ctx.testSegments = testSegments;
		forkCtx.replaceHead(testSegments);
	}

	/** Makes a code path segment for the update part of a ForStatement. */
	makeForUpdate() {
		const ctx = this.loopContext;
		const choiceCtx = this.choiceContext;
		const forkCtx = this.forkContext;
		if (ctx.testSegments) {
			finalizeTestSegmentsOfFor(ctx, choiceCtx, forkCtx.head);
		} else {
			ctx.endOfInitSegments = forkCtx.head;
		}
		const updateSegments = forkCtx.makeDisconnected(-1, -1);
		ctx.continueDestSegments = ctx.updateSegments = updateSegments;
		forkCtx.replaceHead(updateSegments);
	}

	/** Makes a code path segment for the body part of a ForStatement. */
	makeForBody() {
		handleForBody(this);
	}

	/** Makes a code path segment for the left part of a ForInStatement and a
	 * ForOfStatement.
	 */
	makeForInOfLeft() {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const leftSegments = forkCtx.makeDisconnected(-1, -1);
		ctx.prevSegments = forkCtx.head;
		ctx.leftSegments = ctx.continueDestSegments = leftSegments;
		forkCtx.replaceHead(leftSegments);
	}

	/** Makes a code path segment for the right part of a ForInStatement and a
	 * ForOfStatement.
	 */
	makeForInOfRight() {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const temp = ForkContext.newEmpty(forkCtx);
		temp.add(ctx.prevSegments);
		const rightSegments = temp.makeNext(-1, -1);
		ctx.endOfLeftSegments = forkCtx.head;
		forkCtx.replaceHead(rightSegments);
	}

	/** Makes a code path segment for the body part of a ForInStatement and a
	 * ForOfStatement.
	 */
	makeForInOfBody() {
		const ctx = this.loopContext;
		const forkCtx = this.forkContext;
		const temp = ForkContext.newEmpty(forkCtx);
		temp.add(ctx.endOfLeftSegments);
		const bodySegments = temp.makeNext(-1, -1);
		makeLooped(this, forkCtx.head, ctx.leftSegments);
		ctx.brokenForkContext.add(forkCtx.head);
		forkCtx.replaceHead(bodySegments);
	}

	//--------------------------------------------------------------------------
	// Control Statements
	//--------------------------------------------------------------------------

	/** Creates new context in which a `break` statement can be used. */
	pushBreakContext(breakable, label) {
		this.breakContext = new BreakContext(
			this.breakContext,
			breakable,
			label,
			this.forkContext,
		);
		return this.breakContext;
	}

	/** Removes the top item of the break context stack. */
	popBreakContext() {
		const ctx = this.breakContext;
		const forkCtx = this.forkContext;
		this.breakContext = ctx.upper;
		if (!ctx.breakable) {
			const broken = ctx.brokenForkContext;
			if (!broken.empty) {
				broken.add(forkCtx.head);
				forkCtx.replaceHead(broken.makeNext(0, -1));
			}
		}
		return ctx;
	}

	/** Makes a path for a `break` statement. */
	makeBreak(label) {
		const forkCtx = this.forkContext;
		if (!forkCtx.reachable) {
			return;
		}
		const ctx = getBreakContext(this, label);
		if (ctx) {
			ctx.brokenForkContext.add(forkCtx.head);
		}
		forkCtx.replaceHead(forkCtx.makeUnreachable(-1, -1));
	}

	/** Makes a path for a `continue` statement. */
	makeContinue(label) {
		const forkCtx = this.forkContext;
		if (!forkCtx.reachable) {
			return;
		}
		const ctx = getContinueContext(this, label);
		if (ctx) {
			if (ctx.continueDestSegments) {
				makeLooped(this, forkCtx.head, ctx.continueDestSegments);
				if (ctx.type === "ForInStatement" || ctx.type === "ForOfStatement") {
					ctx.brokenForkContext.add(forkCtx.head);
				}
			} else {
				ctx.continueForkContext.add(forkCtx.head);
			}
		}
		forkCtx.replaceHead(forkCtx.makeUnreachable(-1, -1));
	}

	/** Makes a path for a `return` statement. */
	makeReturn() {
		const forkCtx = this.forkContext;
		if (forkCtx.reachable) {
			getReturnContext(this).returnedForkContext.add(forkCtx.head);
			forkCtx.replaceHead(forkCtx.makeUnreachable(-1, -1));
		}
	}

	/** Makes a path for a `throw` statement. */
	makeThrow() {
		const forkCtx = this.forkContext;
		if (forkCtx.reachable) {
			getThrowContext(this).thrownForkContext.add(forkCtx.head);
			forkCtx.replaceHead(forkCtx.makeUnreachable(-1, -1));
		}
	}

	/** Makes the final path. */
	makeFinal() {
		const segments = this.currentSegments;
		if (segments.length > 0 && segments[0].reachable) {
			this.returnedForkContext.add(segments);
		}
	}
}

module.exports = CodePathState;