# Refactored Docker Analytics Manager

## Analysis of Complexity Issues

1. **Massive constructor** with 100+ lines of configuration data
2. **Duplicated member UUID generation logic** in `generateEvent()` and `generateSession()`
3. **Duplicated UTM query string building** in both methods
4. **`fetchTinybirdToken()`** has deeply nested try/catch with mixed concerns
5. **`generateSession()`** has complex inline page count logic
6. **`generateAnalytics()`** mixes event generation and batch sending concerns
7. **`clearAnalytics()`** has inconsistent error handling for optional datasources
8. **Large class** doing too many things (config, data generation, API calls)

---

```javascript
#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable ghost/ghost-custom/no-native-error */
/**
 * Docker Analytics Manager
 *
 * Manages analytics data for the Docker-based development environment.
 * Generates and clears analytics events directly in the Tinybird local instance.
 *
 * Usage:
 *   yarn data:analytics:generate [count]  - Generate analytics events
 *   yarn data:analytics:clear             - Clear all analytics events for the site
 *
 * Prerequisites:
 *   - Docker environment running: yarn dev:analytics
 *   - Ghost database populated with posts/members: yarn reset:data
 */

const DockerDatabaseUtils = require('./docker-database-utils');
const {execSync} = require('child_process');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || 'http://localhost:7181';
const TINYBIRD_DATASOURCE = 'analytics_events';
const TINYBIRD_MV_DATASOURCE = '_mv_hits';
const TINYBIRD_MV_DAILY_PAGES = '_mv_daily_pages';
const DEFAULT_EVENT_COUNT = 10000;
const BATCH_SIZE = 10000;
const PARALLEL_BATCHES = 5;
const DOCKER_VOLUME_NAME = 'ghost-dev_shared-config';

// ---------------------------------------------------------------------------
// Static configuration data (extracted from constructor)
// ---------------------------------------------------------------------------

const STATIC_PAGES = [
    {value: {pathname: '/', type: 'homepage'}, weight: 40},
    {value: {pathname: '/about/', type: 'page'}, weight: 8},
    {value: {pathname: '/pricing/', type: 'page'}, weight: 6},
    {value: {pathname: '/contact/', type: 'page'}, weight: 4},
    {value: {pathname: '/services/', type: 'page'}, weight: 3},
    {value: {pathname: '/team/', type: 'page'}, weight: 3},
    {value: {pathname: '/privacy/', type: 'page'}, weight: 3},
    {value: {pathname: '/terms/', type: 'page'}, weight: 2}
];

const REFERRER_WEIGHTS = [
    {value: '', weight: 25},
    {value: 'https://www.google.com/', weight: 20},
    {value: 'https://news.google.com/', weight: 3},
    {value: 'https://duckduckgo.com/', weight: 2},
    {value: 'https://www.bing.com/', weight: 1},
    {value: 'https://out.reddit.com/', weight: 8},
    {value: 'https://www.reddit.com/', weight: 4},
    {value: 'https://go.bsky.app/', weight: 6},
    {value: 'https://t.co/', weight: 4},
    {value: 'https://lm.facebook.com/', weight: 2},
    {value: 'http://m.facebook.com/', weight: 1},
    {value: 'duonews', weight: 9},
    {value: 'newsletter', weight: 5},
    {value: 'android-app://com.google.android.googlequicksearchbox/', weight: 4},
    {value: 'flipboard', weight: 2}
];

const REFERRER_SOURCE_MAP = {
    'https://www.google.com/': 'Google',
    'https://news.google.com/': 'Google News',
    'https://duckduckgo.com/': 'DuckDuckGo',
    'https://www.bing.com/': 'Bing',
    'https://out.reddit.com/': 'Reddit',
    'https://www.reddit.com/': 'Reddit',
    'https://go.bsky.app/': 'Bluesky',
    'https://t.co/': 'Twitter',
    'https://lm.facebook.com/': 'Facebook',
    'http://m.facebook.com/': 'Facebook',
    flipboard: 'Flipboard',
    duonews: 'duonews',
    newsletter: 'newsletter',
    'android-app://com.google.android.googlequicksearchbox/': 'Google'
};

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
];

const LOCALES = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP'];

const MEMBER_STATUS_WEIGHTS = [
    {value: 'undefined', weight: 83},
    {value: 'paid', weight: 9},
    {value: 'free', weight: 8}
];

const LOCATION_WEIGHTS = [
    {value: 'US', weight: 62},
    {value: 'GB', weight: 15},
    {value: 'CA', weight: 3},
    {value: 'DE', weight: 3},
    {value: 'FR', weight: 3},
    {value: 'AU', weight: 2},
    {value: 'Others', weight: 12}
];

const UTM_SOURCES = [
    {value: 'google', weight: 25},
    {value: 'facebook', weight: 15},
    {value: 'twitter', weight: 12},
    {value: 'newsletter', weight: 15},
    {value: 'email', weight: 10}
];

const UTM_MEDIUMS = [
    {value: 'cpc', weight: 30},
    {value: 'social', weight: 25},
    {value: 'email', weight: 20},
    {value: 'organic', weight: 15},
    {value: 'referral', weight: 10}
];

const UTM_CAMPAIGNS = [
    {value: 'spring_sale_2024', weight: 15},
    {value: 'product_launch', weight: 12},
    {value: 'weekly_newsletter', weight: 20},
    {value: 'summer_promotion', weight: 10}
];

const POST_POPULARITY_TIERS = [
    {tier: 'viral', weight: 8, multiplier: 50},
    {tier: 'popular', weight: 12, multiplier: 12},
    {tier: 'good', weight: 20, multiplier: 4},
    {tier: 'average', weight: 30, multiplier: 1},
    {tier: 'low', weight: 20, multiplier: 0.2},
    {tier: 'very_low', weight: 10, multiplier: 0.05}
];

// ---------------------------------------------------------------------------
// Pure utility helpers
// ---------------------------------------------------------------------------

/**
 * Weighted random selection from an array of {value, weight} items.
 */
function weightedChoice(weights) {
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of weights) {
        random -= item.weight;
        if (random <= 0) {
            return item.value;
        }
    }

    return weights[weights.length - 1].value;
}

/**
 * Pick a random element from an array.
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a v4-style UUID.
 */
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Format a Date for Tinybird (ISO without T/Z).
 */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build a URL query string from a UTM params object, omitting undefined values.
 */
function buildUtmQueryString(utmParams) {
    return Object.entries(utmParams)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
}

/**
 * Append UTM params to a URL if present.
 */
function appendUtmParams(href, utmParams) {
    if (!utmParams) {
        return href;
    }
    const qs = buildUtmQueryString(utmParams);
    return qs ? `${href}?${qs}` : href;
}

/**
 * Determine session page count using a weighted distribution:
 *   ~40% single page, ~30% 2-3, ~20% 4-6, ~10% 7-10
 */
function pickSessionPageCount() {
    const r = Math.random();
    if (r < 0.4) {
        return 1;
    }
    if (r < 0.7) {
        return 2 + Math.floor(Math.random() * 2);
    }
    if (r < 0.9) {
        return 4 + Math.floor(Math.random() * 3);
    }
    return 7 + Math.floor(Math.random() * 4);
}

// ---------------------------------------------------------------------------
// TinybirdClient – handles all HTTP communication with Tinybird
// ---------------------------------------------------------------------------

class TinybirdClient {
    constructor(host) {
        this.host = host;
        this.token = null;
    }

    /**
     * Resolve the Tinybird token from env vars or Docker volume.
     */
    async resolveToken() {
        const envToken =
            process.env.TINYBIRD_ADMIN_TOKEN || process.env.TINYBIRD_TRACKER_TOKEN;

        if (envToken) {
            const varName = process.env.TINYBIRD_ADMIN_TOKEN
                ? 'TINYBIRD_ADMIN_TOKEN'
                : 'TINYBIRD_TRACKER_TOKEN';
            console.log(`Using ${varName} from environment`);
            this.token = envToken;
            return;
        }

        this.token = this._readTokenFromDockerVolume();
    }

    /**
     * Read and parse the Tinybird token from the shared Docker volume.
     * @private
     */
    _readTokenFromDockerVolume() {
        console.log('Reading Tinybird config from Docker volume...');

        let envContent;
        try {
            envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );
        } catch (error) {
            this._rethrowDockerError(error);
        }

        const config = this._parseEnvFile(envContent);
        const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;

        if (!token) {
            throw new Error('No token found in Docker volume config');
        }

        const tokenType = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
        console.log(`Tinybird ${tokenType} token acquired from Docker volume`);
        return token;
    }

    /** @private */
    _parseEnvFile(content) {
        return Object.fromEntries(
            content
                .trim()
                .split('\n')
                .flatMap((line) => {
                    const [key, ...valueParts] = line.split('=');
                    return key && valueParts.length > 0
                        ? [[key.trim(), valueParts.join('=').trim()]]
                        : [];
                })
        );
    }

    /** @private */
    _rethrowDockerError(error) {
        if (error.message.includes('Cannot connect to the Docker daemon')) {
            throw new Error('Docker is not running. Please start Docker first.');
        }
        if (
            error.message.includes('No such file') ||
            error.message.includes('No token found')
        ) {
            throw new Error(
                'Tinybird config not found in Docker volume. ' +
                'Make sure Tinybird is running: yarn dev:analytics'
            );
        }
        throw new Error(`Could not retrieve Tinybird token: ${error.message}`);
    }

    /**
     * POST NDJSON events to the Events API.
     */
    async sendEvents(events, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${this.host}/v0/events?name=${TINYBIRD_DATASOURCE}${wait ? '&wait=true' : ''}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`,
                'Content-Type': 'application/x-ndjson'
            },
            body: ndjson
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tinybird API error: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    /**
     * Truncate a named datasource.
     */
    async truncateDatasource(datasourceName) {
        const url = `${this.host}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.token}`}
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(
                `Failed to truncate ${datasourceName}: ${response.status} - ${errorText}`
            );
        }

        console.log(`  ${datasourceName} truncated`);
        return this._parseResponse(await response.text());
    }

    /** @private */
    _parseResponse(text) {
        if (!text?.trim()) {
            return {status: 'ok'};
        }
        try {
            return JSON.parse(text);
        } catch {
            return {status: 'ok', message: text};
        }
    }
}

