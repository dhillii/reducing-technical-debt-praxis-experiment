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

class TinybirdTokenManager {
    constructor() {
        this.token = null;
    }

    async fetchFromEnvironment() {
        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            this.token = process.env.TINYBIRD_ADMIN_TOKEN;
            console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
            return this.token;
        }

        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            this.token = process.env.TINYBIRD_TRACKER_TOKEN;
            console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
            return this.token;
        }

        return null;
    }

    parseEnvContent(envContent) {
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

    async fetchFromDockerVolume() {
        try {
            console.log('Reading Tinybird config from Docker volume...');
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = this.parseEnvContent(envContent);

            if (config.TINYBIRD_ADMIN_TOKEN) {
                this.token = config.TINYBIRD_ADMIN_TOKEN;
                console.log('Tinybird admin token acquired from Docker volume');
                return this.token;
            }

            if (config.TINYBIRD_TRACKER_TOKEN) {
                this.token = config.TINYBIRD_TRACKER_TOKEN;
                console.log('Tinybird tracker token acquired from Docker volume');
                return this.token;
            }

            throw new Error('No token found in Docker volume config');
        } catch (error) {
            this.handleFetchError(error);
            throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
        }
    }

    handleFetchError(error) {
        if (error.message.includes('No such file') || error.message.includes('No token found')) {
            console.error('Tinybird config not found in Docker volume.');
            console.error('Make sure Tinybird is running: yarn dev:analytics');
        } else if (error.message.includes('Cannot connect to the Docker daemon')) {
            console.error('Docker is not running. Please start Docker first.');
        } else {
            console.error('Failed to fetch Tinybird token:', error.message);
        }
    }

    async fetch() {
        console.log('Fetching Tinybird token...');
        const envToken = await this.fetchFromEnvironment();
        if (envToken) {
            return envToken;
        }
        return await this.fetchFromDockerVolume();
    }
}

class ContentSelector {
    constructor(posts, postPopularityMap, siteConfig) {
        this.posts = posts;
        this.postPopularityMap = postPopularityMap;
        this.siteConfig = siteConfig;
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
    }

    selectStaticPage(weightedChoice) {
        const staticPage = weightedChoice(this.staticPages);
        return {
            post_uuid: 'undefined',
            post_type: staticPage.type === 'homepage' ? '' : 'page',
            pathname: staticPage.pathname,
            published_at: null
        };
    }

    selectPost(weightedChoice, randomChoice) {
        if (this.posts.length === 0) {
            return {
                post_uuid: 'undefined',
                post_type: '',
                pathname: '/',
                published_at: null
            };
        }

        const weightedPosts = [];
        for (const post of this.posts) {
            const popularity = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            const weight = Math.ceil(popularity.multiplier * 10);

            for (let i = 0; i < weight; i++) {
                weightedPosts.push(post);
            }
        }

        const selectedPost = randomChoice(weightedPosts);

        return {
            post_uuid: selectedPost.uuid,
            post_type: selectedPost.type,
            pathname: selectedPost.pathname,
            published_at: selectedPost.published_at
        };
    }

    select(weightedChoice, randomChoice) {
        if (Math.random() < 0.4) {
            return this.selectStaticPage(weightedChoice);
        }
        return this.selectPost(weightedChoice, randomChoice);
    }
}

class EventPayloadBuilder {
    constructor(siteUuid, siteConfig, referrerSourceMap, userAgents, locales, locationWeights) {
        this.siteUuid = siteUuid;
        this.siteConfig = siteConfig;
        this.referrerSourceMap = referrerSourceMap;
        this.userAgents = userAgents;
        this.locales = locales;
        this.locationWeights = locationWeights;
    }

    buildHref(pathname, utmParams) {
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        let href = `${baseUrl}${pathname}`;

        if (utmParams) {
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

    build(content, memberUuid, memberStatus, referrer, utmParams, randomChoice, weightedChoice) {
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const href = this.buildHref(content.pathname, utmParams);

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': randomChoice(this.userAgents),
            locale: randomChoice(this.locales),
            location: weightedChoice(this.locationWeights),
            referrer: referrer,
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: referrerSource
            }
        };

        if (utmParams) {
            Object.assign(payload, utmParams);
        }

        return payload;
    }
}

