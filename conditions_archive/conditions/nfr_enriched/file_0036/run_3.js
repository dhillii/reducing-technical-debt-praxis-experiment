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

// ============================================================================
// Meta Tag Utilities
// ============================================================================

function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

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

// ============================================================================
// Frontend App Helpers
// ============================================================================

function getMembersHelper(data, frontendKey, excludeList) {
    // Do not load Portal if both Memberships and Tips & Donations and Recommendations are disabled
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }
    let membersHelper = '';
    if (!excludeList.has('portal')) {
        membersHelper += getPortalScript(data, frontendKey);
    }
    if (!excludeList.has('cta_styles')) {
        membersHelper += (`<style id="gh-members-styles">${templateStyles}</style>`);
    }
    if (settingsCache.get('paid_members_enabled')) {
        membersHelper += getStripeScript();
    }
    return membersHelper;
}

function getPortalScript(data, frontendKey) {
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

function getStripeScript() {
    // disable fraud detection for e2e tests to reduce waiting time
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

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
        const previewAttrs = extractAnnouncementPreviewAttrs(preview);
        if (!previewAttrs) {
            return '';
        }
        Object.assign(attrs, previewAttrs);
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

function extractAnnouncementPreviewAttrs(preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
    const announcementVisibility = searchParam.has('announcement_vis');

    if (!announcement || !announcementVisibility) {
        return null;
    }

    return {
        announcement: escapeExpression(announcement),
        'announcement-background': escapeExpression(announcementBackground),
        preview: true
    };
}

// ============================================================================
// Discovery and Tracking Helpers
// ============================================================================

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

function getTinybirdTrackerScript(dataRoot) {
    const preview = dataRoot?.context?.includes('preview');
    if (preview) {
        return '';
    }

    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const trackerConfig = getTinybirdConfig();
    const tbParams = buildTinybirdParams(dataRoot);

    return `<script defer src="${src}" data-stringify-payload="false" ${trackerConfig.datasource ? `data-datasource="${trackerConfig.datasource}"` : ''} data-storage="localStorage" data-host="${trackerConfig.endpoint}" ${trackerConfig.token && env !== 'production' ? `data-token="${trackerConfig.token}"` : ''} ${tbParams}></script>`;
}

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

function buildTinybirdParams(dataRoot) {
    const params = {
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: getTinybirdPostType(dataRoot.context),
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    };

    return _.map(params, (value, key) => `tb_${key}="${value}"`).join(' ');
}

function getTinybirdPostType(context) {
    if (context?.includes('post')) {
        return 'post';
    }
    if (context?.includes('page')) {
        return 'page';
    }
    return null;
}

// ============================================================================
// Asset Helpers
// ============================================================================

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

function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

function addWebAnalytics(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        // Set a flag in response locals to indicate tracking script is being served
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

// ============================================================================
// Style and Injection Helpers
// ============================================================================

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

function addCustomFonts(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
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
}

// ============================================================================
// Metadata Helpers
// ============================================================================

function addMetadataForContext(head, context, meta, excludeList) {
    if (!context) {
        return;
    }

    if (!excludeList.has('metadata')) {
        addBasicMetadata(head, meta);
    }

    addPaginationLinks(head, meta);
    addStructuredDataForContext(head, context, meta, excludeList);
}

function addBasicMetadata(head, meta) {
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }

    if (settingsCache.get('icon')) {
        const favicon = blogIcon.getIconUrl();
        const iconType = blogIcon.getIconType(favicon);
        head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }

    head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');
    addReferrerPolicy(head);
}

function addReferrerPolicy(head) {
    const referrerPolicy = config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';

    if (_.includes(head, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

function addPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

function addStructuredDataForContext(head, context, meta, excludeList) {
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');

    if (_.includes(context, 'paged') || !useStructuredData) {
        return;
    }

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

function addGeneratorAndRss(head, safeVersion, meta) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(meta.site.title) + '" href="' +
        escapeExpression(meta.rssUrl) + '">');
}

// ============================================================================
// Main Ghost Head Helper
// ============================================================================

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
    // if server error page do nothing
    if (options.data.root.statusCode >= 500) {
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

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        // Add metadata and structured data
        addMetadataForContext(head, context, meta, excludeList);

        // Add generator and RSS
        addGeneratorAndRss(head, safeVersion, meta);

        // Add frontend apps
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }
        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        // Add discovery links
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        // Add assets
        addCardAssets(head, excludeList);
        addCommentCounts(head, excludeList);
        addMemberAttribution(head);
        addWebAnalytics(head, dataRoot);

        // Add styles and injections
        addAccentColorStyle(head, options.data.site.accent_color);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
        addCustomFonts(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);

        // Return what we have so far (currently nothing)
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```