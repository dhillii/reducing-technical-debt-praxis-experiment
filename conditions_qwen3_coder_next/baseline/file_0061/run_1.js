let high = lineStartIndices.length;

	while (low < high) {
		const mid = Math.trunc((low + high) / 2); // Use bitwise OR to floor the division

		if (target < lineStartIndices[mid]) {
			high = mid;
		} else {
			low = mid + 1;
		}
	}

	return low;