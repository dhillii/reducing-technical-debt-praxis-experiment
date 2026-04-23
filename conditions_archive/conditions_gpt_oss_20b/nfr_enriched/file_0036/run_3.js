```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
const {
    metaData,
    settingsCache,
    config,
    blogIcon,
    urlUtils,
    getFrontendKey,
    settingsHelpers
} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {
    generateCustomFontCss,
    isValidCustomFont,
    isValidCustomHeadingFont
} = require('@tryghost/custom-fonts');
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
 * Write a meta tag.
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Finalise structured data meta tags.
 * @param {object} meta
 * @returns {string[]}
 */
function finaliseStructuredData(meta) {
    const head = [];

    _.each(meta.structuredData, function (content, property) {
        if (property === 'article:tag') {
            _.each(meta.keywords, function (keyword) {
                if (keyword !== '') {
                    keyword = escapeExpression(keyword);
                    head.push(writeMetaTag(property, escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content !== null && content !== undefined) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });

    return head;
}

/**
 * Build meta tags for description, icon, canonical, robots, referrer, navigation links.
 * @param {object} meta
 * @param {string[]} context
 * @param {Set<string>} excludeList
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} safeVersion
 * @param {string[]} head
 */
function buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion, head) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
        }

        if (settingsCache.get('icon')) {
            head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
        }

        head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

        if (_.includes(context, 'preview')) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
        }
    }

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

/**
 * Build structured data and schema scripts.
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildStructuredAndSchema(meta, excludeList, head) {
    if (!_.includes(meta.context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push.apply(head, finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
        }
    }
}

/**
 * Build alternate RSS link.
 * @param {object} meta
 * @param {string[]} head
 */
function buildAlternateRss(meta, head) {
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
}

/**
 * Build members helper script.
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildMembersHelper(options, frontendKey, excludeList, head) {
    head.push(getMembersHelper(options.data, frontendKey, excludeList));
}

/**
 * Build search helper script.
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildSearchHelper(frontendKey, excludeList, head) {
    if (!excludeList.has('search')) {
        head.push(getSearchHelper(frontendKey));
    }
}

/**
 * Build announcement bar helper script.
 * @param {object} options
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildAnnouncementBarHelper(options, excludeList, head) {
    if (!excludeList.has('announcement')) {
        head.push(getAnnouncementBarHelper(options.data));
    }
}

/**
 * Build webmention discovery link.
 * @param {string[]} head
 */
function buildWebmentionLink(head) {
    try {
        head.push(getWebmentionDiscoveryLink());
    } catch (err) {
        logging.warn(err);
    }
}

/**
 * Build card assets scripts and styles.
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildCardAssets(excludeList, head) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Build comment counts script.
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildCommentCounts(excludeList, head) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Build member attribution script.
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildMemberAttribution(excludeList, head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Build Tinybird tracker script and set analytics flag.
 * @param {object} dataRoot
 * @param {Set<string>} excludeList
 * @param {string[]} head
 */
function buildTinybirdTracker(dataRoot, excludeList, head) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Build accent color style tag.
 * @param {object} options
 * @param {string[]} head
 */
function buildAccentColorStyle(options, head) {
    if (options.data.site.accent_color) {
        const accentColor = escapeExpression(options.data.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

        if (existingScriptIndex !== -1) {
            head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
        } else {
            head.push(styleTag);
        }
    }
}

/**
 * Build global, post, and tag code injections.
 * @param {object} options
 * @param {string[]} head
 */
function buildCodeInjections(options, head) {
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const postCodeInjection = options.data.root.post?.codeinjection_head ?? null;
    const tagCodeInjection = options.data.root.tag?.codeinjection_head ?? null;

    if (!_.isEmpty(globalCodeinjection)) {
        head.push(globalCodeinjection);
    }
    if (!_.isEmpty(postCodeInjection)) {
        head.push(postCodeInjection);
    }
    if (!_.isEmpty(tagCodeInjection)) {
        head.push(tagCodeInjection);
    }
}

/**
 * Build custom font CSS if applicable.
 * @param {object} options
 * @param {string[]} head
 */
function buildCustomFontStyle(options, head) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        /** @type FontSelection */
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
}

/**
 * Ghost head helper.
 * @param {object} options
 * @returns {SafeString}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    // if server error page do nothing
    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (context) {
            buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, options.data.site.safeVersion, head);
            buildStructuredAndSchema(meta, excludeList, head);
        }

        head.push(`<meta name="generator" content="Ghost ${escapeExpression(options.data.site.safeVersion)}">`);
        buildAlternateRss(meta, head);

        buildMembersHelper(options, frontendKey, excludeList, head);
        buildSearchHelper(frontendKey, excludeList, head);
        buildAnnouncementBarHelper(options, excludeList, head);
        buildWebmentionLink(head);
        buildCardAssets(excludeList, head);
        buildCommentCounts(excludeList, head);
        buildMemberAttribution(excludeList, head);
        buildTinybirdTracker(dataRoot, excludeList, head);
        buildAccentColorStyle(options, head);
        buildCodeInjections(options, head);
        buildCustomFontStyle(options, head);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```