class SessionEventGenerator {
    constructor(manager) {
        this.manager = manager;
    }

    determinePageCount() {
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

    generateSessionAttributes() {
        const memberStatus = this.manager.weightedChoice(this.manager.memberStatusWeights);
        let memberUuid;

        if (memberStatus === 'undefined') {
            memberUuid = 'undefined';
        } else if (this.manager.memberUuids.length > 0 && Math.random() < 0.7) {
            memberUuid = this.manager.randomChoice(this.manager.memberUuids);
        } else {
            memberUuid = this.manager.generateUuid();
        }

        return {
            memberStatus,
            memberUuid,
            userAgent: this.manager.randomChoice(this.manager.userAgents),
            locale: this.manager.randomChoice(this.manager.locales),
            location: this.manager.weightedChoice(this.manager.locationWeights),
            referrer: this.manager.weightedChoice(this.manager.referrerWeights),
            utmParams: this.manager.generateUtmParameters()
        };
    }

    buildPageEvent(content, sessionId, timestamp, sessionAttrs, isFirstPage) {
        const payloadBuilder = new EventPayloadBuilder(
            this.manager.siteUuid,
            this.manager.siteConfig,
            this.manager.referrerSourceMap,
            this.manager.userAgents,
            this.manager.locales,
            this.manager.locationWeights
        );

        const href = payloadBuilder.buildHref(
            content.pathname,
            isFirstPage ? sessionAttrs.utmParams : null
        );

        const payload = {
            site_uuid: this.manager.siteUuid,
            member_uuid: sessionAttrs.memberUuid,
            member_status: sessionAttrs.memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': sessionAttrs.userAgent,
            locale: sessionAttrs.locale,
            location: sessionAttrs.location,
            referrer: isFirstPage ? sessionAttrs.referrer : '',
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: isFirstPage ? (this.manager.referrerSourceMap[sessionAttrs.referrer] || sessionAttrs.referrer) : ''
            }
        };

        if (isFirstPage && sessionAttrs.utmParams) {
            Object.assign(payload, sessionAttrs.utmParams);
        }

        return {
            timestamp: this.manager.formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: payload
        };
    }

    generate() {
        const sessionId = this.manager.generateUuid();
        const pageCount = this.determinePageCount();
        const firstContent = this.manager.contentSelector.select(
            this.manager.weightedChoice.bind(this.manager),
            this.manager.randomChoice.bind(this.manager)
        );
        let baseTimestamp = this.manager.generateTimestamp(firstContent.published_at);
        const sessionAttrs = this.generateSessionAttributes();
        const events = [];
        const now = new Date();

        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.manager.contentSelector.select(
                this.manager.weightedChoice.bind(this.manager),
                this.manager.randomChoice.bind(this.manager)
            );

            let timestamp;
            if (i === 0) {
                timestamp = baseTimestamp;
            } else {
                const offsetSeconds = 30 + Math.floor(Math.random() * 270);
                timestamp = new Date(baseTimestamp.getTime() + (i * offsetSeconds * 1000));
            }

            if (timestamp > now) {
                break;
            }

            events.push(this.buildPageEvent(content, sessionId, timestamp, sessionAttrs, i === 0));
        }

