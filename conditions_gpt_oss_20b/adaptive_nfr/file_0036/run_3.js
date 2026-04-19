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
 * @private
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
 * @private
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
 * @private
 * @param {object} data
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') &&
        !settingsCache.get('donations_enabled') &&
        !settingsCache.get('recommendations_enabled')) {
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
        membersHelper += `<style id="gh-members-styles">${templateStyles}</style>`;
    }
    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }
    return membersHelper;
}

/**
 * @private
 * @param {string} frontendKey
 * @returns {string}
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
 * @private
 * @param {object} data
 * @returns {string}
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
 * @private
 * @returns {string}
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
 * @private
 * @param {object} dataRoot
 * @returns {string}
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
        post_type: dataRoot.context?.includes('post')
            ? 'post'
            : dataRoot.context?.includes('page')
                ? 'page'
                : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');
    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/**
 * @private
 * @param {object} options
 * @returns {boolean}
 */
function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getAccentColorStyle(options) {
    if (!options.data.site.accent_color) {
        return '';
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    return `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getCustomFontCss(options) {
    const isPreview = isSitePreview(options);
    const headingFont = isPreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isPreview ? options.data?.site?.body_font : settingsCache.get('body_font');
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
        return new SafeString(customCSS);
    }
    return '';
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getGlobalCodeInjection(options) {
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    return globalCodeinjection || '';
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getPostCodeInjection(options) {
    return options.data.root.post?.codeinjection_head || '';
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getTagCodeInjection(options) {
    return options.data.root.tag?.codeinjection_head || '';
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getIconLink(options) {
    if (!settingsCache.get('icon')) {
        return '';
    }
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    return `<link rel="icon" href="${favicon}" type="image/${iconType}">`;
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getCanonicalLink(meta) {
    return `<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`;
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getPrevLink(meta) {
    if (!meta.previousUrl) {
        return '';
    }
    return `<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`;
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getNextLink(meta) {
    if (!meta.nextUrl) {
        return '';
    }
    return `<link rel="next" href="${escapeExpression(meta.nextUrl)}">`;
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getGeneratorTag(meta, safeVersion) {
    return `<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`;
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getRSSLink(meta) {
    return `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`;
}

/**
 * @private
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @returns {string[]}
 */
function getStructuredDataScripts(meta, excludeList) {
    if (excludeList.has('social_data')) {
        return [];
    }
    const scripts = [];
    scripts.push('');
    scripts.push(...finaliseStructuredData(meta));
    scripts.push('');
    return scripts;
}

/**
 * @private
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getSchemaScript(meta, excludeList) {
    if (excludeList.has('schema') || !meta.schema) {
        return '';
    }
    return `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`;
}

/**
 * @private
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getCardAssets(options, excludeList) {
    if (excludeList.has('card_assets')) {
        return '';
    }
    let assets = '';
    if (cardAssets.hasFile('js')) {
        assets += `<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`;
    }
    if (cardAssets.hasFile('css')) {
        assets += `<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`;
    }
    return assets;
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getCommentCounts(options, excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMemberAttribution(options, excludeList) {
    if (excludeList.has('member_attribution') || !settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getAnalyticsScript(options, excludeList) {
    if (excludeList.has('analytics') || !settingsHelpers.isWebAnalyticsEnabled()) {
        return '';
    }
    const dataRoot = options.data.root;
    const script = getTinybirdTrackerScript(dataRoot);
    if (script && dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
    return script;
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getAccentColorStyleTag(options, excludeList) {
    if (excludeList.has('accent_color')) {
        return '';
    }
    return getAccentColorStyle(options);
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getGlobalCodeInjectionTag(options, excludeList) {
    if (excludeList.has('global_codeinjection')) {
        return '';
    }
    return getGlobalCodeInjection(options);
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getPostCodeInjectionTag(options, excludeList) {
    if (excludeList.has('post_codeinjection')) {
        return '';
    }
    return getPostCodeInjection(options);
}

/**
 * @private
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getTagCodeInjectionTag(options, excludeList) {
    if (excludeList.has('tag_codeinjection')) {
        return '';
    }
    return getTagCodeInjection(options);
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getCustomFontCssTag(options) {
    return getCustomFontCss(options);
}

/**
 * @private
 * @param {object} options
 * @returns {boolean}
 */
function shouldReturnOnErrorStatus(options) {
    return options.data.root.statusCode >= 500;
}

/**
 * @private
 * @param {object} options
 * @returns {Set<string>}
 */
function getExcludeList(options) {
    return new Set(options?.hash?.exclude?.split(',') || []);
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getSafeVersion(options) {
    return settingsCache.get('codeinjection_head') ? '' : config.get('safeVersion');
}

/**
 * @private
 * @param {object} meta
 * @returns {string}
 */
function getMetaDescription(meta) {
    if (!meta.metaDescription || meta.metaDescription.length === 0) {
        return '';
    }
    return `<meta name="description" content="${escapeExpression(meta.metaDescription)}">`;
}

/**
 * @private
 * @param {object} meta
 * @param {string} referrerPolicy
 * @param {string[]} context
 * @returns {string[]}
 */
function getRobotsAndReferrer(meta, referrerPolicy, context) {
    const tags = [];
    if (_.includes(context, 'preview')) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
    return tags;
}

/**
 * @private
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @returns {string[]}
 */
function getStructuredDataAndSchema(meta, excludeList) {
    const scripts = [];
    if (!_.includes(meta.context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
        scripts.push(...getStructuredDataScripts(meta, excludeList));
        scripts.push(getSchemaScript(meta, excludeList));
    }
    return scripts;
}

/**
 * @private
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string[]}
 */
function buildHeadArray(options, meta, frontendKey, excludeList) {
    const head = [];
    const context = options.data.root._locals?.context || null;
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const safeVersion = config.get('safeVersion');

    head.push(getMetaDescription(meta));
    head.push(getIconLink(options));
    head.push(getCanonicalLink(meta));
    head.push(...getRobotsAndReferrer(meta, referrerPolicy, context || []));

    head.push(getPrevLink(meta));
    head.push(getNextLink(meta));

    head.push(...getStructuredDataAndSchema(meta, excludeList));

    head.push(getGeneratorTag(meta, safeVersion));
    head.push(getRSSLink(meta));

    head.push(getMembersHelper(options.data, frontendKey, excludeList));
    head.push(getSearchHelper(frontendKey));
    head.push(getAnnouncementBarHelper(options.data));

    head.push(getWebmentionDiscoveryLink());
    head.push(getCardAssets(options, excludeList));
    head.push(getCommentCounts(options, excludeList));
    head.push(getMemberAttribution(options, excludeList));
    head.push(getAnalyticsScript(options, excludeList));

    head.push(getAccentColorStyleTag(options, excludeList));
    head.push(getGlobalCodeInjectionTag(options, excludeList));
    head.push(getPostCodeInjectionTag(options, excludeList));
    head.push(getTagCodeInjectionTag(options, excludeList));
    head.push(getCustomFontCssTag(options));

    return head.filter(Boolean);
}

/**
 * We use the name ghost_head to match the helper for consistency:
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (shouldReturnOnErrorStatus(options)) {
        return;
    }
    const excludeList = getExcludeList(options);
    try {
        const meta = await getMetaData(options.data.root, options.data.root);
        const frontendKey = await getFrontendKey();
        const head = buildHeadArray(options, meta, frontendKey, excludeList);
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString('');
    }
};

module.exports.async = true;