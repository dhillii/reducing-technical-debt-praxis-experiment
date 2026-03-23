# Refactored Ghost Head Helper

## Key Refactoring Decisions

1. **Extract cohesive helper builders** into focused, single-responsibility functions
2. **Eliminate deep nesting** in the main function via early returns and extracted methods
3. **Replace scattered conditionals** with a pipeline/builder pattern
4. **Consolidate font logic** into its own function
5. **Reduce parameter passing** by grouping related data into context objects

```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme

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
 *
 * @typedef {Object} HeadContext
 * @property {Object} dataRoot
 * @property {Object} data
 * @property {string[]} context
 * @property {string} safeVersion
 * @property {Set<string>} excludeList
 * @property {string} frontendKey
 * @property {Object} meta
 */

const {get: getMetaData, getAssetUrl} = metaData;

// ---------------------------------------------------------------------------
// Low-level tag builders
// ---------------------------------------------------------------------------

function writeMetaTag(property, content, type) {
    const resolvedType = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${resolvedType}="${property}" content="${content}">`;
}

function buildStructuredDataTags(meta) {
    const tags = [];

    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, (keyword) => {
                if (keyword !== '') {
                    tags.push(writeMetaTag(property, escapeExpression(keyword)));
                }
            });
            tags.push('');
        } else if (content !== null && content !== undefined) {
            tags.push(writeMetaTag(property, escapeExpression(content)));
        }
    });

    return tags;
}

// ---------------------------------------------------------------------------
// Feature-specific script/link builders
// ---------------------------------------------------------------------------

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

function buildMembersHelper(data, frontendKey, excludeList) {
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
        const fraudSignalsParam = process.env.NODE_ENV === 'testing-browser'
            ? '?advancedFraudSignals=false'
            : '';
        parts.push(`<script async src="https://js.stripe.com/v3/${fraudSignalsParam}"></script>`);
    }

    return parts.join('\n    ');
}

function buildSearchHelper(frontendKey) {
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

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function buildAnnouncementBarPreviewAttrs(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(
            searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : ''
        ),
        preview: true
    };
}

