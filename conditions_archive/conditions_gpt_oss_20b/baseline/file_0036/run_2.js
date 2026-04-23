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
const {cardAssets} = require('../services/assets-minification');
const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

const {get: getMetaData, getAssetUrl} = metaData;

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return `<meta ${type}="${property}" content="${content}">`;
}

function buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion) {
    const tags = [];

    if (excludeList.has('metadata')) return tags;

    if (meta.metaDescription) {
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

    if (meta.previousUrl) {
        tags.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        tags.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    tags.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    tags.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

    return tags;
}

function buildStructuredData(meta, excludeList) {
    if (excludeList.has('social_data')) return [];

    const head = [];
    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, keyword => {
                if (keyword) {
                    head.push(writeMetaTag(property, escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content != null) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });
    return head;
}

function buildSchemaScript(meta, excludeList) {
    if (excludeList.has('schema') || !meta.schema) return '';
    return `<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n</script>`;
}

function buildMembersHelper(options, frontendKey, excludeList) {
    if (excludeList.has('portal') && excludeList.has('cta_styles') && !settingsCache.get('paid_members_enabled')) {
        return '';
    }

    let helper = '';

    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = _.has(options.data.root, 'site._preview') && options.data.root.site.accent_color
            ? options.data.root.site.accent_color
            : '';
        const attributes = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (colorString) attributes['accent-color'] = colorString;
        const dataAttributes = getDataAttributes(attributes);
        helper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    }

    if (!excludeList.has('cta_styles')) {
        helper += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        helper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }

    return helper;
}

function buildSearchHelper(frontendKey, excludeList) {
    if (excludeList.has('search')) return '';
    const {scriptUrl} = getFrontendAppConfig('sodoSearch');
    if (!scriptUrl) return '';
    const attrs = {
        key: frontendKey,
        styles: getFrontendAppConfig('sodoSearch').stylesUrl,
        'sodo-search': urlUtils.getAdminUrl() || urlUtils.getSiteUrl(),
        locale: settingsCache.get('locale') || 'en'
    };
    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

function buildAnnouncementBarHelper(options, excludeList) {
    if (excludeList.has('announcement')) return '';
    const preview = options.data.root?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    if (!isFilled && !preview) return '';

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
        const announcementBackground = searchParam.get('announcement_bg') || '';
        const announcementVisibility = searchParam.has('announcement_vis');

        if (!announcement || !announcementVisibility) return '';
        attrs.announcement = escapeExpression(announcement);
        attrs['announcement-background'] = escapeExpression(announcementBackground);
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
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

function buildCardAssets(excludeList) {
    if (excludeList.has('card_assets')) return '';
    let assets = '';
    if (cardAssets.hasFile('js')) {
        assets += `<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`;
    }
    if (cardAssets.hasFile('css')) {
        assets += `<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`;
    }
    return assets;
}

function buildCommentCounts(excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') return '';
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

function buildMemberAttribution(excludeList) {
    if (excludeList.has('member_attribution') || !settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) return '';
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

function buildTinybirdScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) return '';
    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const localEnabled = localConfig?.enabled ?? false;
    const endpoint = localEnabled ? localConfig.endpoint : statsConfig.endpoint;
    const token = localEnabled ? localConfig.token : statsConfig.token;
    const datasource = localEnabled ? localConfig.datasource : statsConfig.datasource;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post')
            ? 'post'
            : dataRoot.context?.includes('page')
            ? 'page'
            : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

function buildAccentColorStyle(options) {
    if (!options.data.site.accent_color) return '';
    const accentColor = escapeExpression(options.data.site.accent_color);
    return `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
}

function buildCodeInjections(options) {
    const injections = [];
    if (options.data.site.accent_color) {
        injections.push(buildAccentColorStyle(options));
    }
    if (options.data.root.codeinjection_head) {
        injections.push(options.data.root.codeinjection_head);
    }
    if (options.data.root.post?.codeinjection_head) {
        injections.push(options.data.root.post.codeinjection_head);
    }
    if (options.data.root.tag?.codeinjection_head) {
        injections.push(options.data.root.tag.codeinjection_head);
    }
    return injections.filter(Boolean).join('\n');
}

function buildCustomFontStyle(options, dataRoot) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if (
        (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))
    ) {
        const fontSelection = {};
        if (headingFont) fontSelection.heading = headingFont;
        if (bodyFont) fontSelection.body = bodyFont;
        const customCSS = generateCustomFontCss(fontSelection);
        return new SafeString(customCSS);
    }
    return '';
}

/**
 * Ghost Head Helper
 * @param {Object} options
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (options.data.root.statusCode >= 500) return;

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        const head = [];

        head.push(...buildMetaTags(meta, context, excludeList, referrerPolicy, favicon, iconType, safeVersion));

        if (!_.includes(context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
            head.push(...buildStructuredData(meta, excludeList));
            const schemaScript = buildSchemaScript(meta, excludeList);
            if (schemaScript) head.push(schemaScript);
        }

        head.push(buildMembersHelper(options, frontendKey, excludeList));
        head.push(buildSearchHelper(frontendKey, excludeList));
        head.push(buildAnnouncementBarHelper(options, excludeList));
        head.push(buildWebmentionLink());
        head.push(buildCardAssets(excludeList));
        head.push(buildCommentCounts(excludeList));
        head.push(buildMemberAttribution(excludeList));

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(buildTinybirdScript(dataRoot));
            if (dataRoot._locals) dataRoot._locals.ghostAnalytics = true;
        }

        head.push(buildCodeInjections(options));
        head.push(buildCustomFontStyle(options, dataRoot));

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString('');
    }
};

module.exports.async = true;
```