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
 * Generates a meta tag with proper escaping
 * @param {string} property - The property name
 * @param {string} content - The content value
 * @param {string} type - The tag type (name or property)
 * @returns {string} The meta tag HTML
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

/**
 * Processes structured data and returns formatted meta tags
 * @param {object} meta - The metadata object
 * @returns {array} Array of meta tag strings
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
 * Checks if members functionality should be loaded
 * @returns {boolean}
 */
function shouldLoadMembers() {
    return settingsCache.get('members_enabled') || 
           settingsCache.get('donations_enabled') || 
           settingsCache.get('recommendations_enabled');
}

/**
 * Builds portal script tag
 * @param {object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @returns {string} Portal script HTML
 */
function buildPortalScript(data, frontendKey) {
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
    return `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;
}

/**
 * Builds CTA styles tag
 * @returns {string} Styles HTML
 */
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

/**
 * Builds Stripe script tag
 * @returns {string} Stripe script HTML
 */
function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

/**
 * Generates members helper content
 * @param {object} data - The data object
 * @param {string} frontendKey - The frontend key
 * @param {Set} excludeList - Set of excluded items
 * @returns {string} Members helper HTML
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!shouldLoadMembers()) {
        return '';
    }

    let membersHelper = '';

    if (!excludeList.has('portal')) {
        membersHelper += buildPortalScript(data, frontendKey);
    }

    if (!excludeList.has('cta_styles')) {
        membersHelper += buildCtaStyles();
    }

    if (settingsCache.get('paid_members_enabled')) {
        membersHelper += buildStripeScript();
    }

    return membersHelper;
}

/**
 * Generates search helper content
 * @param {string} frontendKey - The frontend key
 * @returns {string} Search helper HTML
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
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Checks if announcement bar should be shown
 * @param {object} data - The data object
 * @returns {boolean}
 */
function shouldShowAnnouncementBar(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || preview;
}

/**
 * Extracts announcement preview parameters
 * @param {string} preview - The preview query string
 * @returns {object|null} Announcement preview data or null
 */
function extractAnnouncementPreview(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        announcementBackground: searchParam.has('announcement_bg') ? escapeExpression(searchParam.get('announcement_bg')) : ''
    };
}

/**
 * Generates announcement bar helper content
 * @param {object} data - The data object
 * @returns {string} Announcement bar helper HTML
 */
function getAnnouncementBarHelper(data) {
    if (!shouldShowAnnouncementBar(data)) {
        return '';
    }

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    const preview = data?.site?._preview;
    if (preview) {
        const previewData = extractAnnouncementPreview(preview);
        if (!previewData) {
            return '';
        }
        attrs.announcement = previewData.announcement;
        attrs['announcement-background'] = previewData.announcementBackground;
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Generates webmention discovery link
 * @returns {string} Webmention link HTML
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
 * Checks if in preview context
 * @param {object} dataRoot - The data root object
 * @returns {boolean}
 */
function isPreviewContext(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/**
 * Gets tinybird configuration based on environment
 * @returns {object} Configuration object with endpoint, token, datasource
 */
function getTinybirdConfig() {
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');
    const localEnabled = localConfig?.enabled ?? false;

    return {
        endpoint: localEnabled ? localConfig.endpoint : statsConfig.endpoint,
        token: localEnabled ? localConfig.token : statsConfig.token,
        datasource: localEnabled ? localConfig.datasource : statsConfig.datasource
    };
}

/**
 * Builds tinybird tracker parameters
 * @param {object} dataRoot - The data root object
 * @returns {string} Space-separated data attributes
 */
function buildTinybirdParams(dataRoot) {
    const postType = dataRoot.context?.includes('post') ? 'post' : 
                     dataRoot.context?.includes('page') ? 'page' : null;

    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: postType,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

/**
 * Generates tinybird tracker script
 * @param {object} dataRoot - The data root object
 * @returns {string} Tracker script HTML
 */
function getTinybirdTrackerScript(dataRoot) {
    if (isPreviewContext(dataRoot)) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const tbConfig = getTinybirdConfig();
    const tbParams = buildTinybirdParams(dataRoot);

    const datasourceAttr = tbConfig.datasource ? `data-datasource="${tbConfig.datasource}"` : '';
    const tokenAttr = tbConfig.token && env !== 'production' ? `data-token="${tbConfig.token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${tbConfig.endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

/**
 * Checks if context is paged
 * @param {array} context - The context array
 * @returns {boolean}
 */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/**
 * Checks if preview context
 * @param {array} context - The context array
 * @returns {boolean}
 */
function isPreviewContextArray(context) {
    return _.includes(context, 'preview');
}

/**
 * Adds metadata tags to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {array} context - The context array
 * @param {Set} excludeList - Set of excluded items
 * @param {string} favicon - The favicon URL
 * @param {string} iconType - The icon type
 * @param {string} referrerPolicy - The referrer policy
 */
function addMetadataTags(head, meta, context, excludeList, favicon, iconType, referrerPolicy) {
    if (excludeList.has('metadata')) {
        return;
    }

    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }

    if (settingsCache.get('icon')) {
        head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }

    head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

    if (isPreviewContextArray(context)) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

/**
 * Adds pagination links to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 */
function addPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

/**
 * Adds structured data to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {Set} excludeList - Set of excluded items
 */
function addStructuredData(head, meta, excludeList) {
    if (!excludeList.has('social_data')) {
        head.push('');
        head.push.apply(head, finaliseStructuredData(meta));
        head.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        head.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }
}

/**
 * Adds context-specific content to head array
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {array} context - The context array
 * @param {Set} excludeList - Set of excluded items
 * @param {string} favicon - The favicon URL
 * @param {string} iconType - The icon type
 * @param {string} referrerPolicy - The referrer policy
 * @param {boolean} useStructuredData - Whether to use structured data
 */
function addContextContent(head, meta, context, excludeList, favicon, iconType, referrerPolicy, useStructuredData) {
    addMetadataTags(head, meta, context, excludeList, favicon, iconType, referrerPolicy);
    addPaginationLinks(head, meta);

    if (!isPagedContext(context) && useStructuredData) {
        addStructuredData(head, meta, excludeList);
    }
}

/**
 * Adds card assets to head array
 * @param {array} head - The head array
 * @param {Set} excludeList - Set of excluded items
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
 * Adds comment counts script to head array
 * @param {array} head - The head array
 * @param {Set} excludeList - Set of excluded items
 */
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts')) {
        return;
    }

    if (settingsCache.get('comments_enabled') === 'off') {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

/**
 * Adds member attribution script to head array
 * @param {array} head - The head array
 */
function addMemberAttribution(head) {
    if (!settingsCache.get('members_enabled')) {
        return;
    }

    if (!settingsCache.get('members_track_sources')) {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
}

/**
 * Adds web analytics to head array
 * @param {array} head - The head array
 * @param {object} dataRoot - The data root object
 */
function addWebAnalytics(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }

    head.push(getTinybirdTrackerScript(dataRoot));

    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

/**
 * Adds accent color style to head array
 * @param {array} head - The head array
 * @param {object} siteData - The site data object
 */
function addAccentColor(head, siteData) {
    if (!siteData.accent_color) {
        return;
    }

    const accentColor = escapeExpression(siteData.accent_color);
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Adds code injections to head array
 * @param {array} head - The head array
 * @param {string} globalCodeinjection - Global code injection
 * @param {string} postCodeInjection - Post code injection
 * @param {string} tagCodeInjection - Tag code injection
 */
function addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection) {
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
 * Checks if custom fonts are valid
 * @param {string} headingFont - The heading font
 * @param {string} bodyFont - The body font
 * @returns {boolean}
 */
function hasValidCustomFonts(headingFont, bodyFont) {
    const headingFontValid = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const bodyFontValid = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);
    return headingFontValid || bodyFontValid;
}

/**
 * Adds custom fonts to head array
 * @param {array} head - The head array
 * @param {string} headingFont - The heading font
 * @param {string} bodyFont - The body font
 */
function addCustomFonts(head, headingFont, bodyFont) {
    if (!hasValidCustomFonts(headingFont, bodyFont)) {
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
 * Gets the appropriate font value based on preview mode
 * @param {object} options - The options object
 * @param {string} settingKey - The settings cache key
 * @param {string} dataKey - The data object key
 * @returns {string|null}
 */
function getFontValue(options, settingKey, dataKey) {
    const isSitePreview = options.data?.site?._preview ?? false;
    if (isSitePreview) {
        return options.data?.site?.[dataKey];
    }
    return settingsCache.get(settingKey);
}

/**
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
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head || null;
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

        if (context) {
            addContextContent(head, meta, context, excludeList, favicon, iconType, referrerPolicy, useStructuredData);
        }

        head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
        head.push('<link rel="alternate" type="application/rss+xml" title="' +
            escapeExpression(meta.site.title) + '" href="' +
            escapeExpression(meta.rssUrl) + '">');

        head.push(getMembersHelper(options.data, frontendKey, excludeList));

        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }

        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMemberAttribution(head);
        addWebAnalytics(head, dataRoot);
        addAccentColor(head, options.data.site);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);

        const headingFont = getFontValue(options, 'heading_font', 'heading_font');
        const bodyFont = getFontValue(options, 'body_font', 'body_font');
        addCustomFonts(head, headingFont, bodyFont);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```