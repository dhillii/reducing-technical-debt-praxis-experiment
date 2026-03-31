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

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

const {get: getMetaData, getAssetUrl} = metaData;

// ─── Meta Tag Helpers ────────────────────────────────────────────────────────

function writeMetaTag(property, content, type) {
    const resolvedType = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${resolvedType}="${property}" content="${content}">`;
}

function finaliseStructuredData(meta) {
    const head = [];

    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, (keyword) => {
                if (keyword !== '') {
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

// ─── Frontend App Helpers ────────────────────────────────────────────────────

function buildScriptTag(scriptUrl, dataAttributes) {
    return `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
}

function getMembersHelper(data, frontendKey, excludeList) {
    const membersEnabled = settingsCache.get('members_enabled');
    const donationsEnabled = settingsCache.get('donations_enabled');
    const recommendationsEnabled = settingsCache.get('recommendations_enabled');

    if (!membersEnabled && !donationsEnabled && !recommendationsEnabled) {
        return '';
    }

    const parts = [];

    if (!excludeList.has('portal')) {
        parts.push(buildPortalScript(data, frontendKey));
    }

    if (!excludeList.has('cta_styles')) {
        parts.push(`<style id="gh-members-styles">${templateStyles}</style>`);
    }

    if (settingsCache.get('paid_members_enabled')) {
        parts.push(buildStripeScript());
    }

    return parts.join('');
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

    return buildScriptTag(scriptUrl, getDataAttributes(attributes));
}

function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');

    if (!scriptUrl) {
        return '';
    }

    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': adminUrl,
        locale: settingsCache.get('locale') || 'en'
    };

    return buildScriptTag(scriptUrl, getDataAttributes(attrs));
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
        const previewAttrs = buildPreviewAnnouncementAttrs(preview);
        if (!previewAttrs) {
            return;
        }
        Object.assign(attrs, previewAttrs);
    }

    return buildScriptTag(scriptUrl, getDataAttributes(attrs));
}

function buildPreviewAnnouncementAttrs(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : ''),
        preview: true
    };
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

// ─── Analytics ───────────────────────────────────────────────────────────────

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const {endpoint, token, datasource} = resolveTinybirdConfig();
    const tbParams = buildTinybirdParams(dataRoot);

    return [
        `<script defer src="${src}"`,
        `data-stringify-payload="false"`,
        datasource ? `data-datasource="${datasource}"` : '',
        `data-storage="localStorage"`,
        `data-host="${endpoint}"`,
        (token && env !== 'production') ? `data-token="${token}"` : '',
        tbParams,
        `></script>`
    ].filter(Boolean).join(' ');
}

function resolveTinybirdConfig() {
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const localEnabled = localConfig?.enabled ?? false;

    return {
        endpoint: localEnabled ? localConfig.endpoint : statsConfig.endpoint,
        token: localEnabled ? localConfig.token : statsConfig.token,
        datasource: localEnabled ? localConfig.datasource : statsConfig.datasource
    };
}

function buildTinybirdParams(dataRoot) {
    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: resolvePostType(dataRoot.context),
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

function resolvePostType(context) {
    if (context?.includes('post')) {
        return 'post';
    }
    if (context?.includes('page')) {
        return 'page';
    }
    return null;
}

// ─── Head Assembly ───────────────────────────────────────────────────────────

function buildBaseMetaTags(meta, context, safeVersion, referrerPolicy, favicon, iconType, excludeList) {
    const head = [];

    if (context) {
        if (!excludeList.has('metadata')) {
            head.push(...buildMetadataTags(meta, context, referrerPolicy, favicon, iconType));
        }

        if (meta.previousUrl) {
            head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
        }

        if (meta.nextUrl) {
            head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
        }

        if (!_.includes(context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
            head.push(...buildStructuredDataTags(meta, excludeList));
        }
    }

    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

    return head;
}

function buildMetadataTags(meta, context, referrerPolicy, favicon, iconType) {
    const tags = [];

    if (meta.metaDescription && meta.metaDescription.length > 0) {
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

function buildStructuredDataTags(meta, excludeList) {
    const tags = [];

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

function buildCardAssetTags(excludeList) {
    if (excludeList.has('card_assets')) {
        return [];
    }

    const tags = [];

    if (cardAssets.hasFile('js')) {
        tags.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }

    if (cardAssets.hasFile('css')) {
        tags.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    return tags;
}

function buildMemberTrackingTags(excludeList) {
    const tags = [];

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        tags.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        tags.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    return tags;
}

function buildAnalyticsTags(dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return [];
    }

    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }

    return [getTinybirdTrackerScript(dataRoot)];
}

function injectAccentColor(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

function buildCodeInjectionTags(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    return [globalCodeinjection, postCodeInjection, tagCodeInjection].filter(value => !_.isEmpty(value));
}

function buildCustomFontTag(isSitePreview, siteData) {
    const headingFont = isSitePreview ? siteData?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? siteData?.body_font : settingsCache.get('body_font');

    const hasValidHeadingFont = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBodyFont = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeadingFont && !hasValidBodyFont) {
        return null;
    }

    /** @type FontSelection */
    const fontSelection = {};

    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }

    return new SafeString(generateCustomFontCss(fontSelection));
}

// ─── Main Export ─────────────────────────────────────────────────────────────

/**
 * **NOTE**
 * Express adds `_locals`, see https://github.com/expressjs/express/blob/4.15.4/lib/response.js#L962.
 * But `options.data.root.context` is available next to `root._locals.context`, because
 * Express creates a `renderOptions` object, see https://github.com/expressjs/express/blob/4.15.4/lib/application.js#L554
 * and merges all locals to the root of the object. Very confusing, because the data is available in different layers.
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ?? null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;
    const globalCodeinjection = sett