// ---------------------------------------------------------------------------
// EventGenerator – pure event/session generation logic
// ---------------------------------------------------------------------------

class EventGenerator {
    constructor({siteUuid, siteConfig, posts, memberUuids}) {
        this.siteUuid = siteUuid;
        this.baseUrl = siteConfig.url || 'http://localhost:2368';
        this.posts = posts;
        this.memberUuids = memberUuids;
        this.postPopularityMap = new Map();

        this._buildWeightedPostPool();
    }

    /** Pre-compute a weighted post pool for O(1) random selection. */
    _buildWeightedPostPool() {
        const shuffled = [...this.posts].sort(() => Math.random() - 0.5);
        let index = 0;

        this._weightedPostPool = [];

        for (const tier of POST_POPULARITY_TIERS) {
            const tierCount = Math.ceil((tier.weight / 100) * shuffled.length);

            for (let i = 0; i < tierCount && index < shuffled.length; i++, index++) {
                const post = shuffled[index];
                this.postPopularityMap.set(post.uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
                const slotCount = Math.ceil(tier.multiplier * 10);
                for (let s = 0; s < slotCount; s++) {
                    this._weightedPostPool.push(post);
                }
            }
        }
    }

    /** Select a content item (post, static page, or homepage). */
    selectContent() {
        if (Math.random() < 0.4 || this.posts.length === 0) {
            return this._staticPageContent();
        }
        return this._postContent();
    }

    /** @private */
    _staticPageContent() {
        const page = weightedChoice(STATIC_PAGES);
        return {
            post_uuid: 'undefined',
            post_type: page.type === 'homepage' ? '' : 'page',
            pathname: page.pathname,
            published_at: null
        };
    }

    /** @private */
    _postContent() {
        const post = randomChoice(this._weightedPostPool);
        return {
            post_uuid: post.uuid,
            post_type: post.type,
            pathname: post.pathname,
            published_at: post.published_at
        };
    }

    /** Resolve a member UUID based on status. */
    resolveMemberUuid(memberStatus) {
        if (memberStatus === 'undefined') {
            return 'undefined';
        }
        if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            return randomChoice(this.memberUuids);
        }
        return generateUuid();
    }

