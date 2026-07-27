const {metaData, settingsCache, config, blogIcon, urlUtils, getFrontendKey, settingsHelpers} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {generateCustomFontCss, isValidCustomFont, isValidCustomHeadingFont} = require('@tryghost/custom-fonts');
const {cardAssets} = require('../services/assets-minification');
const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

/**
 * Write a meta tag string.
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
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
 * Guard: should add metadata section.
 * @param {string[]|null} context
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldAddMetadata(context, excludeList) {
    return !!context && !excludeList.has('metadata');
}

/**
 * Guard: should add structured data.
 * @param {string[]|null} context
 * @param {boolean} useStructuredData
 * @returns {boolean}
 */
function shouldAddStructuredData(context, useStructuredData) {
    return !!context && !_.includes(context, 'paged') && useStructuredData;
}

/**
 * Add basic meta tags (description, icon, canonical, referrer).
 * @param {string[]} head
 * @param {object} meta
 * @param {string[]} context
 * @param {Set<string>} excludeList
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 */
function addMetaTags(head, meta, context, excludeList, referrerPolicy, favicon, iconType) {
    if (excludeList.has('metadata')) {
        return;
    }

    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }

    if (settingsCache.get('icon')) {
        head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }

    head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

    if (_.includes(context, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Add previous/next navigation links.
 * @param {string[]} head
 * @param {object} meta
 */
function addPrevNextLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }
    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

/**
 * Add structured data and schema scripts.
 * @param {string[]} head
 * @param {object} meta
 * @param {string[]} context
 * @param {Set<string>} excludeList
 * @param {boolean} useStructuredData
 */
function addStructuredDataSection(head, meta, context, excludeList, useStructuredData) {
    if (!shouldAddStructuredData(context, useStructuredData)) {
        return;
    }

    if (!excludeList.has('social_data')) {
        head.push('');
        head.push.apply(head, finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }
}

/**
 * Add members, search, announcement, webmention, card assets, comment counts,
 * member attribution, and analytics scripts.
 * @param {string[]} head
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @param {object} dataRoot
 */
function addMembersAndExtras(head, options, frontendKey, excludeList, dataRoot) {
    head.push(getMembersHelper(options.data, frontendKey, excludeList));

    if (!excludeList.has('search')) {
        head.push(getSearchHelper(frontendKey));
    }

    if (!excludeList.has('announcement')) {
        head.push(getAnnouncementBarHelper(options.data));
    }

    try {
        head.push(getWebmentionDiscoveryLink());
    } catch (err) {
        logging.warn(err);
    }

    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Add accent colour style tag.
 * @param {string[]} head
 * @param {object} options
 */
function addAccentColor(head, options) {
    const accent = options.data.site.accent_color;
    if (!accent) {
        return;
    }
    const escaped = escapeExpression(accent);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const idx = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    if (idx !== -1) {
        head[idx] = head[idx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Add global, post and tag code injections.
 * @param {string[]} head
 * @param {string} globalCodeinjection
 * @param {string|null} postCodeInjection
 * @param {string|null} tagCodeInjection
 */
function addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection) {
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
 * Add custom font CSS if valid fonts are provided.
 * @param {string[]} head
 * @param {object} options
 */
function addCustomFonts(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
        return;
    }

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

/**
 * Ghost head helper.
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context || null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (shouldAddMetadata(context, excludeList)) {
            addMetaTags(head, meta, context, excludeList, referrerPolicy, favicon, iconType);
            addPrevNextLinks(head, meta);
            addStructuredDataSection(head, meta, context, excludeList, useStructuredData);
        }

        head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
        head.push('<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">');

        addMembersAndExtras(head, options, frontendKey, excludeList, dataRoot);
        addAccentColor(head, options);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
        addCustomFonts(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;