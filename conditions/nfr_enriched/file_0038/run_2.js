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

const TINYBIRD_HOST = process.env.TINYBIRD_HOST || 'http://localhost:7181';
const TINYBIRD_DATASOURCE = 'analytics_events';
const TINYBIRD_MV_DATASOURCE = '_mv_hits';
const TINYBIRD_MV_DAILY_PAGES = '_mv_daily_pages';
const DEFAULT_EVENT_COUNT = 10000;
const BATCH_SIZE = 10000;
const PARALLEL_BATCHES = 5;
const DOCKER_VOLUME_NAME = 'ghost-dev_shared-config';

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

const USER_COUNT = 200;

// --- Pure utility functions ---

function generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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

function buildHref(baseUrl, pathname, utmParams) {
    const href = `${baseUrl}${pathname}`;
    if (!utmParams) {
        return href;
    }
    const qs = buildUtmQueryString(utmParams);
    return qs ? `${href}?${qs}` : href;
}

function parseEnvContent(content) {
    return content.trim().split('\n').reduce((config, line) => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            config[key.trim()] = valueParts.join('=').trim();
        }
        return config;
    }, {});
}

function selectSessionPageCount() {
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

function generateTimestamp(publishedAt = null) {
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
    const timePosition = Math.pow(Math.random(), 0.6);
    const timestamp = new Date(startDate.getTime() + (timePosition * timeRange));

    if (timestamp.getHours() < 6 && Math.random() < 0.7) {
        timestamp.setHours(9 + Math.floor(Math.random() * 12));
    }

    timestamp.setMinutes(Math.floor(Math.random() * 60));
    timestamp.setSeconds(Math.floor(Math.random() * 60));

    if (timestamp > now) {
        return new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);
    }

    return timestamp;
}

// --- Tinybird API ---

async function tinybirdRequest(method, path, token, body = null) {
    const options = {
        method,
        headers: {Authorization: `Bearer ${token}`}
    };

    if (body) {
        options.headers['Content-Type'] = 'application/x-ndjson';
        options.body = body;
    }

    const response = await fetch(`${TINYBIRD_HOST}${path}`, options);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Tinybird API error [${method} ${path}]: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    if (!text || !text.trim()) {
        return {status: 'ok'};
    }

    try {
        return JSON.parse(text);
    } catch {
        return {status: 'ok', message: text};
    }
}

async function sendEventsToTinybird(events, token, wait = false) {
    const ndjson = events.map(e => JSON.stringify(e)).join('\n');
    const waitParam = wait ? '&wait=true' : '';
    return tinybirdRequest('POST', `/v0/events?name=${TINYBIRD_DATASOURCE}${waitParam}`, token, ndjson);
}

async function truncateDatasource(datasourceName, token) {
    const result = await tinybirdRequest('POST', `/v0/datasources/${datasourceName}/truncate`, token);
    console.log(`  ${datasourceName} truncated`);
    return result;
}

// --- Token fetching ---

async function fetchTinybirdToken() {
    console.log('Fetching Tinybird token...');

    if (process.env.TINYBIRD_ADMIN_TOKEN) {
        console.log('Using TINYBIRD_ADMIN_TOKEN from environment');
        return process.env.TINYBIRD_ADMIN_TOKEN;
    }

    if (process.env.TINYBIRD_TRACKER_TOKEN) {
        console.log('Using TINYBIRD_TRACKER_TOKEN from environment');
        return process.env.TINYBIRD_TRACKER_TOKEN;
    }

    try {
        console.log('Reading Tinybird config from Docker volume...');
        const envContent = execSync(
            `docker run --rm -v ${DOCKER_VOLUME_NAME}:/config alpine cat /config/.env.tinybird 2>/dev/null`,
            {encoding: 'utf8', timeout: 10000}
        );

        const config = parseEnvContent(envContent);

        const token = config.TINYBIRD_ADMIN_TOKEN || config.TINYBIRD_TRACKER_TOKEN;
        if (!token) {
            throw new Error('No token found in Docker volume config');
        }

        const tokenType = config.TINYBIRD_ADMIN_TOKEN ? 'admin' : 'tracker';
        console.log(`Tinybird ${tokenType} token acquired from Docker volume`);
        return token;
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

// --- Post popularity ---

function assignPostPopularity(posts) {
    const popularityMap = new Map();
    const shuffled = [...posts].sort(() => Math.random() - 0.5);
    let postIndex = 0;

    for (const tier of POST_POPULARITY_TIERS) {
        const tierCount = Math.ceil((tier.weight / 100) * shuffled.length);
        for (let i = 0; i < tierCount && postIndex < shuffled.length; i++) {
            popularityMap.set(shuffled[postIndex].uuid, {tier: tier.tier, multiplier: tier.multiplier});
            postIndex += 1;
        }
    }

    return popularityMap;
}

function buildWeightedPostPool(posts, popularityMap) {
    const pool = [];
    for (const post of posts) {
        const popularity = popularityMap.get(post