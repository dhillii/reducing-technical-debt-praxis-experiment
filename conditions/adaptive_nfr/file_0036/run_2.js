```javascript
const {metaData, settingsCache, config, blogIcon, urlUtils, getFrontendKey, settingsHelpers} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {generateCustomFontCss, isValidCustomFont, isValidCustomHeadingFont} = require('@tryghost/custom-fonts');
const {cardAssets} = require('../services/assets-minification');
const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

const {get: getMetaData, getAssetUrl} = metaData;

// ============================================================================
// Meta Tag Builders
// ============================================================================

function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return `<meta ${type}="${property}" content="${content}">`;
}

function buildMetadataTags(meta, context, excludeList, favicon, iconType, referrerPolicy) {
    const tags = [];

    if (meta.metaDescription?.length > 0) {
        tags.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }

    if (settingsCache.get('icon')) {
        tags.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }

    tags.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

    if (_.includes(context, 'preview')) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }

    return tags;
}

function buildPaginationTags(meta) {
    const tags = [];

    if (meta.previousUrl) {
        tags.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        tags.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    return tags;
}

function buildStructuredDataTags(meta, useStructuredData, excludeList) {
    const tags = [];

    if (!useStructuredData) {
        return tags;
    }

    if (!excludeList.has('social_data')) {
        tags.push('');
        tags.push(...finaliseStructuredData(meta));
        tags.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        tags.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
    }

    return tags;
}

function finaliseStructuredData(meta) {
    const head = [];

    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, (keyword) => {
                if (keyword !== '') {
                    keyword = escapeExpression(keyword);
                    head.push(writeMetaTag(property, keyword));
                }
            });
            head.push('');
        } else if (content !== null && content !== undefined) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });

    return head;
}

// ============================================================================
// Frontend App Helpers
// ============================================================================

function getMembersHelper(data, frontendKey, excludeList) {
    const isEnabled = settingsCache.get('members_enabled') || 
                     settingsCache.get('donations_enabled') || 
                     settingsCache.get('recommendations_enabled');

    if (!isEnabled) {
        return '';
    }

    let html = '';

    if (!excludeList.has('portal')) {
        html += buildPortalScript(data, frontendKey);
    }

    if (!excludeList.has('cta_styles')) {
        html += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        html += buildStripeScript();
    }

    return html;
}

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

function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
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
        const previewAttrs = extractAnnouncementPreviewAttrs(preview);
        if (!previewAttrs) {
            return '';
        }
        Object.assign(attrs, previewAttrs);
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

function extractAnnouncementPreviewAttrs(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(announcementBackground),
        preview: true
    };
}

// ============================================================================
// Asset and Tracking Helpers
// ============================================================================

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

function buildCardAssetTags(excludeList) {
    const tags = [];

    if (excludeList.has('card_assets')) {
        return tags;
    }

    if (cardAssets.hasFile('js')) {
        tags.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }

    if (cardAssets.hasFile('css')) {
        tags.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    return tags;
}

function buildCommentCountsTags(excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return '';
    }

    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

function buildMemberAttributionTags() {
    if (!settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) {
        return '';
    }

    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

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

    const tbParams = buildTinybirdParams(dataRoot);

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

function buildTinybirdParams(dataRoot) {
    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

// ============================================================================
// Custom Font Helpers
// ============================================================================

function buildCustomFontTags(data) {
    const isSitePreview = data?.site?._preview ?? false;
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');

    if (!(typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) &&
        !(typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        return '';
    }

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

// ============================================================================
// Accent Color Helper
// ============================================================================

function buildAccentColorTag(accentColor, head) {
    if (!accentColor) {
        return '';
    }

    const escaped = escapeExpression(accentColor);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        return styleTag;
    }

    return '';
}

// ============================================================================
// Code Injection Helper
// ============================================================================

function buildCodeInjectionTags(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    const tags = [];

    if (!_.isEmpty(globalCodeinjection)) {
        tags.push(globalCodeinjection);
    }

    if (!_.isEmpty(postCodeInjection)) {
        tags.push(postCodeInjection);
    }

    if (!_.isEmpty(tagCodeInjection)) {
        tags.push(tagCodeInjection);
    }

    return tags;
}

// ============================================================================
// Main Helper
// ============================================================================

module.exports = async function ghost_head(options) {
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context || null;
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

        if (context) {
            if (!excludeList.has('metadata')) {
                head.push(...buildMetadataTags(meta, context, excludeList, favicon, iconType, referrerPolicy));
            }

            head.push(...buildPaginationTags(meta));

            if (!_.includes(context, 'paged')) {
                head.push(...buildStructuredDataTags(meta, useStructuredData, excludeList));
            }
        }

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
        head.push(...buildCardAssetTags(exclude