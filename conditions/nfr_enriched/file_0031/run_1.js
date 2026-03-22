# Refactored Docker Analytics Manager

## Key Improvements

1. **Extracted configuration** into a dedicated `CONFIG` object
2. **Separated data constants** from class logic
3. **Decomposed large methods** into smaller, focused functions
4. **Eliminated code duplication** (member UUID generation, UTM query string building)
5. **Simplified complex conditionals** with early returns and helper methods
6. **Improved naming** for clarity

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

function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function weightedChoice(weights) {
    let random = Math.random() * weights.reduce((sum, item) => sum + item.weight, 0);
    for (const item of weights) {
        random -= item.weight;
        if (random <= 0) {
            return item.value;
        }
    }
    return weights[weights.length - 1].value;
}

function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

function buildUtmQueryString(utmParams) {
    return Object.entries(utmParams)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
}

function buildHref(baseUrl, pathname, utmParams = null) {
    const base = `${baseUrl}${pathname}`;
    if (!utmParams) {
        return base;
    }
    const query = buildUtmQueryString(utmParams);
    return query ? `${base}?${query}` : base;
}

function generateUtmParameters() {
    if (Math.random() < 0.5) {
        return null;
    }
    return {
        utm_source: weightedChoice(UTM_SOURCES),
        utm_medium: weightedChoice(UTM_MEDIUMS),
        utm_campaign: Math.random() < 0.8 ? weightedChoice(UTM_CAMPAIGNS) : undefined
    };
}

function parseEnvContent(content) {
    return content.trim().split('\n').reduce((config, line) => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
        }
        return config;
    }, {});
}

function selectSessionPageCount() {
    const r = Math.random();
    if (r < 0.4) {
        return 1;
    }
    if (r < 0.7) {
        return 2 + Math.floor(Math.random() * 2); // 2–3
    }
    if (r < 0.9) {
        return 4 + Math.floor(Math.random() * 3); // 4–6
    }
    return 7 + Math.floor(Math.random() * 4);     // 7–10
}

