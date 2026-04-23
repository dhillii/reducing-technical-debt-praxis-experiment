```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
const {metaData, settingsCache, config, blogIcon, urlUtils, getFrontendKey, settingsHelpers} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {generateCustomFontCss, isValidCustomFont, isValidCustomHeadingFont} = require('@tryghost/custom-fonts');
// BAD REQUIRE
// @TODO fix this require
const {cardAssets} = require('../services/assets-minification');

const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

const {get: getMetaData, getAssetUrl} = metaData;

/**
 * Prepares the data root and extracts necessary context information
 * @param {Object} options - The options object containing data
 * @returns {Object} Prepared data object with extracted context
 */
function prepareDataRoot(options) {
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    return {
        dataRoot,
        context,
        safeVersion,
        postCodeInjection,
        tagCodeInjection,
        globalCodeinjection,
        useStructuredData,
        referrerPolicy,
        favicon,
        iconType
    };
}

/**
 * Builds meta tags for the document head
 * @param {Object} meta - Metadata object
 * @param {Object} dataRoot - Data root object
 * @param {Set} excludeList - List of excluded items
 * @returns {Array} Array of meta tag strings
 */
function buildMetaTags(meta, dataRoot, excludeList) {
    const head = [];
    const context = dataRoot.context;

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
        }

        if (settingsCache.get('icon')) {
            head.push(`<link rel="icon" href="${dataRoot.favicon}" type="image/${dataRoot.iconType}">`);
        }

        head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

        if (_.includes(context, 'preview')) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', dataRoot.referrerPolicy, 'name'));
        }
    }

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    if (!_.includes(context, 'paged') && dataRoot.useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push(...finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
        }
    }

    return head;
}

/**
 * Builds link tags for the document head
 * @param {Object} meta - Metadata object
 * @param {Object} dataRoot - Data root object
 * @returns {Array} Array of link tag strings
 */
function buildLinkTags(meta, dataRoot) {
    const head = [];
    head.push(`<meta name="generator" content="Ghost ${escapeExpression(dataRoot.safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
    return head;
}

/**
 * Builds script tags for members functionality
 * @param {Object} data - Data object
 * @param {string} frontendKey - Frontend key
 * @param {Set} excludeList - List of excluded items
 * @returns {string} Script tag string
 */
function buildMembersScript(data, frontendKey, excludeList) {
    return getMembersHelper(data, frontendKey, excludeList);
}

/**
 * Builds script tags for search functionality
 * @param {string} frontendKey - Frontend key
 * @returns {string} Script tag string
 */
function buildSearchScript(frontendKey) {
    return getSearchHelper(frontendKey);
}

/**
 * Builds script tags for announcement bar
 * @param {Object} data - Data object
 * @returns {string} Script tag string
 */
function buildAnnouncementScript(data) {
    return getAnnouncementBarHelper(data);
}

/**
 * Builds webmention discovery link
 * @returns {string} Link tag string
 */
