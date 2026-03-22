# Refactored Docker Analytics Manager

## Analysis of Complexity Issues

1. **Massive constructor** with 100+ lines of configuration data
2. **Duplicated logic** in `generateEvent()` and `generateSession()` (member UUID, UTM, href building)
3. **Long methods** (`generateAnalytics`, `fetchTinybirdToken`, `generateSession`)
4. **Mixed concerns** in single class (config, data generation, API communication)
5. **Inline UUID generation** using a regex replace pattern
6. **Repeated weighted-choice patterns** for member UUID selection

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
const {randomUUID} = require('crypto');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
    tinybirdHost: process.env.TINYBIRD_HOST || 'http://localhost:7181',
    datasource: 'analytics_events',
    mvDatasource: '_mv_hits',
    mvDailyPages: '_mv_daily_pages',
    defaultEventCount: 10000,
    batchSize: 10000,
    parallelBatches: 5,
    dockerVolumeName: 'ghost-dev_shared-config'
};

// ---------------------------------------------------------------------------
// Static weight tables (extracted from constructor)
// ---------------------------------------------------------------------------

const WEIGHTS = {
    staticPages: [
        {value: {pathname: '/', type: 'homepage'}, weight: 40},
        {value: {pathname: '/about/', type: 'page'}, weight: 8},
        {value: {pathname: '/pricing/', type: 'page'}, weight: 6},
        {value: {pathname: '/contact/', type: 'page'}, weight: 4},
        {value: {pathname: '/services/', type: 'page'}, weight: 3},
        {value: {pathname: '/team/', type: 'page'}, weight: 3},
        {value: {pathname: '/privacy/', type: 'page'}, weight: 3},
        {value: {pathname: '/terms/', type: 'page'}, weight: 2}
    ],

    referrers: [
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
    ],

    memberStatus: [
        {value: 'undefined', weight: 83},
        {value: 'paid', weight: 9},
        {value: 'free', weight: 8}
    ],

    locations: [
        {value: 'US', weight: 62},
        {value: 'GB', weight: 15},
        {value: 'CA', weight: 3},
        {value: 'DE', weight: 3},
        {value: 'FR', weight: 3},
        {value: 'AU', weight: 2},
        {value: 'Others', weight: 12}
    ],

    utmSources: [
        {value: 'google', weight: 25},
        {value: 'facebook', weight: 15},
        {value: 'twitter', weight: 12},
        {value: 'newsletter', weight: 15},
        {value: 'email', weight: 10}
    ],

    utmMediums: [
        {value: 'cpc', weight: 30},
        {value: 'social', weight: 25},
        {value: 'email', weight: 20},
        {value: 'organic', weight: 15},
        {value: 'referral', weight: 10}
    ],

    utmCampaigns: [
        {value: 'spring_sale_2024', weight: 15},
        {value: 'product_launch', weight: 12},
        {value: 'weekly_newsletter', weight: 20},
        {value: 'summer_promotion', weight: 10}
    ],

    postPopularityTiers: [
        {tier: 'viral', weight: 8, multiplier: 50},
        {tier: 'popular', weight: 12, multiplier: 12},
        {tier: 'good', weight: 20, multiplier: 4},
        {tier: 'average', weight: 30, multiplier: 1},
        {tier: 'low', weight: 20, multiplier: 0.2},
        {tier: 'very_low', weight: 10, multiplier: 0.05}
    ]
};

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

// ---------------------------------------------------------------------------
// Pure utility helpers
// ---------------------------------------------------------------------------

/**
 * Weighted random selection from an array of {value, weight} items.
 */
function weightedChoice(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let remaining = Math.random() * total;

    for (const item of items) {
        remaining -= item.weight;
        if (remaining <= 0) {
            return item.value;
        }
    }

    return items[items.length - 1].value;
}

/** Pick a uniformly random element from an array. */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/** Format a Date for Tinybird (ISO without T/Z). */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build a URL query string from a UTM params object,
 * omitting undefined values.
 */
