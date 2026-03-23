# Refactored Ghost Head Helper

## Key Refactoring Decisions

1. **Extract cohesive functions** - Break the monolithic `ghost_head` into focused, single-responsibility functions
2. **Eliminate nested conditionals** - Flatten control flow with early returns and guard clauses
3. **Reduce duplication** - Consolidate repeated patterns (exclude checks, asset injection)
4. **Improve naming clarity** - Make intent explicit at each level

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
// Feature helpers – each returns a string (or '') for a specific head section
// ---------------------------------------------------------------------------

function buildPortalScript(data, frontendKey) {
    const {scriptUrl} = getFrontendAppConfig('portal');
    const accentColor = (_.has(data, 'site._preview') && data.site.accent_color)
        ? data.site.accent_color
        : '';

    const attributes = {
        i18n: true,
        ghost: urlUtils.getSiteUrl(),
        key: frontendKey,
        api: urlUtils.urlFor('api', {type: 'content'}, true),
        locale: settingsCache.get('locale') || 'en',
        ...(accentColor && {'accent-color': accentColor})
    };

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attributes)} crossorigin="anonymous"></script>`;
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
        const fraudSignalsParam = process.env.NODE_ENV === 'testing-browser'
            ? '?advancedFraudSignals=false'
            : '';
        parts.push(`<script async src="https://js.stripe.com/v3/${fraudSignalsParam}"></script>`);
    }

    return parts.join('');
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

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function buildAnnouncementPreviewAttrs(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const hasVisibility = searchParam.has('announcement_vis');

    if (!announcement || !hasVisibility) {
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
        const previewAttrs = buildAnnouncementPreviewAttrs(preview);
        if (!previewAttrs) {
            return '';
        }
        attrs = {...attrs, ...previewAttrs};
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

function buildTinybirdParams(dataRoot, trackerConfig) {
    const {endpoint, token, datasource} = trackerConfig;
    const env = config.get('env');

    const tbData = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post'
            : dataRoot.context?.includes('page') ? 'page'
            : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    const tbParams = _.map(tbData, (value, key) => `tb_${key}="${value}"`).join(' ');
    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';
    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const useLocal = localConfig?.enabled ?? false;

    const trackerConfig = {
        endpoint: useLocal ? localConfig.endpoint : statsConfig.endpoint,
        token: useLocal ? localConfig.token : statsConfig.token,
        datasource: useLocal ? localConfig.datasource : statsConfig.datasource
    };

    return buildTinybirdParams(dataRoot, trackerConfig);
}

// ---------------------------------------------------------------------------
// Head section builders – each appends to the shared `head` array
// ---------------------------------------------------------------------------

function pushMetadataTags(head, {meta, context, referrerPolicy, favicon, iconType}) {
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

function pushPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

function pushStructuredData(head, meta, excludeList) {
    if (!excludeList.has('social_data')) {
        head.push('');
        head.push(...buildStructuredDataTags(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push(
            `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`
        );
    }
}

function pushCardAssets(head) {
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

function pushAccentColorStyle(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const lastScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastScriptIndex !== -1) {
        head[lastScriptIndex] += styleTag;
    } else {
        head.push(styleTag);
    }
}

function pushCustomFontCss(head, {isSitePreview, siteData}) {
    const headingFont = isSitePreview
        ? siteData?.heading_font
        : settingsCache.get('heading_font');
    const bodyFont = isSitePreview
        ? siteData?.body_font
        : settingsCache.get('body_font');

    const hasValidHeadingFont = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBodyFont = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeadingFont && !hasValidBodyFont) {
        return;
    }

    /** @type FontSelection */
    const fontSelection = {
        ...(headingFont && {heading: headingFont}),
        ...(bodyFont && {body: bodyFont})
    };

    head.push(new SafeString(generateCustomFontCss(fontSelection)));
}

function pushCodeInjections(head, {globalCodeinjection, postCodeInjection, tagCodeInjection}) {
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

// ---------------------------------------------------------------------------
// Context-dependent head assembly
// ---------------------------------------------------------------------------

function pushContextualTags(head, {meta, context, referrerPolicy, favicon, iconType, excludeList, useStructuredData}) {
    if (!context) {
        return;
    }

    if (!excludeList.has('metadata')) {
        pushMetadataTags(head, {meta, context, referrerPolicy, favicon, iconType});
    }

    pushPaginationLinks(head, meta);

    if (!_.includes(context, 'paged') && useStructuredData) {
        pushStructuredData(head, meta, excludeList);
    }
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

    const head = [];
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ?? null;
    const safeVersion = dataRoot._locals.safeVersion;
    const favicon = blogIcon.getIconUrl();

    const codeInjections = {
        globalCodeinjection: settingsCache.get('codeinjection_head'),
        postCodeInjection: dataRoot.post?.codeinjection_head ?? null,
        tagCodeInjection: dataRoot.tag?.codeinjection_head ?? null
    };

    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';

    debug('preparation complete, begin fetch');

    try {
        // @TODO: getMetaData(dataRoot, dataRoot) – see https://github.com/TryGhost/Ghost/issues/8995
        const [meta, frontendKey] = await Promise.all([
            getMetaData(dataRoot, dataRoot),
            getFrontendKey()
        ]);

        debug('end fetch');

        pushContextualTags(head, {
            meta,
            context,
            referrerPolicy,
            favicon,
            iconType: blogIcon.getIconType(favicon),
            excludeList,
            useStructuredData
        });

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

        // @TODO do this in a more "frameworky" way
        if (!excludeList.has('card_assets')) {
            pushCardAssets(head);
        }

        if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
        }

        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        if (options.data.site.accent_color) {
            pushAccentColorStyle(head, options.data.site.accent_color);
        }

        pushCodeInjections(head, codeInjections);

        pushCustomFontCss(head, {
            isSitePreview: options.data?.site?._preview ?? false,
            siteData: options.data?.site
        });

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

| Concern | Before | After |
|---|---|---|
| **Main function length** | ~130 lines of mixed logic | ~80 lines of orchestration |
| **Structured data** | `finaliseStructuredData` mutated external array | `buildStructuredDataTags` returns array, spread in |
| **Portal script** | Inlined inside `getMembersHelper` | Extracted to `buildPortalScript` |
| **Announcement preview** | Nested `if/return` inside helper | Extracted to `buildAnnouncementPreviewAttrs` with null-return guard |
| **Tinybird config** | Ternary chains inline | Extracted `trackerConfig` object + `buildTinybirdParams` |
| **Head assembly** | One giant `try` block | Dedicated `push*` functions per concern |
| **Font selection** | Imperative object building | Spread-based one-liner |
| **Parallel fetches** | Sequential `await` calls | `Promise.all` for `meta` + `frontendKey` |
| **Null coalescing** | Mix of `? :` and `||` | Consistent `??` for nullish, `||` for falsy |