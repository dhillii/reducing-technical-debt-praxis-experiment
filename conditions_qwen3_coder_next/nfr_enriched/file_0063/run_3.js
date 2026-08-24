/**
	 * Pops the last context of TryStatement and finalizes it.
	 * @returns {void}
	 */
	popTryContext() {
		const context = this.tryContext;

		this.tryContext = context.upper;

		const originalReturnedForkContext = context.returnedForkContext;
		const originalThrownForkContext = context.thrownForkContext;

		if (
			originalReturnedForkContext.empty &&
			originalThrownForkContext.empty
		) {
			return;
		}

		const headSegments = this.forkContext.head;
		const middleIndex = getMiddleIndex(headSegments.length);

		this.forkContext = this.forkContext.upper;
		const normalSegments = headSegments.slice(0, middleIndex);
		const leavingSegments = headSegments.slice(middleIndex);

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
	 * Calculates the midpoint index for segment splitting.
	 * @param {number} length The length of a segments array.
	 * @returns {number} The truncated half-length as an integer.
	 */
	function getMiddleIndex(length) {
		return Math.trunc(length / 2);
	}