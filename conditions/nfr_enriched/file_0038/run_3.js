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
class AnalyticsConfigProvider {
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
    constructor(posts, postPopularityMap, staticPages) {
        this.posts = posts;
        this.postPopularityMap = postPopularityMap;
        this.staticPages = staticPages;
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
        const staticPage = RandomUtils.weightedChoice(this.staticPages);
        return {
            post_uuid: 'undefined',
            post_type: staticPage.type === 'homepage' ? '' : 'page',
            pathname: staticPage.pathname,
            published_at: null
        };
    }

    /**
     * Select a post based on popularity
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

    /**
     * Get default content when no posts available
     */
    getDefaultContent() {
        return {
            post_uuid: 'undefined',
            post_type: '',
            pathname: '/',
            published_at: null
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
    constructor(siteUuid, siteConfig, referrerSourceMap) {
        this.siteUuid = siteUuid;
        this.siteConfig = siteConfig;
        this.referrerSourceMap = referrerSourceMap;
    }

    /**
     * Build event payload for a page view
     */
    buildPayload(content, memberUuid, memberStatus, userAgent, locale, location, referrer, pathname, href, utmParams, isFirstPage = true) {
        const referrerSource = this.referrerSourceMap[referrer] || referrer;

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

        if (isFirstPage && utmParams) {
            Object.assign(payload, utmParams);
        }

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
    buildHref(pathname, utmParams = null