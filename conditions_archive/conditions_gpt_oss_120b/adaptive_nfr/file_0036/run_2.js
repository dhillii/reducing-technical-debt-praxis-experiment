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

/* ---------- Predicate helpers ---------- */

/** @returns {boolean} */
function isServerError(options) {
    return options?.data?.root?.statusCode >= 500;
}

/** @returns {boolean} */
function hasContext(dataRoot) {
    return !!dataRoot._locals?.context;
}

/** @returns {boolean} */
function isPreviewContext(context) {
    return _.includes(context, 'preview');
}

/** @returns {boolean} */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/** @returns {boolean} */
function shouldExclude(excludeList, key) {
    return excludeList.has(key);
}

/** @returns {boolean} */
function hasMetaDescription(meta) {
    return meta.metaDescription && meta.metaDescription.length > 0;
}

/** @returns {boolean} */
function hasSiteIcon() {
    return !!settingsCache.get('icon');
}

/** @returns {boolean} */
function useStructuredDataFlag() {
    return !config.isPrivacyDisabled('useStructuredData');
}

/** @returns {boolean} */
function hasReferrerPolicy() {
    return !!config.get('referrerPolicy');
}

/** @returns {boolean} */
function isSitePreview(options) {
    return !!options?.data?.site?._preview;
}

/* ---------- Utility helpers ---------- */

function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

function finaliseStructuredData(meta) {
    const head = [];
    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, keyword => {
                if (keyword !== '') {
                    head.push(writeMetaTag(property, escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content != null) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });
    return head;
}

/* ---------- Section builders ---------- */

function addMetadata(head, meta, excludeList, context, referrerPolicy, favicon, iconType, safeVersion) {
    if (shouldExclude(excludeList, 'metadata')) {
        return;
    }
    if (hasMetaDescription(meta)) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }
    if (hasSiteIcon()) {
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

function addPrevNextLinks(head, meta) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

function addStructuredData(head, meta, excludeList, context) {
    if (isPagedContext(context) || !useStructuredDataFlag()) {
        return;
    }
    if (!shouldExclude(excludeList, 'social_data')) {
        head.push('');
        head.push(...finaliseStructuredData(meta));
        head.push('');
    }
    if (!shouldExclude(excludeList, 'schema') && meta.schema) {
        head.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }
}

function addGeneratorAndRSS(head, meta, safeVersion) {
    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
}

function addMembersHelper(head, optionsData, frontendKey, excludeList) {
    head.push(getMembersHelper(optionsData, frontendKey, excludeList));
}

function addSearchHelper(head, frontendKey, excludeList) {
    if (!shouldExclude(excludeList, 'search')) {
        head.push(getSearchHelper(frontendKey));
    }
}

function addAnnouncementHelper(head, optionsData, excludeList) {
    if (!shouldExclude(excludeList, 'announcement')) {
        head.push(getAnnouncementBarHelper(optionsData));
    }
}

function addWebmentionLink(head) {
    try {
        head.push(getWebmentionDiscoveryLink());
    } catch (err) {
        logging.warn(err);
    }
}

function addCardAssets(head, excludeList) {
    if (shouldExclude(excludeList, 'card_assets')) {
        return;
    }
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

function addCommentCounts(head, excludeList) {
    if (shouldExclude(excludeList, 'comment_counts')) {
        return;
    }
    if (settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

function addAnalytics(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }
    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

function addAccentColorStyle(head, options) {
    if (!options?.data?.site?.accent_color) {
        return;
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const idx = _.findLastIndex(head, str => /<\/(style|script)>/.test(str));
    if (idx !== -1) {
        head[idx] = head[idx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

function addGlobalCodeInjection(head, globalCodeinjection) {
    if (!_.isEmpty(globalCodeinjection)) {
        head.push(globalCodeinjection);
    }
}

function addPostTagCodeInjection(head, postCodeInjection, tagCodeInjection) {
    if (!_.isEmpty(postCodeInjection)) {
        head.push(postCodeInjection);
    }
    if (!_.isEmpty(tagCodeInjection)) {
        head.push(tagCodeInjection);
    }
}

function addCustomFonts(head, options) {
    const isPreview = isSitePreview(options);
    const headingFont = isPreview ? options?.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isPreview ? options?.data?.site?.body_font : settingsCache.get('body_font');

    const headingValid = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const bodyValid = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!headingValid && !bodyValid) {
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

/* ---------- Main helper ---------- */

module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (isServerError(options)) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context || null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const referrerPolicy = hasReferrerPolicy() ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (hasContext(dataRoot)) {
            addMetadata(head, meta, excludeList, context, referrerPolicy, favicon, iconType, safeVersion);
            addPrevNextLinks(head, meta);
            addStructuredData(head, meta, excludeList, context);
        }

        addGeneratorAndRSS(head, meta, safeVersion);
        addMembersHelper(head, options.data, frontendKey, excludeList);
        addSearchHelper(head, frontendKey, excludeList);
        addAnnouncementHelper(head, options.data, excludeList);
        addWebmentionLink(head);
        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMemberAttribution(head);
        addAnalytics(head, dataRoot);
        addAccentColorStyle(head, options);
        addGlobalCodeInjection(head, globalCodeinjection);
        addPostTagCodeInjection(head, dataRoot.post?.codeinjection_head, dataRoot.tag?.codeinjection_head);
        addCustomFonts(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```