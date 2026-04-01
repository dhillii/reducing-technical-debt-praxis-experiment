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
 * Token source strategy for fetching Tinybird tokens
 */
const tokenSources = {
    /**
     * Fetch token from environment variables
     */
    environment: () => {
        if (process.env.TINYBIRD_ADMIN_TOKEN) {
            console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
            return process.env.TINYBIRD_ADMIN_TOKEN;
        }
        if (process.env.TINYBIRD_TRACKER_TOKEN) {
            console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
            return process.env.TINYBIRD_TRACKER_TOKEN;
        }
        return null;
    },

    /**
     * Fetch token from Docker volume
     */
    dockerVolume: () => {
        try {
            console.log('Reading Tinybird config from Docker volume...');
            const envContent = execSync(
                `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
                {encoding: 'utf8', timeout: 10000}
            );

            const config = parseEnvContent(envContent);

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
            return null;
        }
    }
};

/**
 * Parse environment file content into key-value pairs
 */
function parseEnvContent(envContent) {
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
 * Handle token fetch errors with appropriate messaging
 */
function handleTokenFetchError(error) {
    if (error.message.includes('No such file') || error.message.includes('No token found')) {
        console.error('Tinybird config not found in Docker volume.');
        console.error('Make sure Tinybird is running: yarn dev:analytics');
    } else if (error.message.includes('Cannot connect to the Docker daemon')) {
        console.error('Docker is not running. Please start Docker first.');
    } else {
        console.error('Failed to fetch Tinybird token:', error.message);
    }
}

/**
 * Determine page count distribution for a session
 */
function determinePageCount() {
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

/**
 * Determine member UUID based on status and available members
 */
function determineMemberUuid(memberStatus, memberUuids) {
    if (memberStatus === 'undefined') {
        return 'undefined';
    } else if (memberUuids.length > 0 && Math.random() < 0.7) {
        return memberUuids[Math.floor(Math.random() * memberUuids.length)];
    } else {
        return generateUuid();
    }
}

/**
 * Generate UUID
 */
function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Weighted random selection
 */
function weightedChoice(weights) {
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
 * Random array element
 */
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Apply realistic daily hour patterns to timestamp
 */
function applyDailyPattern(timestamp) {
    const hour = timestamp.getHours();

    if (hour >= 0 && hour < 6) {
        if (Math.random() < 0.7) {
            timestamp.setHours(9 + Math.floor(Math.random() * 12));
        }
    }

    timestamp.setMinutes(Math.floor(Math.random() * 60));
    timestamp.setSeconds(Math.floor(Math.random() * 60));

    return timestamp;
}

/**
 * Ensure timestamp is not in the future
 */
function ensureNotFuture(timestamp) {
    const now = new Date();
    if (timestamp > now) {
        return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    }
    return timestamp;
}

/**
 * Build href with optional UTM parameters
 */
function buildHref(baseUrl, pathname, utmParams) {
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

/**
 * Create event payload object
 */
function createEventPayload(config) {
    const {siteUuid, memberUuid, memberStatus, content, userAgent, locale, location, referrer, baseUrl, utmParams, referrerSource} = config;

    const payload = {
        site_uuid: siteUuid,
        member_uuid: memberUuid,
        member_status: memberStatus,
        post_uuid: content.post_uuid,
        post_type: content.post_type,
        'user-agent': userAgent,
        locale: locale,
        location: location,
        referrer: referrer,
        pathname: content.pathname,
        href: buildHref(baseUrl, content.pathname, utmParams),
        meta: {
            referrerSource: referrerSource
        }
    };

    if (utmParams) {
        Object.assign(payload, utmParams);
    }

    return payload;
}

/**
 * Create event object
 */
function createEvent(timestamp, sessionId, payload) {
    return {
        timestamp: formatTimestamp(timestamp),
        session_id: sessionId,
        action: 'page_hit',
        version: '1',
        payload: payload
    };
}

/**
 * Format timestamp for Tinybird
 */
function formatTimestamp(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '');
}

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

    /**
     * Fetch the Tinybird token from Docker volume or environment
     */
    async fetchTinybirdToken() {
        console.log('Fetching Tinybird token...');

        for (const [sourceName, sourceFunc] of Object