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

// Builds portal script and styles for members functionality
function buildPortalHelper(data, frontendKey) {
    let helper = '';
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
    helper += `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;

    return helper;
}

// Builds CTA styles for members
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

// Builds Stripe script for paid members
function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

// Determines if members helper should be loaded
function shouldLoadMembersHelper() {
    return settingsCache.get('members_enabled') || settingsCache.get('donations_enabled') || settingsCache.get('recommendations_enabled');
}

function getMembersHelper(data, frontendKey, excludeList) {
    if (!shouldLoadMembersHelper()) {
        return '';
    }

    let membersHelper = '';

    if (!excludeList.has('portal')) {
        membersHelper += buildPortalHelper(data, frontendKey);
    }

    if (!excludeList.has('cta_styles')) {
        membersHelper += buildCtaStyles();
    }

    if (settingsCache.get('paid_members_enabled')) {
        membersHelper += buildStripeScript();
    }

    return membersHelper;
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

// Extracts announcement preview parameters from query string
function extractAnnouncementPreview(preview) {
    const searchParam = new URLSearchParams(preview);
    return {
        announcement: searchParam.get('announcement'),
        announcementBackground: searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '',
        announcementVisibility: searchParam.has('announcement_vis')
    };
}

// Builds announcement bar attributes
function buildAnnouncementAttributes(siteUrl, preview) {
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': new URL('members/api/announcement/', siteUrl)
    };

    if (preview) {
        const previewData = extractAnnouncementPreview(preview);

        if (!previewData.announcement || !previewData.announcementVisibility) {
            return null;
        }

        attrs.announcement = escapeExpression(previewData.announcement);
        attrs['announcement-background'] = escapeExpression(previewData.announcementBackground);
        attrs.preview = true;
    }

    return attrs;
}

// Determines if announcement bar should be shown
function shouldShowAnnouncementBar(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || preview;
}

function getAnnouncementBarHelper(data) {
    if (!shouldShowAnnouncementBar(data)) {
        return '';
    }

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const preview = data?.site?._preview;

    const attrs = buildAnnouncementAttributes(siteUrl, preview);
    if (!attrs) {
        return '';
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
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

// Gets tinybird tracker configuration
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

// Builds tinybird tracker parameters
function buildTinybirdParams(dataRoot) {
    return _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');
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

// Adds core metadata tags to head
function addCoreMetadata(head, meta, context, safeVersion, favicon, iconType, referrerPolicy, excludeList) {
    if (!context || excludeList.has('metadata')) {
        return;
    }

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

// Adds pagination links to head
function addPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

// Adds structured data to head
function addStructuredData(head, meta, context, useStructuredData, excludeList) {
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

// Adds generator and RSS feed links
function addGeneratorAndRss(head, meta, safeVersion) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(meta.site.title) + '" href="' +
        escapeExpression(meta.rssUrl) + '">');
}

// Adds card assets (CSS and JS)
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

// Adds comment counts script
function addCommentCounts(head, excludeList) {
    if (excludeList.has('comment_counts') || settingsCache.get('comments_enabled') === 'off') {
        return;
    }

    head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
}

// Adds member attribution script
function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

// Adds web analytics tracking script
function addWebAnalytics(head, dataRoot) {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
        return;
    }

    head.push(getTinybirdTrackerScript(dataRoot));
    if (dataRoot._locals) {
        dataRoot._locals.ghostAnalytics = true;
    }
}

// Adds accent color style
function addAccentColor(head, accentColor) {
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

// Adds code injections from global, post, and tag settings
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

// Gets font selection from preview or settings cache
function getFontSelection(isSitePreview, data) {
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');

    return {headingFont, bodyFont};
}

// Adds custom fonts CSS
function addCustomFonts(head, isSitePreview, data) {
    const {headingFont, bodyFont} = getFontSelection(isSitePreview, data);

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

module.exports = async function ghost_head(options) {
    debug('begin');

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
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        addCoreMetadata(head, meta, context, safeVersion, favicon, iconType, referrerPolicy, excludeList);
        addPaginationLinks(head, meta);
        addStructuredData(head, meta, context, useStructuredData, excludeList);
        addGeneratorAndRss(head, meta, safeVersion);

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
        addAccentColor(head, options.data.site.accent_color);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);

        const isSitePreview = options.data?.site?._preview ?? false;
        addCustomFonts(head, isSitePreview, options.data);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;