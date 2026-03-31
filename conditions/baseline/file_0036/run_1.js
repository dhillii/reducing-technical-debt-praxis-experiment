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
        locale: settingsCache.get('locale') || 'en',
        ...(colorString && {'accent-color': colorString})
    };

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
    const announcementBackground = searchParam.get('announcement_bg') || '';
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
        const siteUrl = urlUtils.getSiteUrl();
        const webmentionUrl = new URL('webmentions/receive/', siteUrl);
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

// ─── Analytics ───────────────────────────────────────────────────────────────

function resolveTinybirdConfig() {
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const useLocal = localConfig?.enabled ?? false;

    return {
        endpoint: useLocal ? localConfig.endpoint : statsConfig.endpoint,
        token: useLocal ? localConfig.token : statsConfig.token,
        datasource: useLocal ? localConfig.datasource : statsConfig.datasource
    };
}

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const {endpoint, token, datasource} = resolveTinybirdConfig();

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

// ─── Custom Fonts ─────────────────────────────────────────────────────────────

function getCustomFontTag(data) {
    const isSitePreview = data?.site?._preview ?? false;

    const headingFont = isSitePreview
        ? data?.site?.heading_font
        : settingsCache.get('heading_font');
    const bodyFont = isSitePreview
        ? data?.site?.body_font
        : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
        return null;
    }

    /** @type FontSelection */
    const fontSelection = {
        ...(headingFont && {heading: headingFont}),
        ...(bodyFont && {body: bodyFont})
    };

    return new SafeString(generateCustomFontCss(fontSelection));
}

// ─── Accent Color ─────────────────────────────────────────────────────────────

function injectAccentColor(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] += styleTag;
    } else {
        head.push(styleTag);
    }
}

// ─── Head Builder ─────────────────────────────────────────────────────────────

function buildMetadataSection(meta, context, referrerPolicy, favicon, iconType, excludeList) {
    const head = [];

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription?.length > 0) {
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

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    return head;
}

function buildStructuredDataSection(meta, context, excludeList) {
    const head = [];
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');

    if (!_.includes(context, 'paged') && useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('', ...finaliseStructuredData(meta), '');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push(
                `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`
            );
        }
    }

    return head;
}

function buildCardAssets(excludeList) {
    const head = [];

    if (excludeList.has('card_assets')) {
        return head;
    }

    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }

    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    return head;
}

function buildOptionalScripts(excludeList) {
    const head = [];

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(
            `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" ` +
            `data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`
        );
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    return head;
}

function buildCodeInjections(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    return [globalCodeinjection, postCodeInjection, tagCodeInjection]
        .filter(code => !_.isEmpty(code));
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
    const iconType