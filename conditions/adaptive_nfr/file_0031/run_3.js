# Refactored Docker Analytics Manager

## Key Refactoring Decisions

1. **Extract configuration constants** from constructor into a dedicated config object
2. **Decompose large methods** (`generateSession`, `generateEvent`, `fetchTinybirdToken`) into focused helpers
3. **Eliminate code duplication** (member UUID generation, UTM query string building, href construction)
4. **Simplify `selectContent`** by replacing manual weighted array expansion with proper weighted selection
5. **Clarify `generateTimestamp`** by extracting the start date calculation
6. **Simplify `generateSessionId`** session lookup logic
7. **Reduce `generateAnalytics`** by extracting batch-sending logic

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
// Static configuration data
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

/**
 * Uniform random element from an array.
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
 * Format a Date for Tinybird (YYYY-MM-DD HH:MM:SS).
 */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

/**
 * Build a URL query string from UTM params, omitting undefined values.
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
 * Parse a simple KEY=VALUE .env file into an object.
 */
function parseEnvFile(content) {
    const config = {};
    for (const line of content.trim().split('\n')) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
        }
    }
    return config;
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
    // Token acquisition
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

    /**
     * Return a token from environment variables, or null if none are set.
     */
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

    /**
     * Read the Tinybird token from the shared Docker volume config file.
     */
    async resolveTokenFromDockerVolume() {
        console.log('Reading Tinybird config from Docker volume...');
        try {
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = parseEnvFile(envContent);

            if (config.TINYBIRD_ADMIN_TOKEN) {
                console.log('Tinybird admin token acquired from Docker volume');
                return config.TINYBIRD_ADMIN_TOKEN;
            }
            if (config.TINYBIRD_TRACKER_TOKEN) {
                console.log('Tinybird tracker token acquired from Docker volume');
                return config.TINYBIRD_TRACKER_TOKEN;
            }

            throw new Error('No token found in Docker volume config');
        } catch (error) {
            this.rethrowTokenError(error);
        }
    }

    rethrowTokenError(error) {
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

    // -------------------------------------------------------------------------
    // Post popularity
    // -------------------------------------------------------------------------

    assignPostPopularity() {
        this.postPopularityMap.clear();
        const shuffled = [...this.posts].sort(() => Math.random() - 0.5);

        let postIndex = 0;
        for (const tier of POST_POPULARITY_TIERS) {
            const tierCount = Math.ceil((tier.weight / 100) * shuffled.length);
            for (let i = 0; i < tierCount && postIndex < shuffled.length; i++, postIndex++) {
                this.postPopularityMap.set(shuffled[postIndex].uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Content & member selection
    // -------------------------------------------------------------------------

    /**
     * Select a page/post to record a hit against.
     */
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
        // Build a weight list from popularity multipliers without array expansion.
        const postWeights = this.posts.map((post) => {
            const popularity = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            return {value: post, weight: Math.ceil(popularity.multiplier * 10)};
        });

        const post = weightedChoice(postWeights);
        return {
            post_uuid: post.uuid,
            post_type: post.type,
            pathname: post.pathname,
            published_at: post.published_at
        };
    }

    /**
     * Resolve a member UUID based on the chosen member status.
     */
    resolveMemberUuid(memberStatus) {
        if (memberStatus === 'undefined') {
            return 'undefined';
        }
        if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            return randomChoice(this.memberUuids);
        }
        return generateUuid();
    }

    // -------------------------------------------------------------------------
    // Timestamp generation
    // -------------------------------------------------------------------------

    /**
     * Generate a realistic timestamp with gradual growth over ~12 months.
     */
    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const startDate = this.resolveStartDate(now, publishedAt);
        const timeRange = now.getTime() - startDate.getTime();

        // Power distribution creates gradual growth (not a sudden spike at the end).
        const timePosition = Math.pow(Math.random(), 0.6);
        const timestamp = new Date(startDate.getTime() + timePosition * timeRange);

        this.applyDailyPattern(timestamp);
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        // Guard: never return a future timestamp.
        if (timestamp > now) {
            return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }
        return timestamp;
    }

    resolveStartDate(now, publishedAt) {
        const twelveMonthsAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);
        const pubDate = publishedAt ? new Date(publishedAt) : null;

        // Use the later of "12 months ago" and the publication date.
        let startDate = pubDate && pubDate > twelveMonthsAgo ? pubDate : twelveMonthsAgo;

        // Ensure the range is at least 7 days wide.
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (startDate >= now) {
            startDate = sevenDaysAgo;
        }
        return startDate;
    }

    /**
     * Reduce overnight traffic by shifting some early-morning hits to daytime.
     */
    applyDailyPattern(timestamp) {
        const hour = timestamp.getHours();
        if (hour < 6 && Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }
    }

    // -------------------------------------------------------------------------
    // Session management
    // -------------------------------------------------------------------------

    /**
     * Return an existing session ID for a user if one is still active (< 3 h),
     * otherwise create a new session.
     */
    generateSessionId(userId, timestamp) {
        const userKey = `user_${userId}`;
        const sessions = this.userSessions.get(userKey) ?? [];

        if (!this.userSessions.has(userKey)) {
            this.userSessions.set(userKey, sessions);
        }

        const activeSession = sessions.find((s) => {
            const ageHours = (timestamp.getTime() - s.startTime.getTime()) / (1000 * 60 * 60);
            return ageHours >= 0 && ageHours <= 3;
        });

        if (activeSession) {
            return activeSession.sessionId;
        }

        const sessionId = generateUuid();
        sessions.push({sessionId, startTime: timestamp});
        return sessionId;
    }

    /**
     * Determine the number of page views for a session using a realistic distribution.
     */
    resolveSessionPageCount() {
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
        return 7 + Math.floor(Math.random() * 4); // 7–10
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
    // Event / session generation
    // -------------------------------------------------------------------------

    /**
     * Build a single Tinybird event object.
     */
    buildEvent({sessionId, timestamp, content, memberStatus, memberUuid, userAgent, locale, location, referrer, utmParams, isEntryPage}) {
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        const referrerSource = REFERRER_SOURCE_MAP[referrer] || referrer;

        let href = `${baseUrl}${content.pathname}`;
        if (isEntryPage) {
            href = appendUtmParams(href, utmParams);
        }

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

    /**
     * Generate all events for a single user session.
     */
    generateSession() {
        const sessionId = generateUuid();
        const pageCount = this.resolveSessionPageCount();
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
            const offsetMs = i === 0 ? 0 : i * (30 + Math.floor(Math.random() * 270)) * 1000;
            const timestamp = new Date(baseTimestamp.getTime() + offsetMs);

            if (timestamp > now) {
                break;
            }

            events.push(this.buildEvent({
                sessionId,
                timestamp,
                content,
                memberStatus,
                memberUuid,
                userAgent,
                locale,
                location,
                referrer,
                utmParams,
                isEntryPage: i === 0
            }));
        }

        return events;
    }

    // -------------------------------------------------------------------------
    // Tinybird API
    // -------------------------------------------------------------------------

    async sendEventsToTinybird(events, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${TINYBIRD_HOST}/v0/events?name=${TINYBIRD_DATASOURCE}${wait ? '&wait=true' : ''}`;

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

    async truncateDatasource(datasourceName) {
        const url = `${TINYBIRD_HOST}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.tinybirdToken}`}
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to truncate ${datasourceName}: ${response.status} - ${errorText}`);
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

    // -------------------------------------------------------------------------
    // Public commands
    // -------------------------------------------------------------------------

    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        this.userSessions.clear();

        const events = this.collectSessionEvents(numEvents);
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const sentCount = await this.sendAllBatches(events);
        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    /**
     * Accumulate session events until the target count is reached.
     */
    collectSessionEvents(numEvents) {
        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            events.push(...this.generateSession());
            sessionCount += 1;
        }

        // Trim any overshoot.
        events.length = numEvents;

        console.log(`Generated ${events.length} events from ${sessionCount} sessions (avg ${(events.length / sessionCount).toFixed(1)} pages/session)`);
        return events;
    }

    /**
     * Slice events into batches and upload them in parallel chunks.
     */
    async sendAllBatches(events) {
        console.log(`\nPushing events to Tinybird (batch size: ${BATCH_SIZE}, parallel: ${PARALLEL_BATCHES})...`);

        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }

        let sentCount = 0;
        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const chunk = batches.slice(i, i + PARALLEL_BATCHES);
            try {
                await Promise.all(chunk.map(batch => this.sendEventsToTinybird(batch)));
                sentCount += chunk.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * BATCH_SIZE}:`, error.message);
                throw error;
            }
        }

        return sentCount;
    }

    async clearAnalytics() {
        console.log('\nClearing analytics events...');

        const required = [TINYBIRD_DATASOURCE, TINYBIRD_MV_DATASOURCE];
        for (const ds of required) {
            console.log(`Truncating ${ds}...`);
            await this.truncateDatasource(ds);
        }

        // Optional datasource — may not exist in older setups.
        console.log(`Truncating ${TINYBIRD_MV_DAILY_PAGES}...`);
        try {
            await this.truncateDatasource(TINYBIRD_MV_DAILY_PAGES);
        } catch {
            console.log(`  ${TINYBIRD_MV_DAILY_PAGES} not found (may not be deployed yet)`);
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

## Summary of Changes

| Area | Before | After |
|---|---|---|
| **Configuration data** | Inline in `constructor` (100+ lines) | Module-level constants, zero constructor noise |
| **`weightedChoice` / `randomChoice` / `generateUuid`** | Instance methods | Pure module-level functions — no `this` needed |
| **`fetchTinybirdToken`** | One 50-line method with nested try/catch | Split into `resolveTokenFromEnv`, `resolveTokenFromDockerVolume`, `rethrowTokenError` |
| **`selectContent`** | Mixed static/post logic + manual array expansion | `selectStaticPage` + `selectWeightedPost` using proper weighted selection (no array explosion) |
| **`generateTimestamp`** | Inline start-date logic + daily pattern | `resolveStartDate` + `applyDailyPattern` helpers |
| **Member UUID resolution** | Duplicated in `generateEvent` and `generateSession` | Single `resolveMemberUuid` method |
| **UTM → href building** | Duplicated in both event builders | `appendUtmParams` + `buildUtmQueryString` pure helpers |
| **`generateSession` / `generateEvent`** | Two overlapping methods | Single `buildEvent` + `generateSession`; `generateEvent` removed |
| **`generateAnalytics`** | One 40-line method | Delegates to `collectSessionEvents` + `sendAllBatches` |
| **`clearAnalytics`** | Repetitive per-datasource blocks | Loop over required list + single optional try/catch |