# Refactored Docker Analytics Manager

## Key Improvements

1. **Extracted configuration** into a separate `CONFIG` object
2. **Decomposed large methods** (`generateEvent`, `generateSession`, `fetchTinybirdToken`) into smaller, focused helpers
3. **Eliminated code duplication** (member UUID generation, UTM query string building, payload construction)
4. **Simplified complex conditionals** with early returns and guard clauses
5. **Replaced manual weighted arrays** with a cleaner data structure
6. **Extracted static data** from constructor into module-level constants

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
// Static data (module-level constants to keep constructor lean)
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
// Helpers
// ---------------------------------------------------------------------------

/**
 * Weighted random selection from an array of {value, weight} items.
 */
function weightedChoice(weights) {
    const total = weights.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * total;
    for (const item of weights) {
        random -= item.weight;
        if (random <= 0) {
            return item.value;
        }
    }
    return weights[weights.length - 1].value;
}

/** Pick a random element from an array. */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/** Generate a v4-style UUID. */
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

/** Format a Date for Tinybird (YYYY-MM-DD HH:MM:SS). */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build a UTM query string from a params object.
 * Returns an empty string when there are no params.
 */
function buildUtmQueryString(utmParams) {
    if (!utmParams) {
        return '';
    }
    return Object.entries(utmParams)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');
}

/** Append a UTM query string to a URL when one exists. */
function appendUtmToUrl(url, utmParams) {
    const qs = buildUtmQueryString(utmParams);
    return qs ? `${url}?${qs}` : url;
}

