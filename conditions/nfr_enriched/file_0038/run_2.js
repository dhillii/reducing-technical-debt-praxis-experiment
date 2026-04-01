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
 *   yarn data:analytics:clear             - Clear all analytics events
 *
 * Prerequisites:
 *   - Docker environment running: yarn dev:analytics
 *   - Ghost database populated with posts/members: yarn reset:data
 */

const DockerDatabaseUtils = require('./docker-database-utils');
const {execSync} = require('child_process');

// Configuration
const TINYBIRD_HOST = process.env.TINYBIRD_HOST || 'http://localhost:7181';
const TINYBIRD_DATASOURCE = 'analytics_events';
const TINYBIRD_MV_DATASOURCE = '_mv_hits';
const TINYBIRD_MV_DAILY_PAGES = '_mv_daily_pages';
const DEFAULT_EVENT_COUNT = 10000;
const BATCH_SIZE = 10000;
const PARALLEL_BATCHES = 5;
const DOCKER_VOLUME_NAME = 'ghost-dev_shared-config';

/**
 * Configuration data provider for analytics generation
 */
class AnalyticsConfig {
    constructor() {
        this.staticPages = [
            {value: {pathname: '/', type: 'homepage'}, weight: 40},
            {value: {pathname: '/about/', type: 'page'}, weight: 8},
            {value: {pathname: '/pricing/', type: 'page'}, weight: 6},
            {value: {pathname: '/contact/', type: 'page'}, weight: 4},
            {value: {pathname: '/services/', type: 'page'}, weight: 3},
            {value: {pathname: '/team/', type: 'page'}, weight: 3},
            {value: {pathname: '/privacy/', type: 'page'}, weight: 3},
            {value: {pathname: '/terms/', type: 'page'}, weight: 2}
        ];

        this.referrerWeights = [
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

        this.referrerSourceMap = {
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

        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
        ];

        this.locales = ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP'];

        this.memberStatusWeights = [
            {value: 'undefined', weight: 83},
            {value: 'paid', weight: 9},
            {value: 'free', weight: 8}
        ];

        this.locationWeights = [
            {value: 'US', weight: 62},
            {value: 'GB', weight: 15},
            {value: 'CA', weight: 3},
            {value: 'DE', weight: 3},
            {value: 'FR', weight: 3},
            {value: 'AU', weight: 2},
            {value: 'Others', weight: 12}
        ];

        this.utmSources = [
            {value: 'google', weight: 25},
            {value: 'facebook', weight: 15},
            {value: 'twitter', weight: 12},
            {value: 'newsletter', weight: 15},
            {value: 'email', weight: 10}
        ];

        this.utmMediums = [
            {value: 'cpc', weight: 30},
            {value: 'social', weight: 25},
            {value: 'email', weight: 20},
            {value: 'organic', weight: 15},
            {value: 'referral', weight: 10}
        ];

        this.utmCampaigns = [
            {value: 'spring_sale_2024', weight: 15},
            {value: 'product_launch', weight: 12},
            {value: 'weekly_newsletter', weight: 20},
            {value: 'summer_promotion', weight: 10}
        ];

        this.postPopularityTiers = [
            {tier: 'viral', weight: 8, multiplier: 50},
            {tier: 'popular', weight: 12, multiplier: 12},
            {tier: 'good', weight: 20, multiplier: 4},
            {tier: 'average', weight: 30, multiplier: 1},
            {tier: 'low', weight: 20, multiplier: 0.2},
            {tier: 'very_low', weight: 10, multiplier: 0.05}
        ];
    }
}

/**
 * Utility functions for random selection and UUID generation
 */
class RandomUtils {
    /**
     * Generate UUID v4
     */
    static generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Select item from weighted array
     */
    static weightedChoice(weights) {
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
     * Select random element from array
     */
    static randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

/**
 * Manages timestamp generation with realistic traffic patterns
 */
class TimestampGenerator {
    /**
     * Generate timestamp with gradual growth over ~12 months
     */
    static generate(publishedAt = null) {
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
        const random = Math.random();
        const timePosition = Math.pow(random, 0.6);

        let timestamp = new Date(startDate.getTime() + (timePosition * timeRange));

        TimestampGenerator.applyDailyPattern(timestamp);
        TimestampGenerator.addRandomVariation(timestamp);

        if (timestamp > now) {
            timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }

        return timestamp;
    }

    /**
     * Apply realistic daily traffic patterns
     */
    static applyDailyPattern(timestamp) {
        const hour = timestamp.getHours();

        if (hour >= 0 && hour < 6) {
            if (Math.random() < 0.7) {
                timestamp.setHours(9 + Math.floor(Math.random() * 12));
            }
        }
    }

    /**
     * Add random minute and second variation
     */
    static addRandomVariation(timestamp) {
        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));
    }

