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