    /** Generate UTM parameters (50% chance of none). */
    generateUtmParameters() {
        if (Math.random() < 0.5) {
            return null;
        }
        return {
            utm_source: weightedChoice(UTM_SOURCES),
            utm_medium: weightedChoice(UTM_MEDIUMS),
            utm_campaign: Math.random() < 0.8 ? weightedChoice(UTM_CAMPAIGNS) : undefined
        };
    }

    /**
     * Generate a timestamp with gradual growth over ~12 months.
     * Respects content publication date and applies realistic daily patterns.
     */
    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const twelveMonthsAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);

        let startDate = publishedAt
            ? new Date(Math.max(new Date(publishedAt).getTime(), twelveMonthsAgo.getTime()))
            : twelveMonthsAgo;

        if (startDate >= now) {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        const timeRange = now.getTime() - startDate.getTime();
        const timePosition = Math.pow(Math.random(), 0.6);
        const timestamp = new Date(startDate.getTime() + timePosition * timeRange);

        this._applyDailyPattern(timestamp);
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        // Safety: never return a future timestamp
        if (timestamp > now) {
            return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }

        return timestamp;
    }

    /** Reduce overnight traffic by shifting early-morning hours to daytime. @private */
    _applyDailyPattern(timestamp) {
        if (timestamp.getHours() < 6 && Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }
    }

    /**
     * Generate a complete session (one or more page-hit events).
     */
    generateSession() {
        const sessionId = generateUuid();
        const pageCount = pickSessionPageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);

        // Shared session attributes
        const memberStatus = weightedChoice(MEMBER_STATUS_WEIGHTS);
        const memberUuid = this.resolveMemberUuid(memberStatus);
        const userAgent = randomChoice(USER_AGENTS);
        const locale = randomChoice(LOCALES);
        const location = weightedChoice(LOCATION_WEIGHTS);
        const referrer = weightedChoice(REFERRER_WEIGHTS);
        const referrerSource = REFERRER_SOURCE_MAP[referrer] || referrer;
        const utmParams = this.generateUtmParameters();

        const events = [];
        const now = new Date();

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = this._sessionPageTimestamp(baseTimestamp, i);

            if (timestamp > now) {
                break;
            }

            const isEntryPage = i === 0;
            const href = appendUtmParams(
                `${this.baseUrl}${content.pathname}`,
                isEntryPage ? utmParams : null
            );

            const payload = {
                site_uuid: this.siteUuid,
                member_uuid: memberUuid,
                member_status: memberStatus,
                post_uuid: content.post_uuid,
                post_type: content.post_type,
                'user-agent': userAgent,
                locale,
                location,
                referrer: isEntryPage ? referrer : '',
                pathname: content.pathname,
                href,
                meta: {referrerSource: isEntryPage ? referrerSource : ''}
            };

            if (isEntryPage && utmParams) {
                Object.assign(payload, utmParams);
            }

            events.push({
                timestamp: formatTimestamp(timestamp),
                session_id: sessionId,
                action: 'page_hit',
                version: '1',
                payload
            });
        }

        return events;
    }

    /** Compute the timestamp for the i-th page in a session. @private */
    _sessionPageTimestamp(baseTimestamp, pageIndex) {
        if (pageIndex === 0) {
            return baseTimestamp;
        }
        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        return new Date(baseTimestamp.getTime() + pageIndex * offsetSeconds * 1000);
    }
}

