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

// Configuration
const TINYBIRD_HOST = process.env.TINYBIRD_HOST || 'http://localhost:7181';
const TINYBIRD_DATASOURCE = 'analytics_events';
const TINYBIRD_MV_DATASOURCE = '_mv_hits';
const TINYBIRD_MV_DAILY_PAGES = '_mv_daily_pages';
const DEFAULT_EVENT_COUNT = 10000;
const BATCH_SIZE = 10000; // Events per API request (Tinybird handles large batches well)
const PARALLEL_BATCHES = 5; // Number of concurrent batch uploads
const DOCKER_VOLUME_NAME = 'ghost-dev_shared-config';

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};

        // Will be populated from database with published dates
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

        // Referrer sources based on production data analysis
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
        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            this.tinybirdToken = process.env.TINYBIRD_ADMIN_TOKEN;
            return this.tinybirdToken;
        }

        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            this.tinybirdToken = process.env.TINYBIRD_TRACKER_TOKEN;
            return this.tinybirdToken;
        }

        try {
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = parseEnvFile(envContent);
            this.tinybirdToken = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;
            return this.tinybirdToken;
        } catch (error) {
            throw new Error('Could not retrieve Tinybird token. Ensure yarn dev:analytics is running.');
        }
    }

    async init() {
        await this.fetchTinybirdToken();
        this.siteUuid = await this.db.getSiteUuid();
        this.siteConfig = await this.db.getSiteConfig();
        this.posts = await this.db.getPostsWithDetails({publishedOnly: true});
        this.memberUuids = await this.db.getMemberUuids({limit: 500});
        this.assignPostPopularity();
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

    selectContent() {
        if (Math.random() < 0.4) {
            return this.weightedChoice(this.staticPages);
        }
        if (this.posts.length === 0) {
            return {post_uuid: 'undefined', post_type: '', pathname: '/', published_at: null};
        }
        const weightedPosts = [];
        for (const post of this.posts) {
            const popularity = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            const weight = Math.ceil(popularity.multiplier * 10);
            for (let i = 0; i < weight; i++) {
                weightedPosts.push(post);
            }
        }
        const selectedPost = this.randomChoice(weightedPosts);
        return {
            post_uuid: selectedPost.uuid,
            post_type: selectedPost.type,
            pathname: selectedPost.pathname,
            published_at: selectedPost.published_at
        };
    }

    generateSessionId(userId, timestamp) {
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
        const sessionId = this.generateUuid();
        userSessionData.push({
            sessionId: sessionId,
            startTime: timestamp
        });
        return sessionId;
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

    generateEvent() {
        const userId = Math.floor(Math.random() * this.userCount) + 1;
        const content = this.selectContent();
        const timestamp = this.generateTimestamp(content.published_at);
        const sessionId = this.generateSessionId(userId, timestamp);
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        const referrer = this.weightedChoice(this.referrerWeights);
        let memberUuid;
        if (memberStatus === 'undefined') {
            memberUuid = 'undefined';
        } else if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            memberUuid = this.randomChoice(this.memberUuids);
        } else {
            memberUuid = this.generateUuid();
        }
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const utmParams = this.generateUtmParameters();
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        let href = `${baseUrl}${content.pathname}`;
        if (utmParams) {
            const utmQueryString = Object.entries(utmParams)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('&');
            if (utmQueryString) {
                href = `${href}?${utmQueryString}`;
            }
        }
        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': this.randomChoice(this.userAgents),
            locale: this.randomChoice(this.locales),
            location: this.weightedChoice(this.locationWeights),
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
        return {
            timestamp: this.formatTimestamp(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: payload
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

    generateSession() {
        const sessionId = this.generateUuid();
        let pageCount;
        const r = Math.random();
        if (r < 0.4) {
            pageCount = 1;
        } else if (r < 0.7) {
            pageCount = 2 + Math.floor(Math.random() * 2); // 2-3
        } else if (r < 0.9) {
            pageCount = 4 + Math.floor(Math.random() * 3); // 4-6
        } else {
            pageCount = 7 + Math.floor(Math.random() * 4); // 7-10
        }
        const firstContent = this.selectContent();
        let baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        let memberUuid;
        if (memberStatus === 'undefined') {
            memberUuid = 'undefined';
        } else if (this.memberUuids.length > 0 && Math.random() < 0.7) {
            memberUuid = this.randomChoice(this.memberUuids);
        } else {
            memberUuid = this.generateUuid();
        }
        const userAgent = this.randomChoice(this.userAgents);
        const locale = this.randomChoice(this.locales);
        const location = this.weightedChoice(this.locationWeights);
        const referrer = this.weightedChoice(this.referrerWeights);
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const utmParams = this.generateUtmParameters();
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        const events = [];
        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            let timestamp;
            if (i === 0) {
                timestamp = baseTimestamp;
            } else {
                const offsetSeconds = 30 + Math.floor(Math.random() * 270); // 30-300 seconds
                timestamp = new Date(baseTimestamp.getTime() + (i * offsetSeconds * 1000));
            }
            if (timestamp > new Date()) {
                break;
            }
            let href = `${baseUrl}${content.pathname}`;
            if (i === 0 && utmParams) {
                const utmQueryString = Object.entries(utmParams)
                    .filter(([, value]) => value !== undefined)
                    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                    .join('&');
                if (utmQueryString) {
                    href = `${href}?${utmQueryString}`;
                }
            }
            const payload = {
                site_uuid: this.siteUuid,
                member_uuid: memberUuid,
                member_status: memberStatus,
                post_uuid: content.post_uuid,
                post_type: content.post_type,
                'user-agent': userAgent,
                locale: locale,
                location: location,
                referrer: i === 0 ? referrer : '', // Only first page has external referrer
                pathname: content.pathname,
                href: href,
                meta: {
                    referrerSource: i === 0 ? referrerSource : ''
                }
            };
            if (i === 0 && utmParams) {
                Object.assign(payload, utmParams);
            }
            events.push({
                timestamp: this.formatTimestamp(timestamp),
                session_id: sessionId,
                action: 'page_hit',
                version: '1',
                payload: payload
            });
        }
        return events;
    }

    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);
        this.userSessions.clear();
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
        await this.truncateDatasource(TINYBIRD_DATASOURCE);
        await this.truncateDatasource(TINYBIRD_MV_DATASOURCE);
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

function parseEnvFile(envContent) {
    const config = {};
    const lines = envContent.trim().split('\n');
    for (const line of lines) {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
        }
    }
    return config;
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