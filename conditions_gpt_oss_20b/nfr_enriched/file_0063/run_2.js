/**
	 * Makes a path for a `continue` statement.
	 *
	 * It makes a looping path.
	 * It makes new unreachable segment, then it set the head with the segment.
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

				// If the context is a for-in/of loop, this affects a break also.
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
	 *
	 * It registers the head segment to a context of `return`.
	 * It makes new unreachable segment, then it set the head with the segment.
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
	 *
	 * It registers the head segment to a context of `throw`.
	 * It makes new unreachable segment, then it set the head with the segment.
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