// ---------------------------------------------------------------------------
// DockerAnalyticsManager – orchestrates init, generate, and clear
// ---------------------------------------------------------------------------

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybird = new TinybirdClient(TINYBIRD_HOST);
        this.generator = null; // Initialised in init()
    }

    /**
     * Initialise: resolve token, load DB data, build generator.
     */
    async init() {
        console.log('Initializing Docker Analytics Manager...');

        await this.tinybird.resolveToken();

        const [siteUuid, siteConfig, posts, memberUuids] = await Promise.all([
            this.db.getSiteUuid(),
            this.db.getSiteConfig(),
            this.db.getPostsWithDetails({publishedOnly: true}),
            this.db.getMemberUuids({limit: 500})
        ]);

        console.log(`Site UUID: ${siteUuid}`);
        console.log(`Site URL: ${siteConfig.url || 'http://localhost:2368'}`);
        console.log(`Loaded ${posts.length} published posts`);
        console.log(`Loaded ${memberUuids.length} members`);

        if (posts.length === 0) {
            console.warn('No posts found. Run "yarn reset:data" to generate Ghost data first.');
        }

        this.generator = new EventGenerator({siteUuid, siteConfig, posts, memberUuids});
        return true;
    }

    /**
     * Generate events and push them to Tinybird in parallel batches.
     */
    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Batch size: ${BATCH_SIZE}, parallel batches: ${PARALLEL_BATCHES}`);

        const {events, sessionCount} = this._generateEvents(numEvents);
        console.log(
            `Generated ${events.length} events from ${sessionCount} sessions ` +
            `(avg ${(events.length / sessionCount).toFixed(1)} pages/session)`
        );

        const sentCount = await this._sendInParallelBatches(events);
        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    /** Generate sessions until numEvents is reached, then trim. @private */
    _generateEvents(numEvents) {
        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generator.generateSession());
            sessionCount += 1;
        }

        events.length = numEvents; // trim any overshoot
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return {events, sessionCount};
    }

    /** Slice events into batches and send PARALLEL_BATCHES at a time. @private */
    async _sendInParallelBatches(events) {
        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }

        let sentCount = 0;

        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const chunk = batches.slice(i, i + PARALLEL_BATCHES);
            await Promise.all(chunk.map(batch => this.tinybird.sendEvents(batch)));
            sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
            console.log(`Sent ${sentCount}/${events.length} events`);
        }

        return sentCount;
    }

    /**
     * Truncate the main datasource and all materialized views.
     */
    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        // Required datasources – errors are fatal
        for (const name of [TINYBIRD_DATASOURCE, TINYBIRD_MV_DATASOURCE]) {
            console.log(`Truncating ${name}...`);
            await this.tinybird.truncateDatasource(name);
        }

        // Optional datasource – may not exist in older setups
        console.log(`Truncating ${TINYBIRD_MV_DAILY_PAGES}...`);
        try {
            await this.tinybird.truncateDatasource(TINYBIRD_MV_DAILY_PAGES);
        } catch {
            console.log(`  ${TINYBIRD_MV_DAILY_PAGES} not found (may not be deployed yet)`);
        }

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    async close() {
        await this.db.close();
    }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printHelp() {
    console.log(`