function buildUtmQueryString(utmParams) {
    return Object.entries(utmParams)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

/**
 * Append UTM params to a URL if present.
 */
function appendUtmToUrl(url, utmParams) {
    if (!utmParams) {
        return url;
    }
    const qs = buildUtmQueryString(utmParams);
    return qs ? `${url}?${qs}` : url;
}

// ---------------------------------------------------------------------------
// Tinybird token resolution (extracted from class)
// ---------------------------------------------------------------------------

/**
 * Read and parse the Tinybird .env file from the Docker volume.
 * Returns a config object or throws.
 */
function readTinybirdDockerConfig(volumeName) {
    const envContent = execSync(
        `docker run --rm -v ${volumeName}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
        {encoding: 'utf8', timeout: 10000}
    );

    return Object.fromEntries(
        envContent.trim().split('\n')
            .map(line => line.split('='))
            .filter(([key, ...rest]) => key && rest.length > 0)
            .map(([key, ...rest]) => [key.trim(), rest.join('=').trim()])
    );
}

/**
 * Resolve the Tinybird token from environment variables or Docker volume.
 * Prefers admin token over tracker token.
 */
async function resolveTinybirdToken(volumeName) {
    const envToken = process.env.TINYBIRD_ADMIN_TOKEN || process.env.TINYBIRD_TRACKER_TOKEN;
    if (envToken) {
        const source = process.env.TINYBIRD_ADMIN_TOKEN ? 'TINYBIRD_ADMIN_TOKEN' : 'TINYBIRD_TRACKER_TOKEN';
        console.log(`Using ${source} from environment`);
        return envToken;
    }

    console.log('Reading Tinybird config from Docker volume...');
    try {
        const config = readTinybirdDockerConfig(volumeName);
        const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;

        if (!token) {
            throw new Error('No token found in Docker volume config');
        }

        const tokenType = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
        console.log(`Tinybird ${tokenType} token acquired from Docker volume`);
        return token;
    } catch (error) {
        rethrowWithFriendlyMessage(error);
    }
}

function rethrowWithFriendlyMessage(error) {
    if (error.message.includes('No such file') || error.message.includes('No token found')) {
        console.error('Tinybird config not found in Docker volume.');
        console.error('Make sure Tinybird is running: yarn dev:analytics');
    } else if (error.message.includes('Cannot connect to the Docker daemon')) {
        console.error('Docker is not running. Please start Docker first.');
    } else {
        console.error('Failed to fetch Tinybird token:', error.message);
    }
    throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
}

// ---------------------------------------------------------------------------
// Tinybird API client (single-responsibility)
// ---------------------------------------------------------------------------

class TinybirdClient {
    constructor(host, token) {
        this.host = host;
        this.token = token;
    }

    get authHeaders() {
        return {Authorization: `Bearer ${this.token}`};
    }

    async sendEvents(events, {wait = false} = {}) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${this.host}/v0/events?name=${CONFIG.datasource}${wait ? '&wait=true' : ''}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {...this.authHeaders, 'Content-Type': 'application/x-ndjson'},
            body: ndjson
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Tinybird API error: ${response.status} - ${errorText}`);
        }

        return response.json();
    }

    async truncateDatasource(name) {
        const response = await fetch(`${this.host}/v0/datasources/${name}/truncate`, {
            method: 'POST',
            headers: this.authHeaders
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to truncate ${name}: ${response.status} - ${errorText}`);
        }

        console.log(`  ${name} truncated`);

        const text = await response.text();
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
// Event generation helpers
// ---------------------------------------------------------------------------

/**
 * Assign popularity tiers to posts, returning a Map of uuid -> {tier, multiplier}.
 */
function buildPostPopularityMap(posts) {
    const map = new Map();
    const shuffled = [...posts].sort(() => Math.random() - 0.5);
    let index = 0;

    for (const tier of WEIGHTS.postPopularityTiers) {
        const count = Math.ceil((tier.weight / 100) * shuffled.length);

        for (let i = 0; i < count && index < shuffled.length; i++, index++) {
            map.set(shuffled[index].uuid, {tier: tier.tier, multiplier: tier.multiplier});
        }
    }

    return map;
}

/**
 * Build a weighted post pool based on popularity multipliers.
 */
function buildWeightedPostPool(posts, popularityMap) {
    const pool = [];

    for (const post of posts) {
        const {multiplier = 1} = popularityMap.get(post.uuid) || {};
        const weight = Math.ceil(multiplier * 10);

        for (let i = 0; i < weight; i++) {
            pool.push(post);
        }
    }

    return pool;
}

/**
 * Generate a timestamp with gradual growth over ~12 months,
 * respecting an optional earliest date (e.g. post publication date).
 */
function generateTimestamp(publishedAt = null) {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getTime() - (12 * 30 * 24 * 60 * 60 * 1000));

    let startDate = publishedAt && new Date(publishedAt) > twelveMonthsAgo
        ? new Date(publishedAt)
        : twelveMonthsAgo;

    // Guard: if startDate is in the future, fall back to last 7 days
    if (startDate >= now) {
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    }

    const timeRange = now.getTime() - startDate.getTime();
    const timePosition = Math.pow(Math.random(), 0.6); // gradual growth curve
    const ts = new Date(startDate.getTime() + timePosition * timeRange);

    // Reduce overnight traffic (midnight–6am)
    if (ts.getHours() < 6 && Math.random() < 0.7) {
        ts.setHours(9 + Math.floor(Math.random() * 12));
    }

    ts.setMinutes(Math.floor(Math.random() * 60));
    ts.setSeconds(Math.floor(Math.random() * 60));

    // Never return a future timestamp
    return ts > now
        ? new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000)
        : ts;
}

/**
 * Determine the number of pages in a session using a weighted distribution.
 * ~40% single page, ~30% 2-3, ~20% 4-6, ~10% 7-10
 */
function generatePageCount() {
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

/**
 * Resolve a member UUID based on status and available member list.
 */
function resolveMemberUuid(memberStatus, memberUuids) {
    if (memberStatus === 'undefined') {
        return 'undefined';
    }
    if (memberUuids.length > 0 && Math.random() < 0.7) {
        return randomChoice(memberUuids);
    }
    return randomUUID();
}

/**
 * Generate UTM parameters (50% chance of returning null).
 */
function generateUtmParameters() {
    if (Math.random() < 0.5) {
        return null;
    }

    return {
        utm_source: weightedChoice(WEIGHTS.utmSources),
        utm_medium: weightedChoice(WEIGHTS.utmMediums),
        utm_campaign: Math.random() < 0.8 ? weightedChoice(WEIGHTS.utmCampaigns) : undefined
    };
}

// ---------------------------------------------------------------------------
// DockerAnalyticsManager
// ---------------------------------------------------------------------------

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybird = null; // TinybirdClient, set during init
        this.siteUuid = null;
        this.siteConfig = {};
        this.posts = [];
        this.memberUuids = [];
        this.popularityMap = new Map();
        this.weightedPostPool = [];
    }

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    async init() {
        console.log('Initializing Docker Analytics Manager...');

        const token = await resolveTinybirdToken(CONFIG.dockerVolumeName);
        this.tinybird = new TinybirdClient(CONFIG.tinybirdHost, token);

        this.siteUuid = await this.db.getSiteUuid();
        console.log(`Site UUID: ${this.siteUuid}`);

        this.siteConfig = await this.db.getSiteConfig();
        console.log(`Site URL: ${this.siteConfig.url || 'http://localhost:2368'}`);

        this.posts = await this.db.getPostsWithDetails({publishedOnly: true});
        console.log(`Loaded ${this.posts.length} published posts`);

        this.memberUuids = await this.db.getMemberUuids({limit: 500});
        console.log(`Loaded ${this.memberUuids.length} members`);

        this.popularityMap = buildPostPopularityMap(this.posts);
        this.weightedPostPool = buildWeightedPostPool(this.posts, this.popularityMap);

        if (this.posts.length === 0) {
            console.warn('No posts found. Run "yarn reset:data" to generate Ghost data first.');
        }

        return true;
    }

    async close() {
        await this.db.close();
    }

    // -------------------------------------------------------------------------
    // Content selection
    // -------------------------------------------------------------------------

    get baseUrl() {
        return this.siteConfig.url || 'http://localhost:2368';
    }

    selectContent() {
        // 40% chance of a static page
        if (Math.random() < 0.4 || this.posts.length === 0) {
            const page = weightedChoice(WEIGHTS.staticPages);
            return {
                post_uuid: 'undefined',
                post_type: page.type === 'homepage' ? '' : 'page',
                pathname: page.pathname,
                published_at: null
            };
        }

        const post = randomChoice(this.weightedPostPool);
        return {
            post_uuid: post.uuid,
            post_type: post.type,
            pathname: post.pathname,
            published_at: post.published_at
        };
    }

    // -------------------------------------------------------------------------
    // Session & event generation
    // -------------------------------------------------------------------------

    /**
     * Generate all events for a single browsing session.
     */
    generateSession() {
        const sessionId = randomUUID();
        const pageCount = generatePageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = generateTimestamp(firstContent.published_at);
        const now = new Date();

        // Shared session attributes
        const memberStatus = weightedChoice(WEIGHTS.memberStatus);
        const memberUuid = resolveMemberUuid(memberStatus, this.memberUuids);
        const userAgent = randomChoice(USER_AGENTS);
        const locale = randomChoice(LOCALES);
        const location = weightedChoice(WEIGHTS.locations);
        const referrer = weightedChoice(WEIGHTS.referrers);
        const referrerSource = REFERRER_SOURCE_MAP[referrer] || referrer;
        const utmParams = generateUtmParameters();

        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const offsetMs = i === 0 ? 0 : i * (30 + Math.floor(Math.random() * 270)) * 1000;
            const timestamp = new Date(baseTimestamp.getTime() + offsetMs);

            if (timestamp > now) {
                break;
            }

            const isEntryPage = i === 0;
            const href = appendUtmToUrl(
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

    /**
     * Generate exactly `numEvents` events across multiple sessions.
     */
    generateEvents(numEvents) {
        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generateSession());
            sessionCount += 1;
        }

        events.length = numEvents; // trim overshoot
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        console.log(
            `Generated ${events.length} events from ${sessionCount} sessions ` +
            `(avg ${(events.length / sessionCount).toFixed(1)} pages/session)`
        );

        return events;
    }

    // -------------------------------------------------------------------------
    // Tinybird operations
    // -------------------------------------------------------------------------

    /**
     * Send events in parallel batches, logging progress.
     */
    async sendInBatches(events) {
        const {batchSize, parallelBatches} = CONFIG;
        const batches = [];

        for (let i = 0; i < events.length; i += batchSize) {
            batches.push(events.slice(i, i + batchSize));
        }

        let sentCount = 0;

        for (let i = 0; i < batches.length; i += parallelBatches) {
            const chunk = batches.slice(i, i + parallelBatches);

            try {
                await Promise.all(chunk.map(batch => this.tinybird.sendEvents(batch)));
                sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * batchSize}:`, error.message);
                throw error;
            }
        }

        return sentCount;
    }

    async generateAnalytics(numEvents = CONFIG.defaultEventCount) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${CONFIG.batchSize}, parallel: ${CONFIG.parallelBatches}`);

        const events = this.generateEvents(numEvents);

        console.log(`\nPushing events to Tinybird...`);
        const sentCount = await this.sendInBatches(events);

        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        const datasources = [CONFIG.datasource, CONFIG.mvDatasource];
        for (const name of datasources) {
            console.log(`Truncating ${name}...`);
            await this.tinybird.truncateDatasource(name);
        }

        // Optional datasource — may not exist in older setups
        console.log(`Truncating ${CONFIG.mvDailyPages}...`);
        try {
            await this.tinybird.truncateDatasource(CONFIG.mvDailyPages);
        } catch {
            console.log(`  ${CONFIG.mvDailyPages} not found (may not be deployed yet)`);
        }

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
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
  count  - Number of events to generate (default: ${CONFIG.defaultEventCount})

Prerequisites:
  - Docker environment running: yarn dev:analytics
  - Ghost database populated: yarn reset:data

Examples:
  yarn data:analytics:generate          # Generate ${CONFIG.defaultEventCount} events
  yarn data:analytics:generate 10000    # Generate 10,000 events
  yarn data:analytics:clear             # Clear all events
`);
}

