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
const CONFIG = {
    TINYBIRD_HOST: process.env.TINYBIRD_HOST || 'http://localhost:7181',
    TINYBIRD_DATASOURCE: 'analytics_events',
    TINYBIRD_MV_DATASOURCE: '_mv_hits',
    TINYBIRD_MV_DAILY_PAGES: '_mv_daily_pages',
    DEFAULT_EVENT_COUNT: 10000,
    BATCH_SIZE: 10000,
    PARALLEL_BATCHES: 5,
    DOCKER_VOLUME_NAME: 'ghost-dev_shared-config',
    USER_COUNT: 200,
    SESSION_TIMEOUT_HOURS: 3,
    MONTHS_BACK: 12,
    TIME_POWER: 0.6
};

// Static data definitions
const STATIC_DATA = {
    pages: [
        {value: {pathname: '/', type: 'homepage'}, weight: 40},
        {value: {pathname: '/about/', type: 'page'}, weight: 8},
        {value: {pathname: '/pricing/', type: 'page'}, weight: 6},
        {value: {pathname: '/contact/', type: 'page'}, weight: 4},
        {value: {pathname: '/services/', type: 'page'}, weight: 3},
        {value: {pathname: '/team/', type: 'page'}, weight: 3},
        {value: {pathname: '/privacy/', type: 'page'}, weight: 3},
        {value: {pathname: '/terms/', type: 'page'}, weight: 2}
    ],
    referrers: [
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
    ],
    referrerSourceMap: {
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
    },
    userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1'
    ],
    locales: ['en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP'],
    memberStatuses: [
        {value: 'undefined', weight: 83},
        {value: 'paid', weight: 9},
        {value: 'free', weight: 8}
    ],
    locations: [
        {value: 'US', weight: 62},
        {value: 'GB', weight: 15},
        {value: 'CA', weight: 3},
        {value: 'DE', weight: 3},
        {value: 'FR', weight: 3},
        {value: 'AU', weight: 2},
        {value: 'Others', weight: 12}
    ],
    utmSources: [
        {value: 'google', weight: 25},
        {value: 'facebook', weight: 15},
        {value: 'twitter', weight: 12},
        {value: 'newsletter', weight: 15},
        {value: 'email', weight: 10}
    ],
    utmMediums: [
        {value: 'cpc', weight: 30},
        {value: 'social', weight: 25},
        {value: 'email', weight: 20},
        {value: 'organic', weight: 15},
        {value: 'referral', weight: 10}
    ],
    utmCampaigns: [
        {value: 'spring_sale_2024', weight: 15},
        {value: 'product_launch', weight: 12},
        {value: 'weekly_newsletter', weight: 20},
        {value: 'summer_promotion', weight: 10}
    ],
    postPopularityTiers: [
        {tier: 'viral', weight: 8, multiplier: 50},
        {tier: 'popular', weight: 12, multiplier: 12},
        {tier: 'good', weight: 20, multiplier: 4},
        {tier: 'average', weight: 30, multiplier: 1},
        {tier: 'low', weight: 20, multiplier: 0.2},
        {tier: 'very_low', weight: 10, multiplier: 0.05}
    ]
};

class RandomUtils {
    static generateUuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

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

    static randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
}

class TimestampGenerator {
    static generate(publishedAt = null) {
        const now = new Date();
        const monthsBack = CONFIG.MONTHS_BACK;
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
        const timePosition = Math.pow(Math.random(), CONFIG.TIME_POWER);
        let timestamp = new Date(startDate.getTime() + (timePosition * timeRange));

        const hour = timestamp.getHours();
        if (hour >= 0 && hour < 6 && Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }

        timestamp.setMinutes(Math.floor(Math.random() * 60));
        timestamp.setSeconds(Math.floor(Math.random() * 60));

        if (timestamp > now) {
            timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
        }

        return timestamp;
    }

    static format(date) {
        return date.toISOString().replace('T', ' ').replace('Z', '');
    }
}

class SessionManager {
    constructor() {
        this.userSessions = new Map();
    }

    generateSessionId(userId, timestamp) {
        const userKey = `user_${userId}`;

        if (!this.userSessions.has(userKey)) {
            this.userSessions.set(userKey, []);
        }

        const userSessionData = this.userSessions.get(userKey);

        for (const session of userSessionData) {
            const timeDiff = (timestamp.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);
            if (timeDiff <= CONFIG.SESSION_TIMEOUT_HOURS && timeDiff >= 0) {
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

    clear() {
        this.userSessions.clear();
    }
}

class ContentSelector {
    constructor(posts, postPopularityMap) {
        this.posts = posts;
        this.postPopularityMap = postPopularityMap;
    }

    select() {
        if (Math.random() < 0.4) {
            const staticPage = RandomUtils.weightedChoice(STATIC_DATA.pages);
            return {
                post_uuid: 'undefined',
                post_type: staticPage.type === 'homepage' ? '' : 'page',
                pathname: staticPage.pathname,
                published_at: null
            };
        }

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

        const selectedPost = RandomUtils.randomChoice(weightedPosts);

        return {
            post_uuid: selectedPost.uuid,
            post_type: selectedPost.type,
            pathname: selectedPost.pathname,
            published_at: selectedPost.published_at
        };
    }
}

class EventPayloadBuilder {
    constructor(siteUuid, siteConfig) {
        this.siteUuid = siteUuid;
        this.siteConfig = siteConfig;
    }

    buildPayload(content, memberUuid, memberStatus, referrer, utmParams, isFirstPage = true) {
        const referrerSource = STATIC_DATA.referrerSourceMap[referrer] || referrer;
        const baseUrl = this.siteConfig.url || 'http://localhost:2368';

        let href = `${baseUrl}${content.pathname}`;
        if (isFirstPage && utmParams) {
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
            'user-agent': RandomUtils.randomChoice(STATIC_DATA.userAgents),
            locale: RandomUtils.randomChoice(STATIC_DATA.locales),
            location: RandomUtils.weightedChoice(STATIC_DATA.locations),
            referrer: isFirstPage ? referrer : '',
            pathname: content.pathname,
            href: href,
            meta: {
                referrerSource: isFirstPage ? referrerSource : ''
            }
        };

        if (isFirstPage && utmParams) {
            Object.assign(payload, utmParams);
        }

        return payload;
    }

    buildEvent(timestamp, sessionId, payload) {
        return {
            timestamp: TimestampGenerator.format(timestamp),
            session_id: sessionId,
            action: 'page_hit',
            version: '1',
            payload: payload
        };
    }
}

class TinybirdClient {
    constructor(token) {
        this.token = token;
    }

    async sendEvents(events) {
        const ndjson = events.map(e => JSON.stringify(e)).join('\n');
        const url = `${CONFIG.TINYBIRD_HOST}/v0/events?name=${CONFIG.TINYBIRD_DATASOURCE}`;

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

    async truncateDatasource(datasourceName) {
        const url = `${CONFIG.TINYBIRD_HOST}/v0/datasources/${datasourceName}/truncate`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.token}`
            }
        });