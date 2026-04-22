#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable ghost/ghost-custom/no-native-error */
const DockerDatabaseUtils = require('./docker-database-utils');
const {execSync} = require('child_process');
const fetch = require('node-fetch');

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
            const config = {};
            for (const line of envContent.trim().split('\n')) {
                const [key, ...valueParts] = line.split('=');
                if (key && valueParts.length) {
                    config[key.trim()] = valueParts.join('=').trim();
                }
            }
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

    assignPostPopularity() {
        this.postPopularityMap.clear();
        const shuffled = [...this.posts].sort(() => Math.random() - 0.5);
        let idx = 0;
        for (const tier of this.postPopularityTiers) {
            const count = Math.ceil((tier.weight / 100) * shuffled.length);
            for (let i = 0; i < count && idx < shuffled.length; i++) {
                this.postPopularityMap.set(shuffled[idx].uuid, {tier: tier.tier, multiplier: tier.multiplier});
                idx++;
            }
        }
    }

    generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    weightedChoice(weights) {
        const total = weights.reduce((s, i) => s + i.weight, 0);
        let r = Math.random() * total;
        for (const item of weights) {
            r -= item.weight;
            if (r <= 0) return item.value;
        }
        return weights[weights.length - 1].value;
    }

    randomChoice(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    selectContent() {
        if (Math.random() < 0.4) {
            const page = this.weightedChoice(this.staticPages);
            return {post_uuid: 'undefined', post_type: page.type === 'homepage' ? '' : 'page', pathname: page.pathname, published_at: null};
        }
        if (!this.posts.length) {
            return {post_uuid: 'undefined', post_type: '', pathname: '/', published_at: null};
        }
        const weighted = [];
        for (const post of this.posts) {
            const mult = (this.postPopularityMap.get(post.uuid)?.multiplier) || 1;
            const weight = Math.ceil(mult * 10);
            for (let i = 0; i < weight; i++) weighted.push(post);
        }
        const chosen = this.randomChoice(weighted);
        return {post_uuid: chosen.uuid, post_type: chosen.type, pathname: chosen.pathname, published_at: chosen.published_at};
    }

    generateSessionId(userId, timestamp) {
        const key = `user_${userId}`;
        if (!this.userSessions.has(key)) this.userSessions.set(key, []);
        const sessions = this.userSessions.get(key);
        for (const s of sessions) {
            const diff = (timestamp - s.startTime) / (1000 * 60 * 60);
            if (diff >= 0 && diff <= 3) return s.sessionId;
        }
        const id = this.generateUuid();
        sessions.push({sessionId: id, startTime: timestamp});
        return id;
    }

    generateTimestamp(publishedAt = null) {
        const now = new Date();
        const monthsBack = 12;
        let start = new Date(now.getTime() - monthsBack * 30 * 24 * 60 * 60 * 1000);
        if (publishedAt) {
            const pub = new Date(publishedAt);
            if (pub > start) start = pub;
        }
        if (start >= now) start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const range = now - start;
        const pos = Math.pow(Math.random(), 0.6);
        let ts = new Date(start.getTime() + pos * range);
        const hour = ts.getHours();
        if (hour < 6 && Math.random() < 0.7) ts.setHours(9 + Math.floor(Math.random() * 12));
        ts.setMinutes(Math.floor(Math.random() * 60));
        ts.setSeconds(Math.floor(Math.random() * 60));
        if (ts > now) ts = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        return ts;
    }

    formatTimestamp(date) {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }

    generateUtmParameters() {
        if (Math.random() < 0.5) return null;
        return {
            utm_source: this.weightedChoice(this.utmSources),
            utm_medium: this.weightedChoice(this.utmMediums),
            utm_campaign: Math.random() < 0.8 ? this.weightedChoice(this.utmCampaigns) : undefined
        };
    }

    /*** Session helpers ***/
    _determinePageCount() {
        const r = Math.random();
        if (r < 0.4) return 1;
        if (r < 0.7) return 2 + Math.floor(Math.random() * 2);
        if (r < 0.9) return 4 + Math.floor(Math.random() * 3);
        return 7 + Math.floor(Math.random() * 4);
    }

    _buildBaseAttributes() {
        const memberStatus = this.weightedChoice(this.memberStatusWeights);
        let memberUuid = 'undefined';
        if (memberStatus !== 'undefined' && this.memberUuids.length && Math.random() < 0.7) {
            memberUuid = this.randomChoice(this.memberUuids);
        } else if (memberStatus !== 'undefined') {
            memberUuid = this.generateUuid();
        }
        return {
            memberStatus,
            memberUuid,
            userAgent: this.randomChoice(this.userAgents),
            locale: this.randomChoice(this.locales),
            location: this.weightedChoice(this.locationWeights),
            referrer: this.weightedChoice(this.referrerWeights),
            referrerSource: null,
            utmParams: this.generateUtmParameters()
        };
    }

    _buildEventPayload(base, content, isEntry) {
        const hrefBase = `${this.siteConfig.url || 'http://localhost:2368'}${content.pathname}`;
        let href = hrefBase;
        if (isEntry && base.utmParams) {
            const qs = Object.entries(base.utmParams)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join('&');
            if (qs) href = `${href}?${qs}`;
        }

        const payload = {
            site_uuid: this.siteUuid,
            member_uuid: base.memberUuid,
            member_status: base.memberStatus,
            post_uuid: content.post_uuid,
            post_type: content.post_type,
            'user-agent': base.userAgent,
            locale: base.locale,
            location: base.location,
            referrer: isEntry ? base.referrer : '',
            pathname: content.pathname,
            href,
            meta: {referrerSource: isEntry ? base.referrerSource : ''}
        };
        if (isEntry && base.utmParams) Object.assign(payload, base.utmParams);
        return payload;
    }

    generateSession() {
        const sessionId = this.generateUuid();
        const pageCount = this._determinePageCount();
        const firstContent = this.selectContent();
        const baseTimestamp = this.generateTimestamp(firstContent.published_at);
        const baseAttrs = this._buildBaseAttributes();
        baseAttrs.referrerSource = this.referrerSourceMap[baseAttrs.referrer] || baseAttrs.referrer;

        const events = [];
        for (let i = 0; i < pageCount; i++) {
            const content = i === 0 ? firstContent : this.selectContent();
            const timestamp = i === 0 ? baseTimestamp : new Date(baseTimestamp.getTime() + i * (30 + Math.floor(Math.random() * 270)) * 1000);
            if (timestamp > new Date()) break;

            const payload = this._buildEventPayload(baseAttrs, content, i === 0);
            events.push({
                timestamp: this.formatTimestamp(timestamp),
                session_id: sessionId,
                action: 'page_hit',
                version: '1',
                payload
            });
        }
        return events;
    }

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
        return res.json();
    }

    async generateAnalytics(numEvents = DEFAULT_EVENT_COUNT) {
        console.log(`\nGenerating ${numEvents} analytics events...`);
        console.log(`Site UUID: ${this.siteUuid}`);
        console.log(`Batch size: ${BATCH_SIZE}`);

        this.userSessions.clear();
        const events = [];

        while (events.length < numEvents) {
            events.push(...this.generateSession());
        }
        if (events.length > numEvents) events.length = numEvents;

        console.log(`Generated ${events.length} events`);
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const batches = [];
        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            batches.push(events.slice(i, i + BATCH_SIZE));
        }

        let sent = 0;
        console.log(`\nPushing events to Tinybird (parallel: ${PARALLEL_BATCHES})...`);
        for (let i = 0; i < batches.length; i += PARALLEL_BATCHES) {
            const chunk = batches.slice(i, i + PARALLEL_BATCHES);
            try {
                await Promise.all(chunk.map(b => this.sendEventsToTinybird(b)));
                sent += chunk.reduce((s, b) => s + b.length, 0);
                console.log(`Sent ${sent}/${events.length} events`);
            } catch (err) {
                console.error(`Failed batch at offset ${i * BATCH_SIZE}:`, err.message);
                throw err;
            }
        }

        console.log(`\nSuccessfully pushed ${sent} events to Tinybird`);
        return sent;
    }

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

    async close() {
        await this.db.close();
    }
}

/*** CLI ***/
function printHelp() {
    console.log(`
Usage:
  node docker-analytics-manager.js generate [count]  - Generate analytics events
  node docker-analytics-manager.js clear           - Clear all analytics events

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
    const cmd = args[0];

    console.log('Docker Analytics Manager');
    console.log('='.repeat(50));

    if (!cmd || cmd === 'help' || args.includes('--help') || args.includes('-h')) {
        printHelp();
        return;
    }

    const manager = new DockerAnalyticsManager();
    try {
        await manager.init();
        if (cmd === 'generate') {
            const count = parseInt(args[1]) || DEFAULT_EVENT_COUNT;
            await manager.generateAnalytics(count);
        } else if (cmd === 'clear') {
            await manager.clearAnalytics();
        } else {
            console.error(`Unknown command: ${cmd}`);
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