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
 * Writes a meta tag with proper property/name attribute
 * @param {string} property - The meta property or name
 * @param {string} content - The meta content value
 * @param {string} [type] - The attribute type (name or property)
 * @returns {string} The meta tag HTML
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Finalizes structured data for SEO
 * @param {Object} meta - The metadata object containing structured data
 * @returns {string[]} Array of meta tag strings
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
 * Prepares data extraction from the root object
 * @param {Object} dataRoot - The root data object
 * @returns {Object} Prepared data object with extracted values
 */
function prepareData(dataRoot) {
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;

    return {
        context,
        safeVersion,
        postCodeInjection,
        tagCodeInjection
    };
}

/**
 * Builds meta tags for the page
 * @param {Object} meta - The metadata object
 * @param {Object} dataRoot - The root data object
 * @param {Set} excludeList - List of excluded items
 * @param {string} frontendKey - The frontend key
 * @returns {string[]} Array of meta tag strings
 */
function buildMetaTags(meta, dataRoot, excludeList, frontendKey) {
    const head = [];
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
        }

        if (settingsCache.get('icon')) {
            head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
        }

        head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

        if (_.includes(dataRoot._locals.context, 'preview')) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', config.get('referrerPolicy') || 'no-referrer-when-downgrade', 'name'));
        }
    }

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    if (!_.includes(dataRoot._locals.context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push(...finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
        }
    }

    head.push(`<meta name="generator" content="Ghost ${escapeExpression(dataRoot._locals.safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

    return head;
}

/**
 * Builds script tags for various functionality
 * @param {Object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @param {Set} excludeList - List of excluded items
 * @returns {string[]} Array of script tag strings
 */
function buildScriptTags(data, frontendKey, excludeList) {
    const head = [];

    head.push(getMembersHelper(data, frontendKey, excludeList));
    if (!excludeList.has('search')) {
        head.push(getSearchHelper(frontendKey));
    }
    if (!excludeList.has('announcement')) {
        head.push(getAnnouncementBarHelper(data));
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
        head.push(getTinybirdTrackerScript(data));
        if (data._locals) {
            data._locals.ghostAnalytics = true;
        }
    }

    return head;
}

/**
 * Builds style tags for the page
 * @param {Object} data - The data object
 * @param {Set} excludeList - List of excluded items
 * @returns {string[]} Array of style tag strings
 */
function buildStyleTags(data, excludeList) {
    const head = [];

    if (!excludeList.has('cta_styles')) {
        head.push(`<style id="gh-members-styles">${templateStyles}</style>`);
    }

    if (data.site.accent_color) {
        const accentColor = escapeExpression(data.site.accent_color);
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
 * Builds font configuration and CSS
 * @param {Object} data - The data object
 * @param {Set} excludeList - List of excluded items
 * @returns {string[]} Array of style tag strings
 */
function buildFontStyles(data, excludeList) {
    const head = [];
    const isSitePreview = data?.site?._preview ?? false;
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');

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
 * Injects code injection from various sources
 * @param {Object} dataRoot - The root data object
 * @param {Set} excludeList - List of excluded items
 * @returns {string[]} Array of code injection strings
 */
function injectCodeInjection(dataRoot, excludeList) {
    const head = [];

    if (!_.isEmpty(dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null)) {
        head.push(dataRoot.post.codeinjection_head);
    }

    if (!_.isEmpty(dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null)) {
        head.push(dataRoot.tag.codeinjection_head);
    }

    if (!_.isEmpty(settingsCache.get('codeinjection_head'))) {
        head.push(settingsCache.get('codeinjection_head'));
    }

    return head;
}

/**
 * Gets members helper script
 * @param {Object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @param {Set} excludeList - List of excluded items
 * @returns {string} Members helper script
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let membersHelper = '';
    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = (_.has(data, 'site._preview') && data.site.accent_color) ? data.site.accent_color : '';
        const attributes = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (colorString) {
            attributes['accent-color'] = colorString;
        }
        const dataAttributes = getDataAttributes(attributes);
        membersHelper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    }
    if (!excludeList.has('cta_styles')) {
        membersHelper += (`<style id="gh-members-styles">${templateStyles}</style>`);
    }
    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }
    return membersHelper;
}

/**
 * Gets search helper script
 * @param {string} frontendKey - The frontend key
 * @returns {string} Search helper script
 */
function getSearchHelper(frontendKey) {
    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');

    if (!scriptUrl) {
        return '';
    }

    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': adminUrl,
        locale: settingsCache.get('locale') || 'en'
    };
    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Gets announcement bar helper script
 * @param {Object} data - The data object
 * @returns {string} Announcement bar helper script
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

    if (!isFilled && !preview) {
        return '';
    }

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    if (preview) {
        const searchParam = new URLSearchParams(preview);
        const announcement = searchParam.get('announcement');
        const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
        const announcementVisibility = searchParam.has('announcement_vis');

        if (!announcement || !announcementVisibility) {
            return '';
        }
        attrs.announcement = escapeExpression(announcement);
        attrs['announcement-background'] = escapeExpression(announcementBackground);
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Gets webmention discovery link
 * @returns {string} Webmention discovery link
 */
function getWebmentionDiscoveryLink() {
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
 * Gets Tinybird tracker script
 * @param {Object} dataRoot - The root data object
 * @returns {string} Tinybird tracker script
 */
function getTinybirdTrackerScript(dataRoot) {
    const preview = dataRoot?.context?.includes('preview');
    if (preview) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const localEnabled = localConfig?.enabled ?? false;

    const endpoint = localEnabled ? localConfig.endpoint : statsConfig.endpoint;
    const token = localEnabled ? localConfig.token : statsConfig.token;
    const datasource = localEnabled ? localConfig.datasource : statsConfig.datasource;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

// We use the name ghost_head to match the helper for consistency:
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    // if server error page do nothing
    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const preparedData = prepareData(dataRoot);
    const meta = await getMetaData(dataRoot, dataRoot);
    const frontendKey = await getFrontendKey();

    debug('end fetch');

    const head = [];
    head.push(...buildMetaTags(meta, dataRoot, excludeList, frontendKey));
    head.push(...buildScriptTags(options.data, frontendKey, excludeList));
    head.push(...buildStyleTags(options.data, excludeList));
    head.push(...buildFontStyles(options.data, excludeList));
    head.push(...injectCodeInjection(dataRoot, excludeList));

    debug('end');
    return new SafeString(head.join('\n    ').trim());
};

module.exports.async = true;
```