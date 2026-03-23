# Refactored Ghost Head Helper

## Key Refactoring Strategies Applied

1. **Extract helper builders into focused functions** - Each head section becomes its own function
2. **Reduce nesting** with early returns and guard clauses
3. **Eliminate repetition** in font/settings logic
4. **Separate concerns** - data extraction, building, and assembly are distinct phases

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

// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

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
            return;
        }

        if (content !== null && content !== undefined) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });

    return head;
}

// ---------------------------------------------------------------------------
// Section builders — each returns a string (or array of strings)
// ---------------------------------------------------------------------------

function buildMetadataSection(meta, context, referrerPolicy, favicon, iconType) {
    const head = [];

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

    return head;
}

function buildPaginationLinks(meta) {
    const head = [];

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    return head;
}

function buildStructuredDataSection(meta, excludeList) {
    const head = [];

    if (!excludeList.has('social_data')) {
        head.push('');
        head.push(...finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push(
            `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`
        );
    }

    return head;
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
        parts.push(buildStripeScript());
    }

    return parts.join('');
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

function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser'
        ? '?advancedFraudSignals=false'
        : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

function buildSearchHelper(frontendKey) {
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

    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    if (preview) {
        const previewAttrs = buildAnnouncementPreviewAttrs(preview);
        if (!previewAttrs) {
            return '';
        }
        Object.assign(attrs, previewAttrs);
    }

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function buildAnnouncementPreviewAttrs(preview) {
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

function buildWebmentionLink() {
    try {
        const webmentionUrl = new URL('webmentions/receive/', urlUtils.getSiteUrl());
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

function buildCardAssets() {
    const parts = [];

    if (cardAssets.hasFile('js')) {
        parts.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }

    if (cardAssets.hasFile('css')) {
        parts.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    return parts;
}

function buildCommentCountsScript() {
    if (settingsCache.get('comments_enabled') === 'off') {
        return '';
    }
    const apiUrl = `${urlUtils.getSiteUrl(true)}members/api/comments/counts/`;
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${apiUrl}"></script>`;
}

function buildMemberAttributionScript() {
    if (!settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
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
        post_type: resolvePostType(dataRoot.context),
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
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

function buildAccentColorStyle(accentColor) {
    return `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
}

function injectAccentColor(head, accentColor) {
    if (!accentColor) {
        return;
    }

    const styleTag = buildAccentColorStyle(accentColor);
    const lastScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastScriptIndex !== -1) {
        head[lastScriptIndex] += styleTag;
    } else {
        head.push(styleTag);
    }
}

function buildCustomFontCss(isSitePreview, siteData) {
    const headingFont = isSitePreview
        ? siteData?.heading_font
        : settingsCache.get('heading_font');

    const bodyFont = isSitePreview
        ? siteData?.body_font
        : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
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

    return generateCustomFontCss(fontSelection);
}

// ---------------------------------------------------------------------------
// Context-aware section assembly
// ---------------------------------------------------------------------------

function buildContextSection(meta, context, excludeList, referrerPolicy, favicon, iconType) {
    const head = [];

    if (!context) {
        return head;
    }

    if (!excludeList.has('metadata')) {
        head.push(...buildMetadataSection(meta, context, referrerPolicy, favicon, iconType));
    }

    head.push(...buildPaginationLinks(meta));

    if (!_.includes(context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
        head.push(...buildStructuredDataSection(meta, excludeList));
    }

    return head;
}

// ---------------------------------------------------------------------------
// Data extraction
// ---------------------------------------------------------------------------

function extractHeadContext(options) {
    const dataRoot = options.data.root;

    return {
        dataRoot,
        context: dataRoot._locals.context ?? null,
        safeVersion: dataRoot._locals.safeVersion,
        postCodeInjection: dataRoot.post?.codeinjection_head ?? null,
        tagCodeInjection: dataRoot.tag?.codeinjection_head ?? null,
        globalCodeInjection: settingsCache.get('codeinjection_head'),
        referrerPolicy: config.get('referrerPolicy') || 'no-referrer-when-downgrade',
        favicon: blogIcon.getIconUrl(),
        isSitePreview: options.data?.site?._preview ?? false
    };
}

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

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
    const {
        dataRoot,
        context,
        safeVersion,
        postCodeInjection,
        tagCodeInjection,
        globalCodeInjection,
        referrerPolicy,
        favicon,
        isSitePreview
    } = extractHeadContext(options);

    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        /**
         * @TODO:
         *   - getMetaData(dataRoot, dataRoot) -> yes that looks confusing!
         *   - there is a very mixed usage of `data.context` vs. `root.context` vs `root._locals.context` vs. `this.context`
         *   - NOTE: getMetaData won't live here anymore soon, see https://github.com/TryGhost/Ghost/issues/8995
         *   - therefore we get rid of using `getMetaData(this, dataRoot)`
         *   - dataRoot has access to *ALL* locals, see function description
         *   - it should not break anything
         */
        const [meta, frontendKey] = await Promise.all([
            getMetaData(dataRoot, dataRoot),
            getFrontendKey()
        ]);

        debug('end fetch');

        // Context-dependent metadata
        head.push(...buildContextSection(meta, context, excludeList, referrerPolicy, favicon, iconType));

        // Always-present tags
        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

        // Feature scripts
        head.push(buildMembersHelper(options.data, frontendKey, excludeList));

        if (!excludeList.has('search')) {
            head.push(buildSearchHelper(frontendKey));
        }

        if (!excludeList.has('announcement')) {
            head.push(buildAnnouncementBarHelper(options.data));
        }

        head.push(buildWebmentionLink());

        // @TODO do this in a more "frameworky" way
        if (!excludeList.has('card_assets')) {
            head.push(...buildCardAssets());
        }

        if (!excludeList.has('comment_counts')) {
            head.push(buildCommentCountsScript());
        }

        head.push(buildMemberAttributionScript());

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(buildTinybirdTrackerScript(dataRoot));

            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        // Accent color — injected adjacent to last script/style tag
        injectAccentColor(head, options.data.site.accent_color);

        // Code injection
        [globalCodeInjection, postCodeInjection, tagCodeInjection].forEach((injection) => {
            if (!_.isEmpty(injection)) {
                head.push(injection);
            }
        });

        // Custom fonts
        const customFontCss = buildCustomFontCss(isSitePreview, options.data?.site);
        if (customFontCss) {
            head.push(new SafeString(customFontCss));
        }

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

| Area | Before | After |
|------|--------|-------|
| **Main function length** | ~130 lines | ~80 lines |
| **`getMembersHelper`** | Monolithic with inline portal/stripe logic | Split into `buildMembersHelper`, `buildPortalScript`, `buildStripeScript` |
| **`getAnnouncementBarHelper`** | Mixed preview/normal logic | Preview attrs extracted to `buildAnnouncementPreviewAttrs` |
| **`getTinybirdTrackerScript`** | Inline post-type resolution | Extracted to `resolvePostType` |
| **Context section** | Nested `if (context)` block in main | Extracted to `buildContextSection` |
| **Data extraction** | Scattered `const` declarations | Consolidated in `extractHeadContext` |
| **Parallel fetching** | Sequential `await` calls | `Promise.all([getMetaData, getFrontendKey])` |
| **Code injection loop** | Three separate `if (!_.isEmpty(...))` blocks | Single `.forEach` over array |
| **Accent color** | Inline index-finding logic | Extracted to `injectAccentColor` + `buildAccentColorStyle` |
| **Font CSS** | Complex nested conditionals | Extracted to `buildCustomFontCss` with early return |