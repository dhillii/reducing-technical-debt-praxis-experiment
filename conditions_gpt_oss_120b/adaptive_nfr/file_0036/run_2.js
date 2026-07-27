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
 * Guard: server error page.
 * @param {object} options
 * @returns {boolean}
 */
function isServerError(options) {
    return options.data.root.statusCode >= 500;
}

/**
 * Guard: presence of context.
 * @param {object} dataRoot
 * @returns {boolean}
 */
function hasContext(dataRoot) {
    return Boolean(dataRoot._locals.context);
}

/**
 * Guard: preview context.
 * @param {string[]} context
 * @returns {boolean}
 */
function isPreviewContext(context) {
    return _.includes(context, 'preview');
}

/**
 * Guard: paged context.
 * @param {string[]} context
 * @returns {boolean}
 */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/**
 * Guard: metadata exclusion.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Guard: social data exclusion.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Guard: schema exclusion.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeSchema(excludeList) {
    return !excludeList.has('schema');
}

/**
 * Guard: card assets exclusion.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Guard: comment counts inclusion.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeCommentCounts(excludeList) {
    return !excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Guard: members track sources inclusion.
 * @returns {boolean}
 */
function shouldIncludeMembersTrackSources() {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Guard: web analytics enabled.
 * @returns {boolean}
 */
function isWebAnalyticsEnabled() {
    return settingsHelpers.isWebAnalyticsEnabled();
}

/**
 * Guard: accent color presence.
 * @param {object} options
 * @returns {boolean}
 */
function hasAccentColor(options) {
    return Boolean(options.data.site.accent_color);
}

/**
 * Guard: global code injection presence.
 * @param {string} code
 * @returns {boolean}
 */
function hasGlobalCodeInjection(code) {
    return !_.isEmpty(code);
}

/**
 * Add metadata tags to head.
 * @param {string[]} head
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @param {string[]} context
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 */
function addMetadata(head, meta, excludeList, context, referrerPolicy, favicon, iconType) {
    if (!shouldIncludeMetadata(excludeList)) {
        return;
    }
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }
    if (settingsCache.get('icon')) {
        head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }
    head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');
    if (isPreviewContext(context)) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Add previous/next links to head.
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
 * Determine if structured data should be added.
 * @param {string[]} context
 * @param {boolean} useStructuredData
 * @returns {boolean}
 */
function shouldAddStructuredData(context, useStructuredData) {
    return !isPagedContext(context) && useStructuredData;
}

/**
 * Add structured data and schema to head.
 * @param {string[]} head
 * @param {object} meta
 * @param {Set<string>} excludeList
 */
function addStructuredData(head, meta, excludeList) {
    if (!shouldIncludeSocialData(excludeList)) {
        return;
    }
    head.push('');
    head.push.apply(head, finaliseStructuredData(meta));
    head.push('');
    if (shouldIncludeSchema(excludeList) && meta.schema) {
        head.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }
}

/**
 * Add generator and RSS tags to head.
 * @param {string[]} head
 * @param {object} meta
 * @param {string} safeVersion
 */
function addGeneratorAndRss(head, meta, safeVersion) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(meta.site.title) + '" href="' +
        escapeExpression(meta.rssUrl) + '">');
}

/**
 * Add card assets scripts/styles to head.
 * @param {string[]} head
 * @param {Set<string>} excludeList
 */
function addCardAssets(head, excludeList) {
    if (!shouldIncludeCardAssets(excludeList)) {
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
 * Add comment counts script to head.
 * @param {string[]} head
 * @param {Set<string>} excludeList
 */
function addCommentCounts(head, excludeList) {
    if (!shouldIncludeCommentCounts(excludeList)) {
        return;
    }
    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/**
 * Add members track sources script to head.
 * @param {string[]} head
 */
function addMembersTrackSources(head) {
    if (!shouldIncludeMembersTrackSources()) {
        return;
    }
    head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
}

/**
 * Add web analytics tracker script to head.
 * @param {string[]} head
 * @param {object} dataRoot
 */
function addWebAnalytics(head, dataRoot) {
    if (!isWebAnalyticsEnabled()) {
        return;
    }
    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Add accent color style to head.
 * @param {string[]} head
 * @param {object} options
 */
function addAccentColor(head, options) {
    if (!hasAccentColor(options)) {
        return;
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Add global, post, and tag code injections to head.
 * @param {string[]} head
 * @param {string} globalCodeinjection
 * @param {string} postCodeInjection
 * @param {string} tagCodeInjection
 */
function addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection) {
    if (hasGlobalCodeInjection(globalCodeinjection)) {
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
 * Add custom font CSS to head.
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
 * Main Ghost head helper.
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (isServerError(options)) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        if (hasContext(dataRoot)) {
            addMetadata(head, meta, excludeList, context, referrerPolicy, favicon, iconType);
            addPrevNextLinks(head, meta);
            if (shouldAddStructuredData(context, useStructuredData)) {
                addStructuredData(head, meta, excludeList);
            }
        }

        addGeneratorAndRss(head, meta, safeVersion);
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

        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMembersTrackSources(head);
        addWebAnalytics(head, dataRoot);
        addAccentColor(head, options);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
        addCustomFonts(head, options);

    } catch (error) {
        logging.error(error);
    }

    debug('end');
    return new SafeString(head.join('\n    ').trim());
};

module.exports.async = true;