async function main() {
    const args = process.argv.slice(2);
    const [command, ...rest] = args;

    console.log('Docker Analytics Manager');
    console.log('='.repeat(50));

    if (!command || ['help', '--help', '-h'].includes(command) || args.includes('--help') || args.includes('-h')) {
        printHelp();
        return;
    }

    const manager = new DockerAnalyticsManager();

    try {
        await manager.init();

        if (command === 'generate') {
            const count = parseInt(rest[0]) || CONFIG.defaultEventCount;
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

## Key Changes Summary

| Area | Before | After |
|---|---|---|
| **Constructor** | ~100 lines of mixed config + state | 8 lines of state only |
| **Configuration** | Scattered across constructor | Single `CONFIG` object |
| **Weight tables** | Instance properties | Module-level `WEIGHTS` constant |
| **Token resolution** | 60-line method with nested try/catch | `resolveTinybirdToken()` + `rethrowWithFriendlyMessage()` free functions |
| **Tinybird API** | Methods on main class | Dedicated `TinybirdClient` class |
| **Duplicated member UUID logic** | Repeated in `generateEvent` + `generateSession` | Single `resolveMemberUuid()` helper |
| **Duplicated UTM/href logic** | Repeated in both generators | `appendUtmToUrl()` + `buildUtmQueryString()` helpers |
| **Post popularity** | `assignPostPopularity()` + inline pool building | `buildPostPopularityMap()` + `buildWeightedPostPool()` pure functions |
| **`generateEvent()`** | Kept alongside `generateSession()` (duplication) | Removed — sessions cover all cases |
| **UUID generation** | Inline regex replace | `crypto.randomUUID()` |
| **Timestamp logic** | Inline in method | `generateTimestamp()` pure function |
| **Batch sending** | Inline in `generateAnalytics` | `sendInBatches()` method |