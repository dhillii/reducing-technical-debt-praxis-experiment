# Refactored Docker Analytics Manager

## Key Improvements

1. **Extracted configuration** into a dedicated `CONFIG` object
2. **Decomposed large methods** into smaller, focused functions
3. **Eliminated code duplication** (member UUID generation, UTM query string building)
4. **Simplified complex logic** (token fetching, batch sending)
5. **Replaced manual weighted arrays** with a cleaner data structure
6. **Improved separation of concerns** between data generation and HTTP communication

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

// ─── Configuration ────────────────────────────────────────────────────────────

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

// ─── Static Data ──────────────────────────────────────────────────────────────

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

// ─── Pure Utility Functions ───────────────────────────────────────────────────

/**
 * Weighted random selection from an array of {value, weight} items
 */
function weightedChoice(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * total;
    for (const item of items) {
        random -= item.weight;
        if (random <= 0) {
            return item.value;
        }
    }
    return items[items.length - 1].value;
}

/**
 * Random element from an array
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate a v4-style UUID
 */
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Format a Date for Tinybird (YYYY-MM-DD HH:MM:SS)
 */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build a URL query string from a params object, omitting undefined values
 */
function buildQueryString(params) {
    return Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

/**
 * Parse a .env-style file into a key/value object
 */
function parseEnvFile(content) {
    return Object.fromEntries(
        content.trim().split('\n')
            .map(line => line.split('='))
            .filter(([key, ...rest]) => key && rest.length > 0)
            .map(([key, ...rest]) => [key.trim(), rest.join('=').trim()])
    );
}

// ─── Token Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve the Tinybird token from environment variables or Docker volume.
 * Returns the token string or throws if unavailable.
 */
async function resolveTinybirdToken() {
    const envToken = process.env.TINYBIRD_ADMIN_TOKEN || process.env.TINYBIRD_TRACKER_TOKEN;
    if (envToken) {
        const name = process.env.TINYBIRD_ADMIN_TOKEN ? 'TINYBIRD_ADMIN_TOKEN' : 'TINYBIRD_TRACKER_TOKEN';
        console.log(`Using ${name} from environment`);
        return envToken;
    }

    return readTokenFromDockerVolume();
}

function readTokenFromDockerVolume() {
    console.log('Reading Tinybird config from Docker volume...');
    try {
        const raw = execSync(
            `docker run --rm -v ${CONFIG.dockerVolumeName}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
            {encoding: 'utf8', timeout: 10000}
        );

        const config = parseEnvFile(raw);
        const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;

        if (!token) {
            throw new Error('No token found in Docker volume config');
        }

        const label = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
        console.log(`Tinybird ${label} token acquired from Docker volume`);
        return token;
    } catch (error) {
        rethrowDockerTokenError(error);
    }
}

function rethrowDockerTokenError(error) {
    if (error.message.includes('No such file') || error.message.includes('No token found')) {
        console.error('Tinybird config not found in Docker volume. Make sure Tinybird is running: yarn dev:analytics');
    } else if (error.message.includes('Cannot connect to the Docker daemon')) {
        console.error('Docker is not running. Please start Docker first.');
    } else {
        console.error('Failed to fetch Tinybird token:', error.message);
    }
    throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
}

// ─── Tinybird HTTP Client ─────────────────────────────────────────────────────

class TinybirdClient {
    constructor(token) {
        this.token = token;
    }

    get authHeaders() {
        return {Authorization: `Bearer ${this.token}`};
    }

    async sendEvents(events, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const waitParam = wait ? '&wait=true' : '';
        const url = `${CONFIG.tinybirdHost}/v0/events?name=${CONFIG.datasource}${waitParam}`;

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
        const url = `${CONFIG.tinybirdHost}/v0/datasources/${name}/truncate`;
        const response = await fetch(url, {method: 'POST', headers: this.authHeaders});

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

// ─── Event Generation ─────────────────────────────────────────────────────────

class EventGenerator {
    constructor({siteUuid, siteConfig, posts, memberUuids}) {
        this.siteUuid = siteUuid;
        this.baseUrl = siteConfig.url || 'http://localhost:2368';
        this.posts = posts;
        this.memberUuids = memberUuids;
        this.postPopularityMap = new Map();
        this.assignPostPopularity();
    }

    // ── Post Popularity ──────────────────────────────────────────────────────

    assignPostPopularity() {
        this.postPopularityMap.clear();
        const shuffled = [...this.posts].sort(() => Math.random() - 0.5);
        let index = 0;

        for (const tier of POST_POPULARITY_TIERS) {
            const count = Math.ceil((tier.weight / 100) * shuffled.length);
            for (let i = 0; i < count && index < shuffled.length; i++, index++) {
                this.postPopularityMap.set(shuffled[index].uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
            }
        }
    }

    // ── Content Selection ────────────────────────────────────────────────────

    selectContent() {
        if (Math.random() < 0.4 || this.posts.length === 0) {
            return this.selectStaticPage();
        }
        return this.selectPost();
    }

    selectStaticPage() {
        const page = weightedChoice(STATIC_PAGES);
        return {
            post_uuid: 'undefined',
            post_type: page.type === 'homepage' ? '' : 'page',
            pathname: page.pathname,
            published_at: null
        };
    }

    selectPost() {
        const weightedPosts = this.posts.flatMap((post) => {
            const {multiplier = 1} = this.postPopularityMap.get(post.uuid) || {};
            return Array(Math.ceil(multiplier * 10)).fill(post);
        });

        const post = randomChoice(weightedPosts);
        return {
            post_uuid: post.uuid,
            post_type: post.type,
            pathname: post.pathname,
            published_at: post.published_at
        };
    }

    // ── Member UUID ──────────────────────────────────────────────────────────

    resolveMemberUuid(memberStatus) {
        if (memberStatus === 'undefined') {
            return 'undefined';
        }
        if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            return randomChoice(this.memberUuids);
        }
        return generateUuid();
    }

    // ── Timestamp ────────────────────────────────────────────────────────────

    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const monthsBack = 12;
        let startDate = new Date(now - monthsBack * 30 * 24 * 60 * 60 * 1000);

        if (publishedAt) {
            const pubDate = new Date(publishedAt);
            if (pubDate > startDate) {
                startDate = pubDate;
            }
        }

        if (startDate >= now) {
            startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        }

        // Power distribution for gradual growth (S-curve)
        const timePosition = Math.pow(Math.random(), 0.6);
        const timestamp = new Date(startDate.getTime() + timePosition * (now - startDate));

        // Reduce overnight traffic (midnight–6am)
        if (timestamp.getHours() < 6 && Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }

        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        // Safety: never return a future timestamp
        return timestamp > now
            ? new Date(now - Math.random() * 24 * 60 * 60 * 1000)
            : timestamp;
    }

    // ── UTM Parameters ───────────────────────────────────────────────────────

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

    // ── URL Building ─────────────────────────────────────────────────────────

    buildHref(pathname, utmParams) {
        const base = `${this.baseUrl}${pathname}`;
        if (!utmParams) {
            return base;
        }
        const qs = buildQueryString(utmParams);
        return qs ? `${base}?${qs}` : base;
    }

    // ── Session Page Count ───────────────────────────────────────────────────

    generatePageCount() {
        const r = Math.random();
        if (r < 0.4) {
            return 1;
        }
        if (r < 0.7) {
            return 2 + Math.floor(Math.random() * 2);  // 2–3
        }
        if (r < 0.9) {
            return 4 + Math.floor(Math.random() * 3);  // 4–6
        }
        return 7 + Math.floor(Math.random() * 4);      // 7–10
    }

    // ── Event / Session Building ─────────────────────────────────────────────

    buildPageHitEvent({sessionId, timestamp, content, memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, utmParams, isEntryPage}) {
        const href = isEntryPage ? this.buildHref(content.pathname, utmParams) : `${this.baseUrl}${content.pathname}`;

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

        return {
            timestamp: formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload
        };
    }

    generateSession() {
        const sessionId = generateUuid();
        const pageCount = this.generatePageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);

        const memberStatus = weightedChoice(MEMBER_STATUS_WEIGHTS);
        const sharedAttrs = {
            sessionId,
            memberStatus,
            memberUuid: this.resolveMemberUuid(memberStatus),
            userAgent: randomChoice(USER_AGENTS),
            locale: randomChoice(LOCALES),
            location: weightedChoice(LOCATION_WEIGHTS),
            referrer: weightedChoice(REFERRER_WEIGHTS),
            utmParams: this.generateUtmParameters()
        };
        sharedAttrs.referrerSource = REFERRER_SOURCE_MAP[sharedAttrs.referrer] || sharedAttrs.referrer;

        const now = new Date();
        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const offsetMs = i === 0 ? 0 : i * (30 + Math.floor(Math.random() * 270)) * 1000;
            const timestamp = new Date(baseTimestamp.getTime() + offsetMs);

            if (timestamp > now) {
                break;
            }

            events.push(this.buildPageHitEvent({
                ...sharedAttrs,
                timestamp,
                content,
                isEntryPage: i === 0
            }));
        }

        return events;
    }
}

// ─── Main Manager ─────────────────────────────────────────────────────────────

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybird = null;
        this.generator = null;
    }

    async init() {
        console.log('Initializing Docker Analytics Manager...');

        const token = await resolveTinybirdToken();
        this.tinybird = new TinybirdClient(token);

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

    // ── Analytics Generation ─────────────────────────────────────────────────

    async generateAnalytics(numEvents = CONFIG.defaultEventCount) {
        console.log(`\nGenerating ${numEvents} analytics events...`);

        const events = this.collectEvents(numEvents);
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        console.log(`\nPushing events to Tinybird (batch size: ${CONFIG.batchSize}, parallel: ${CONFIG.parallelBatches})...`);
        const sentCount = await this.sendAllBatches(events);

        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    collectEvents(numEvents) {
        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generator.generateSession());
            sessionCount += 1;
        }

        events.length = numEvents; // trim overshoot
        console.log(`Generated ${events.length} events from ${sessionCount} sessions (avg ${(events.length / sessionCount).toFixed(1)} pages/session)`);
        return events;
    }

    async sendAllBatches(events) {
        const batches = chunkArray(events, CONFIG.batchSize);
        let sentCount = 0;

        for (let i = 0; i < batches.length; i += CONFIG.parallelBatches) {
            const chunk = batches.slice(i, i + CONFIG.parallelBatches);
            try {
                await Promise.all(chunk.map(batch => this.tinybird.sendEvents(batch)));
                sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * CONFIG.batchSize}:`, error.message);
                throw error;
            }
        }

        return sentCount;
    }

    // ── Analytics Clearing ───────────────────────────────────────────────────

    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        await this.truncate(CONFIG.datasource);
        await this.truncate(CONFIG.mvDatasource);
        await this.truncateOptional(CONFIG.mvDailyPages);

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    async truncate(name) {
        console.log(`Truncating ${name}...`);
        return this.tinybird.truncateDatasource(name);
    }

    async truncateOptional(name) {
        console.log(`Truncating ${name}...`);
        try {
            await this.tinybird.truncateDatasource(name);
        } catch {
            console.log(`  ${name} not found (may not be deployed yet)`);
        }
    }

    async close() {
        await this.db.close();
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

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
    const [command, countArg] = process.argv.slice(2);

    console.log('Docker Analytics Manager');
    console.log('='.repeat(50));

    if (!command || ['help', '--help', '-h'].includes(command)) {
        printHelp();
        return;
    }

    const manager = new DockerAnalyticsManager();

    try {
        await manager.init();

        if (command === 'generate') {
            await manager.generateAnalytics(parseInt(countArg) || CONFIG.defaultEventCount);
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

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Configuration** | Constants scattered + instance properties | Single `CONFIG` object + module-level constants |
| **Static data** | Instance properties in constructor | Module-level constants (no re-allocation per instance) |
| **Responsibilities** | One 500-line class doing everything | `TinybirdClient`, `EventGenerator`, `DockerAnalyticsManager` |
| **Token resolution** | 60-line method with nested try/catch | Three focused functions with clear error handling |
| **Member UUID logic** | Duplicated in `generateEvent` & `generateSession` | Single `resolveMemberUuid()` method |
| **UTM query string** | Duplicated inline in two places | `buildQueryString()` pure function |
| **Batch chunking** | Inline `for` loop | `chunkArray()` pure function |
| **Event building** | Duplicated payload construction | Single `buildPageHitEvent()` method |
| **`init()`** | Sequential `await` calls | `Promise.all` for parallel DB queries |
| **`.env` parsing** | Manual `for` loop | `parseEnvFile()` pure function using `Object.fromEntries` |