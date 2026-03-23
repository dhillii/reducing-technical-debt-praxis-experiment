# Refactored Ghost Head Helper

## Key Improvements
- Extracted logical sections into focused, single-responsibility functions
- Reduced nesting depth in the main function
- Eliminated repetitive patterns with helper utilities
- Improved readability and maintainability

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
 */

const {get: getMetaData, getAssetUrl} = metaData;

// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

function buildScriptTag(src, attrs = '', defer = true) {
    const deferAttr = defer ? 'defer ' : '';
    return `<script ${deferAttr}src="${src}" ${attrs} crossorigin="anonymous"></script>`;
}

// ---------------------------------------------------------------------------
// Structured data
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Feature helpers
// ---------------------------------------------------------------------------

function getPortalScript(data, frontendKey) {
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

    return buildScriptTag(scriptUrl, getDataAttributes(attributes));
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
        parts.push(getPortalScript(data, frontendKey));
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

    return buildScriptTag(scriptUrl, getDataAttributes(attrs));
}

function getAnnouncementBarAttrs(preview, siteUrl) {
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    if (!preview) {
        return attrs;
    }

    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        ...attrs,
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(searchParam.get('announcement_bg') || ''),
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
    const attrs = getAnnouncementBarAttrs(preview, siteUrl);

    if (!attrs) {
        return '';
    }

    return buildScriptTag(scriptUrl, getDataAttributes(attrs));
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

function getTinybirdTrackerParams(dataRoot, trackerConfig) {
    const {local: localConfig, stats: statsConfig} = trackerConfig;
    const useLocal = localConfig?.enabled ?? false;

    const endpoint = useLocal ? localConfig.endpoint : statsConfig.endpoint;
    const token = useLocal ? localConfig.token : statsConfig.token;
    const datasource = useLocal ? localConfig.datasource : statsConfig.datasource;

    const context = dataRoot.context;
    const postType = context?.includes('post') ? 'post'
        : context?.includes('page') ? 'page'
        : null;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: postType,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    return {endpoint, token, datasource, tbParams};
}

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const trackerConfig = {
        stats: config.get('tinybird:tracker'),
        local: config.get('tinybird:tracker:local')
    };

    const {endpoint, token, datasource, tbParams} = getTinybirdTrackerParams(dataRoot, trackerConfig);
    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && env !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

// ---------------------------------------------------------------------------
// Head section builders
// ---------------------------------------------------------------------------

function buildMetadataSection(meta, context, favicon, iconType, referrerPolicy, excludeList) {
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

function buildStructuredDataSection(meta, context, useStructuredData, excludeList) {
    const head = [];

    if (_.includes(context, 'paged') || !useStructuredData) {
        return head;
    }

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

function buildCardAssetsSection(excludeList) {
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

function buildMemberTrackingSection(excludeList) {
    const head = [];

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        const countsApi = `${urlUtils.getSiteUrl(true)}members/api/comments/counts/`;
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${countsApi}"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    return head;
}

function buildAnalyticsSection(dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return [];
    }

    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }

    return [getTinybirdTrackerScript(dataRoot)];
}

function buildCodeInjectionSection(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    return [globalCodeinjection, postCodeInjection, tagCodeInjection]
        .filter(code => !_.isEmpty(code));
}

function buildAccentColorStyle(accentColor, head) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const lastScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastScriptIndex !== -1) {
        head[lastScriptIndex] += styleTag;
        return null; // already inserted inline
    }

    return styleTag;
}

function buildCustomFontSection(options) {
    const isSitePreview = options.data?.site?._preview ?? false;

    const headingFont = isSitePreview
        ? options.data?.site?.heading_font
        : settingsCache.get('heading_font');

    const bodyFont = isSitePreview
        ? options.data?.site?.body_font
        : settingsCache.get('body_font');

    const hasValidHeadingFont = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBodyFont = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeadingFont && !hasValidBodyFont) {
        return null;
    }

    /** @type FontSelection */
    const fontSelection = {
        ...(headingFont && {heading: headingFont}),
        ...(bodyFont && {body: bodyFont})
    };

    return new SafeString(generateCustomFontCss(fontSelection));
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
 * hbs forwards the data to any hbs helper like this:
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
 *   }
 * }
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
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const [meta, frontendKey] = await Promise.all([
            getMetaData(dataRoot, dataRoot),
            getFrontendKey()
        ]);

        debug('end fetch');

        if (context) {
            head.push(...buildMetadataSection(meta, context, favicon, iconType, referrerPolicy, excludeList));
            head.push(...buildStructuredDataSection(meta, context, useStructuredData, excludeList));
        }

        head.push(
            `<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`,
            `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`
        );

        head.push(getMembersHelper(options.data, frontendKey, excludeList));

        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }

        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        head.push(getWebmentionDiscoveryLink());
        head.push(...buildCardAssetsSection(excludeList));
        head.push(...buildMemberTrackingSection(excludeList));
        head.push(...buildAnalyticsSection(dataRoot));

        if (options.data.site.accent_color) {
            const styleTag = buildAccentColorStyle(options.data.site.accent_color, head);
            if (styleTag) {
                head.push(styleTag);
            }
        }

        head.push(...buildCodeInjectionSection(globalCodeinjection, postCodeInjection, tagCodeInjection));

        const customFontStyle = buildCustomFontSection(options);
        if (customFontStyle) {
            head.push(customFontStyle);
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

| Area | Change |
|------|--------|
| **Parallel fetching** | `getMetaData` and `getFrontendKey` now run concurrently via `Promise.all` |
| **Section builders** | Extracted `buildMetadataSection`, `buildStructuredDataSection`, `buildCardAssetsSection`, `buildMemberTrackingSection`, `buildAnalyticsSection`, `buildCodeInjectionSection` to isolate concerns |
| **Portal logic** | Extracted `getPortalScript` from `getMembersHelper` to separate attribute building from script generation |
| **Announcement attrs** | Extracted `getAnnouncementBarAttrs` to isolate the preview-branching logic |
| **Tinybird config** | Extracted `getTinybirdTrackerParams` to separate config resolution from template rendering |
| **Accent color** | Extracted `buildAccentColorStyle` to isolate the find-last-index mutation pattern |
| **Custom fonts** | Extracted `buildCustomFontSection` to isolate font validation and CSS generation |
| **Spread over push.apply** | Replaced `head.push.apply(head, arr)` with `head.push(...arr)` |
| **Object spread** | Used `...` spread for conditional attribute merging instead of imperative assignments |
| **Null coalescing** | Replaced ternary chains with `??` and `||` where appropriate |