    /**
     * Format timestamp for Tinybird
     */
    static format(date) {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }
}

/**
 * Manages content selection (posts and pages)
 */
class ContentSelector {
    constructor(posts, postPopularityMap, config) {
        this.posts = posts;
        this.postPopularityMap = postPopularityMap;
        this.config = config;
    }

    /**
     * Select content (post, page, or homepage)
     */
    select() {
        if (Math.random() < 0.4) {
            return this.selectStaticPage();
        }

        if (this.posts.length === 0) {
            return this.getDefaultContent();
        }

        return this.selectPost();
    }

    /**
     * Select a static page
     */
    selectStaticPage() {
        const staticPage = RandomUtils.weightedChoice(this.config.staticPages);
        return {
            post_uuid: 'undefined',
            post_type: staticPage.type === 'homepage' ? '' : 'page',
            pathname: staticPage.pathname,
            published_at: null
        };
    }

    /**
     * Get default homepage content
     */
    getDefaultContent() {
        return {
            post_uuid: 'undefined',
            post_type: '',
            pathname: '/',
            published_at: null
        };
    }

    /**
     * Select a post based on popularity weighting
     */
    selectPost() {
        const weightedPosts = [];
        for (const post of this.posts) {
            const popularity = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            const weight = Math.ceil(popularity.multiplier * 10);

            for (let i = 0; i < weight; i++) {
                weightedPosts.push(post);
            }
        }

        const selectedPost = RandomUtils.randomChoice(weightedPosts);

        return {
            post_uuid: selectedPost.uuid,
            post_type: selectedPost.type,
            pathname: selectedPost.pathname,
            published_at: selectedPost.published_at
        };
    }
}

/**
 * Manages user sessions and session IDs
 */
class SessionManager {
    constructor() {
        this.userSessions = new Map();
    }

    /**
     * Generate or retrieve session ID for a user
     */
    getSessionId(userId, timestamp) {
        const userKey = `user_${userId}`;

        if (!this.userSessions.has(userKey)) {
            this.userSessions.set(userKey, []);
        }

        const userSessionData = this.userSessions.get(userKey);

        for (let session of userSessionData) {
            const timeDiff = (timestamp.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
            if (timeDiff <= 3 && timeDiff >= 0) {
                return session.sessionId;
            }
        }

        const sessionId = RandomUtils.generateUuid();
        userSessionData.push({
            sessionId: sessionId,
            startTime: timestamp
        });

        return sessionId;
    }

    /**
     * Clear all session data
     */
    clear() {
        this.userSessions.clear();
    }
}

/**
 * Builds analytics event payloads
 */
class EventPayloadBuilder {
    constructor(siteUuid, siteConfig, config) {
        this.siteUuid = siteUuid;
        this.siteConfig = siteConfig;
        this.config = config;
    }

    /**
     * Build event payload for a page view
     */
    buildPayload(content, memberUuid, memberStatus, userAgent, locale, location, referrer, pathname, href, isFirstPage = true) {
        const referrerSource = this.config.referrerSourceMap[referrer] || referrer;

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': userAgent,
            locale: locale,
            location: location,
            referrer: isFirstPage ? referrer : '',
            pathname: pathname,
            href: href,
            meta: {
                referrerSource: isFirstPage ? referrerSource : ''
            }
        };

        return payload;
    }

    /**
     * Build complete event object
     */
    buildEvent(timestamp, sessionId, payload) {
        return {
            timestamp: TimestampGenerator.format(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: payload
        };
    }

    /**
     * Build href with optional UTM parameters
     */
    buildHref(pathname, utmParams = null, includeUtm = true) {
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        let href = `${baseUrl}${pathname}`;

        if (includeUtm && utmParams) {
            const utmQueryString = Object.entries(utmParams)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('&');
            if (utmQueryString) {
                href = `${href}?${utmQueryString}`;
            }
        }

        return href;
    }
}

/**
 * Generates UTM parameters
 */
class UtmGenerator {
    constructor(config) {
        this.config = config;
    }

    /**
     * Generate UTM parameters with 50% probability
     */
    generate() {
        if (Math.random() < 0.5) {
            return null;
        }

        return {
            utm_source: RandomUtils.weightedChoice(this.config.utmSources),
            utm_medium: RandomUtils.weightedChoice(this.config.utmMediums),
            utm_campaign: Math.random() < 0.8 ? RandomUtils.weightedChoice(this.config.utmCampaigns) : undefined
        };
    }
}

/**
 * Generates member information
 */
class MemberGenerator {
    constructor(memberUuids, memberStatusWeights) {
        this.memberUuids = memberUuids;
        this.memberStatusWeights = memberStatusWeights;
    }

