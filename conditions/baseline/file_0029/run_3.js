# Refactored Ghost Head Helper

## Key Improvements
- Extracted logical sections into focused, single-responsibility functions
- Reduced nesting depth in the main function
- Eliminated repetitive patterns with helper utilities
- Improved readability through clear naming and structure

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

function buildDeferredScript(src, dataAttrs = '') {
    return `<script defer src="${src}" ${dataAttrs} crossorigin="anonymous"></script>`;
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

    return buildDeferredScript(scriptUrl, getDataAttributes(attributes));
}

function buildStripeScript() {
    const fraudSignalsParam = process.env.NODE_ENV === 'testing-browser'
        ? '?advancedFraudSignals=false'
        : '';
    return `<script async src="https://js.stripe.com/v3/${fraudSignalsParam}"></script>`;
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

    return buildDeferredScript(scriptUrl, getDataAttributes(attrs));
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

    return buildDeferredScript(scriptUrl, getDataAttributes(attrs));
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

function getWebmentionDiscoveryLink() {
    try {
        const webmentionUrl = new URL('webmentions/receive/', urlUtils.getSiteUrl());
        return `<link href="${webmentionUrl.href}" rel="webmention">`;
    } catch (err) {
        logging.warn(err);
        return '';
    }
}

function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const useLocal = localConfig?.enabled ?? false;

    const endpoint = useLocal ? localConfig.endpoint : statsConfig.endpoint;
    const token = useLocal ? localConfig.token : statsConfig.token;
    const datasource = useLocal ? localConfig.datasource : statsConfig.datasource;

    const tbParams = buildTinybirdParams(dataRoot);
    const datasourceAttr = datasource ? `data-datasource="${datasource}"` : '';
    const tokenAttr = (token && config.get('env') !== 'production') ? `data-token="${token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

function buildTinybirdParams(dataRoot) {
    const context = dataRoot.context;
    const postType = context?.includes('post') ? 'post' : context?.includes('page') ? 'page' : null;

    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: postType,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

// ---------------------------------------------------------------------------
// Head section builders
// ---------------------------------------------------------------------------

function buildMetadataTags(meta, context, referrerPolicy, favicon, iconType, excludeList) {
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
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');

    if (_.includes(context, 'paged') || !useStructuredData) {
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

function buildCommentCountsTag(excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return null;
    }

    const apiUrl = `${urlUtils.getSiteUrl(true)}members/api/comments/counts/`;
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${apiUrl}"></script>`;
}

function buildMemberAttributionTag() {
    if (!settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) {
        return null;
    }
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

function buildAccentColorTag(accentColor, head) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const lastScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (lastScriptIndex !== -1) {
        head[lastScriptIndex] += styleTag;
        return null; // mutated in place
    }

    return styleTag;
}

function buildCustomFontTag(options) {
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
    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }

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
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    const postCodeInjection = dataRoot.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot.tag?.codeinjection_head ?? null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');

    debug('preparation complete, begin fetch');

    try {
        const [meta, frontendKey] = await Promise.all([
            getMetaData(dataRoot, dataRoot),
            getFrontendKey()
        ]);

        debug('end fetch');

        if (context) {
            head.push(...buildMetadataTags(meta, context, referrerPolicy, favicon, iconType, excludeList));
            head.push(...buildStructuredDataTags(meta, context, excludeList));
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
        head.push(...buildCardAssetTags(excludeList));

        const commentCountsTag = buildCommentCountsTag(excludeList);
        if (commentCountsTag) {
            head.push(commentCountsTag);
        }

        const memberAttributionTag = buildMemberAttributionTag();
        if (memberAttributionTag) {
            head.push(memberAttributionTag);
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        if (options.data.site.accent_color) {
            const accentTag = buildAccentColorTag(options.data.site.accent_color, head);
            if (accentTag) {
                head.push(accentTag);
            }
        }

        [globalCodeinjection, postCodeInjection, tagCodeInjection]
            .filter(injection => !_.isEmpty(injection))
            .forEach(injection => head.push(injection));

        const customFontTag = buildCustomFontTag(options);
        if (customFontTag) {
            head.push(customFontTag);
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
| **Nesting depth** | Up to 5 levels | Max 3 levels |
| **Script building** | Repeated template literals | `buildDeferredScript()` utility |
| **Metadata/structured data** | Inline in main function | `buildMetadataTags()` / `buildStructuredDataTags()` |
| **Asset tags** | Inline conditionals | `buildCardAssetTags()`, `buildCommentCountsTag()`, `buildMemberAttributionTag()` |
| **Font handling** | Inline in main function | `buildCustomFontTag()` |
| **Code injections** | Three separate if-blocks | Single `.filter().forEach()` chain |
| **Parallel fetching** | Sequential `await` calls | `Promise.all([...])` |
| **Portal/Stripe scripts** | Embedded in `getMembersHelper` | `buildPortalScript()` / `buildStripeScript()` |