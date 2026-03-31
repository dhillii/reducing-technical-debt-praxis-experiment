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
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
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

// ─── Feature Helpers ─────────────────────────────────────────────────────────

function isMembersFeatureEnabled() {
    return settingsCache.get('members_enabled')
        || settingsCache.get('donations_enabled')
        || settingsCache.get('recommendations_enabled');
}

function buildPortalScript(data, frontendKey) {
    const {scriptUrl} = getFrontendAppConfig('portal');
    const colorString = (_.has(data, 'site._preview') && data.site.accent_color)
        ? data.site.accent_color
        : '';

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

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attributes)} crossorigin="anonymous"></script>`;
}

function getMembersHelper(data, frontendKey, excludeList) {
    if (!isMembersFeatureEnabled()) {
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
        const fraudParam = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        parts.push(`<script async src="https://js.stripe.com/v3/${fraudParam}"></script>`);
    }

    return parts.join('');
}

function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');

    if (!scriptUrl) {
        return '';
    }

    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': urlUtils.getAdminUrl() || urlUtils.getSiteUrl(),
        locale: settingsCache.get('locale') || 'en'
    };

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function buildAnnouncementPreviewAttrs(preview, attrs) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementBackground = searchParam.get('announcement_bg') ?? '';
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        ...attrs,
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(announcementBackground),
        preview: true
    };
}

function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content')
        && settingsCache.get('announcement_visibility').length;

    if (!isFilled && !preview) {
        return '';
    }

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);

    let attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    if (preview) {
        attrs = buildAnnouncementPreviewAttrs(preview, attrs);
        if (!attrs) {
            return '';
        }
    }

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function getWebmentionDiscoveryLink() {
    try {
        const webmentionUrl = new URL('webmentions/receive/', urlUtils.getSiteUrl());
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

function buildTinybirdParams(dataRoot, statsConfig) {
    const localConfig = config.get('tinybird:tracker:local');
    const useLocal = localConfig?.enabled ?? false;
    const source = useLocal ? localConfig : statsConfig;

    const {endpoint, token, datasource} = source;
    const env = config.get('env');

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post'
            : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    return {endpoint, token, datasource, env, tbParams};
}

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const statsConfig = config.get('tinybird:tracker');
    const {endpoint, token, datasource, env, tbParams} = buildTinybirdParams(dataRoot, statsConfig);

    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

// ─── Head Section Builders ───────────────────────────────────────────────────

function buildBasicMetaTags(meta, context, favicon, iconType, referrerPolicy, excludeList) {
    const tags = [];

    if (!excludeList.has('metadata')) {
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
    }

    if (meta.previousUrl) {
        tags.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        tags.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    return tags;
}

function buildStructuredDataTags(meta, context, excludeList) {
    const tags = [];

    if (_.includes(context, 'paged') || !config.isPrivacyDisabled('useStructuredData')) {
        return tags;
    }

    if (!excludeList.has('social_data')) {
        tags.push('');
        tags.push(...finaliseStructuredData(meta));
        tags.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        tags.push(
            `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`
        );
    }

    return tags;
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

function buildAnalyticsTags(dataRoot) {
    const tags = [];

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        tags.push(
            `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" ` +
            `data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`
        );
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        tags.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        tags.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }

    return tags;
}

function buildAccentColorTag(accentColor, head) {
    const escaped = escapeExpression(accentColor);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const lastScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastScriptIndex !== -1) {
        head[lastScriptIndex] += styleTag;
        return null;
    }

    return styleTag;
}

function buildCodeInjectionTags(...injections) {
    return injections.filter(code => !_.isEmpty(code));
}

function resolveFont(isSitePreview, siteData, cacheKey) {
    return isSitePreview ? siteData?.[cacheKey] : settingsCache.get(cacheKey);
}

function buildCustomFontTag(isSitePreview, siteData) {
    const headingFont = resolveFont(isSitePreview, siteData, 'heading_font');
    const bodyFont = resolveFont(isSitePreview, siteData, 'body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
        return null;
    }

    /** @type FontSelection */
    const fontSelection = {};
    if (headingFont) fontSelection.heading = headingFont;
    if (bodyFont) fontSelection.body = bodyFont;

    return new SafeString(generateCustomFontCss(fontSelection));
}

// ─── Main Helper ─────────────────────────────────────────────────────────────

/**
 * **NOTE**
 * Express adds `_locals`, see https://github.com/expressjs/express/blob/4.15.4/lib/response.js#L962.
 * But `options.data.root.context` is available next to `root._locals.context`, because
 * Express creates a `renderOptions` object, see https://github.com/expressjs/express/blob/4.15.4/lib/application.js#L554
 * and merges all locals to the root of the object. Very confusing, because the data is available in different layers.
 *
 * Express forwards the data like this to the hbs engine:
 * {
 *   post: {},             - res.render('view', databaseResponse)
 *   context: ['post'],    - from res.locals
 *   safeVersion: '1.x',   - from res.locals
 *   _locals: {
 *     context: ['post'],
 *     safeVersion: '1.x'
 *   }
 * }
 *
 * hbs forwards the data to any hbs helper like this
 * {
 *   data: {
 *     site: {},
 *     labs: {},
 *     config: {},
 *     root: {
 *       post: {},
 *       context: ['post'],
 *       locals: {...}
 *     }
 *  }
 *
 * `site`, `labs` and `config` are the templateOptions, search for `hbs.updateTemplateOptions` in the code base.
 *  Also see how the root object gets created, https://github.com/wycats/handlebars.js/blob/v4.0.6/lib/handlebars/runtime.js#L259
 */
// We use the name ghost_head to match the helper for consistency:
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
    const postCodeInjection = dataRoot.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot.tag?.codeinjection_head ?? null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const