Usage:
  node docker-analytics-manager.js generate [count]  - Generate analytics events
  node docker-analytics-manager.js clear             - Clear all analytics events

Options:
  count  - Number of events to generate (default: ${DEFAULT_EVENT_COUNT})

Prerequisites:
  - Docker environment running: yarn dev:analytics
  - Ghost database populated: yarn reset:data

Examples:
  yarn data:analytics:generate          # Generate 10,000 events
  yarn data:analytics:generate 10000    # Generate 10,000 events
  yarn data:analytics:clear             # Clear all events
`);
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    console.log('Docker Analytics Manager');
    console.log('='.repeat(50));

    if (!command || command === 'help' || args.includes('--help') || args.includes('-h')) {
        printHelp();
        return;
    }

    const manager = new DockerAnalyticsManager();

    try {
        await manager.init();

        if (command === 'generate') {
            const count = parseInt(args[1]) || DEFAULT_EVENT_COUNT;
            await manager.generateAnalytics(count);
        } else if (command === 'clear') {
            await manager.clearAnalytics();
        } else {
            console.error(`Unknown command: ${command}`);
            console.log('Use "help" to see available commands');
            process.exit(1);
        }
    } catch (error) {
        console.error('\nError:', error.message);
        process.exit(1);
    } finally {
        await manager.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DockerAnalyticsManager;
```

---

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Constructor** | 100+ lines of mixed config + state | Lean 3-field constructor; config moved to module-level constants |
| **Responsibilities** | One class doing everything | Three focused classes: `TinybirdClient`, `EventGenerator`, `DockerAnalyticsManager` |
| **Duplicate member UUID logic** | Copied verbatim in `generateEvent` and `generateSession` | Single `resolveMemberUuid()` method in `EventGenerator` |
| **Duplicate UTM building** | Inline in two places | `buildUtmQueryString()` + `appendUtmParams()` pure helpers |
| **Token resolution** | Deep nested try/catch with mixed error messages | `_readTokenFromDockerVolume()` + `_rethrowDockerError()` with clear separation |
| **Page count logic** | Inline `if/else` chain in `generateSession` | Extracted `pickSessionPageCount()` pure function |
| **Weighted post selection** | Rebuilt on every `selectContent()` call | Pre-computed `_weightedPostPool` in constructor |
| **DB init** | Sequential `await` calls | Parallel `Promise.all()` |
| **Batch sending** | Mixed into `generateAnalytics` | Extracted `_generateEvents()` + `_sendInParallelBatches()` |
| **`generateEvent()`** | Removed (superseded by session-based generation) | Eliminated dead code path |