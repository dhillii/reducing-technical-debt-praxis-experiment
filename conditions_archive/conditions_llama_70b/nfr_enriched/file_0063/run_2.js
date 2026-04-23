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

		/**
		 * We add an `add` method so that these look more like fork contexts and
		 * can be used interchangeably when a fork context is needed to add more
		 * segments to a path.
		 */
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

	/**
	 * Creates and stacks new forking context.
	 * @param {boolean} forkLeavingPath A flag which shows being in a
	 *   "finally" block.
	 * @returns {ForkContext} The created context.
	 */
	pushForkContext(forkLeavingPath) {
		this.forkContext = ForkContext.newEmpty(
			this.forkContext,
			forkLeavingPath,
		);

		return this.forkContext;
	}

	/**
	 * Pops and merges the last forking context.
	 * @returns {ForkContext} The last context.
	 */
	popForkContext() {
		const lastContext = this.forkContext;

		this.forkContext = lastContext.upper;
		this.forkContext.replaceHead(lastContext.makeNext(0, -1));

		return lastContext;
	}

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

	/**
	 * Creates a context for ConditionalExpression, LogicalExpression, AssignmentExpression (logical assignments only),
	 * IfStatement, WhileStatement, DoWhileStatement, or ForStatement.
	 * @param {string} kind A kind string.
	 * @param {boolean} isForkingAsResult Indicates if the result of the choice
	 *      creates a fork.
	 * @returns {void}
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
		const poppedChoiceContext = this.choiceContext;
		const forkContext = this.forkContext;
		const head = forkContext.head;

		this.choiceContext = poppedChoiceContext.upper;

		switch (poppedChoiceContext.kind) {
			case "&&":
			case "||":
			case "??":
				if (!poppedChoiceContext.processed) {
					poppedChoiceContext.trueForkContext.add(head);
					poppedChoiceContext.falseForkContext.add(head);
					poppedChoiceContext.nullishForkContext.add(head);
				}

				if (poppedChoiceContext.isForkingAsResult) {
					const parentContext = this.choiceContext;

					parentContext.trueForkContext.addAll(
						poppedChoiceContext.trueForkContext,
					);
					parentContext.falseForkContext.addAll(
						poppedChoiceContext.falseForkContext,
					);
					parentContext.nullishForkContext.addAll(
						poppedChoiceContext.nullishForkContext,
					);
					parentContext.processed = true;

					return poppedChoiceContext;
				}

				break;

			case "test":
				if (!poppedChoiceContext.processed) {
					poppedChoiceContext.trueForkContext.add(forkContext.head);
					poppedChoiceContext.falseForkContext.add(forkContext.head);
					poppedChoiceContext.nullishForkContext.add(forkContext.head);
				}

				break;

			case "loop":
				return poppedChoiceContext;

			default:
				throw new Error("unreachable");
		}

		const combinedForkContext = poppedChoiceContext.trueForkContext;

		combinedForkContext.addAll(poppedChoiceContext.falseForkContext);
		forkContext.replaceHead(combinedForkContext.makeNext(0, -1));

		return poppedChoiceContext;
	}

	/**
	 * Creates a code path segment to represent right-hand operand of a logical
	 * expression.
	 * @returns {void}
	 */
	makeLogicalRight() {
		const currentChoiceContext = this.choiceContext;
		const forkContext = this.forkContext;

		if (currentChoiceContext.processed) {
			let prevForkContext;

			switch (currentChoiceContext.kind) {
				case "&&":
					prevForkContext = currentChoiceContext.trueForkContext;
					break;
				case "||":
					prevForkContext = currentChoiceContext.falseForkContext;
					break;
				case "??":
					prevForkContext = currentChoiceContext.nullishForkContext;
					break;
				default:
					throw new Error("unreachable");
			}

			forkContext.replaceHead(prevForkContext.makeNext(0, -1));

			prevForkContext.clear();
			currentChoiceContext.processed = false;
		} else {
			switch (currentChoiceContext.kind) {
				case "&&":
					currentChoiceContext.falseForkContext.add(forkContext.head);
					currentChoiceContext.nullishForkContext.add(forkContext.head);
					break;
				case "||":
					currentChoiceContext.trueForkContext.add(forkContext.head);
					break;
				case "??":
					currentChoiceContext.trueForkContext.add(forkContext.head);
					currentChoiceContext.falseForkContext.add(forkContext.head);
					break;
				default:
					throw new Error("unreachable");
			}

			forkContext.replaceHead(forkContext.makeNext(-1, -1));
		}
	}

	/**
	 * Makes a code path segment of the `if` block.
	 * @returns {void}
	 */
	makeIfConsequent() {
		const context = this.choiceContext;
		const forkContext = this.forkContext;

		if (!context.processed) {
			context.trueForkContext.add(forkContext.head);
			context.falseForkContext.add(forkContext.head);
			context.nullishForkContext.add(forkContext.head);
		}

		context.processed = false;

		forkContext.replaceHead(context.trueForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment of the `else` block.
	 * @returns {void}
	 */
	makeIfAlternate() {
		const context = this.choiceContext;
		const forkContext = this.forkContext;

		context.trueForkContext.clear();
		context.trueForkContext.add(forkContext.head);
		context.processed = true;

		forkContext.replaceHead(context.falseForkContext.makeNext(0, -1));
	}

	/**
	 * Pushes a new `ChainExpression` context to the stack.
	 * @returns {void}
	 */
	pushChainContext() {
		this.chainContext = new ChainContext(this.chainContext);
	}

	/**
	 * Pops a `ChainExpression` context from the stack.
	 * @returns {void}
	 */
	popChainContext() {
		const context = this.chainContext;

		this.chainContext = context.upper;

		for (let i = context.choiceContextCount; i > 0; --i) {
			this.popChoiceContext();
		}
	}

	/**
	 * Creates a choice context for optional access.
	 * @returns {void}
	 */
	makeOptionalNode() {
		if (this.chainContext) {
			this.chainContext.choiceContextCount += 1;
			this.pushChoiceContext("??", false);
		}
	}

	/**
	 * Creates a fork.
	 * @returns {void}
	 */
	makeOptionalRight() {
		if (this.chainContext) {
			this.makeLogicalRight();
		}
	}

	/**
	 * Creates a context object of SwitchStatement and stacks it.
	 * @param {boolean} hasCase Indicates if the switch statement has one or more
	 *   case parts.
	 * @param {string|null} label The label text.
	 * @returns {void}
	 */
	pushSwitchContext(hasCase, label) {
		this.switchContext = new SwitchContext(this.switchContext, hasCase);
		this.pushBreakContext(true, label);
	}

	/**
	 * Pops the last context of SwitchStatement and finalizes it.
	 * @returns {void}
	 */
	popSwitchContext() {
		const context = this.switchContext;

		this.switchContext = context.upper;

		const forkContext = this.forkContext;
		const brokenForkContext = this.popBreakContext().brokenForkContext;

		if (context.forkCount === 0) {
			if (!brokenForkContext.empty) {
				brokenForkContext.add(forkContext.makeNext(-1, -1));
				forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
			}

			return;
		}

		const lastSegments = forkContext.head;

		this.forkBypassPath();
		const lastCaseSegments = forkContext.head;

		brokenForkContext.add(lastSegments);

		if (!context.lastIsDefault) {
			if (context.defaultBodySegments) {
				disconnectSegments(
					context.defaultSegments,
					context.defaultBodySegments,
				);

				makeLooped(this, lastCaseSegments, context.defaultBodySegments);
			} else {
				brokenForkContext.add(lastCaseSegments);
			}
		}

		for (let i = 0; i < context.forkCount; ++i) {
			this.forkContext = this.forkContext.upper;
		}

		forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment for a `SwitchCase` node.
	 * @param {boolean} isCaseBodyEmpty Indicates if the body is empty.
	 * @param {boolean} isDefaultCase Indicates if the body is the default case.
	 * @returns {void}
	 */
	makeSwitchCaseBody(isCaseBodyEmpty, isDefaultCase) {
		const context = this.switchContext;

		if (!context.hasCase) {
			return;
		}

		const parentForkContext = this.forkContext;
		const forkContext = this.pushForkContext();

		forkContext.add(parentForkContext.makeNext(0, -1));

		if (isDefaultCase) {
			context.defaultSegments = parentForkContext.head;

			if (isCaseBodyEmpty) {
				context.foundEmptyDefault = true;
			} else {
				context.defaultBodySegments = forkContext.head;
			}
		} else {
			if (!isCaseBodyEmpty && context.foundEmptyDefault) {
				context.foundEmptyDefault = false;
				context.defaultBodySegments = forkContext.head;
			}
		}

		context.lastIsDefault = isDefaultCase;
		context.forkCount += 1;
	}

	/**
	 * Creates a context object of TryStatement and stacks it.
	 * @param {boolean} hasFinalizer Indicates if the try statement has a
	 *   `finally` block.
	 * @returns {void}
	 */
	pushTryContext(hasFinalizer) {
		this.tryContext = new TryContext(
			this.tryContext,
			hasFinalizer,
			this.forkContext,
		);
	}

	/**
	 * Pops the last context of TryStatement and finalizes it.
	 * @returns {void}
	 */
	popTryContext() {
		const context = this.tryContext;

		this.tryContext = context.upper;

		if (context.position === "catch") {
			this.popForkContext();
			return;
		}

		const originalReturnedForkContext = context.returnedForkContext;
		const originalThrownForkContext = context.thrownForkContext;

		if (
			originalReturnedForkContext.empty &&
			originalThrownForkContext.empty
		) {
			return;
		}

		const headSegments = this.forkContext.head;

		this.forkContext = this.forkContext.upper;
		const normalSegments = headSegments.slice(
			0,
			Math.trunc(headSegments.length / 2),
		);
		const leavingSegments = headSegments.slice(
			Math.trunc(headSegments.length / 2),
		);

		if (!originalReturnedForkContext.empty) {
			getReturnContext(this).returnedForkContext.add(leavingSegments);
		}
		if (!originalThrownForkContext.empty) {
			getThrowContext(this).thrownForkContext.add(leavingSegments);
		}

		this.forkContext.replaceHead(normalSegments);

		if (!context.lastOfTryIsReachable && !context.lastOfCatchIsReachable) {
			this.forkContext.makeUnreachable();
		}
	}

	/**
	 * Makes a code path segment for a `catch` block.
	 * @returns {void}
	 */
	makeCatchBlock() {
		const context = this.tryContext;
		const forkContext = this.forkContext;
		const originalThrownForkContext = context.thrownForkContext;

		context.position = "catch";
		context.thrownForkContext = ForkContext.newEmpty(forkContext);
		context.lastOfTryIsReachable = forkContext.reachable;

		originalThrownForkContext.add(forkContext.head);
		const thrownSegments = originalThrownForkContext.makeNext(0, -1);

		this.pushForkContext();
		this.forkBypassPath();
		this.forkContext.add(thrownSegments);
	}

	/**
	 * Makes a code path segment for a `finally` block.
	 * @returns {void}
	 */
	makeFinallyBlock() {
		const context = this.tryContext;
		let forkContext = this.forkContext;
		const originalReturnedForkContext = context.returnedForkContext;
		const originalThrownForContext = context.thrownForkContext;
		const headOfLeavingSegments = forkContext.head;

		if (context.position === "catch") {
			this.popForkContext();
			forkContext = this.forkContext;

			context.lastOfCatchIsReachable = forkContext.reachable;
		} else {
			context.lastOfTryIsReachable = forkContext.reachable;
		}

		context.position = "finally";

		if (
			originalReturnedForkContext.empty &&
			originalThrownForContext.empty
		) {
			return;
		}

		const segments = forkContext.makeNext(-1, -1);

		for (let i = 0; i < forkContext.count; ++i) {
			const prevSegsOfLeavingSegment = [headOfLeavingSegments[i]];

			for (
				let j = 0;
				j < originalReturnedForkContext.segmentsList.length;
				++j
			) {
				prevSegsOfLeavingSegment.push(
					originalReturnedForkContext.segmentsList[j][i],
				);
			}
			for (
				let j = 0;
				j < originalThrownForContext.segmentsList.length;
				++j
			) {
				prevSegsOfLeavingSegment.push(
					originalThrownForContext.segmentsList[j][i],
				);
			}

			segments.push(
				CodePathSegment.newNext(
					this.idGenerator.next(),
					prevSegsOfLeavingSegment,
				),
			);
		}

		this.pushForkContext(true);
		this.forkContext.add(segments);
	}

	/**
	 * Creates a context object of a loop statement and stacks it.
	 * @param {string} type The type of the node which was triggered.
	 * @param {string|null} label The label text.
	 * @returns {void}
	 */
	pushLoopContext(type, label) {
		const forkContext = this.forkContext;

		const breakContext = this.pushBreakContext(true, label);

		switch (type) {
			case "WhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new WhileLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;

			case "DoWhileStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new DoWhileLoopContext(
					this.loopContext,
					label,
					breakContext,
					forkContext,
				);
				break;

			case "ForStatement":
				this.pushChoiceContext("loop", false);
				this.loopContext = new ForLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;

			case "ForInStatement":
				this.loopContext = new ForInLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;

			case "ForOfStatement":
				this.loopContext = new ForOfLoopContext(
					this.loopContext,
					label,
					breakContext,
				);
				break;

			default:
				throw new Error(`unknown type: "${type}"`);
		}
	}

	/**
	 * Pops the last context of a loop statement and finalizes it.
	 * @returns {void}
	 */
	popLoopContext() {
		const context = this.loopContext;

		this.loopContext = context.upper;

		const forkContext = this.forkContext;
		const brokenForkContext = this.popBreakContext().brokenForkContext;

		switch (context.type) {
			case "WhileStatement":
			case "ForStatement":
				this.popChoiceContext();

				makeLooped(
					this,
					forkContext.head,
					context.continueDestSegments,
				);
				break;

			case "DoWhileStatement": {
				const choiceContext = this.popChoiceContext();

				if (!choiceContext.processed) {
					choiceContext.trueForkContext.add(forkContext.head);
					choiceContext.falseForkContext.add(forkContext.head);
				}

				if (context.test !== true) {
					brokenForkContext.addAll(choiceContext.falseForkContext);
				}

				const segmentsList = choiceContext.trueForkContext.segmentsList;

				for (let i = 0; i < segmentsList.length; ++i) {
					makeLooped(this, segmentsList[i], context.entrySegments);
				}
				break;
			}

			case "ForInStatement":
			case "ForOfStatement":
				brokenForkContext.add(forkContext.head);

				makeLooped(this, forkContext.head, context.leftSegments);
				break;

			default:
				throw new Error("unreachable");
		}

		if (brokenForkContext.empty) {
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		} else {
			forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
		}
	}

	/**
	 * Makes a code path segment for the test part of a WhileStatement.
	 * @param {boolean|undefined} test The test value.
	 * @returns {void}
	 */
	makeWhileTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const testSegments = forkContext.makeNext(0, -1);

		context.test = test;
		context.continueDestSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}

	/**
	 * Makes a code path segment for the body part of a WhileStatement.
	 * @returns {void}
	 */
	makeWhileBody() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;

		if (!choiceContext.processed) {
			choiceContext.trueForkContext.add(forkContext.head);
			choiceContext.falseForkContext.add(forkContext.head);
		}

		if (context.test !== true) {
			context.brokenForkContext.addAll(choiceContext.falseForkContext);
		}
		forkContext.replaceHead(choiceContext.trueForkContext.makeNext(0, -1));
	}

	/**
	 * Makes a code path segment for the body part of a DoWhileStatement.
	 * @returns {void}
	 */
	makeDoWhileBody() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const bodySegments = forkContext.makeDisconnected(-1, -1);

		context.entrySegments = bodySegments;
		forkContext.replaceHead(bodySegments);
	}

	/**
	 * Makes a code path segment for the test part of a DoWhileStatement.
	 * @param {boolean|undefined} test The test value.
	 * @returns {void}
	 */
	makeDoWhileTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;

		context.test = test;

		if (!context.continueForkContext.empty) {
			context.continueForkContext.add(forkContext.head);
			const testSegments = context.continueForkContext.makeNext(0, -1);

			forkContext.replaceHead(testSegments);
		}
	}

	/**
	 * Makes a code path segment for the test part of a ForStatement.
	 * @param {boolean|undefined} test The test value.
	 * @returns {void}
	 */
	makeForTest(test) {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const endOfInitSegments = forkContext.head;
		const testSegments = forkContext.makeNext(-1, -1);

		context.test = test;
		context.endOfInitSegments = endOfInitSegments;
		context.continueDestSegments = context.testSegments = testSegments;
		forkContext.replaceHead(testSegments);
	}

	/**
	 * Makes a code path segment for the update part of a ForStatement.
	 * @returns {void}
	 */
	makeForUpdate() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;

		if (context.testSegments) {
			finalizeTestSegmentsOfFor(context, choiceContext, forkContext.head);
		} else {
			context.endOfInitSegments = forkContext.head;
		}

		const updateSegments = forkContext.makeDisconnected(-1, -1);

		context.continueDestSegments = context.updateSegments = updateSegments;
		forkContext.replaceHead(updateSegments);
	}

	/**
	 * Makes a code path segment for the body part of a ForStatement.
	 * @returns {void}
	 */
	makeForBody() {
		const context = this.loopContext;
		const choiceContext = this.choiceContext;
		const forkContext = this.forkContext;

		if (context.updateSegments) {
			context.endOfUpdateSegments = forkContext.head;

			makeLooped(
				this,
				context.endOfUpdateSegments,
				context.testSegments,
			);
		} else if (context.testSegments) {
			finalizeTestSegmentsOfFor(context, choiceContext, forkContext.head);
		} else {
			context.endOfInitSegments = forkContext.head;
		}

		let bodySegments = context.endOfTestSegments;

		if (!bodySegments) {
			const prevForkContext = ForkContext.newEmpty(forkContext);

			prevForkContext.add(context.endOfInitSegments);
			if (context.endOfUpdateSegments) {
				prevForkContext.add(context.endOfUpdateSegments);
			}

			bodySegments = prevForkContext.makeNext(0, -1);
		}

		context.continueDestSegments =
			context.continueDestSegments || bodySegments;

		forkContext.replaceHead(bodySegments);
	}

	/**
	 * Makes a code path segment for the left part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfLeft() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const leftSegments = forkContext.makeDisconnected(-1, -1);

		context.prevSegments = forkContext.head;
		context.leftSegments = context.continueDestSegments = leftSegments;
		forkContext.replaceHead(leftSegments);
	}

	/**
	 * Makes a code path segment for the right part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfRight() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const temp = ForkContext.newEmpty(forkContext);

		temp.add(context.prevSegments);
		const rightSegments = temp.makeNext(-1, -1);

		context.endOfLeftSegments = forkContext.head;
		forkContext.replaceHead(rightSegments);
	}

	/**
	 * Makes a code path segment for the body part of a ForInStatement and a
	 * ForOfStatement.
	 * @returns {void}
	 */
	makeForInOfBody() {
		const context = this.loopContext;
		const forkContext = this.forkContext;
		const temp = ForkContext.newEmpty(forkContext);

		temp.add(context.endOfLeftSegments);
		const bodySegments = temp.makeNext(-1, -1);

		makeLooped(this, forkContext.head, context.leftSegments);

		context.brokenForkContext.add(forkContext.head);
		forkContext.replaceHead(bodySegments);
	}

	/**
	 * Creates new context in which a `break` statement can be used.
	 * @param {boolean} breakable Indicates if we are inside a statement where
	 *      `break` without a label will exit the statement.
	 * @param {string|null} label The label associated with the statement.
	 * @returns {BreakContext} The new context.
	 */
	pushBreakContext(breakable, label) {
		this.breakContext = new BreakContext(
			this.breakContext,
			breakable,
			label,
			this.forkContext,
		);
		return this.breakContext;
	}

	/**
	 * Removes the top item of the break context stack.
	 * @returns {Object} The removed context.
	 */
	popBreakContext() {
		const context = this.breakContext;
		const forkContext = this.forkContext;

		this.breakContext = context.upper;

		if (!context.breakable) {
			const brokenForkContext = context.brokenForkContext;

			if (!brokenForkContext.empty) {
				brokenForkContext.add(forkContext.head);
				forkContext.replaceHead(brokenForkContext.makeNext(0, -1));
			}
		}

		return context;
	}

	/**
	 * Makes a path for a `break` statement.
	 * @param {string|null} label A label of the break statement.
	 * @returns {void}
	 */
	makeBreak(label) {
		const forkContext = this.forkContext;

		if (!forkContext.reachable) {
			return;
		}

		const context = getBreakContext(this, label);

		if (context) {
			context.brokenForkContext.add(forkContext.head);
		}

		forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
	}

	/**
	 * Makes a path for a `continue` statement.
	 * @param {string|null} label A label of the continue statement.
	 * @returns {void}
	 */
	makeContinue(label) {
		const forkContext = this.forkContext;

		if (!forkContext.reachable) {
			return;
		}

		const context = getContinueContext(this, label);

		if (context) {
			if (context.continueDestSegments) {
				makeLooped(
					this,
					forkContext.head,
					context.continueDestSegments,
				);

				if (
					context.type === "ForInStatement" ||
					context.type === "ForOfStatement"
				) {
					context.brokenForkContext.add(forkContext.head);
				}
			} else {
				context.continueForkContext.add(forkContext.head);
			}
		}
		forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
	}

	/**
	 * Makes a path for a `return` statement.
	 * @returns {void}
	 */
	makeReturn() {
		const forkContext = this.forkContext;

		if (forkContext.reachable) {
			getReturnContext(this).returnedForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}

	/**
	 * Makes a path for a `throw` statement.
	 * @returns {void}
	 */
	makeThrow() {
		const forkContext = this.forkContext;

		if (forkContext.reachable) {
			getThrowContext(this).thrownForkContext.add(forkContext.head);
			forkContext.replaceHead(forkContext.makeUnreachable(-1, -1));
		}
	}

	/**
	 * Makes the final path.
	 * @returns {void}
	 */
	makeFinal() {
		const segments = this.currentSegments;

		if (segments.length > 0 && segments[0].reachable) {
			this.returnedForkContext.add(segments);
		}
	}
}

module.exports = CodePathState;
```