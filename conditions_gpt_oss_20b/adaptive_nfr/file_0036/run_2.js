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

/**
 * Builds meta tags for the head section.
 *
 * @param {Object} meta
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} referrerPolicy
 * @param {Array<string>} context
 * @returns {Array<string>}
 */
function buildMetadata(meta, favicon, iconType, referrerPolicy, context) {
    const tags = [];
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        tags.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }
    if (settingsCache.get('icon')) {
        tags.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }
    tags.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');
    if (_.includes(context, 'preview')) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
    if (meta.previousUrl) {
        tags.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }
    if (meta.nextUrl) {
        tags.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
    return tags;
}

/**
 * Builds the schema JSON-LD script tag.
 *
 * @param {Object} schema
 * @returns {string}
 */
function buildSchemaScript(schema) {
    return '<script type="application/ld+json">\n' + JSON.stringify(schema, null, '    ') + '\n    </script>\n';
}

/**
 * Builds the generator meta tag.
 *
 * @param {string} safeVersion
 * @returns {string}
 */
function buildGeneratorTag(safeVersion) {
    return '<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">';
}

/**
 * Builds the RSS link tag.
 *
 * @param {Object} meta
 * @returns {string}
 */
function buildRSSLink(meta) {
    return '<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">';
}

/**
 * Builds card assets scripts and styles.
 *
 * @returns {Array<string>}
 */
function buildCardAssets() {
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
 * Builds the comment counts script tag.
 *
 * @returns {string}
 */
function buildCommentCounts() {
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

/**
 * Builds the member attribution script tag.
 *
 * @returns {string}
 */
function buildMemberAttribution() {
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

/**
 * Builds the accent color style tag.
 *
 * @param {string} accentColor
 * @returns {string}
 */
function buildAccentColorStyle(accentColor) {
    const escaped = escapeExpression(accentColor);
    return `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
}

/**
 * Builds custom font CSS if applicable.
 *
 * @param {Object} options
 * @returns {SafeString|null}
 */
function buildCustomFontStyle(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};
        if (headingFont) fontSelection.heading = headingFont;
        if (bodyFont) fontSelection.body = bodyFont;
        const customCSS = generateCustomFontCss(fontSelection);
        return new SafeString(customCSS);
    }
    return null;
}

/**
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

/**
 * @param {Object} meta
 * @returns {Array<string>}
 */
function finaliseStructuredData(meta) {
    const head = [];
    _.each(meta.structuredData, function (content, property) {
        if (property === 'article:tag') {
            _.each(meta.keywords, function (keyword) {
                if (keyword !== '') {
                    keyword = escapeExpression(keyword);
                    head.push(writeMetaTag(property,
                        escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content !== null && content !== undefined) {
            head.push(writeMetaTag(property,
                escapeExpression(content)));
        }
    });
    return head;
}

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
 * Ghost Head Helper
 * Usage: `{{ghost_head}}`
 *
 * Outputs scripts and other assets at the top of a Ghost theme
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (options.data.root.statusCode >= 500) {
        return;
    }
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    debug('preparation complete, begin fetch');
    const head = [];
    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();
        debug('end fetch');
        if (context) {
            if (!excludeList.has('metadata')) {
                head.push(...buildMetadata(meta, favicon, iconType, referrerPolicy, context));
            }
            if (!_.includes(context, 'paged') && useStructuredData) {
                if (!excludeList.has('social_data')) {
                    head.push('', ...finaliseStructuredData(meta), '');
                }
                if (!excludeList.has('schema') && meta.schema) {
                    head.push(buildSchemaScript(meta.schema));
                }
            }
        }
        head.push(buildGeneratorTag(safeVersion));
        head.push(buildRSSLink(meta));
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
        if (!excludeList.has('card_assets')) {
            head.push(...buildCardAssets());
        }
        if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(buildCommentCounts());
        }
        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(buildMemberAttribution());
        }
        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }
        if (options.data.site?.accent_color) {
            head.push(buildAccentColorStyle(options.data.site.accent_color));
        }
        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }
        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }
        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }
        const customFontStyle = buildCustomFontStyle(options);
        if (customFontStyle) {
            head.push(customFontStyle);
        }
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;