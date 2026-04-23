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

/** @returns {boolean} Check if members, donations, or recommendations are enabled */
function isMembersFeatureEnabled() {
    return settingsCache.get('members_enabled') || settingsCache.get('donations_enabled') || settingsCache.get('recommendations_enabled');
}

/** @returns {string} Portal script and styles */
function buildPortalHelper(data, frontendKey) {
    let helper = '';
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
    helper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    return helper;
}

/** @returns {string} CTA styles */
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

/** @returns {string} Stripe script for paid members */
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
        membersHelper += buildPortalHelper(data, frontendKey);
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

/** @returns {boolean} Check if announcement bar should be shown */
function shouldShowAnnouncementBar(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || preview;
}

/** @returns {object|null} Extract announcement preview data */
function getAnnouncementPreviewData(preview) {
    if (!preview) {
        return null;
    }
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
    const previewData = getAnnouncementPreviewData(preview);
    
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

/** @returns {boolean} Check if preview context */
function isPreviewContext(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/** @returns {string} Get tinybird endpoint */
function getTinybirdEndpoint(statsConfig, localConfig) {
    const localEnabled = localConfig?.enabled ?? false;
    return localEnabled ? localConfig.endpoint : statsConfig.endpoint;
}

/** @returns {string} Get tinybird token */
function getTinybirdToken(statsConfig, localConfig) {
    const localEnabled = localConfig?.enabled ?? false;
    return localEnabled ? localConfig.token : statsConfig.token;
}

/** @returns {string} Get tinybird datasource */
function getTinybirdDatasource(statsConfig, localConfig) {
    const localEnabled = localConfig?.enabled ?? false;
    return localEnabled ? localConfig.datasource : statsConfig.datasource;
}

/** @returns {string} Build tinybird parameters */
function buildTinybirdParams(dataRoot) {
    return _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');
}

function getTinybirdTrackerScript(dataRoot) {
    if (isPreviewContext(dataRoot)) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');

    const endpoint = getTinybirdEndpoint(statsConfig, localConfig);
    const token = getTinybirdToken(statsConfig, localConfig);
    const datasource = getTinybirdDatasource(statsConfig, localConfig);
    const tbParams = buildTinybirdParams(dataRoot);

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/** @returns {boolean} Check if context includes preview */
function isContextPreview(context) {
    return _.includes(context, 'preview');
}

/** @returns {boolean} Check if context is paged */
function isContextPaged(context) {
    return _.includes(context, 'paged');
}

/** @returns {string} Build metadata tags */
function buildMetadataTags(meta, favicon, iconType, referrerPolicy, context) {
    const tags = [];
    
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        tags.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }

    if (settingsCache.get('icon')) {
        tags.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }

    tags.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

    if (isContextPreview(context)) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }

    return tags;
}

/** @returns {string[]} Build pagination links */
function buildPaginationLinks(meta) {
    const links = [];
    
    if (meta.previousUrl) {
        links.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        links.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }

    return links;
}

/** @returns {string[]} Build structured data tags */
function buildStructuredDataTags(meta, context, useStructuredData, excludeList) {
    const tags = [];
    
    if (isContextPaged(context) || !useStructuredData) {
        return tags;
    }

    if (!excludeList.has('social_data')) {
        tags.push('');
        tags.push.apply(tags, finaliseStructuredData(meta));
        tags.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        tags.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }

    return tags;
}

/** @returns {string} Build card assets tags */
function buildCardAssetsTags() {
    const tags = [];
    
    if (cardAssets.hasFile('js')) {
        tags.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        tags.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    return tags;
}

/** @returns {boolean} Check if comments are enabled */
function areCommentsEnabled() {
    return settingsCache.get('comments_enabled') !== 'off';
}

/** @returns {string} Build comment counts script */
function buildCommentCountsScript() {
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

/** @returns {boolean} Check if member attribution tracking is enabled */
function isMemberAttributionEnabled() {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/** @returns {string} Build member attribution script */
function buildMemberAttributionScript() {
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

/** @returns {string} Build accent color style */
function buildAccentColorStyle(accentColor) {
    return `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
}

/** @returns {string} Get font selection from data or cache */
function getFontSelection(data, isSitePreview) {
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
    
    return {headingFont, bodyFont};
}

/** @returns {boolean} Check if custom fonts are valid */
function hasValidCustomFonts(headingFont, bodyFont) {
    return (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
           (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
}

/** @returns {string} Build custom font CSS */
function buildCustomFontCss(headingFont, bodyFont) {
    const fontSelection = {};
    
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }
    
    return generateCustomFontCss(fontSelection);
}

module.exports = async function ghost_head(options) {
    debug('begin');
    
    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head || null;
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

        if (!context) {
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
            return new SafeString(head.join('\n    ').trim());
        }

        if (!excludeList.has('metadata')) {
            head.push(...buildMetadataTags(meta, favicon, iconType, referrerPolicy, context));
        }

        head.push(...buildPaginationLinks(meta));
        head.push(...buildStructuredDataTags(meta, context, useStructuredData, excludeList));

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

        if (!excludeList.has('card_assets')) {
            head.push(...buildCardAssetsTags());
        }

        if (!excludeList.has('comment_counts') && areCommentsEnabled()) {
            head.push(buildCommentCountsScript());
        }

        if (isMemberAttributionEnabled()) {
            head.push(buildMemberAttributionScript());
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        if (options.data.site.accent_color) {
            const accentColor = escapeExpression(options.data.site.accent_color);
            const styleTag = buildAccentColorStyle(accentColor);
            const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

            if (existingScriptIndex !== -1) {
                head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
            } else {
                head.push(styleTag);
            }
        }

        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }

        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }

        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }

        const isSitePreview = options.data?.site?._preview ?? false;
        const {headingFont, bodyFont} = getFontSelection(options.data, isSitePreview);
        
        if (hasValidCustomFonts(headingFont, bodyFont)) {
            const customCSS = buildCustomFontCss(headingFont, bodyFont);
            head.push(new SafeString(customCSS));
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;