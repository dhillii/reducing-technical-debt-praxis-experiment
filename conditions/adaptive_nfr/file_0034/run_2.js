// Before
if (this._testMode) {
    this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * TEST_MODE_RATE_LIMIT, 1);
} else {
    this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * LIVE_MODE_RATE_LIMIT, 1);
}

// After
const apiRateLimit = this._testMode ? TEST_MODE_RATE_LIMIT : LIVE_MODE_RATE_LIMIT;
this._rateLimitBucket = new LeakyBucket(EXPECTED_API_EFFICIENCY * apiRateLimit, 1);