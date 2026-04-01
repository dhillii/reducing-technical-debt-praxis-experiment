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
 * Generates a meta tag with proper escaping
 * @param {string} property - The property name
 * @param {string} content - The content value
 * @param {string} type - The tag type (name or property)
 * @returns {string} The meta tag HTML
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

/**
 * Processes structured data and returns formatted meta tags
 * @param {object} meta - The metadata object
 * @returns {array} Array of meta tag strings
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
 * Checks if members functionality should be loaded
 * @returns {boolean}
 */
function shouldLoadMembers() {
    return settingsCache.get('members_enabled') || 
           settingsCache.get('donations_enabled') || 
           settingsCache.get('recommendations_enabled');
}

/**
 * Builds portal script tag
 * @param {object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @returns {string} Portal script HTML
 */
function buildPortalScript(data, frontendKey) {
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
    return `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
}

/**
 * Builds CTA styles tag
 * @returns {string} Styles HTML
 */
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

/**
 * Builds Stripe script tag
 * @returns {string} Stripe script HTML
 */
function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

/**
 * Generates members helper content
 * @param {object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @param {Set} excludeList - Set of excluded items
 * @returns {string} Members helper HTML
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!shouldLoadMembers()) {
        return '';
    }

    let membersHelper = '';

    if (!excludeList.has('portal')) {
        membersHelper += buildPortalScript(data, frontendKey);
    }

    if (!excludeList.has('cta_styles')) {
        membersHelper += buildCtaStyles();
    }

    if (settingsCache.get('paid_members_enabled')) {
        membersHelper += buildStripeScript();
    }

    return membersHelper;
}

/**
 * Generates search helper content
 * @param {string} frontendKey - The frontend key
 * @returns {string} Search helper HTML
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
 * Checks if announcement bar should be shown
 * @param {object} data - The data object
 * @returns {boolean}
 */
function shouldShowAnnouncementBar(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || preview;
}

/**
 * Extracts announcement preview parameters
 * @param {string} preview - The preview query string
 * @returns {object|null} Announcement preview data or null
 */
function extractAnnouncementPreview(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        announcementBackground: searchParam.has('announcement_bg') ? escapeExpression(searchParam.get('announcement_bg')) : ''
    };
}

/**
 * Generates announcement bar helper content
 * @param {object} data - The data object
 * @returns {string} Announcement bar helper HTML
 */
function getAnnouncementBarHelper(data) {
    if (!shouldShowAnnouncementBar(data)) {
        return '';
    }

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    const preview = data?.site?._preview;
    if (preview) {
        const previewData = extractAnnouncementPreview(preview);
        if (!previewData) {
            return '';
        }
        attrs.announcement = previewData.announcement;
        attrs['announcement-background'] = previewData.announcementBackground;
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Generates webmention discovery link
 * @returns {string} Webmention link HTML
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
 * Checks if in preview context
 * @param {object} dataRoot - The data root object
 * @returns {boolean}
 */
function isPreviewContext(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/**
 * Gets tinybird configuration based on environment
 * @returns {object} Configuration object with endpoint, token, datasource
 */
function getTinybirdConfig() {
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const localEnabled = localConfig?.enabled ?? false;

    return {
        endpoint: localEnabled ? localConfig.endpoint : statsConfig.endpoint,
        token: localEnabled ? localConfig.token : statsConfig.token,
        datasource: localEnabled ? localConfig.datasource : statsConfig.datasource
    };
}

/**
 * Builds tinybird tracker parameters
 * @param {object} dataRoot - The data root object
 * @returns {string} Space-separated data attributes
 */
function buildTinybirdParams(dataRoot) {
    const postType = dataRoot.context?.includes('post') ? 'post' : 
                     dataRoot.context?.includes('page') ? 'page' : null;

    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: postType,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

/**
 * Generates tinybird tracker script
 * @param {object} dataRoot - The data root object
 * @returns {string} Tracker script HTML
 */
function getTinybirdTrackerScript(dataRoot) {
    if (isPreviewContext(dataRoot)) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const tbConfig = getTinybirdConfig();
    const tbParams = buildTinybirdParams(dataRoot);

    const datasourceAttr = tbConfig.datasource ? `data-datasource="${tbConfig.datasource}"` : '';
    const tokenAttr = tbConfig.token && env !== 'production' ? `data-token="${tbConfig.token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${tbConfig.endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

/**
 * Checks if context is paged
 * @param {array} context - The context array
 * @returns {boolean}
 */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/**
 * Checks if preview context
 * @param {array} context - The context array
 * @returns {boolean}
 */
function isPreviewContextArray(context) {
    return _.includes(context, 'preview');
}

/**
 * Adds metadata tags to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {array} context - The context array
 * @param {boolean} useStructuredData - Whether to use structured data
 * @param {string} referrerPolicy - The referrer policy
 * @param {string} favicon - The favicon URL
 * @param {string} iconType - The icon type
 * @param {Set} excludeList - Set of excluded items
 */
function addMetadataTags(head, meta, context, useStructuredData, referrerPolicy, favicon, iconType, excludeList) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
        }

        head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

        if (isPreviewContextArray(context)) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
        }
    }
}

/**
 * Adds pagination links to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 */
function addPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

/**
 * Adds structured data to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {Set} excludeList - Set of excluded items
 */
function addStructuredData(head, meta, excludeList) {
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
 * Adds card assets to head array
 * @param {array} head - The head array
 * @param {Set} excludeList - Set of excluded items
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
 * Adds comment counts script to head array
 * @param {array} head - The head array
 * @param {Set} excludeList - Set of excluded items
 */
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts')) {
        return;
    }

    if (settingsCache.get('comments_enabled') === 'off') {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(