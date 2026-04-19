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
 *
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
 *
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
 * Build members helper section.
 *
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildMembersHelper(options, frontendKey, excludeList) {
    return getMembersHelper(options.data, frontendKey, excludeList);
}

/**
 * Build search helper section.
 *
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildSearchHelper(frontendKey, excludeList) {
    if (excludeList.has('search')) {
        return '';
    }
    return getSearchHelper(frontendKey);
}

/**
 * Build announcement bar helper section.
 *
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildAnnouncementHelper(options, excludeList) {
    if (excludeList.has('announcement')) {
        return '';
    }
    return getAnnouncementBarHelper(options.data);
}

/**
 * Build webmention discovery link.
 *
 * @returns {string}
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
 * Build card assets section.
 *
 * @param {Set<string>} excludeList
 * @returns {string[]}
 */
function buildCardAssets(excludeList) {
    if (excludeList.has('card_assets')) {
        return [];
    }
    const assets = [];
    if (cardAssets.hasFile('js')) {
        assets.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        assets.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
    return assets;
}

/**
 * Build comment counts script.
 *
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildCommentCounts(excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

/**
 * Build member attribution script.
 *
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildMemberAttribution(excludeList) {
    if (excludeList.has('member_attribution') && !(settingsCache.get('members_enabled') && settingsCache.get('members_track_sources'))) {
        return '';
    }
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
    }
    return '';
}

/**
 * Build Tinybird tracker script.
 *
 * @param {object} dataRoot
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildTinybirdTracker(dataRoot, excludeList) {
    if (excludeList.has('tinybird_tracker')) {
        return '';
    }
    return getTinybirdTrackerScript(dataRoot);
}

/**
 * Build accent color style tag.
 *
 * @param {object} options
 * @returns {string}
 */
function buildAccentColorStyle(options) {
    if (!options.data.site.accent_color) {
        return '';
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    return `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
}

/**
 * Build code injection strings.
 *
 * @param {object} options
 * @returns {string[]}
 */
function buildCodeInjections(options) {
    const injections = [];
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const postCodeInjection = options.data.root.post?.codeinjection_head || null;
    const tagCodeInjection = options.data.root.tag?.codeinjection_head || null;

    if (!_.isEmpty(globalCodeinjection)) {
        injections.push(globalCodeinjection);
    }
    if (!_.isEmpty(postCodeInjection)) {
        injections.push(postCodeInjection);
    }
    if (!_.isEmpty(tagCodeInjection)) {
        injections.push(tagCodeInjection);
    }
    return injections;
}

/**
 * Build custom font style tag.
 *
 * @param {object} options
 * @returns {string}
 */
function buildCustomFontStyle(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if (
        (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))
    ) {
        /** @type FontSelection */
        const fontSelection = {};

        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        const customCSS = generateCustomFontCss(fontSelection);
        return new SafeString(customCSS);
    }
    return '';
}

/**
 * Build meta tags for the head section.
 *
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @param {string[]} context
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} safeVersion
 * @returns {string[]}
 */
function buildMetaTags(meta, excludeList, context, referrerPolicy, favicon, iconType, safeVersion) {
    const head = [];

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

    if (!_.includes(context, 'paged') && !excludeList.has('social_data')) {
        head.push('');
        head.push.apply(head, finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
    }

    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

    return head;
}

/**
 * Main ghost_head helper.
 *
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        const head = buildMetaTags(
            meta,
            excludeList,
            context,
            referrerPolicy,
            favicon,
            iconType,
            safeVersion
        );

        head.push(buildMembersHelper(options, frontendKey, excludeList));
        head.push(buildSearchHelper(frontendKey, excludeList));
        head.push(buildAnnouncementHelper(options, excludeList));
        head.push(buildWebmentionLink());
        head.push(...buildCardAssets(excludeList));
        head.push(buildCommentCounts(excludeList));
        head.push(buildMemberAttribution(excludeList));

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(buildTinybirdTracker(dataRoot, excludeList));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        const accentStyle = buildAccentColorStyle(options);
        if (accentStyle) {
            const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
            if (existingScriptIndex !== -1) {
                head[existingScriptIndex] += accentStyle;
            } else {
                head.push(accentStyle);
            }
        }

        head.push(...buildCodeInjections(options));

        const customFontStyle = buildCustomFontStyle(options);
        if (customFontStyle) {
            head.push(customFontStyle);
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```