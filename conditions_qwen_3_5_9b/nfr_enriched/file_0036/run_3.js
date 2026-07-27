const {metaData, settingsCache, config, blogIcon, urlUtils, getFrontendKey, settingsHelpers} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {generateCustomFontCss, isValidCustomFont, isValidCustomHeadingFont} = require('@tryghost/custom-fonts');
const {cardAssets} = require('../services/assets-minification');

const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

const {get: getMetaData, getAssetUrl} = metaData;

/**
 * Generates a meta tag string for the given property and content.
 * @param {string} property - The meta property or name.
 * @param {string} content - The meta content value.
 * @param {string} type - The meta tag type (name or property).
 * @returns {string} The generated meta tag HTML.
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

/**
 * Finalizes structured data by generating meta tags for article tags and other properties.
 * @param {Object} meta - The metadata object containing structuredData and keywords.
 * @returns {string[]} An array of meta tag strings.
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
 * Generates the Portal script and styles for members.
 * @param {Object} data - The template data object.
 * @param {string} frontendKey - The frontend key for the portal.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {string} The generated Portal script HTML.
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let membersHelper = '';
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
        membersHelper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
    }
    if (!excludeList.has('cta_styles')) {
        membersHelper += (`<style id="gh-members-styles">${templateStyles}</style>`);
    }
    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }
    return membersHelper;
}

/**
 * Generates the Sodo Search script.
 * @param {string} frontendKey - The frontend key for search.
 * @returns {string} The generated search script HTML.
 */
function getSearchHelper(frontendKey) {
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
    let helper = `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;

    return helper;
}

/**
 * Generates the Announcement Bar script.
 * @param {Object} data - The template data object.
 * @returns {string} The generated announcement bar script HTML.
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
            return;
        }
        attrs.announcement = escapeExpression(announcement);
        attrs['announcement-background'] = escapeExpression(announcementBackground);
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    let helper = `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;

    return helper;
}

/**
 * Generates the Webmention Discovery link.
 * @returns {string} The generated webmention link HTML.
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
 * Generates the Tinybird Tracker script.
 * @param {Object} dataRoot - The root data object.
 * @returns {string} The generated Tinybird tracker script HTML.
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
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects custom font CSS into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} fontSelection - The font selection object.
 * @returns {void}
 */
function injectCustomFontCss(head, fontSelection) {
    const customCSS = generateCustomFontCss(fontSelection);
    head.push(new SafeString(customCSS));
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Object} dataRoot._locals - The locals object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects meta tags into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} meta - The metadata object.
 * @param {string} context - The current context.
 * @param {Set} excludeList - A set of features to exclude.
 * @param {string} referrerPolicy - The referrer policy.
 * @returns {void}
 */
function injectMetaTags(head, meta, context, excludeList, referrerPolicy) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
        }

        head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

        if (_.includes(context, 'preview')) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
        }
    }

    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }

    if (!_.includes(context, 'paged') && useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push.apply(head, finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push('<script type="application/ld+json">\n' + JSON.stringify(meta.schema, null, '    ') + '\n    </script>\n');
        }
    }
}

/**
 * Injects generator and RSS link into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} safeVersion - The safe version string.
 * @param {Object} meta - The metadata object.
 * @returns {void}
 */
function injectGeneratorAndRssLink(head, safeVersion, meta) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">');
}

/**
 * Injects portal script and styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} data - The template data object.
 * @param {string} frontendKey - The frontend key for the portal.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectPortalScript(head, data, frontendKey, excludeList) {
    head.push(getMembersHelper(data, frontendKey, excludeList));
}

/**
 * Injects search script into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} frontendKey - The frontend key for search.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectSearchScript(head, frontendKey, excludeList) {
    if (!excludeList.has('search')) {
        head.push(getSearchHelper(frontendKey));
    }
}

/**
 * Injects announcement bar script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} data - The template data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectAnnouncementBarScript(head, data, excludeList) {
    if (!excludeList.has('announcement')) {
        head.push(getAnnouncementBarHelper(data));
    }
}

/**
 * Injects webmention discovery link into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectWebmentionDiscoveryLink(head) {
    try {
        head.push(getWebmentionDiscoveryLink());
    } catch (err) {
        logging.warn(err);
    }
}

/**
 * Injects favicon into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} favicon - The favicon URL.
 * @param {string} iconType - The favicon type.
 * @returns {void}
 */
function injectFavicon(head, favicon, iconType) {
    if (settingsCache.get('icon')) {
        head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }
}

/**
 * Injects robots and referrer meta tags into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} context - The current context.
 * @param {string} referrerPolicy - The referrer policy.
 * @returns {void}
 */
function injectRobotsAndReferrerTags(head, context, referrerPolicy) {
    if (_.includes(context, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Injects structured data into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} meta - The metadata object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectStructuredData(head, meta, excludeList) {
    if (!_.includes(context, 'paged') && useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push.apply(head, finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push('<script type="application/ld+json">\n' + JSON.stringify(meta.schema, null, '    ') + '\n    </script>\n');
        }
    }
}

/**
 * Injects previous and next links into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} meta - The metadata object.
 * @returns {void}
 */
function injectPrevNextLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

/**
 * Injects generator and RSS link into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} safeVersion - The safe version string.
 * @param {Object} meta - The metadata object.
 * @returns {void}
 */
function injectGeneratorAndRssLink(head, safeVersion, meta) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">');
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns {void}
 */
function injectCodeInjectionScripts(head, postCodeInjection, tagCodeInjection, globalCodeinjection) {
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

/**
 * Injects card assets into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

/**
 * Injects comment counts script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectCommentCountsScript(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

/**
 * Injects member attribution script into the head.
 * @param {Object} head - The array of head elements.
 * @returns {void}
 */
function injectMemberAttributionScript(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

/**
 * Injects Tinybird tracker script into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @returns {void}
 */
function injectTinybirdTrackerScript(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

/**
 * Injects font styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} dataRoot - The root data object.
 * @param {Set} excludeList - A set of features to exclude.
 * @returns {void}
 */
function injectFontStyles(head, dataRoot, excludeList) {
    const isSitePreview = dataRoot?.site?._preview ?? false;
    const headingFont = isSitePreview ? dataRoot?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? dataRoot?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        injectCustomFontCss(head, fontSelection);
    }
}

/**
 * Injects accent color styles into the head.
 * @param {Object} head - The array of head elements.
 * @param {string} accentColor - The accent color value.
 * @returns {void}
 */
function injectAccentColorStyles(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Injects code injection scripts into the head.
 * @param {Object} head - The array of head elements.
 * @param {Object} postCodeInjection - The post code injection.
 * @param {Object} tagCodeInjection - The tag code injection.
 * @param {string} globalCodeinjection - The global code injection.
 * @returns