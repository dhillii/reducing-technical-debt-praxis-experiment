```javascript
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

/**
 * Represents the context in which a `break` statement can be used.
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
		/**
		 * The previous `BreakContext`
		 * @type {BreakContext}
		 */
		this.upper = upperContext;

		/**
		 * Indicates if we are inside a statement where `break` without a label
		 * will exit the statement.
		 * @type {boolean}
		 */
		this.breakable = breakable;

		/**
		 * The label associated with the statement.
		 * @type {string|null}
		 */
		this.label = label;

		/**
		 * The fork context for the `break`.
		 * @type {ForkContext}
		 */
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
		/**
		 * The previous `ChainContext`
		 * @type {ChainContext}
		 */
		this.upper = upperContext;

		/**
		 * The number of choice contexts inside of the `ChainContext`.
		 * @type {number}
		 */
		this.choiceContextCount = 0;
	}
}

/**
 * Represents a choice in the code path.
 */
class ChoiceContext {
	/**
	 * Creates a new instance.
	 * @param {ChoiceContext} upperContext The previous `ChoiceContext`.
	 * @param {string} kind The kind of choice.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice
	 *      creates a fork.
	 * @param {ForkContext} forkContext The containing `ForkContext`.
	 */
	constructor(upperContext, kind, isForkingAsResult, forkContext) {
		/**
		 * The previous `ChoiceContext`
		 * @type {ChoiceContext}
		 */
		this.upper = upperContext;

		/**
		 * The kind of choice.
		 * @type {string}
		 */
		this.kind = kind;

		/**
		 * Indicates if the result of the choice forks the code path.
		 * @type {boolean}
		 */
		this.isForkingAsResult = isForkingAsResult;

		/**
		 * The fork context for the `true` path of the choice.
		 * @type {ForkContext}
		 */
		this.trueForkContext = ForkContext.newEmpty(forkContext);

		/**
		 * The fork context for the `false` path of the choice.
		 * @type {ForkContext}
		 */
		this.falseForkContext = ForkContext.newEmpty(forkContext);

		/**
		 * The fork context for when the choice result is `null` or `undefined`.
		 * @type {ForkContext}
		 */
		this.nullishForkContext = ForkContext.newEmpty(forkContext);

		/**
		 * Indicates if any of `trueForkContext`, `falseForkContext`, or
		 * `nullishForkContext` have been updated with segments from a child context.
		 * @type {boolean}
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
		/**
		 * The previous `LoopContext`.
		 * @type {LoopContext}
		 */
		this.upper = upperContext;

		/**
		 * The AST node's `type` for the loop.
		 * @type {string}
		 */
		this.type = type;

		/**
		 * The label for the loop from an enclosing `LabeledStatement`.
		 * @type {string|null}
		 */
		this.label = label;

		/**
		 * The fork context for when `break` is encountered.
		 * @type {ForkContext}
		 */
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

		/**
		 * The hardcoded literal boolean test condition for
		 * the loop. Used to catch infinite or skipped loops.
		 * @type {boolean|undefined}
		 */
		this.test = void 0;

		/**
		 * The segments representing the test condition where `continue` will
		 * jump to. The test condition will typically have just one segment but
		 * it's possible for there to be more than one.
		 * @type {Array<CodePathSegment>|null}
		 */
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

		/**
		 * The hardcoded literal boolean test condition for
		 * the loop. Used to catch infinite or skipped loops.
		 * @type {boolean|undefined}
		 */
		this.test = void 0;

		/**
		 * The segments at the start of the loop body. This is the only loop
		 * where the test comes at the end, so the first iteration always
		 * happens and we need a reference to the first statements.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.entrySegments = null;

		/**
		 * The fork context to follow when a `continue` is found.
		 * @type {ForkContext}
		 */
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

		/**
		 * The hardcoded literal boolean test condition for
		 * the loop. Used to catch infinite or skipped loops.
		 * @type {boolean|undefined}
		 */
		this.test = void 0;

		/**
		 * The end of the init expression. This may change during the lifetime
		 * of the instance as we traverse the loop because some loops don't have
		 * an init expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.endOfInitSegments = null;

		/**
		 * The start of the test expression. This may change during the lifetime
		 * of the instance as we traverse the loop because some loops don't have
		 * a test expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.testSegments = null;

		/**
		 * The end of the test expression. This may change during the lifetime
		 * of the instance as we traverse the loop because some loops don't have
		 * a test expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.endOfTestSegments = null;

		/**
		 * The start of the update expression. This may change during the lifetime
		 * of the instance as we traverse the loop because some loops don't have
		 * an update expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.updateSegments = null;

		/**
		 * The end of the update expression. This may change during the lifetime
		 * of the instance as we traverse the loop because some loops don't have
		 * an update expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.endOfUpdateSegments = null;

		/**
		 * The segments representing the test condition where `continue` will
		 * jump to. The test condition will typically have just one segment but
		 * it's possible for there to be more than one. This may change during the
		 * lifetime of the instance as we traverse the loop because some loops
		 * don't have an update expression. When there is an update expression, this
		 * will end up pointing to that expression; otherwise it will end up pointing
		 * to the test expression.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.continueDestSegments = null;
	}
}

/**
 * Represents the context for a `for-in` loop.
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

		/**
		 * The segments that came immediately before the start of the loop.
		 * This allows you to traverse backwards out of the loop into the
		 * surrounding code. This is necessary to evaluate the right expression
		 * correctly, as it must be evaluated in the same way as the left
		 * expression, but the pointer to these segments would otherwise be
		 * lost if not stored on the instance. Once the right expression has
		 * been evaluated, this property is no longer used.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.prevSegments = null;

		/**
		 * Segments representing the start of everything to the left of the
		 * `in` keyword. This can be used to move forward towards
		 * `endOfLeftSegments`. `leftSegments` and `endOfLeftSegments` are
		 * effectively the head and tail of a doubly-linked list.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.leftSegments = null;

		/**
		 * Segments representing the end of everything to the left of the
		 * `in` keyword. This can be used to move backward towards `leftSegments`.
		 * `leftSegments` and `endOfLeftSegments` are effectively the head
		 * and tail of a doubly-linked list.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.endOfLeftSegments = null;

		/**
		 * The segments representing the left expression where `continue` will
		 * jump to. In `for-in` loops, `continue` must always re-execute the
		 * left expression each time through the loop. This contains the same
		 * segments as `leftSegments`, but is duplicated here so each loop
		 * context has the same property pointing to where `continue` should
		 * end up.
		 * @type {Array<CodePathSegment>|null}
		 */
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

		/**
		 * The segments that came immediately before the start of the loop.
		 * This allows you to traverse backwards out of the loop into the
		 * surrounding code. This is necessary to evaluate the right expression
		 * correctly, as it must be evaluated in the same way as the left
		 * expression, but the pointer to these segments would otherwise be
		 * lost if not stored on the instance. Once the right expression has
		 * been evaluated, this property is no longer used.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.prevSegments = null;

		/**
		 * Segments representing the start of everything to the left of the
		 * `of` keyword. This can be used to move forward towards
		 * `endOfLeftSegments`. `leftSegments` and `endOfLeftSegments` are
		 * effectively the head and tail of a doubly-linked list.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.leftSegments = null;

		/**
		 * Segments representing the end of everything to the left of the
		 * `of` keyword. This can be used to move backward towards `leftSegments`.
		 * `leftSegments` and `endOfLeftSegments` are effectively the head
		 * and tail of a doubly-linked list.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.endOfLeftSegments = null;

		/**
		 * The segments representing the left expression where `continue` will
		 * jump to. In `for-in` loops, `continue` must always re-execute the
		 * left expression each time through the loop. This contains the same
		 * segments as `leftSegments`, but is duplicated here so each loop
		 * context has the same property pointing to where `continue` should
		 * end up.
		 * @type {Array<CodePathSegment>|null}
		 */
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
	 */
	constructor(upperContext, hasCase) {
		/**
		 * The previous context.
		 * @type {SwitchContext}
		 */
		this.upper = upperContext;

		/**
		 * Indicates if there is at least one `case` statement.
		 * @type {boolean}
		 */
		this.hasCase = hasCase;

		/**
		 * The `default` keyword.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.defaultSegments = null;

		/**
		 * The default case body starting segments.
		 * @type {Array<CodePathSegment>|null}
		 */
		this.defaultBodySegments = null;

		/**
		 * Indicates if a `default` case and is empty exists.
		 * @type {boolean}
		 */
		this.foundEmptyDefault = false;

		/**
		 * Indicates that a `default` exists and is the last case.
		 * @type {boolean}
		 */
		this.lastIsDefault = false;

		/**
		 * The number of fork contexts created.
		 * @type {number}
		 */
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
		/**
		 * The previous context.
		 * @type {TryContext}
		 */
		this.upper = upperContext;

		/**
		 * Indicates if the `try` statement has a `finally` block.
		 * @type {boolean}
		 */
		this.hasFinalizer = hasFinalizer;

		/**
		 * Tracks the traversal position inside of the `try` statement.
		 * @type {"try"|"catch"|"finally"}
		 */
		this.position = "try";

		/**
		 * If the `try` statement has a `finally` block, this affects how a
		 * `return` statement behaves in the `try` block.
		 * @type {ForkContext|null}
		 */
		this.returnedForkContext = hasFinalizer
			? ForkContext.newEmpty(forkContext)
			: null;

		/**
		 * When a `throw` occurs inside of a `try` block, the code path forks
		 * into the `catch` or `finally` blocks.
		 * @type {ForkContext}
		 */
		this.thrownForkContext = ForkContext.newEmpty(forkContext);

		/**
		 * Indicates if the last segment in the `try` block is reachable.
		 * @type {boolean}
		 */
		this.lastOfTryIsReachable = false;

		/**
		 * Indicates if the last segment in the `catch` block is reachable.
		 * @type {boolean}
		 */
		this.lastOfCatchIsReachable = false;
	}
}

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
		/**
		 * The ID generator to use when creating new segments.
		 * @type {IdGenerator}
		 */
		this.idGenerator = idGenerator;

		/**
		 * A callback function to call when there is a loop.
		 * @type {Function}
		 */
		this.notifyLooped = onLooped;

		/**
		 * The root fork context for this state.
		 * @type {ForkContext}
		 */
		this.forkContext = ForkContext.newRoot(idGenerator);

		/**
		 * Context for logical expressions, conditional expressions, `if` statements,
		 * and loops.
		 * @type {ChoiceContext}
		 */
		this.choiceContext = null;

		/**
		 * Context for `switch` statements.
		 * @type {SwitchContext}
		 */
		this.switchContext = null;

		/**
		 * Context for `try` statements.
		 * @type {TryContext}
		 */
		this.tryContext = null;

		/**
		 * Context for loop statements.
		 * @type {LoopContext}
		 */
		this.loopContext = null;

		/**
		 * Context for `break` statements.
		 * @type {BreakContext}
		 */
		this.breakContext = null;

		/**
		 * Context for `ChainExpression` nodes.
		 * @type {ChainContext}
		 */
		this.chainContext = null;

		/**
		 * An array that tracks the current segments in the state.
		 * @type {Array<CodePathSegment>}
		 */
		this.currentSegments = [];

		/**
		 * Tracks the starting segment for this path.
		 * @type {CodePathSegment}
		 */
		this.initialSegment = this.forkContext.head[0];

		/**
		 * The final segments of the code path which are either `return` or `throw`.
		 * @type {Array<CodePathSegment>}
		 */
		this.finalSegments = [];

		/**
		 * The final segments of the code path which are `return`.
		 * @type {Array<CodePathSegment>}
		 */
		this.returnedForkContext = [];

		/**
		 * The final segments of the code path which are `throw`.
		 * @type {Array<CodePathSegment>}
		 */
		this.thrownForkContext = [];

		// Add an `add` method to these arrays.
		const final = this.finalSegments;
		const returned = this.returnedForkContext;
		const thrown = this.thrownForkContext;

		returned.add = (segments) => {
			returned.push(...segments);
			final.push(...segments.filter((segment) => !thrown.includes(segment)));
		};
		thrown.add = (segments) => {
			thrown.push(...segments);
			final.push(...segments.filter((segment) => !returned.includes(segment)));
		};
	}

	// ... rest of the class remains the same ...

	/**
	 * Creates a new path.
	 * @returns {void}
	 */
	forkPath() {
		this.forkContext.add(this.parentForkContext.makeNext(-1, -1));
	}

	/**
	 * Creates a bypass path.
	 * @returns {void}
	 */
	forkBypassPath() {
		this.forkContext.add(this.parentForkContext.head);
	}

	// ... rest of the class remains the same ...

	/**
	 * Makes a code path segment for the test part of a ForStatement.
	 * @param {boolean|undefined} test The test value (only when constant).
	 * @returns {void}
	 */
	makeForTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const endOfInitSegments = forkContext.head;
		const testSegments = forkContext.makeNext(-1, -1);

		// Update state.
		context.test = test;
		context.endOfInitSegments = endOfInitSegments;
		context.continueDestSegments = context.testSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}

	// ... rest of the class remains the same ...

	/**
	 * Makes a code path segment for the update part of a ForStatement.
	 * @returns {void}
	 */
	makeForUpdate() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;

		// Make the next paths of the test.
		if (context.testSegments) {
			finalizeTestSegmentsOfFor(context, choiceContext, forkContext.head);
		} else {
			context.endOfInitSegments = forkContext.head;
		}

		// Update state.
		const updateSegments = forkContext.makeDisconnected(-1, -1);

		context.continueDestSegments = context.updateSegments = updateSegments;
		forkContext.replaceHead(updateSegments);
	}

	// ... rest of the class remains the same ...

	/**
	 * Creates looping path between two arrays of segments.
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

	// ... rest of the class remains the same ...

	/**
	 * Finalizes segments of `test` chunk of a ForStatement.
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

module.exports = CodePathState;
```