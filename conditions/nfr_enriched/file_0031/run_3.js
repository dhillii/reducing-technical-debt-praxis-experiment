# Refactored Docker Analytics Manager

## Key Improvements

1. **Extracted configuration** into a dedicated `CONFIG` object
2. **Decomposed large methods** into smaller, focused functions
3. **Eliminated duplication** in member UUID generation, UTM building, and payload construction
4. **Simplified complex logic** in token fetching, session generation, and batch sending
5. **Replaced manual weighted arrays** with a cleaner data structure
6. **Improved readability** with clearer naming and reduced nesting

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
    const href = `${baseUrl}${pathname}`;
    if (!utmParams) {
        return href;
    }
    const query = buildUtmQueryString(utmParams);
    return query ? `${href}?${query}` : href;
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

function selectPageCount() {
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

function parseEnvContent(content) {
    return Object.fromEntries(
        content.trim().split('\n')
            .map(line => line.split('='))
            .filter(([key, ...rest]) => key && rest.length > 0)
            .map(([key, ...rest]) => [key.trim(), rest.join('=').trim()])
    );
}

// ─── Token Fetching ───────────────────────────────────────────────────────────

function readTokenFromDockerVolume() {
    const envContent = execSync(
        `docker run --rm -v ${CONFIG.dockerVolumeName}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
        {encoding: 'utf8', timeout: 10000}
    );
    const config = parseEnvContent(envContent);
    return config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN || null;
}

function handleTokenFetchError(error) {
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

async function fetchTinybirdToken() {
    console.log('Fetching Tinybird token...');

    const envToken = process.env.TINYBIRD_ADMIN_TOKEN || process.env.TINYBIRD_TRACKER_TOKEN;
    if (envToken) {
        const tokenName = process.env.TINYBIRD_ADMIN_TOKEN ? 'TINYBIRD_ADMIN_TOKEN' : 'TINYBIRD_TRACKER_TOKEN';
        console.log(`Using ${tokenName} from environment`);
        return envToken;
    }

    try {
        console.log('Reading Tinybird config from Docker volume...');
        const token = readTokenFromDockerVolume();
        if (!token) {
            throw new Error('No token found in Docker volume config');
        }
        console.log('Tinybird token acquired from Docker volume');
        return token;
    } catch (error) {
        handleTokenFetchError(error);
    }
}

// ─── Timestamp Generation ─────────────────────────────────────────────────────

function generateTimestamp(publishedAt = null) {
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getTime() - (12 * 30 * 24 * 60 * 60 * 1000));

    let startDate = publishedAt && new Date(publishedAt) > twelveMonthsAgo
        ? new Date(publishedAt)
        : twelveMonthsAgo;

    if (startDate >= now) {
        startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    }

    // Power distribution creates gradual growth pattern
    const timePosition = Math.pow(Math.random(), 0.6);
    const timestamp = new Date(startDate.getTime() + (timePosition * (now.getTime() - startDate.getTime())));

    // Reduce overnight traffic (midnight–6am)
    if (timestamp.getHours() < 6 && Math.random() < 0.7) {
        timestamp.setHours(9 + Math.floor(Math.random() * 12));
    }

    timestamp.setMinutes(Math.floor(Math.random() * 60));
    timestamp.setSeconds(Math.floor(Math.random() * 60));

    return timestamp > now
        ? new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000)
        : timestamp;
}

// ─── DockerAnalyticsManager ───────────────────────────────────────────────────

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};
        this.postPopularityMap = new Map();
        this.userCount = 200;
    }

    // ─── Initialisation ───────────────────────────────────────────────────────

    async init() {
        console.log('Initializing Docker Analytics Manager...');

        this.tinybirdToken = await fetchTinybirdToken();
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

    // ─── Post Popularity ──────────────────────────────────────────────────────

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

    // ─── Content Selection ────────────────────────────────────────────────────

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

    // ─── Member UUID ──────────────────────────────────────────────────────────

    resolveMemberUuid(memberStatus) {
        if (memberStatus === 'undefined') {
            return 'undefined';
        }
        if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            return randomChoice(this.memberUuids);
        }
        return generateUuid();
    }

    // ─── Payload Building ─────────────────────────────────────────────────────

    buildPayload({content, memberUuid, memberStatus, userAgent, locale, location, referrer, referrerSource, utmParams, isEntryPage, baseUrl}) {
        const href = buildHref(baseUrl, content.pathname, isEntryPage ? utmParams : null);

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

    // ─── Session Generation ───────────────────────────────────────────────────

    generateSession() {
        const sessionId = generateUuid();
        const firstContent = this.selectContent();
        const baseTimestamp = generateTimestamp(firstContent.published_at);
        const pageCount = selectPageCount();
        const now = new Date();

        const memberStatus = weightedChoice(MEMBER_STATUS_WEIGHTS);
        const sessionAttrs = {
            memberUuid: this.resolveMemberUuid(memberStatus),
            memberStatus,
            userAgent: randomChoice(USER_AGENTS),
            locale: randomChoice(LOCALES),
            location: weightedChoice(LOCATION_WEIGHTS),
            referrer: weightedChoice(REFERRER_WEIGHTS),
            utmParams: generateUtmParameters(),
            baseUrl: this.siteConfig.url || 'http://localhost:2368'
        };
        sessionAttrs.referrerSource = REFERRER_SOURCE_MAP[sessionAttrs.referrer] || sessionAttrs.referrer;

        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const offsetSeconds = i === 0 ? 0 : 30 + Math.floor(Math.random() * 270);
            const timestamp = new Date(baseTimestamp.getTime() + (i * offsetSeconds * 1000));

            if (timestamp > now) {
                break;
            }

            const payload = this.buildPayload({
                content,
                ...sessionAttrs,
                isEntryPage: i === 0
            });

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

    // ─── Tinybird API ─────────────────────────────────────────────────────────

    async sendEventsToTinybird(events) {
        const url = `${CONFIG.tinybirdHost}/v0/events?name=${CONFIG.datasource}`;
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.tinybirdToken}`,
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

    async truncateDatasource(name) {
        const response = await fetch(`${CONFIG.tinybirdHost}/v0/datasources/${name}/truncate`, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.tinybirdToken}`}
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

    // ─── Public Commands ──────────────────────────────────────────────────────

    async generateAnalytics(numEvents = CONFIG.defaultEventCount) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);

        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generateSession());
            sessionCount += 1;
        }
        events.length = numEvents;

        console.log(`Generated ${events.length} events from ${sessionCount} sessions (avg ${(events.length / sessionCount).toFixed(1)} pages/session)`);

        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

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

        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
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
| **Configuration** | Constants scattered + constructor properties | Single `CONFIG` object + module-level constants |
| **Static data** | Defined inside constructor | Module-level constants (allocated once) |
| **Token fetching** | One 50-line method with nested try/catch | `fetchTinybirdToken` + `readTokenFromDockerVolume` + `handleTokenFetchError` |
| **Content selection** | One method with mixed concerns | `selectContent` → `selectStaticPage` / `selectPost` |
| **Member UUID** | Duplicated in `generateEvent` & `generateSession` | Single `resolveMemberUuid` method |
| **Payload building** | Duplicated in `generateEvent` & `generateSession` | Single `buildPayload` method |
| **UTM/href building** | Inline string manipulation repeated | `buildHref` + `buildUtmQueryString` pure functions |
| **Timestamp logic** | Nested conditionals | Flattened with early returns |
| **`generateEvent`** | Kept as dead code (session-based generation used) | Removed entirely |
| **`parseEnvContent`** | Manual for-loop with split | Functional `Object.fromEntries` pipeline |