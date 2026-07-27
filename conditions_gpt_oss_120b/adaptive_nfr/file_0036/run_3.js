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

const {get: getMetaData, getAssetUrl} = metaData;

/**
 * Write a meta tag string.
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
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
                    head.push(writeMetaTag(property,
                        escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content !== null && content !== undefined) {
            head.push(writeMetaTag(property,
                escapeExpression(content)));
        }
    });

    return head;
}

/**
 * Guard: check if response is a server error page.
 * @param {object} options
 * @returns {boolean}
 */
function isServerError(options) {
    return options?.data?.root?.statusCode >= 500;
}

/**
 * Extract exclude list from options.
 * @param {object} options
 * @returns {Set<string>}
 */
function getExcludeSet(options) {
    return new Set(options?.hash?.exclude?.split(',') || []);
}

/**
 * Check if a context array includes a value.
 * @param {string[]|null} context
 * @param {string} value
 * @returns {boolean}
 */
function hasContext(context, value) {
    return Array.isArray(context) && context.includes(value);
}

/**
 * Determine if the request is a preview.
 * @param {string[]|null} context
 * @returns {boolean}
 */
function isPreviewContext(context) {
    return hasContext(context, 'preview');
}

/**
 * Determine if the request is paged.
 * @param {string[]|null} context
 * @returns {boolean}
 */
function isPaged(context) {
    return hasContext(context, 'paged');
}

/**
 * Decide whether to add metadata tags.
 * @param {string[]|null} context
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldAddMetaData(context, excludeList) {
    return !!context && !excludeList.has('metadata');
}

/**
 * Decide whether to add social/structured data.
 * @param {string[]|null} context
 * @param {Set<string>} excludeList
 * @param {boolean} useStructuredData
 * @returns {boolean}
 */
function shouldAddSocialData(context, excludeList, useStructuredData) {
    return !excludeList.has('social_data') && !isPaged(context) && useStructuredData;
}

/**
 * Decide whether to add schema script.
 * @param {Set<string>} excludeList
 * @param {object} meta
 * @returns {boolean}
 */
function shouldAddSchema(excludeList, meta) {
    return !excludeList.has('schema') && !!meta.schema;
}

/**
 * Decide whether to add search helper.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldAddSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Add meta tags and related links to head.
 * @param {string[]} head
 * @param {object} meta
 * @param {string} safeVersion
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} referrerPolicy
 * @param {Set<string>} excludeList
 * @param {string[]|null} context
 */
function addMetaTags(head, meta, safeVersion, favicon, iconType, referrerPolicy, excludeList, context) {
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }
    if (settingsCache.get('icon')) {
        head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }
    head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);
    if (isPreviewContext(context)) {
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
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

/**
 * Add card assets scripts/styles.
 * @param {string[]} head
 * @param {Set<string>} excludeList
 */
function addCardAssets(head, excludeList) {
    if (excludeList.has('card_assets')) {
        return;
    }
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

/**
 * Add comment count script.
 * @param {string[]} head
 * @param {Set<string>} excludeList
 */
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts')) {
        return;
    }
    if (settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Add member attribution script.
 * @param {string[]} head
 */
function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Add analytics tracker script and flag.
 * @param {string[]} head
 * @param {object} dataRoot
 */
function addAnalytics(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }
    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Add accent color style tag.
 * @param {string[]} head
 * @param {object} options
 */
function addAccentColorStyle(head, options) {
    const accent = options.data.site.accent_color;
    if (!accent) {
        return;
    }
    const escaped = escapeExpression(accent);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const index = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    if (index !== -1) {
        head[index] = head[index] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Push a value onto head if it is non‑empty.
 * @param {string[]} head
 * @param {string|undefined} value
 */
function addIfNotEmpty(head, value) {
    if (value && !_.isEmpty(value)) {
        head.push(value);
    }
}

/**
 * Add custom font CSS if valid fonts are configured.
 * @param {string[]} head
 * @param {object} options
 */
function addCustomFonts(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const headingValid = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const bodyValid = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!headingValid && !bodyValid) {
        return;
    }

    /** @type FontSelection */
    const fontSelection = {};
    if (headingValid) {
        fontSelection.heading = headingFont;
    }
    if (bodyValid) {
        fontSelection.body = bodyFont;
    }
    const customCSS = generateCustomFontCss(fontSelection);
    head.push(new SafeString(customCSS));
}

/**
 * Main Ghost head helper.
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (isServerError(options)) {
        return;
    }

    const excludeList = getExcludeSet(options);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context || null;
    const safeVersion = dataRoot._locals?.safeVersion;
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

        if (shouldAddMetaData(context, excludeList)) {
            addMetaTags(head, meta, safeVersion, favicon, iconType, referrerPolicy, excludeList, context);
        }

        addPrevNextLinks(head, meta);

        if (shouldAddSocialData(context, excludeList, useStructuredData)) {
            head.push('');
            head.push(...finaliseStructuredData(meta));
            head.push('');
            if (shouldAddSchema(excludeList, meta)) {
                head.push('<script type="application/ld+json">\n' +
                    JSON.stringify(meta.schema, null, '    ') +
                    '\n    </script>\n');
            }
        }

        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (shouldAddSearch(excludeList)) {
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

        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMemberAttribution(head);
        addAnalytics(head, dataRoot);
        addAccentColorStyle(head, options);
        addIfNotEmpty(head, globalCodeinjection);
        addIfNotEmpty(head, postCodeInjection);
        addIfNotEmpty(head, tagCodeInjection);
        addCustomFonts(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;