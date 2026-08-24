this.forkContext = this.forkContext.upper;
		const normalSegments = headSegments.slice(
			0,
			Math.trunc(headSegments.length / 2),
		);
		const leavingSegments = headSegments.slice(
			Math.trunc(headSegments.length / 2),
		);