    /**
     * Generate member UUID and status
     */
    generate() {
        const memberStatus = RandomUtils.weightedChoice(this.memberStatusWeights);
        let memberUuid;

        if (memberStatus === 'undefined') {
            memberUuid = 'undefined';
        } else if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            memberUuid = RandomUtils.randomChoice(this.memberUuids);
        } else {
            memberUuid = RandomUtils.generateUuid();
        }

        return {memberUuid, memberStatus};
    }
}

/**
 * Generates page count for sessions
 */
class PageCountGenerator {
    /**
     * Generate realistic page count for a session
     */
    static generate() {
        const r = Math.random();
        if (r < 0.4) {
            return 1;
        } else if (r < 0.7) {
            return 2 + Math.floor(Math.random() * 2);
        } else if (r < 0.9) {
            return 4 + Math.floor(Math.random() * 3);
        } else {
            return 7 + Math.floor(Math.random() * 4);
        }
    }
}

/**
 * Generates individual page events within a session
 */
class PageEventGenerator {
    constructor(contentSelector, eventPayloadBuilder, config) {
        this.contentSelector = contentSelector;
        this.eventPayloadBuilder = eventPayloadBuilder;
        this.config = config;
    }

    /**
     * Generate page event for a session
     */
    generatePageEvent(pageIndex, baseTimestamp, sessionId, memberUuid, memberStatus, userAgent, locale, location, referrer, utmParams) {
        const content = pageIndex === 0 ? this.contentSelector.select() : this.contentSelector.select();
        const timestamp = this.calculatePageTimestamp(pageIndex, baseTimestamp);

        if (timestamp > new Date()) {
            return null;
        }

        const href = this.eventPayloadBuilder.buildHref(content.pathname, utmParams, pageIndex === 0);
        const payload = this.eventPayloadBuilder.buildPayload(
            content,
            memberUuid,
            memberStatus,
            userAgent,
            locale,
            location,
            referrer,
            content.pathname,
            href,
            pageIndex === 0
        );

        if (pageIndex === 0 && utmParams) {
            Object.assign(payload, utmParams);
        }

        return this.eventPayloadBuilder.buildEvent(timestamp, sessionId, payload);
    }

    /**
     * Calculate timestamp for a page in the session
     */
    calculatePageTimestamp(pageIndex, baseTimestamp) {
        if (pageIndex === 0) {
            return baseTimestamp;
        }

        const offsetSeconds = 30 + Math.floor(Math.random() * 270);
        return new Date(baseTimestamp.getTime() + (pageIndex * offsetSeconds * 1000));
    }
}

/**
 * Tinybird API client
 */
class TinybirdClient {
    constructor(token, host = TINYBIRD_HOST) {
        this.token = token;
        this.host = host;
    }