function buildAnnouncementBarHelper(data) {
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
        const previewAttrs = buildAnnouncementBarPreviewAttrs(preview);
        if (!previewAttrs) {
            return '';
        }
        attrs = {...attrs, ...previewAttrs};
    }

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function buildWebmentionLink() {
    try {
        const siteUrl = urlUtils.getSiteUrl();
        const webmentionUrl = new URL('webmentions/receive/', siteUrl);
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

function buildTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const useLocal = localConfig?.enabled ?? false;

    const endpoint = useLocal ? localConfig.endpoint : statsConfig.endpoint;
    const token = useLocal ? localConfig.token : statsConfig.token;
    const datasource = useLocal ? localConfig.datasource : statsConfig.datasource;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post'
            : dataRoot.context?.includes('page') ? 'page'
            : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

function buildCustomFontCss(data) {
    const isSitePreview = data?.site?._preview ?? false;

    const headingFont = isSitePreview
        ? data?.site?.heading_font
        : settingsCache.get('heading_font');
    const bodyFont = isSitePreview
        ? data?.site?.body_font
        : settingsCache.get('body_font');

    const hasValidHeadingFont = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBodyFont = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeadingFont && !hasValidBodyFont) {
        return '';
    }

    /** @type FontSelection */
    const fontSelection = {
        ...(headingFont && {heading: headingFont}),
        ...(bodyFont && {body: bodyFont})
    };

    return generateCustomFontCss(fontSelection);
}

function buildAccentColorStyle(accentColor) {
    return `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
}

// ---------------------------------------------------------------------------
// Head section builders (grouped by concern)
// ---------------------------------------------------------------------------

/**
 * @param {HeadContext} ctx
 */
function buildMetadataTags(ctx) {
    const {meta, excludeList, context} = ctx;
    const tags = [];

    if (excludeList.has('metadata')) {
        return tags;
    }

    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const isPreview = _.includes(context, 'preview');

    if (meta.metaDescription?.length > 0) {
        tags.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }

    if (settingsCache.get('icon')) {
        tags.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }

    tags.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

    if (isPreview) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }

    return tags;
}

/**
 * @param {HeadContext} ctx
 */
function buildPaginationLinks(ctx) {
    const {meta} = ctx;
    const tags = [];

    if (meta.previousUrl) {
        tags.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        tags.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    return tags;
}

/**
 * @param {HeadContext} ctx
 */
function buildSocialAndSchemaTags(ctx) {
    const {meta, context, excludeList} = ctx;
    const tags = [];
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');

    if (_.includes(context, 'paged') || !useStructuredData) {
        return tags;
    }

    if (!excludeList.has('social_data')) {
        tags.push('', ...buildStructuredDataTags(meta), '');
    }

    if (!excludeList.has('schema') && meta.schema) {
        tags.push(
            `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`
        );
    }

    return tags;
}

/**
 * @param {HeadContext} ctx
 */
function buildCardAssetTags(ctx) {
    const {excludeList} = ctx;
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

/**
 * @param {HeadContext} ctx
 */
function buildAnalyticsTags(ctx) {
    const {dataRoot, excludeList} = ctx;
    const tags = [];

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        const countsApi = `${urlUtils.getSiteUrl(true)}members/api/comments/counts/`;
        tags.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${countsApi}"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        tags.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        tags.push(buildTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }

    return tags;
}

/**
 * @param {HeadContext} ctx
 */
function buildCodeInjectionTags(ctx) {
    const {dataRoot, data} = ctx;
    const tags = [];

    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;

    if (!_.isEmpty(globalCodeinjection)) {
        tags.push(globalCodeinjection);
    }

    if (!_.isEmpty(postCodeInjection)) {
        tags.push(postCodeInjection);
    }

    if (!_.isEmpty(tagCodeInjection)) {
        tags.push(tagCodeInjection);
    }

    const customFontCss = buildCustomFontCss(data);
    if (customFontCss) {
        tags.push(new SafeString(customFontCss));
    }

    return tags;
}

// ---------------------------------------------------------------------------
// Accent color injection (appended to last style/script tag)
// ---------------------------------------------------------------------------

function injectAccentColor(head, accentColor) {
    if (!accentColor) {
        return;
    }

    const styleTag = buildAccentColorStyle(accentColor);
    const lastTagIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastTagIndex !== -1) {
        head[lastTagIndex] = head[lastTagIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

/**
 * Express adds `_locals`, see https://github.com/expressjs/express/blob/4.15.4/lib/response.js#L962.
 * `options.data.root.context` is available next to `root._locals.context` because Express creates a
 * `renderOptions` object and merges all locals to the root of the object.
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ?? null;

    debug('preparation complete, begin fetch');

    try {
        const [meta, frontendKey] = await Promise.all([
            getMetaData(dataRoot, dataRoot),
            getFrontendKey()
        ]);

        debug('end fetch');

        /** @type HeadContext */
        const ctx = {
            dataRoot,
            data: options.data,
            context: context ?? [],
            safeVersion: dataRoot._locals.safeVersion,
            excludeList: new Set(options?.hash?.exclude?.split(',') ?? []),
            frontendKey,
            meta
        };

        if (context) {
            head.push(...buildMetadataTags(ctx));
            head.push(...buildPaginationLinks(ctx));
            head.push(...buildSocialAndSchemaTags(ctx));
        }

        head.push(
            `<meta name="generator" content="Ghost ${escapeExpression(ctx.safeVersion)}">`,
            `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`
        );

        head.push(buildMembersHelper(options.data, frontendKey, ctx.excludeList));

        if (!ctx.excludeList.has('search')) {
            head.push(buildSearchHelper(frontendKey));
        }

        if (!ctx.excludeList.has('announcement')) {
            head.push(buildAnnouncementBarHelper(options.data));
        }

        head.push(buildWebmentionLink());
        head.push(...buildCardAssetTags(ctx));
        head.push(...buildAnalyticsTags(ctx));

        injectAccentColor(head, options.data.site.accent_color);

        head.push(...buildCodeInjectionTags(ctx));

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```

## Summary of Changes

| Issue | Before | After |
|---|---|---|
| **Main function length** | ~130 lines with deep nesting | ~60 lines, flat pipeline |
| **Mixed concerns** | All logic inline | Separated into `build*Tags()` functions grouped by concern |
| **Repeated conditionals** | `excludeList.has()` scattered everywhere | Encapsulated inside each builder |
| **Parameter passing** | Individual args threaded through calls | `HeadContext` object shared across builders |
| **Font logic** | Inline with nested ternaries | `buildCustomFontCss()` with clear guard clauses |
| **Portal attributes** | Inline object with `if` mutation | Spread-based construction |
| **Sequential awaits** | `await getMetaData` then `await getFrontendKey` | `Promise.all()` for parallel fetching |
| **Announcement preview** | Nested `if` with early `return` (wrong type) | Extracted `buildAnnouncementBarPreviewAttrs()` returning `null` |