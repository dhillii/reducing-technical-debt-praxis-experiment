#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable ghost/ghost-custom/no-native-error */
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

class DockerAnalyticsManager {
    constructor() {
        this.db = new DockerDatabaseUtils();
        this.tinybirdToken = null;
        this.siteUuid = null;
        this.posts = [];
        this.memberUuids = [];
        this.siteConfig = {};

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

    /** Fetch Tinybird token from env or Docker volume */
    async fetchTinybirdToken() {
        console.log('Fetching Tinybird token...');
        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            this.tinybirdToken = process.env.TINYBIRD_ADMIN_TOKEN;
            console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
            return this.tinybirdToken;
        }
        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            this.tinybirdToken = process.env.TINYBIRD_TRACKER_TOKEN;
            console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
            return this.tinybirdToken;
        }
        try {
            console.log('Reading Tinybird config from Docker volume...');
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );
            const config = this.parseEnvFile(envContent);
            if (config.TINYBIRD_ADMIN_TOKEN) {
                this.tinybirdToken = config.TINYBIRD_ADMIN_TOKEN;
                console.log('Tinybird admin token acquired from Docker volume');
                return this.tinybirdToken;
            }
            if (config.TINYBIRD_TRACKER_TOKEN) {
                this.tinybirdToken = config.TINYBIRD_TRACKER_TOKEN;
                console.log('Tinybird tracker token acquired from Docker volume');
                return this.tinybirdToken;
            }
            throw new Error('No token found in Docker volume config');
        } catch (error) {
            this.handleTokenError(error);
        }
    }

    /** Parse .env file content into key/value map */
    parseEnvFile(content) {
        const lines = content.trim().split('\n');
        const config = {};
        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length) {
                config[key.trim()] = valueParts.join('=').trim();
            }
        }
        return config;
    }

    /** Handle errors while fetching Tinybird token */
    handleTokenError(error) {
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

    /** Initialize manager with DB data */
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
        if (!this.posts.length) {
            console.warn('No posts found. Run "yarn reset:data" to generate Ghost data first.');
        }
        return true;
    }

    /** Assign popularity tiers to posts */
    assignPostPopularity() {
        this.postPopularityMap.clear();
        const shuffled = [...this.posts].sort(() => Math.random() - 0.5);
        let index = 0;
        for (const tier of this.postPopularityTiers) {
            const count = Math.ceil((tier.weight / 100) * shuffled.length);
            for (let i = 0; i < count && index < shuffled.length; i++) {
                this.postPopularityMap.set(shuffled[index].uuid, {
                    tier: tier.tier,
                    multiplier: tier.multiplier
                });
                index++;
            }
        }
    }

    /** Generate UUID */
    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /** Weighted random selection */
    weightedChoice(weights) {
        const total = weights.reduce((s, i) => s + i.weight, 0);
        let rand = Math.random() * total;
        for (const item of weights) {
            rand -= item.weight;
            if (rand <= 0) return item.value;
        }
        return weights[weights.length - 1].value;
    }

    /** Random array element */
    randomChoice(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /** Select content (post, page, or homepage) */
    selectContent() {
        if (Math.random() < 0.4) {
            const page = this.weightedChoice(this.staticPages);
            return {
                post_uuid: 'undefined',
                post_type: page.type === 'homepage' ? '' : 'page',
                pathname: page.pathname,
                published_at: null
            };
        }
        if (!this.posts.length) {
            return {
                post_uuid: 'undefined',
                post_type: '',
                pathname: '/',
                published_at: null
            };
        }
        const weighted = this.buildWeightedPostArray();
        const selected = this.randomChoice(weighted);
        return {
            post_uuid: selected.uuid,
            post_type: selected.type,
            pathname: selected.pathname,
            published_at: selected.published_at
        };
    }

    /** Build weighted post array based on popularity */
    buildWeightedPostArray() {
        const arr = [];
        for (const post of this.posts) {
            const pop = this.postPopularityMap.get(post.uuid) || {multiplier: 1};
            const weight = Math.ceil(pop.multiplier * 10);
            for (let i = 0; i < weight; i++) arr.push(post);
        }
        return arr;
    }

    /** Generate or retrieve session ID for a user */
    generateSessionId(userId, timestamp) {
        const key = `user_${userId}`;
        if (!this.userSessions.has(key)) this.userSessions.set(key, []);
        const sessions = this.userSessions.get(key);
        for (const s of sessions) {
            const diff = (timestamp - s.startTime) / (1000 * 60 * 60);
            if (diff >= 0 && diff <= 3) return s.sessionId;
        }
        const newId = this.generateUuid();
        sessions.push({sessionId: newId, startTime: timestamp});
        return newId;
    }

    /** Generate realistic timestamp */
    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const start = this.computeStartDate(now, publishedAt);
        const timeRange = now - start;
        const position = Math.pow(Math.random(), 0.6);
        let ts = new Date(start.getTime() + position * timeRange);
        ts = this.applyDailyPattern(ts);
        ts.setMinutes(Math.floor(Math.random() * 60));
        ts.setSeconds(Math.floor(Math.random() * 60));
        if (ts > now) ts = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        return ts;
    }

    /** Compute start date respecting publication date */
    computeStartDate(now, publishedAt) {
        const twelveMonths = 12 * 30 * 24 * 60 * 60 * 1000;
        let start = new Date(now.getTime() - twelveMonths);
        if (publishedAt) {
            const pub = new Date(publishedAt);
            if (pub > start) start = pub;
        }
        if (start >= now) start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return start;
    }

    /** Reduce overnight traffic by shifting hours */
    applyDailyPattern(date) {
        const hour = date.getHours();
        if (hour >= 0 && hour < 6 && Math.random() < 0.7) {
            date.setHours(9 + Math.floor(Math.random() * 12));
        }
        return date;
    }

    /** Format timestamp for Tinybird */
    formatTimestamp(date) {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }

    /** Generate UTM parameters (or null) */
    generateUtmParameters() {
        if (Math.random() < 0.5) return null;
        return {
            utm_source: this.weightedChoice(this.utmSources),
            utm_medium: this.weightedChoice(this.utmMediums),
            utm_campaign: Math.random() < 0.8 ? this.weightedChoice(this.utmCampaigns) : undefined
        };
    }

    /** Build href with optional UTM query string */
    buildHref(baseUrl, pathname, utmParams) {
        let href = `${baseUrl}${pathname}`;
        if (!utmParams) return href;
        const qs = Object.entries(utmParams)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
            .join('&');
        return qs ? `${href}?${qs}` : href;
    }

    /** Generate a single analytics event */
    generateEvent() {
        const userId = Math.floor(Math.random() * this.userCount) + 1;
        const content = this.selectContent();
        const ts = this.generateTimestamp(content.published_at);
        const sessionId = this.generateSessionId(userId, ts);
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        const referrer = this.weightedChoice(this.referrerWeights);
        const memberUuid = this.resolveMemberUuid(memberStatus);
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const utm = this.generateUtmParameters();
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        const href = this.buildHref(baseUrl, content.pathname, utm);

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: memberUuid,
            member_status: memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': this.randomChoice(this.userAgents),
            locale: this.randomChoice(this.locales),
            location: this.weightedChoice(this.locationWeights),
            referrer,
            pathname: content.pathname,
            href,
            meta: {referrerSource}
        };
        if (utm) Object.assign(payload, utm);
        return {
            timestamp: this.formatTimestamp(ts),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload
        };
    }

    /** Resolve member UUID based on status */
    resolveMemberUuid(status) {
        if (status === 'undefined') return 'undefined';
        if (this.memberUuids.length && Math.random() < 0.7) {
            return this.randomChoice(this.memberUuids);
        }
        return this.generateUuid();
    }

    /** Send events batch to Tinybird */
    async sendEventsToTinybird(events, wait = false) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${TINYBIRD_HOST}/v0/events?name=${TINYBIRD_DATASOURCE}${wait ? '&wait=true' : ''}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.tinybirdToken}`,
                'Content-Type': 'application/x-ndjson'
            },
            body: ndjson
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Tinybird API error: ${res.status} - ${txt}`);
        }
        return await res.json();
    }

    /** Determine page count for a session */
    computePageCount() {
        const r = Math.random();
        if (r < 0.4) return 1;
        if (r < 0.7) return 2 + Math.floor(Math.random() * 2);
        if (r < 0.9) return 4 + Math.floor(Math.random() * 3);
        return 7 + Math.floor(Math.random() * 4);
    }

    /** Build common session attributes */
    buildSessionAttributes() {
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        const memberUuid = this.resolveMemberUuid(memberStatus);
        const userAgent = this.randomChoice(this.userAgents);
        const locale = this.randomChoice(this.locales);
        const location = this.weightedChoice(this.locationWeights);
        const referrer = this.weightedChoice(this.referrerWeights);
        const referrerSource = this.referrerSourceMap[referrer] || referrer;
        const utm = this.generateUtmParameters();
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';
        return {memberStatus, memberUuid, userAgent, locale, location, referrer, referrerSource, utm, baseUrl};
    }

    /** Generate a session with multiple page hits */
    generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this.computePageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const attrs = this.buildSessionAttributes();

        const events = [];
        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const ts = i === 0 ? baseTimestamp : new Date(baseTimestamp.getTime() + i * (30 + Math.floor(Math.random() * 270)) * 1000);
            if (ts > new Date()) break;
            const href = i === 0 ? this.buildHref(attrs.baseUrl, content.pathname, attrs.utm) : `${attrs.baseUrl}${content.pathname}`;
            const payload = {
                site_uuid: this.siteUuid,
                member_uuid: attrs.memberUuid,
                member_status: attrs.memberStatus,
                post_uuid: content.post_uuid,
                post_type: content.post_type,
                'user-agent': attrs.userAgent,
                locale: attrs.locale,
                location: attrs.location,
                referrer: i === 0 ? attrs.referrer : '',
                pathname: content.pathname,
                href,
                meta: {referrerSource: i === 0 ? attrs.referrerSource : ''}
            };
            if (i === 0 && attrs.utm) Object.assign(payload, attrs.utm);
            events.push({
                timestamp: this.formatTimestamp(ts),
                session_id: sessionId,
                action: 'page_hit',
                version: '1',
                payload
            });
        }
        return events;
    }

    /** Generate and push analytics events */
    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        this.userSessions.clear();

        const events = this.collectEvents(numEvents);
        console.log(`Generated ${events.length} events from ${events.sessionCount} sessions (avg ${(events.length / events.sessionCount).toFixed(1)} pages/session)`);
        console.log(`Generated ${events.length}/${numEvents} events...`);

        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const sent = await this.pushBatches(events);
        console.log(`\nSuccessfully pushed ${sent} events to Tinybird`);
        return sent;
    }

    /** Collect events until target count is reached */
    collectEvents(target) {
        const events = [];
        let sessionCount = 0;
        while (events.length < target) {
            const sess = this.generateSession();
            events.push(...sess);
            sessionCount++;
        }
        if (events.length > target) events.length = target;
        return Object.assign(events, {sessionCount});
    }

    /** Push events in parallel batches */
    async pushBatches(events) {
        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }
        let sent = 0;
        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const chunk = batches.slice(i, i + PARALLEL_BATCHES);
            try {
                await Promise.all(chunk.map(b => this.sendEventsToTinybird(b)));
                sent += chunk.reduce((s, b) => s + b.length, 0);
                console.log(`Sent ${sent}/${events.length} events`);
            } catch (err) {
                console.error(`Failed to send batch chunk at offset ${i * BATCH_SIZE}:`, err.message);
                throw err;
            }
        }
        return sent;
    }

    /** Clear analytics data from Tinybird */
    async clearAnalytics() {
        console.log(`\nClearing analytics events...`);
        await this.truncateDatasource(TINYBIRD_DATASOURCE);
        await this.truncateDatasource(TINYBIRD_MV_DATASOURCE);
        try {
            await this.truncateDatasource(TINYBIRD_MV_DAILY_PAGES);
        } catch {
            console.log(`  ${TINYBIRD_MV_DAILY_PAGES} not found (may not be deployed yet)`);
        }
        console.log('All analytics data cleared successfully');
        return {status: 'ok'};
    }

    /** Truncate a Tinybird datasource */
    async truncateDatasource(name) {
        const url = `${TINYBIRD_HOST}/v0/datasources/${name}/truncate`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {Authorization: `Bearer ${this.tinybirdToken}`}
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to truncate ${name}: ${res.status} - ${txt}`);
        }
        console.log(`  ${name} truncated`);
        const txt = await res.text();
        if (txt && txt.trim()) {
            try {
                return JSON.parse(txt);
            } catch {
                return {status: 'ok', message: txt};
            }
        }
        return {status: 'ok'};
    }

    /** Close DB connection */
    async close() {
        await this.db.close();
    }
}

/** Print help message */
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

/** Main CLI handler */
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
    } catch (err) {
        console.error('\nError:', err.message);
        process.exit(1);
    } finally {
        await manager.close();
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = DockerAnalyticsManager;