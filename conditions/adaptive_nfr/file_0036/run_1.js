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
 * @returns {boolean} True if any member feature is enabled
 */
function shouldLoadMembers() {
    return settingsCache.get('members_enabled') || 
           settingsCache.get('donations_enabled') || 
           settingsCache.get('recommendations_enabled');
}

/**
 * Builds portal script tag
 * @param {object} data - The template data
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
 * @returns {string} CTA styles HTML
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
 * @param {object} data - The template data
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
 * @param {object} data - The template data
 * @returns {boolean} True if announcement bar should be shown
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
 * @param {object} data - The template data
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
 * @param {object} dataRoot - The root data object
 * @returns {boolean} True if in preview
 */
function isInPreview(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/**
 * Gets the tinybird tracker configuration
 * @param {object} localConfig - Local configuration
 * @param {object} statsConfig - Stats configuration
 * @returns {object} The active configuration
 */
function getTinybirdConfig(localConfig, statsConfig) {
    const localEnabled = localConfig?.enabled ?? false;
    return {
        endpoint: localEnabled ? localConfig.endpoint : statsConfig.endpoint,
        token: localEnabled ? localConfig.token : statsConfig.token,
        datasource: localEnabled ? localConfig.datasource : statsConfig.datasource
    };
}

/**
 * Builds tinybird tracker parameters
 * @param {object} dataRoot - The root data object
 * @returns {string} The tracker parameters
 */
function buildTinybirdParams(dataRoot) {
    const postType = dataRoot.context?.includes('post') ? 'post' : 
                     dataRoot.context?.includes('page') ? 'page' : null;

    return _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: postType,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');
}

/**
 * Generates tinybird tracker script
 * @param {object} dataRoot - The root data object
 * @returns {string} Tracker script HTML
 */
function getTinybirdTrackerScript(dataRoot) {
    if (isInPreview(dataRoot)) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const statsConfig = config.get('tinybird:tracker');
    const localConfig = config.get('tinybird:tracker:local');

    const tbConfig = getTinybirdConfig(localConfig, statsConfig);
    const tbParams = buildTinybirdParams(dataRoot);

    const datasourceAttr = tbConfig.datasource ? `data-datasource="${tbConfig.datasource}"` : '';
    const tokenAttr = tbConfig.token && env !== 'production' ? `data-token="${tbConfig.token}"` : '';

    return `<script defer src="${src}" data-stringify-payload="false" ${datasourceAttr} data-storage="localStorage" data-host="${tbConfig.endpoint}" ${tokenAttr} ${tbParams}></script>`;
}

/**
 * Checks if context exists
 * @param {array} context - The context array
 * @returns {boolean} True if context exists
 */
function hasContext(context) {
    return !!context;
}

/**
 * Checks if should include metadata
 * @param {array} context - The context array
 * @param {Set} excludeList - Set of excluded items
 * @returns {boolean} True if metadata should be included
 */
function shouldIncludeMetadata(context, excludeList) {
    return hasContext(context) && !excludeList.has('metadata');
}

/**
 * Adds metadata tags to head
 * @param {array} head - The head array
 * @param {object} meta - The metadata object
 * @param {string} favicon - The favicon URL
 * @param {string} iconType - The icon type
 * @param {array} context - The context array
 * @param {string} referrerPolicy - The referrer policy
 */
function addMetadataTags(head, meta, favicon, iconType, context, referrerPolicy) {
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

/**
 * Adds pagination links to head
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
 * Checks if should include structured data
 * @param {array} context - The context array
 * @param {boolean} useStructuredData - Whether structured data is enabled
 * @returns {boolean} True if structured data should be included
 */
function shouldIncludeStructuredData(context, useStructuredData) {
    return !_.includes(context, 'paged') && useStructuredData;
}

/**
 * Adds structured data to head
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
 * Adds card assets to head
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
 * Adds comment counts script to head
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
 * Adds member attribution script to head
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
 * Adds web analytics to head
 * @param {array} head - The head array
 * @param {object} dataRoot - The root data object
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
 * Adds accent color style to head
 * @param {array} head - The head array
 * @param {string} accentColor - The accent color value
 */
function addAccentColorStyle(head, accentColor) {
    if (!accentColor) {
        return;
    }

    const escapedColor = escapeExpression(accentColor);
    const styleTag = `<style>:root {--ghost-accent-color: ${escapedColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Adds code injections to head
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
 * Gets the font selection for custom fonts
 * @param {object} options - The options object
 * @returns {object|null} Font selection or null
 */
function getFontSelection(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeadingFont = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBodyFont = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeadingFont && !hasValidBodyFont) {
        return null;
    }

    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }

    return fontSelection;
}

/**
 * Adds custom fonts to head
 * @param {array} head - The head array
 * @param {object} options - The options object
 */
function addCustomFonts(head, options) {
    const fontSelection = getFontSelection(options);
    if (!fontSelection) {
        return;
    }

    const customCSS = generateCustomFontCss(fontSelection);
    head.push(new SafeString(customCSS));
}

/**
 * Checks if server error
 * @param {object} options - The options object
 * @returns {boolean} True if server error
 */
function isServerError(options) {
    return options.data.root.statusCode >= 500;
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

    if (isServerError(options)) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (shouldIncludeMetadata(context, excludeList)) {
            addMetadataTags(head, meta, favicon, iconType, context, referrerPolicy);
        }

        if (hasContext(context)) {
            addPaginationLinks(head, meta);
        }

        if (hasContext(context) && shouldIncludeStructuredData(context, useStructuredData)) {
            addStructuredData(head, meta, excludeList);
        }

        head.push('<meta name="generator" content="Ghost ' +
            escapeExpression(safeVersion) + '">');
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
        addAccentColorStyle(head, options.data.site.accent_color);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
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