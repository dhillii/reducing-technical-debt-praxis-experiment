```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
const {
    metaData,
    settingsCache,
    config,
    blogIcon,
    urlUtils,
    getFrontendKey,
    settingsHelpers
} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {
    generateCustomFontCss,
    isValidCustomFont,
    isValidCustomHeadingFont
} = require('@tryghost/custom-fonts');
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

/**
 * Build a meta tag string.
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Finalise structured data meta tags.
 */
function finaliseStructuredData(meta) {
    const head = [];
    _.each(meta.structuredData, function (content, property) {
        if (property === 'article:tag') {
            _.each(meta.keywords, function (keyword) {
                if (keyword !== '') {
                    keyword = escapeExpression(keyword);
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

/**
 * Build members helper scripts.
 */
function buildMembersHelper(options, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') &&
        !settingsCache.get('donations_enabled') &&
        !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let helper = '';

    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = (_.has(options.data.root, 'site._preview') && options.data.root.site.accent_color)
            ? options.data.root.site.accent_color
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
        const dataAttributes = getDataAttributes(attributes);
        helper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    }

    if (!excludeList.has('cta_styles')) {
        helper += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled =
            process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        helper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }

    return helper;
}

/**
 * Build search helper script.
 */
function buildSearchHelper(frontendKey, excludeList) {
    if (excludeList.has('search')) {
        return '';
    }
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

/**
 * Build announcement bar helper script.
 */
function buildAnnouncementBarHelper(options, excludeList) {
    if (excludeList.has('announcement')) {
        return '';
    }
    const preview = options.data.root?.site?._preview;
    const isFilled =
        settingsCache.get('announcement_content') &&
        settingsCache.get('announcement_visibility').length;

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
        const searchParam = new URLSearchParams(preview);
        const announcement = searchParam.get('announcement');
        const announcementBackground = searchParam.has('announcement_bg')
            ? searchParam.get('announcement_bg')
            : '';
        const announcementVisibility = searchParam.has('announcement_vis');

        if (!announcement || !announcementVisibility) {
            return '';
        }
        attrs.announcement = escapeExpression(announcement);
        attrs['announcement-background'] = escapeExpression(announcementBackground);
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Build webmention discovery link.
 */
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

/**
 * Build Tinybird tracker script.
 */
function buildTinybirdTrackerScript(dataRoot) {
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

    const tbParams = _.map(
        {
            site_uuid: settingsCache.get('site_uuid'),
            post_uuid: dataRoot.post?.uuid,
            post_type: dataRoot.context?.includes('post')
                ? 'post'
                : dataRoot.context?.includes('page')
                ? 'page'
                : null,
            member_uuid: dataRoot.member?.uuid,
            member_status: dataRoot.member?.status
        },
        (value, key) => `tb_${key}="${value}"`
    ).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/**
 * Build card assets scripts and styles.
 */
function buildCardAssets(excludeList) {
    if (excludeList.has('card_assets')) {
        return [];
    }
    const assets = [];
    if (cardAssets.hasFile('js')) {
        assets.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        assets.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
    return assets;
}

/**
 * Build comment counts script.
 */
function buildCommentCounts(excludeList) {
    if (excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
    }
    return '';
}

/**
 * Build member attribution script.
 */
function buildMemberAttribution() {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
    }
    return '';
}

/**
 * Build accent color style tag.
 */
function buildAccentColorStyle(options, head) {
    if (!options.data.site.accent_color) {
        return '';
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] += styleTag;
    } else {
        head.push(styleTag);
    }
    return '';
}

/**
 * Build custom font style.
 */
function buildCustomFontStyle(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if (
        (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))
    ) {
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
    return '';
}

/**
 * Build global code injection.
 */
function buildGlobalCodeInjection(globalCodeinjection) {
    return globalCodeinjection || '';
}

/**
 * Build post code injection.
 */
function buildPostCodeInjection(postCodeInjection) {
    return postCodeInjection || '';
}

/**
 * Build tag code injection.
 */
function buildTagCodeInjection(tagCodeInjection) {
    return tagCodeInjection || '';
}

/**
 * Build meta tags for description, icon, canonical, robots, referrer.
 */
function buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion) {
    const tags = [];
    if (!excludeList.has('metadata')) {
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
    }
    return tags;
}

/**
 * Build navigation link tags.
 */
function buildNavigationLinks(meta, context, excludeList) {
    const links = [];
    if (meta.previousUrl) {
        links.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        links.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
    return links;
}

/**
 * Build structured data tags.
 */
function buildStructuredData(meta, context, excludeList) {
    if (!excludeList.has('social_data') && !_.includes(context, 'paged') && config.isPrivacyDisabled('useStructuredData') === false) {
        return [''].concat(finaliseStructuredData(meta), ['']);
    }
    return [];
}

/**
 * Build schema script tag.
 */
function buildSchema(meta, excludeList) {
    if (!excludeList.has('schema') && meta.schema) {
        return `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`;
    }
    return '';
}

/**
 * Build generator meta tag.
 */
function buildGeneratorTag(safeVersion) {
    return `<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`;
}

/**
 * Build RSS link tag.
 */
function buildRssLink(meta) {
    return `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`;
}

/**
 * Build analytics script and flag.
 */
function buildAnalytics(dataRoot, excludeList, head) {
    if (!excludeList.has('analytics') && settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(buildTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
    return '';
}

/**
 * Main ghost_head helper.
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        const frontendKeyLocal = frontendKey; // avoid re-evaluating

        // Meta tags
        head.push(...buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion));

        // Navigation links
        head.push(...buildNavigationLinks(meta, context, excludeList));

        // Structured data
        head.push(...buildStructuredData(meta, context, excludeList));

        // Schema
        head.push(buildSchema(meta, excludeList));

        // Generator and RSS
        head.push(buildGeneratorTag(safeVersion));
        head.push(buildRssLink(meta));

        // Helpers
        head.push(buildMembersHelper(options, frontendKeyLocal, excludeList));
        head.push(buildSearchHelper(frontendKeyLocal, excludeList));
        head.push(buildAnnouncementBarHelper(options, excludeList));
        head.push(buildWebmentionLink());
        head.push(...buildCardAssets(excludeList));
        head.push(buildCommentCounts(excludeList));
        head.push(buildMemberAttribution());
        buildAnalytics(dataRoot, excludeList, head);

        // Accent color
        buildAccentColorStyle(options, head);

        // Global, post, tag injections
        head.push(buildGlobalCodeInjection(globalCodeinjection));
        head.push(buildPostCodeInjection(postCodeInjection));
        head.push(buildTagCodeInjection(tagCodeInjection));

        // Custom fonts
        const customFont = buildCustomFontStyle(options);
        if (customFont) {
            head.push(customFont);
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