// ─── Main Class ───────────────────────────────────────────────────────────────

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};
        this.userSessions = new Map();
        this.postPopularityMap = new Map();
        this.userCount = 200;
    }

    // ─── Initialisation ─────────────────────────────────────────────────────

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

    // ─── Token Fetching ─────────────────────────────────────────────────────

    async fetchTinybirdToken() {
        console.log('Fetching Tinybird token...');

        const envToken = this.resolveTokenFromEnvironment();
        if (envToken) {
            this.tinybirdToken = envToken;
            return;
        }

        this.tinybirdToken = await this.resolveTokenFromDockerVolume();
    }

    resolveTokenFromEnvironment() {
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

    async resolveTokenFromDockerVolume() {
        console.log('Reading Tinybird config from Docker volume...');
        try {
            const envContent = execSync(
                `docker run --rm -v ${CONFIG.dockerVolumeName}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = parseEnvContent(envContent);
            const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;

            if (!token) {
                throw new Error('No token found in Docker volume config');
            }

            const tokenType = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
            console.log(`Tinybird ${tokenType} token acquired from Docker volume`);
            return token;
        } catch (error) {
            this.logTokenFetchError(error);
            throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
        }
    }

    logTokenFetchError(error) {
        if (error.message.includes('No such file') || error.message.includes('No token found')) {
            console.error('Tinybird config not found in Docker volume.');
            console.error('Make sure Tinybird is running: yarn dev:analytics');
        } else if (error.message.includes('Cannot connect to the Docker daemon')) {
            console.error('Docker is not running. Please start Docker first.');
        } else {
            console.error('Failed to fetch Tinybird token:', error.message);
        }
    }

    // ─── Post Popularity ────────────────────────────────────────────────────

    assignPostPopularity() {
        this.postPopularityMap.clear();
        const shuffledPosts = [...this.posts].sort(() => Math.random() - 0.5);

        let postIndex = 0;
        for (const tier of POST_POPULARITY_TIERS) {
            const tierCount = Math.ceil((tier.weight / 100) * shuffledPosts.length);
            for (let i = 0; i < tierCount && postIndex < shuffledPosts.length; i++, postIndex++) {
                this.postPopularityMap.set(shuffledPosts[postIndex].uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
            }
        }
    }

    // ─── Content & Member Selection ─────────────────────────────────────────

    selectContent() {
        if (Math.random() < 0.4 || this.posts.length === 0) {
            return this.selectStaticPage();
        }
        return this.selectWeightedPost();
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

    selectWeightedPost() {
        const weightedPosts = this.posts.flatMap((post) => {
            const popularity = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            return Array(Math.ceil(popularity.multiplier * 10)).fill(post);
        });

        const post = randomChoice(weightedPosts);
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

    // ─── Timestamp Generation ────────────────────────────────────────────────

    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const monthsBack = 12;
        let startDate = new Date(now.getTime() - (monthsBack * 30 * 24 * 60 * 60 * 1000));

        if (publishedAt) {
            const pubDate = new Date(publishedAt);
            if (pubDate > startDate) {
                startDate = pubDate;
            }
        }

        if (startDate >= now) {
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        }

        const timeRange = now.getTime() - startDate.getTime();
        const timestamp = new Date(startDate.getTime() + (Math.pow(Math.random(), 0.6) * timeRange));

        this.applyDailyTrafficPattern(timestamp);
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        if (timestamp > now) {
            return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }

        return timestamp;
    }

    applyDailyTrafficPattern(timestamp) {
        const hour = timestamp.getHours();
        const isOvernightHour = hour >= 0 && hour < 6;
        if (isOvernightHour && Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }
    }

    // ─── Session Generation ──────────────────────────────────────────────────

    generateSession() {
        const sessionId = generateUuid();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const pageCount = selectSessionPageCount();

        const sessionContext = this.buildSessionContext(baseTimestamp);
        const now = new Date();
        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = i === 0
                ? baseTimestamp
                : new Date(baseTimestamp.getTime() + (i * (30 + Math.floor(Math.random() * 270)) * 1000));

            if (timestamp > now) {
                break;
            }

            events.push(this.buildPageHitEvent(sessionId, content, timestamp, sessionContext, i === 0));
        }

        return events;
    }

    buildSessionContext(baseTimestamp) {
        const memberStatus = weightedChoice(MEMBER_STATUS_WEIGHTS);
        const referrer = weightedChoice(REFERRER_WEIGHTS);
        return {
            memberStatus,
            memberUuid: this.resolveMemberUuid(memberStatus),
            userAgent: randomChoice(USER_AGENTS),
            locale: randomChoice(LOCALES),
            location: weightedChoice(LOCATION_WEIGHTS),
            referrer,
            referrerSource: REFERRER_SOURCE_MAP[referrer] || referrer,
            utmParams: generateUtmParameters(),
            baseUrl: this.siteConfig.url || 'http://localhost:2368',
            baseTimestamp
        };
    }

    buildPageHitEvent(sessionId, content, timestamp, ctx, isEntryPage) {
        const href = buildHref(ctx.baseUrl, content.pathname, isEntryPage ? ctx.utmParams : null);

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: ctx.memberUuid,
            member_status: ctx.memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': ctx.userAgent,
            locale: ctx.locale,
            location: ctx.location,
            referrer: isEntryPage ? ctx.referrer : '',
            pathname: content.pathname,
            href,
            meta: {referrerSource: isEntryPage ? ctx.referrerSource : ''}
        };

        if (isEntryPage && ctx.utmParams) {
            Object.assign(payload, ctx.utmParams);
        }

        return {
            timestamp: formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload
        };
    }

    // ─── Analytics Generation ────────────────────────────────────────────────

    async generateAnalytics(numEvents = CONFIG.defaultEventCount) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${CONFIG.batchSize}`);

        this.userSessions.clear();

        const events = this.collectSessionEvents(numEvents);
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const sentCount = await this.sendAllBatches(events);
        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    collectSessionEvents(numEvents) {
        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generateSession());
            sessionCount += 1;
        }

        if (events.length > numEvents) {
            events.length = numEvents;
        }

        console.log(
            `Generated ${events.length} events from ${sessionCount} sessions ` +
            `(avg ${(events.length / sessionCount).toFixed(1)} pages/session)`
        );

        return events;
    }

    async sendAllBatches(events) {
        console.log(`\nPushing events to Tinybird (batch size: ${CONFIG.batchSize}, parallel: ${CONFIG.parallelBatches})...`);

        const batches = [];
        for (let i = 0; i < events.length; i += CONFIG.batchSize) {
            batches.push(events.slice(i, i + CONFIG.batchSize));
        }

        let sentCount = 0;
        for (let i = 0; i < batches.length; i += CONFIG.parallelBatches) {
            const chunk = batches.slice(i, i + CONFIG.parallelBatches);
            try {
                await Promise.all(chunk.map(batch => this.sendEventsToTinybird(batch)));
                sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * CONFIG.batchSize}:`, error.message);
                throw error;
            }
        }

        return sentCount;
    }

    // ─── Tinybird API ────────────────────────────────────────────────────────

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

    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        await this.truncateDatasource(CONFIG.datasource);
        await this.truncateDatasource(CONFIG.mvDatasource);

        try {
            await this.truncateDatasource(CONFIG.mvDailyPages);
        } catch {
            console.log(`  ${CONFIG.mvDailyPages} not found (may not be deployed yet)`);
        }

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    async truncateDatasource(datasourceName) {
        const url = `${CONFIG.tinybirdHost}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.tinybirdToken}`}
        });

        if (!response.ok) {
            throw new Error(`Failed to truncate ${datasourceName}: ${response.status} - ${await response.text()}`);
        }

        console.log(`  ${datasourceName} truncated`);

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
  yarn data:analytics:generate          # Generate 10,000 events
  yarn data:analytics:generate 10000    # Generate 10,000 events
  yarn data:analytics:clear             # Clear all events
`);
}

async function main() {
    const [command, secondArg] = process.argv.slice(2);

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
            await manager.generateAnalytics(parseInt(secondArg) || CONFIG.defaultEventCount);
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
| **Configuration** | Scattered `const` declarations + constructor properties | Single `CONFIG` object |
| **Static data** | All in constructor (bloating it) | Module-level constants |
| **`fetchTinybirdToken`** | One large method with nested try/catch | Split into `resolveTokenFromEnvironment`, `resolveTokenFromDockerVolume`, `logTokenFetchError` |
| **`selectContent`** | Mixed static/post logic with duplication | `selectStaticPage` + `selectWeightedPost` helpers |
| **Member UUID logic** | Duplicated in `generateEvent` and `generateSession` | Single `resolveMemberUuid` method |
| **UTM query building** | Duplicated inline in two places | `buildUtmQueryString` + `buildHref` pure functions |
| **`generateSession`** | 80-line monolith | Delegates to `buildSessionContext` + `buildPageHitEvent` |
| **`generateAnalytics`** | Mixed generation + sending logic | Delegates to `collectSessionEvents` + `sendAllBatches` |
| **`generateEvent`** | Removed — superseded by session-based generation | N/A |
| **`main`** | Verbose arg parsing | Destructured, `includes` for help flags |