        return events;
    }
}

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};
        this.contentSelector = null;

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

        this.userCount = 200;
        this.userSessions = new Map();
        this.postPopularityMap = new Map();

        this.postPopularityTiers = [
            {tier: 'viral', weight: 8, multiplier: 50},
            {tier: 'popular', weight: 12, multiplier: 12},
            {tier: 'good', weight: 20, multiplier: 4},
            {tier: 'average', weight: 30, multiplier: 1},
            {tier: 'low', weight: 20, multiplier: 0.2},
            {tier: 'very_low', weight: 10, multiplier: 0.05}
        ];
    }

    async fetchTinybirdToken() {
        const tokenManager = new TinybirdTokenManager();
        this.tinybirdToken = await tokenManager.fetch();
        return this.tinybirdToken;
    }

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
        this.contentSelector = new ContentSelector(this.posts, this.postPopularityMap, this.siteConfig);

        if (this.posts.length === 0) {
            console.warn('No posts found. Run "yarn reset:data" to generate Ghost data first.');
        }

        return true;
    }

    assignPostPopularity() {
        this.postPopularityMap.clear();

        const shuffledPosts = [...this.posts].sort(() => Math.random() - 0.5);

        let postIndex = 0;
        for (const tier of this.postPopularityTiers) {
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

    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    weightedChoice(weights) {
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

    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

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
        const random = Math.random();
        const timePosition = Math.pow(random, 0.6);

        let timestamp = new Date(startDate.getTime() + (timePosition * timeRange));

        const hour = timestamp.getHours();
        if (hour >= 0 && hour < 6) {
            if (Math.random() < 0.7) {
                timestamp.setHours(9 + Math.floor(Math.random() * 12));
            }
        }

        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        if (timestamp > now) {
            timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }

        return timestamp;
    }

    formatTimestamp(date) {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }

    generateUtmParameters() {
        if (Math.random() < 0.5) {
            return null;
        }

        return {
            utm_source: this.weightedChoice(this.utmSources),
            utm_medium: this.weightedChoice(this.utmMediums),
            utm_campaign: Math.random() < 0.8 ? this.weightedChoice(this.utmCampaigns) : undefined
        };
    }

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

        return await response.json();
    }

    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        this.userSessions.clear();

        const events = [];
        const sessionGenerator = new SessionEventGenerator(this);

        let sessionCount = 0;
        while (events.length < numEvents) {
            const sessionEvents = sessionGenerator.generate();
            events.push(...sessionEvents);
            sessionCount += 1;
        }

        if (events.length > numEvents) {
            events.length = numEvents;
        }

        console.log(`Generated ${events.length} events from ${sessionCount} sessions (avg ${(events.length / sessionCount).toFixed(1)} pages/session)`);
        console.log(`Generated ${events.length}/${numEvents} events...`);

        events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        console.log(`\nPushing events to Tinybird (batch size: ${BATCH_SIZE}, parallel: ${PARALLEL_BATCHES})...`);
        let sentCount = 0;

        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }

        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const parallelBatches = batches.slice(i, i + PARALLEL_BATCHES);

            try {
                await Promise.all(parallelBatches.map(batch => this.sendEventsToTinybird(batch)));
                sentCount += parallelBatches.reduce((sum, b) => sum + b.length, 0);
                console.log(`Sent ${sentCount}/${events.length} events`);
            } catch (error) {
                console.error(`Failed to send batch chunk at offset ${i * BATCH_SIZE}:`, error.message);
                throw error;
            }
        }

        console.log(`\nSuccessfully pushed ${sentCount} events to Tinybird`);
        return sentCount;
    }

    async clearAnalytics() {
        console.log(`\nClearing analytics events...`);

        console.log(`Truncating ${TINYBIRD_DATASOURCE}...`);
        await this.truncateDatasource(TINYBIRD_DATASOURCE);

        console.log(`Truncating ${TINYBIRD_MV_DATASOURCE}...`);
        await this.truncateDatasource(TINYBIRD_MV_DATASOURCE);

        console.log(`Truncating ${TINYBIRD_MV_DAILY_PAGES}...`);
        try {
            await this.truncateDatasource(TINYBIRD_MV_DAILY_PAGES);
        } catch (error) {
            console.log(`  ${TINYBIRD_MV_DAILY_PAGES} not found (may not be deployed yet)`);
        }

        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    async truncateDatasource(datasourceName) {
        const url = `${TINYBIRD_HOST}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.tinybirdToken}`
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

    async close() {
        await this.db.close();
    }
}

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