function buildWebmentionLink() {
    try {
        const siteUrl = urlUtils.getSiteUrl();
        const webmentionUrl = new URL('webmentions/receive/', siteUrl);
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

/**
 * Builds Tinybird tracker script
 * @param {Object} dataRoot - Data root object
 * @returns {string} Script tag string
 */
function buildTinybirdScript(dataRoot) {
    return getTinybirdTrackerScript(dataRoot);
}

/**
 * Builds card assets script and style tags
 * @param {Set} excludeList - List of excluded items
 * @returns {Array} Array of script and style tag strings
 */
function buildCardAssets(excludeList) {
    const head = [];
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
    return head;
}

/**
 * Builds comment counts script
 * @returns {string} Script tag string
 */
function buildCommentCountsScript() {
    if (!settingsCache.get('comments_enabled') === 'off') {
        return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
    }
    return '';
}

/**
 * Builds member attribution script
 * @returns {string} Script tag string
 */
function buildMemberAttributionScript() {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
    }
    return '';
}

/**
 * Injects accent color style tag
 * @param {Object} dataRoot - Data root object
 * @param {Array} head - Current head array
 * @returns {Array} Updated head array with accent color
 */
function injectAccentColor(dataRoot, head) {
    if (dataRoot.dataRoot.site.accent_color) {
        const accentColor = escapeExpression(dataRoot.dataRoot.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

        if (existingScriptIndex !== -1) {
            head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
        } else {
            head.push(styleTag);
        }
    }
    return head;
}

/**
 * Injects custom font CSS
 * @param {Object} dataRoot - Data root object
 * @param {Array} head - Current head array
 * @returns {Array} Updated head array with custom fonts
 */
function injectCustomFonts(dataRoot, head) {
    const isSitePreview = dataRoot.dataRoot.site._preview ?? false;
    const headingFont = isSitePreview ? dataRoot.dataRoot.site.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot.dataRoot.site.body_font : settingsCache.get('body_font');

    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        const customCSS = generateCustomFontCss(fontSelection);
        head.push(new SafeString(customCSS));
    }
    return head;
}

/**
 * Injects code injection from settings
 * @param {Object} dataRoot - Data root object
 * @param {Array} head - Current head array
 * @returns {Array} Updated head array with code injection
 */
function injectCodeInjection(dataRoot, head) {
    if (!_.isEmpty(dataRoot.globalCodeinjection)) {
        head.push(dataRoot.globalCodeinjection);
    }
    if (!_.isEmpty(dataRoot.postCodeInjection)) {
        head.push(dataRoot.postCodeInjection);
    }
    if (!_.isEmpty(dataRoot.tagCodeInjection)) {
        head.push(dataRoot.tagCodeInjection);
    }
    return head;
}

/**
 * Injects web analytics script
 * @param {Object} dataRoot - Data root object
 * @param {Array} head - Current head array
 * @returns {Array} Updated head array with analytics script
 */
function injectWebAnalytics(dataRoot, head) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(buildTinybirdScript(dataRoot));
        if (dataRoot.dataRoot._locals) {
            dataRoot.dataRoot._locals.ghostAnalytics = true;
        }
    }
    return head;
}

/**
 * Main Ghost Head helper function
 * @param {Object} options - Options object containing data and hash
 * @returns {SafeString} SafeString containing the head content
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    // If server error page do nothing
    if (options.data.root.statusCode >= 500) {
        return new SafeString('');
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = prepareDataRoot(options);
    const meta = await getMetaData(dataRoot.dataRoot, dataRoot.dataRoot);
    const frontendKey = await getFrontendKey();

    debug('end fetch');

    const head = [];

    // Build meta tags
    head.push(...buildMetaTags(meta, dataRoot, excludeList));

    // Build link tags
    head.push(...buildLinkTags(meta, dataRoot));

    // Build script tags
    head.push(buildMembersScript(options.data, frontendKey, excludeList));
    if (!excludeList.has('search')) {
        head.push(buildSearchScript(frontendKey));
    }
    if (!excludeList.has('announcement')) {
        head.push(buildAnnouncementScript(options.data));
    }
    try {
        head.push(buildWebmentionLink());
    } catch (err) {
        logging.warn(err);
    }

    // Build card assets
    head.push(...buildCardAssets(excludeList));

    // Build comment counts script
    head.push(buildCommentCountsScript());

    // Build member attribution script
    head.push(buildMemberAttributionScript());

    // Inject web analytics
    head = injectWebAnalytics(dataRoot, head);

    // Inject accent color
    head = injectAccentColor(dataRoot, head);

    // Inject code injection
    head = injectCodeInjection(dataRoot, head);

    // Inject custom fonts
    head = injectCustomFonts(dataRoot, head);

    debug('end');
    return new SafeString(head.join('\n    ').trim());
};

module.exports.async = true;
```