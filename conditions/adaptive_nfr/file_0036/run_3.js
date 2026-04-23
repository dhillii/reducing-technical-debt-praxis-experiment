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

function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

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

/** @returns {boolean} */
function isMembersFeatureEnabled() {
    return settingsCache.get('members_enabled') || settingsCache.get('donations_enabled') || settingsCache.get('recommendations_enabled');
}

/** @returns {string} */
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

/** @returns {string} */
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

/** @returns {string} */
function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

function getMembersHelper(data, frontendKey, excludeList) {
    if (!isMembersFeatureEnabled()) {
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

/** @returns {boolean} */
function isAnnouncementBarFilled() {
    return settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
}

/** @returns {boolean} */
function shouldShowAnnouncementBar(data) {
    return isAnnouncementBarFilled() || (data?.site?._preview ?? false);
}

/** @returns {object|null} */
function parseAnnouncementPreview(preview) {
    if (!preview) {
        return null;
    }

    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        announcementBackground: escapeExpression(announcementBackground)
    };
}

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
    const previewData = parseAnnouncementPreview(preview);

    if (previewData) {
        attrs.announcement = previewData.announcement;
        attrs['announcement-background'] = previewData.announcementBackground;
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

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

/** @returns {boolean} */
function isPreviewContext(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/** @returns {string} */
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

/** @returns {boolean} */
function isServerError(statusCode) {
    return statusCode >= 500;
}

/** @returns {boolean} */
function hasContext(context) {
    return context !== null;
}

/** @returns {boolean} */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/** @returns {boolean} */
function isPreviewContextCheck(context) {
    return _.includes(context, 'preview');
}

/** @returns {void} */
function addMetadataToHead(head, meta, context, excludeList, favicon, iconType, referrerPolicy) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
        }

        head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

        if (isPreviewContextCheck(context)) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
        }
    }
}

/** @returns {void} */
function addNavigationLinksToHead(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

/** @returns {void} */
function addStructuredDataToHead(head, meta, context, excludeList, useStructuredData) {
    if (isPagedContext(context) || !useStructuredData) {
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

/** @returns {void} */
function addGeneratorAndRssToHead(head, safeVersion, meta) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(meta.site.title) + '" href="' +
        escapeExpression(meta.rssUrl) + '">');
}

/** @returns {void} */
function addCardAssetsToHead(head, excludeList) {
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

/** @returns {void} */
function addCommentCountsToHead(head, excludeList) {
    if (excludeList.has('comment_counts')) {
        return;
    }

    if (settingsCache.get('comments_enabled') === 'off') {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/** @returns {void} */
function addMemberAttributionToHead(head) {
    if (!settingsCache.get('members_enabled')) {
        return;
    }

    if (!settingsCache.get('members_track_sources')) {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
}

/** @returns {void} */
function addAnalyticsToHead(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }

    head.push(getTinybirdTrackerScript(dataRoot));

    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/** @returns {void} */
function addAccentColorToHead(head, accentColor) {
    if (!accentColor) {
        return;
    }

    const escapedColor = escapeExpression(accentColor);
    const styleTag = `<style>:root {--ghost-accent-color: ${escapedColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/** @returns {void} */
function addCodeInjectionsToHead(head, globalCodeinjection, postCodeInjection, tagCodeInjection) {
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

/** @returns {boolean} */
function isSitePreview(data) {
    return data?.site?._preview ?? false;
}

/** @returns {string|null} */
function getHeadingFont(data) {
    if (isSitePreview(data)) {
        return data?.site?.heading_font;
    }
    return settingsCache.get('heading_font');
}

/** @returns {string|null} */
function getBodyFont(data) {
    if (isSitePreview(data)) {
        return data?.site?.body_font;
    }
    return settingsCache.get('body_font');
}

/** @returns {boolean} */
function hasValidCustomFonts(headingFont, bodyFont) {
    return (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
           (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
}

/** @returns {void} */
function addCustomFontsToHead(head, data) {
    const headingFont = getHeadingFont(data);
    const bodyFont = getBodyFont(data);

    if (!hasValidCustomFonts(headingFont, bodyFont)) {
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

module.exports = async function ghost_head(options) {
    debug('begin');

    if (isServerError(options.data.root.statusCode)) {
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

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (!hasContext(context)) {
            head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
            head.push('<link rel="alternate" type="application/rss+xml" title="' +
                escapeExpression(meta.site.title) + '" href="' +
                escapeExpression(meta.rssUrl) + '">');
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

            addCardAssetsToHead(head, excludeList);
            addCommentCountsToHead(head, excludeList);
            addMemberAttributionToHead(head);
            addAnalyticsToHead(head, dataRoot);
            addAccentColorToHead(head, options.data.site.accent_color);
            addCodeInjectionsToHead(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
            addCustomFontsToHead(head, options.data);

            debug('end');
            return new SafeString(head.join('\n    ').trim());
        }

        addMetadataToHead(head, meta, context, excludeList, favicon, iconType, referrerPolicy);
        addNavigationLinksToHead(head, meta);
        addStructuredDataToHead(head, meta, context, excludeList, useStructuredData);
        addGeneratorAndRssToHead(head, safeVersion, meta);
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

        addCardAssetsToHead(head, excludeList);
        addCommentCountsToHead(head, excludeList);
        addMemberAttributionToHead(head);
        addAnalyticsToHead(head, dataRoot);
        addAccentColorToHead(head, options.data.site.accent_color);
        addCodeInjectionsToHead(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
        addCustomFontsToHead(head, options.data);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;