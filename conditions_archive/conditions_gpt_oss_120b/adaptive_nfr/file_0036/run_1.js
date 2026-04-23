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
 * Write a meta tag.
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Build structured data tags.
 * @param {object} meta
 * @returns {string[]}
 */
function finaliseStructuredData(meta) {
    const head = [];

    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, keyword => {
                if (keyword !== '') {
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
 * Guard: members feature disabled.
 * @returns {boolean}
 */
function isMembersDisabled() {
    return !settingsCache.get('members_enabled') &&
        !settingsCache.get('donations_enabled') &&
        !settingsCache.get('recommendations_enabled');
}

/**
 * Build members helper markup.
 * @param {object} data
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (isMembersDisabled()) {
        return '';
    }

    let markup = '';

    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = (_.has(data, 'site._preview') && data.site.accent_color) ? data.site.accent_color : '';
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
        markup += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    }

    if (!excludeList.has('cta_styles')) {
        markup += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        markup += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }

    return markup;
}

/**
 * Build search helper markup.
 * @param {string} frontendKey
 * @returns {string}
 */
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
    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Build announcement bar helper markup.
 * @param {object} data
 * @returns {string}
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

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
        const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
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
 * @returns {string}
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
 * Build Tinybird tracker script.
 * @param {object} dataRoot
 * @returns {string}
 */
function getTinybirdTrackerScript(dataRoot) {
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

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/**
 * Predicate: should include metadata.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldIncludeMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Predicate: is preview context.
 * @param {string[]} context
 * @returns {boolean}
 */
function isPreviewContext(context) {
    return _.includes(context, 'preview');
}

/**
 * Predicate: is paged context.
 * @param {string[]} context
 * @returns {boolean}
 */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/**
 * Add meta tags to head array.
 * @param {object} meta
 * @param {object} head
 * @param {Set<string>} excludeList
 * @param {string[]} context
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 */
function addMetaTags(meta, head, excludeList, context, referrerPolicy, favicon, iconType) {
    if (!shouldIncludeMetadata(excludeList)) {
        return;
    }

    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }

    if (settingsCache.get('icon')) {
        head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }

    head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);

    if (isPreviewContext(context)) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Add pagination links.
 * @param {object} meta
 * @param {object} head
 */
function addPaginationLinks(meta, head) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

/**
 * Add structured data and schema.
 * @param {object} meta
 * @param {object} head
 * @param {Set<string>} excludeList
 * @param {string[]} context
 * @param {boolean} useStructuredData
 */
function addStructuredData(meta, head, excludeList, context, useStructuredData) {
    if (isPagedContext(context) || !useStructuredData) {
        return;
    }

    if (!excludeList.has('social_data')) {
        head.push('');
        head.push(...finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }
}

/**
 * Add generator and RSS link.
 * @param {object} meta
 * @param {object} head
 * @param {string} safeVersion
 */
function addGeneratorAndRss(meta, head, safeVersion) {
    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
}

/**
 * Add card assets.
 * @param {object} head
 * @param {Set<string>} excludeList
 */
function addCardAssets(head, excludeList) {
    if (excludeList.has('card_assets')) {
        return;
    }
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}

/**
 * Add comment counts script.
 * @param {object} head
 * @param {Set<string>} excludeList
 */
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return;
    }
    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/**
 * Add member attribution script.
 * @param {object} head
 */
function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Add analytics script.
 * @param {object} head
 * @param {object} dataRoot
 */
function addAnalytics(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }
    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Add accent color style.
 * @param {object} head
 * @param {object} options
 */
function addAccentColorStyle(head, options) {
    if (!options.data.site.accent_color) {
        return;
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const lastStyleOrScript = _.findLastIndex(head, str => /<\/(style|script)>/.test(str));
    if (lastStyleOrScript !== -1) {
        head[lastStyleOrScript] = head[lastStyleOrScript] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Add custom font CSS.
 * @param {object} head
 * @param {object} options
 */
function addCustomFonts(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
        return;
    }

    /** @type FontSelection */
    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }

    const customCSS = generateCustomFontCss(fontSelection);
    head.push(new SafeString(customCSS));
}

/**
 * Main helper exported to Handlebars.
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    // Guard: server error page
    if (options.data.root.statusCode >= 500) {
        return new SafeString('');
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context || null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        // Meta tags
        if (context) {
            addMetaTags(meta, head, excludeList, context, referrerPolicy, favicon, iconType);
            addPaginationLinks(meta, head);
            addStructuredData(meta, head, excludeList, context, useStructuredData);
        }

        // Generator & RSS
        addGeneratorAndRss(meta, head, safeVersion);

        // Members, Search, Announcement
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }
        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        // Webmention
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        // Card assets
        addCardAssets(head, excludeList);

        // Comment counts
        addCommentCounts(head, excludeList);

        // Member attribution
        addMemberAttribution(head);

        // Analytics
        addAnalytics(head, dataRoot);

        // Accent color
        addAccentColorStyle(head, options);

        // Global code injection
        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }

        // Post / Tag code injection
        const postCodeInjection = dataRoot?.post?.codeinjection_head;
        const tagCodeInjection = dataRoot?.tag?.codeinjection_head;
        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }
        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }

        // Custom fonts
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