    /**
     * Send events to Tinybird
     */
    async sendEvents(events, datasource = TINYBIRD_DATASOURCE, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${this.host}/v0/events?name=${datasource}${wait ? '&wait=true' : ''}`;

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

        return await response.json();
    }

    /**
     * Truncate a datasource
     */
    async truncateDatasource(datasourceName) {
        const url = `${this.host}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to truncate ${datasourceName}: ${response.status} - ${errorText}`);
        }

        console.log(`  ${datasourceName} truncated`);

        const text = await response.text();
        if (text && text.trim()) {
            try {
                return JSON.parse(text);
            } catch (e) {
                return {status: 'ok', message: text};
            }
        }
        return {status: 'ok'};
    }
}

/**
 * Token provider for Tinybird authentication
 */
class TinybirdTokenProvider {
    /**
     * Fetch Tinybird token from environment or Docker volume
     */
    static async fetch() {
        console.log('Fetching Tinybird token...');

        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
            return process.env.TINYBIRD_ADMIN_TOKEN;
        }

        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
            return process.env.TINYBIRD_TRACKER_TOKEN;
        }

        return TinybirdTokenProvider.fetchFromDockerVolume();
    }

    /**
     * Fetch token from Docker volume
     */
    static async fetchFromDockerVolume() {
        try {
            console.log('Reading Tinybird config from Docker volume...');
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = TinybirdTokenProvider.parseEnvContent(envContent);

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
            TinybirdTokenProvider.handleFetchError(error);
        }
    }

    /**
     * Parse environment file content
     */
    static parseEnvContent(envContent) {
        const lines = envContent.trim().split('\n');
        const config = {};
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                config[key.trim()] = valueParts.join('=').trim();
            }
        }
        return config;
    }

    /**
     * Handle token fetch errors
     */
    static handleFetchError(error) {
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
}

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.tinybirdClient = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};
        this.config = new AnalyticsConfig();
        this.postPopularityMap = new Map();
        this.userCount = 200;
        this.sessionManager = new SessionManager();
    }

    /**
     * Initialize the manager with database data
     */
    async init() {
        console.log('Initializing Docker Analytics Manager...');

        this.tinybirdToken = await TinybirdTokenProvider.fetch();
        this.tinybirdClient = new TinybirdClient(this.tinybirdToken);

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

    /**
     * Assign popularity tiers to posts for realistic traffic distribution
     */
    assignPostPopularity() {
        this.postPopularityMap.clear();

        const shuffledPosts = [...this.posts].sort(() => Math.random() - 0.5);

        let postIndex = 0;
        for (const tier of this.config.postPopularityTiers) {
            const tierCount = Math.ceil((tier.weight / 100) * shuffledPosts.length);

            for (let i = 0; i < tierCount && postIndex < shuffledPosts.length; i++) {
                this.postPopularityMap.set(shuffledPosts[postIndex].uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
                postIndex += 1;
            }
        }
    }

    /**
     * Generate a single session with multiple page hits
     */
    generateSession() {
        const sessionId = RandomUtils.generateUuid();
        const pageCount = PageCountGenerator.generate();

        const contentSelector = new ContentSelector(this.posts, this.postPopularityMap, this.config);
        const firstContent = contentSelector.select();
        const baseTimestamp = TimestampGenerator.generate(firstContent.published_at);

        const memberGenerator = new MemberGenerator(this.memberUuids, this.config.memberStatusWeights);
        const {memberUuid, memberStatus} = memberGenerator.generate();

        const userAgent = RandomUtils.randomChoice(this.config.userAgents);
        const locale = RandomUtils.randomChoice(this.config.locales);
        const location = RandomUtils.weightedChoice(this.config.locationWeights);
        const referrer = RandomUtils.weightedChoice(this.config.referrerWeights);

        const utmGenerator = new UtmGenerator(this.config);
        const utmParams = utmGenerator.generate();

        const eventPayloadBuilder = new EventPayloadBuilder(this.siteUuid, this.siteConfig, this.config);
        const pageEventGenerator = new PageEventGenerator(contentSelector, eventPayloadBuilder, this.config);

        const events = [];

        for (let i = 0; i < pageCount; i++) {
            const event = pageEventGenerator.generatePageEvent(
                i,
                baseTimestamp,
                sessionId,
                memberUuid,
                memberStatus,
                userAgent,
                locale,
                location,
                referrer,
                utmParams
            );

            if (event) {
                events.push(event);
            } else {
                break;
            }
        }

        return events;
    }

    /**
     * Generate and push analytics events to Tinybird
     */
    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        this.sessionManager.clear();

        const events = [];
        let sessionCount = 0;

        while (events.length < numEvents) {
            const sessionEvents = this.generateSession();
            events.push(...sessionEvents);
            sessionCount += 1;
        }

        if (events.length > numEvents) {
            events.length = numEvents;
        }

        console.log(`Generated ${events.length} events from ${sessionCount} sessions (avg ${(events.length / sessionCount).toFixed(1)} pages/session)`);

        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        await this.sendEventsBatched(events);

        console.log(`\nSuccessfully pushed ${events.length} events to Tinybird`);
        return events.length;
    }

    /**
     * Send events in batches with parallel processing
     */
    async sendEventsBatched(events) {
        console.log(`\nPushing events to Tinybird (batch size: ${BATCH_SIZE}, parallel: ${PARALLEL_BATCHES})...`);

        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }

        let sentCount = 0;

        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

            try {
                await Promise.all(parallelBatches.map(batch => this.tinybirdClient.sendEvents(batch)));
                sentCount += parallelBatches.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * BATCH_SIZE}:`, error.message);
                throw error;
            }
        }
    }

    /**
     * Clear analytics events from Tinybird
     */
    async clearAnalytics() {
        console.log(`\nClearing analytics events...`);

        console.log(`Truncating ${TINYBIRD_DATASOURCE}...`);
        await this.tinybirdClient.truncateDatasource(TINYBIRD_DATASOURCE);

        console.log(`Truncating ${TINYBIRD_MV_DATASOURCE}...`);
        await this.tinybirdClient.truncateDatasource(TINYBIRD_MV_DATASOURCE);

        console.log(`Truncating ${TINYBIRD_MV_DAILY_PAGES}...`);
        try {
            await this.tinybirdClient.truncateDatasource(TINYBIRD_MV_DAILY_PAGES);
        } catch (error) {
            console.log(`  ${TINYBIRD_MV_DAILY_PAGES} not found (may not be deployed yet)`);
        }

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    /**
     * Close database connection
     */
    async close() {
        await this.db.close();
    }
}

/**
 * Print help message
 */
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

/**
 * Main CLI handler
 */
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