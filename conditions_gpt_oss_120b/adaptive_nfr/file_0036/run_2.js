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
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Build structured data tags.
 * @param {object} meta
 * @returns {string[]}
 */
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

/**
 * Guard: members feature disabled.
 * @returns {boolean}
 */
function shouldRenderMembers() {
    return settingsCache.get('members_enabled') ||
        settingsCache.get('donations_enabled') ||
        settingsCache.get('recommendations_enabled');
}

/**
 * Build members helper markup.
 * @param {object} data
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!shouldRenderMembers()) {
        return '';
    }
    let membersHelper = '';
    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = (_.has(data, 'site._preview') && data.site.accent_color) ? data.site.accent_color : '';
        const attrs = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (colorString) {
            attrs['accent-color'] = colorString;
        }
        const dataAttrs = getDataAttributes(attrs);
        membersHelper += `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
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
 * Guard: search script unavailable.
 * @param {string} scriptUrl
 * @returns {boolean}
 */
function hasSearchScript(scriptUrl) {
    return !!scriptUrl;
}

/**
 * Build search helper markup.
 * @param {string} frontendKey
 * @returns {string}
 */
function getSearchHelper(frontendKey) {
    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    if (!hasSearchScript(scriptUrl)) {
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
 * Guard: announcement bar not needed.
 * @param {object} data
 * @returns {boolean}
 */
function shouldRenderAnnouncement(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || !!preview;
}

/**
 * Build announcement bar helper markup.
 * @param {object} data
 * @returns {string}
 */
function getAnnouncementBarHelper(data) {
    if (!shouldRenderAnnouncement(data)) {
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
 * Build webmention discovery link.
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
 * Guard: preview context.
 * @param {object} dataRoot
 * @returns {boolean}
 */
function isPreviewContext(dataRoot) {
    return !!dataRoot?.context?.includes('preview');
}

/**
 * Build Tinybird tracker script.
 * @param {object} dataRoot
 * @returns {string}
 */
function getTinybirdTrackerScript(dataRoot) {
    if (isPreviewContext(dataRoot)) {
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

/**
 * Guard: should add accent color style.
 * @param {object} site
 * @returns {boolean}
 */
function hasAccentColor(site) {
    return !!site?.accent_color;
}

/**
 * Build accent color style tag and insert into head array.
 * @param {string[]} head
 * @param {object} site
 */
function addAccentColorStyle(head, site) {
    if (!hasAccentColor(site)) {
        return;
    }
    const accentColor = escapeExpression(site.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const index = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    if (index !== -1) {
        head[index] = head[index] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Guard: custom fonts should be injected.
 * @param {object} options
 * @returns {boolean}
 */
function shouldInjectCustomFonts(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');
    const headingValid = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const bodyValid = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);
    return headingValid || bodyValid;
}

/**
 * Add custom font CSS to head.
 * @param {string[]} head
 * @param {object} options
 */
function addCustomFontStyles(head, options) {
    if (!shouldInjectCustomFonts(options)) {
        return;
    }
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');
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
 * Guard: metadata should be rendered.
 * @param {Set<string>} excludeList
 * @param {object} meta
 * @param {object} context
 * @returns {boolean}
 */
function shouldRenderMetadata(excludeList, meta, context) {
    return !excludeList.has('metadata') && context && meta;
}

/**
 * Add basic metadata tags.
 * @param {string[]} head
 * @param {object} meta
 * @param {object} context
 * @param {Set<string>} excludeList
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} safeVersion
 */
function addMetadata(head, meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion) {
    if (!shouldRenderMetadata(excludeList, meta, context)) {
        return;
    }
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

/**
 * Guard: structured data should be added.
 * @param {Set<string>} excludeList
 * @param {object} meta
 * @param {object} context
 * @param {boolean} useStructuredData
 * @returns {boolean}
 */
function shouldAddStructuredData(excludeList, meta, context, useStructuredData) {
    return !_.includes(context, 'paged') && useStructuredData && !excludeList.has('social_data');
}

/**
 * Add structured data and schema.
 * @param {string[]} head
 * @param {object} meta
 * @param {Set<string>} excludeList
 * @param {object} context
 * @param {boolean} useStructuredData
 */
function addStructuredAndSchema(head, meta, excludeList, context, useStructuredData) {
    if (shouldAddStructuredData(excludeList, meta, context, useStructuredData)) {
        head.push('');
        head.push.apply(head, finaliseStructuredData(meta));
        head.push('');
    }
    if (!excludeList.has('schema') && meta.schema) {
        head.push('<script type="application/ld+json">\n' + JSON.stringify(meta.schema, null, '    ') + '\n    </script>\n');
    }
}

/**
 * Guard: card assets should be rendered.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Add card assets scripts/styles.
 * @param {string[]} head
 */
function addCardAssets(head) {
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

/**
 * Guard: comment counts should be rendered.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderCommentCounts(excludeList) {
    return !excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Add comment counts script.
 * @param {string[]} head
 */
function addCommentCounts(head) {
    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/**
 * Guard: member attribution script should be rendered.
 * @returns {boolean}
 */
function shouldRenderMemberAttribution() {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Add member attribution script.
 * @param {string[]} head
 */
function addMemberAttribution(head) {
    head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
}

/**
 * Guard: analytics should be rendered.
 * @returns {boolean}
 */
function shouldRenderAnalytics() {
    return settingsHelpers.isWebAnalyticsEnabled();
}

/**
 * Add analytics script and flag.
 * @param {string[]} head
 * @param {object} dataRoot
 */
function addAnalytics(head, dataRoot) {
    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Main helper exported to templates.
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
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();
        debug('end fetch');
        addMetadata(head, meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion);
        if (meta.previousUrl) {
            head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
        }
        if (meta.nextUrl) {
            head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
        }
        addStructuredAndSchema(head, meta, excludeList, context, useStructuredData);
        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }
        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }
        head.push(getWebmentionDiscoveryLink());
        if (shouldRenderCardAssets(excludeList)) {
            addCardAssets(head);
        }
        if (shouldRenderCommentCounts(excludeList)) {
            addCommentCounts(head);
        }
        if (shouldRenderMemberAttribution()) {
            addMemberAttribution(head);
        }
        if (shouldRenderAnalytics()) {
            addAnalytics(head, dataRoot);
        }
        addAccentColorStyle(head, options.data.site);
        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }
        const postCodeInjection = dataRoot?.post?.codeinjection_head;
        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }
        const tagCodeInjection = dataRoot?.tag?.codeinjection_head;
        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }
        addCustomFontStyles(head, options);
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;