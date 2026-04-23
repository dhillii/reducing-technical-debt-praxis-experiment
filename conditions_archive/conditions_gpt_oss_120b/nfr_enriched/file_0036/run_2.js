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

/**
 * Write a meta tag string.
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Build structured data meta tags.
 */
function finaliseStructuredData(meta) {
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

/**
 * Build members helper scripts/styles.
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let out = '';

    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = _.has(data, 'site._preview') && data.site.accent_color ? data.site.accent_color : '';
        const attrs = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (colorString) attrs['accent-color'] = colorString;
        out += `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
    }

    if (!excludeList.has('cta_styles')) {
        out += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const fraud = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        out += `<script async src="https://js.stripe.com/v3/${fraud}"></script>`;
    }

    return out;
}

/**
 * Build search helper script.
 */
function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    if (!scriptUrl) return '';

    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': urlUtils.getAdminUrl() || urlUtils.getSiteUrl(),
        locale: settingsCache.get('locale') || 'en'
    };
    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

/**
 * Build announcement bar helper script.
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
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
        const sp = new URLSearchParams(preview);
        const ann = sp.get('announcement');
        const bg = sp.has('announcement_bg') ? sp.get('announcement_bg') : '';
        const vis = sp.has('announcement_vis');
        if (!ann || !vis) return '';
        attrs.announcement = escapeExpression(ann);
        attrs['announcement-background'] = escapeExpression(bg);
        attrs.preview = true;
    }

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

/**
 * Build webmention discovery link.
 */
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

/**
 * Build Tinybird analytics script.
 */
function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) return '';

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const stats = config.get('tinybird:tracker');
    const local = config.get('tinybird:tracker:local') || {};
    const enabled = local.enabled ?? false;

    const endpoint = enabled ? local.endpoint : stats.endpoint;
    const token = enabled ? local.token : stats.token;
    const datasource = enabled ? local.datasource : stats.datasource;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (v, k) => `tb_${k}="${v}"`).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/**
 * Append meta description, favicon, canonical and robots tags.
 */
function addMetaBasics(head, meta, excludeList, referrerPolicy, favicon, iconType) {
    if (excludeList.has('metadata')) return;

    if (meta.metaDescription) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }

    if (settingsCache.get('icon')) {
        head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }

    head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

    if (_.includes(meta.context, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Append prev/next navigation links.
 */
function addPrevNextLinks(head, meta) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

/**
 * Append structured data and schema JSON-LD.
 */
function addStructuredAndSchema(head, meta, excludeList, useStructuredData) {
    if (!useStructuredData) return;

    if (!excludeList.has('social_data')) {
        head.push('');
        head.push(...finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
    }
}

/**
 * Append generator meta and RSS link.
 */
function addGeneratorAndRss(head, safeVersion, meta) {
    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
}

/**
 * Append card assets if not excluded.
 */
function addCardAssets(head, excludeList) {
    if (excludeList.has('card_assets')) return;

    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

/**
 * Append comment counts script if enabled.
 */
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts')) return;
    if (settingsCache.get('comments_enabled') === 'off') return;

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/**
 * Append member attribution script if enabled.
 */
function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Append analytics script and flag.
 */
function addAnalytics(head, dataRoot, excludeList) {
    if (excludeList.has('analytics')) return;
    if (!settingsHelpers.isWebAnalyticsEnabled()) return;

    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Append accent color CSS.
 */
function addAccentColorStyle(head, accentColor) {
    const escaped = escapeExpression(accentColor);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const idx = _.findLastIndex(head, str => /<\/(style|script)>/.test(str));
    if (idx !== -1) {
        head[idx] = head[idx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Append custom font CSS if valid.
 */
function addCustomFonts(head, options) {
    const isPreview = options.data?.site?._preview ?? false;
    const headingFont = isPreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isPreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        /** @type FontSelection */
        const selection = {};
        if (headingFont) selection.heading = headingFont;
        if (bodyFont) selection.body = bodyFont;
        head.push(new SafeString(generateCustomFontCss(selection)));
    }
}

/**
 * Main helper exported to Handlebars.
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) return;

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context || null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head || null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        // meta basics
        if (context) {
            addMetaBasics(head, meta, excludeList, referrerPolicy, favicon, iconType);
            addPrevNextLinks(head, meta);
            addStructuredAndSchema(head, meta, excludeList, useStructuredData);
        }

        // generator & RSS
        addGeneratorAndRss(head, safeVersion, meta);

        // members, search, announcement
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (!excludeList.has('search')) head.push(getSearchHelper(frontendKey));
        if (!excludeList.has('announcement')) head.push(getAnnouncementBarHelper(options.data));

        // webmention
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        // assets & comments
        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMemberAttribution(head);
        addAnalytics(head, dataRoot, excludeList);

        // accent color
        if (options.data.site.accent_color) {
            addAccentColorStyle(head, options.data.site.accent_color);
        }

        // code injections
        if (!_.isEmpty(globalCodeinjection)) head.push(globalCodeinjection);
        if (!_.isEmpty(postCodeInjection)) head.push(postCodeInjection);
        if (!_.isEmpty(tagCodeInjection)) head.push(tagCodeInjection);

        // custom fonts
        addCustomFonts(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```