// ---------------------------------------------------------------------------
// DockerAnalyticsManager
// ---------------------------------------------------------------------------

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};
        this.userCount = 200;
        this.userSessions = new Map();
        this.postPopularityMap = new Map();
    }

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------

    async init() {
        console.log('Initializing Docker Analytics Manager...');

        await this.fetchTinybirdToken();

        this.siteUuid = await this.db.getSiteUuid();
        console.log(`Site UUID: ${this.siteUuid}`);

        this.siteConfig = await this.db.getSiteConfig();
        console.log(`Site URL: ${this.siteConfig.url || 'http://localhost:2368'}`);

        this.posts = await this.db.getPostsWithDetails({publishedOnly: true});
        console.log(`Loaded ${this.posts.length} published posts`);

        this.memberUuids = await this.db.getMemberUuids({limit: 500});
        console.log(`Loaded ${this.memberUuids.length} members`);

        this.assignPostPopularity();

        if (this.posts.length === 0) {
            console.warn('No posts found. Run "yarn reset:data" to generate Ghost data first.');
        }

        return true;
    }

    async close() {
        await this.db.close();
    }

    // -------------------------------------------------------------------------
    // Token retrieval
    // -------------------------------------------------------------------------

    async fetchTinybirdToken() {
        console.log('Fetching Tinybird token...');

        const envToken = this.resolveTokenFromEnv();
        if (envToken) {
            this.tinybirdToken = envToken;
            return;
        }

        this.tinybirdToken = await this.resolveTokenFromDockerVolume();
    }

    /** Returns a token from environment variables, or null. */
    resolveTokenFromEnv() {
        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
            return process.env.TINYBIRD_ADMIN_TOKEN;
        }
        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
            return process.env.TINYBIRD_TRACKER_TOKEN;
        }
        return null;
    }

    /** Reads the Tinybird token from the Docker shared-config volume. */
    async resolveTokenFromDockerVolume() {
        try {
            console.log('Reading Tinybird config from Docker volume...');
            const raw = execSync(
                `docker run --rm -v ${CONFIG.dockerVolumeName}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = this.parseEnvFile(raw);

            const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;
            if (!token) {
                throw new Error('No token found in Docker volume config');
            }

            const label = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
            console.log(`Tinybird ${label} token acquired from Docker volume`);
            return token;
        } catch (error) {
            this.handleTokenFetchError(error);
            throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
        }
    }

    /** Parse a simple KEY=VALUE env file into a plain object. */
    parseEnvFile(content) {
        return Object.fromEntries(
            content
                .trim()
                .split('\n')
                .map((line) => {
                    const [key, ...rest] = line.split('=');
                    return [key && key.trim(), rest.join('=').trim()];
                })
                .filter(([key]) => Boolean(key))
        );
    }

    handleTokenFetchError(error) {
        const msg = error.message;
        if (msg.includes('No such file') || msg.includes('No token found')) {
            console.error('Tinybird config not found in Docker volume.');
            console.error('Make sure Tinybird is running: yarn dev:analytics');
        } else if (msg.includes('Cannot connect to the Docker daemon')) {
            console.error('Docker is not running. Please start Docker first.');
        } else {
            console.error('Failed to fetch Tinybird token:', msg);
        }
    }

    // -------------------------------------------------------------------------
    // Post popularity
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Content & session selection
    // -------------------------------------------------------------------------

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
        // Build a weighted pool using the popularity multiplier
        const pool = this.posts.flatMap((post) => {
            const {multiplier = 1} = this.postPopularityMap.get(post.uuid) || {};
            return Array(Math.ceil(multiplier * 10)).fill(post);
        });

        const post = randomChoice(pool);
        return {
            post_uuid: post.uuid,
            post_type: post.type,
            pathname: post.pathname,
            published_at: post.published_at
        };
    }

    resolveMemberUuid(memberStatus) {
        if (memberStatus === 'undefined') {
            return 'undefined';
        }
        if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            return randomChoice(this.memberUuids);
        }
        return generateUuid();
    }

    generateSessionId(userId, timestamp) {
        const key = `user_${userId}`;
        if (!this.userSessions.has(key)) {
            this.userSessions.set(key, []);
        }

        const sessions = this.userSessions.get(key);
        const existing = sessions.find(({startTime}) => {
            const diffHours = (timestamp - startTime) / (1000 * 60 * 60);
            return diffHours >= 0 && diffHours <= 3;
        });

        if (existing) {
            return existing.sessionId;
        }

        const sessionId = generateUuid();
        sessions.push({sessionId, startTime: timestamp});
        return sessionId;
    }

    // -------------------------------------------------------------------------
    // Timestamp generation
    // -------------------------------------------------------------------------

    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const startDate = this.resolveStartDate(now, publishedAt);
        const timeRange = now - startDate;

        // Power distribution creates gradual growth (slow start → recent peak)
        let ts = new Date(startDate.getTime() + Math.pow(Math.random(), 0.6) * timeRange);

        ts = this.applyDailyPattern(ts);
        ts.setMinutes(Math.floor(Math.random() * 60));
        ts.setSeconds(Math.floor(Math.random() * 60));

        // Guard: never return a future timestamp
        if (ts > now) {
            ts = new Date(now - Math.random() * 24 * 60 * 60 * 1000);
        }

        return ts;
    }

    resolveStartDate(now, publishedAt) {
        const twelveMonthsAgo = new Date(now - 12 * 30 * 24 * 60 * 60 * 1000);
        const pubDate = publishedAt ? new Date(publishedAt) : null;
        const candidate = pubDate && pubDate > twelveMonthsAgo ? pubDate : twelveMonthsAgo;

        // Ensure the range is at least 7 days
        const minStart = new Date(now - 7 * 24 * 60 * 60 * 1000);
        return candidate >= now ? minStart : candidate;
    }

    /** Shift overnight hours (00:00–06:00) to daytime 70% of the time. */
    applyDailyPattern(ts) {
        if (ts.getHours() < 6 && Math.random() < 0.7) {
            ts.setHours(9 + Math.floor(Math.random() * 12));
        }
        return ts;
    }

    // -------------------------------------------------------------------------
    // UTM parameters
    // -------------------------------------------------------------------------

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

    // -------------------------------------------------------------------------
    // Event / session building
    // -------------------------------------------------------------------------

    buildPayload({content, memberUuid, memberStatus, userAgent, locale, location, referrer, href, isEntryPage, utmParams}) {
        const referrerSource = REFERRER_SOURCE_MAP[referrer] || referrer;

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

        return payload;
    }

    buildEvent({content, sessionId, timestamp, memberUuid, memberStatus, userAgent, locale, location, referrer, isEntryPage, utmParams}) {
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        const rawUrl = `${baseUrl}${content.pathname}`;
        const href = isEntryPage ? appendUtmToUrl(rawUrl, utmParams) : rawUrl;

        return {
            timestamp: formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: this.buildPayload({
                content, memberUuid, memberStatus, userAgent,
                locale, location, referrer, href, isEntryPage, utmParams
            })
        };
    }

    generateSession() {
        const sessionId = generateUuid();
        const pageCount = this.samplePageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);

        // Shared session attributes
        const memberStatus = weightedChoice(MEMBER_STATUS_WEIGHTS);
        const memberUuid = this.resolveMemberUuid(memberStatus);
        const userAgent = randomChoice(USER_AGENTS);
        const locale = randomChoice(LOCALES);
        const location = weightedChoice(LOCATION_WEIGHTS);
        const referrer = weightedChoice(REFERRER_WEIGHTS);
        const utmParams = this.generateUtmParameters();

        const now = new Date();
        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = i === 0
                ? baseTimestamp
                : new Date(baseTimestamp.getTime() + i * (30 + Math.floor(Math.random() * 270)) * 1000);

            if (timestamp > now) {
                break;
            }

            events.push(this.buildEvent({
                content, sessionId, timestamp,
                memberUuid, memberStatus, userAgent, locale, location, referrer,
                isEntryPage: i === 0,
                utmParams
            }));
        }

        return events;
    }

    /** Sample a page count per session with a realistic distribution. */
    samplePageCount() {
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

    // -------------------------------------------------------------------------
    // Tinybird API
    // -------------------------------------------------------------------------

    async sendEventsToTinybird(events, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${CONFIG.tinybirdHost}/v0/events?name=${CONFIG.datasource}${wait ? '&wait=true' : ''}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.tinybirdToken}`,
                'Content-Type': 'application/x-ndjson'
            },
            body: ndjson
        });

        if (!response.ok) {
            throw new Error(`Tinybird API error: ${response.status} - ${await response.text()}`);
        }

        return response.json();
    }

    async truncateDatasource(name) {
        const url = `${CONFIG.tinybirdHost}/v0/datasources/${name}/truncate`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.tinybirdToken}`}
        });

        if (!response.ok) {
            throw new Error(`Failed to truncate ${name}: ${response.status} - ${await response.text()}`);
        }

        console.log(`  ${name} truncated`);

        const text = await response.text();
        if (!text.trim()) {
            return {status: 'ok'};
        }
        try {
            return JSON.parse(text);
        } catch {
            return {status: 'ok', message: text};
        }
    }

    // -------------------------------------------------------------------------
    // Public commands
    // -------------------------------------------------------------------------

    async generateAnalytics(numEvents = CONFIG.defaultEventCount) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${CONFIG.batchSize}`);

        this.userSessions.clear();

        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generateSession());
            sessionCount += 1;
        }
        events.length = numEvents; // trim any overshoot

        console.log(
            `Generated ${events.length} events from ${sessionCount} sessions ` +
            `(avg ${(events.length / sessionCount).toFixed(1)} pages/session)`
        );

        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        console.log(`\nPushing events to Tinybird (batch size: ${CONFIG.batchSize}, parallel: ${CONFIG.parallelBatches})...`);

        const batches = [];
        for (let i = 0; i < events.length; i += CONFIG.batchSize) {
            batches.push(events.slice(i, i + CONFIG.batchSize));
        }

        let sentCount = 0;
        for (let i = 0; i < batches.length; i += CONFIG.parallelBatches) {
            const chunk = batches.slice(i, i + CONFIG.parallelBatches);
            await Promise.all(chunk.map(batch => this.sendEventsToTinybird(batch)));
            sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
            console.log(`Sent ${sentCount}/${events.length} events`);
        }

        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        for (const name of [CONFIG.datasource, CONFIG.mvDatasource]) {
            console.log(`Truncating ${name}...`);
            await this.truncateDatasource(name);
        }

        // Daily pages MV may not exist in older setups
        console.log(`Truncating ${CONFIG.mvDailyPages}...`);
        try {
            await this.truncateDatasource(CONFIG.mvDailyPages);
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
  yarn data:analytics:generate          # Generate 10,000 events
  yarn data:analytics:generate 10000    # Generate 10,000 events
  yarn data:analytics:clear             # Clear all events
`);
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);

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
            await manager.generateAnalytics(parseInt(rest[0]) || CONFIG.defaultEventCount);
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
| **Configuration** | Scattered `const` declarations | Single `CONFIG` object |
| **Static data** | Defined inside constructor (re-created per instance) | Module-level constants |
| **`fetchTinybirdToken`** | One large method with nested try/catch | Split into `resolveTokenFromEnv`, `resolveTokenFromDockerVolume`, `parseEnvFile`, `handleTokenFetchError` |
| **`generateSession` / `generateEvent`** | Duplicated member UUID logic, UTM building, payload construction | Shared `resolveMemberUuid`, `buildUtmQueryString`, `appendUtmToUrl`, `buildPayload`, `buildEvent` helpers |
| **`selectContent`** | Mixed static/post logic in one method | Split into `selectStaticPage` and `selectPost` |
| **`generateTimestamp`** | Inline start-date calculation and hour-shifting | Extracted `resolveStartDate` and `applyDailyPattern` |
| **Page-count sampling** | Inline `if/else` chain in `generateSession` | Extracted `samplePageCount` |
| **`generateAnalytics`** | Inline batch-send loop with error handling | Cleaner loop; error propagates naturally |
| **`clearAnalytics`** | Repeated truncate calls | Loop over known datasources |
| **`weightedChoice` / `randomChoice` / `generateUuid` / `formatTimestamp`** | Instance methods | Pure module-level functions (no `this` needed) |