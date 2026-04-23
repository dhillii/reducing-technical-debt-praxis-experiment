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

/** @returns {boolean} True if any membership feature is enabled */
function isMembershipFeatureEnabled() {
    return settingsCache.get('members_enabled') || 
           settingsCache.get('donations_enabled') || 
           settingsCache.get('recommendations_enabled');
}

/** @returns {string} Portal script and styles */
function buildPortalHelper(data, frontendKey) {
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

/** @returns {string} CTA styles */
function buildCtaStyles() {
    return `<style id="gh-members-styles">${templateStyles}</style>`;
}

/** @returns {string} Stripe script for paid members */
function buildStripeScript() {
    const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
    return `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
}

function getMembersHelper(data, frontendKey, excludeList) {
    if (!isMembershipFeatureEnabled()) {
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

/** @returns {boolean} True if announcement bar should be shown */
function shouldShowAnnouncementBar(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    return isFilled || preview;
}

/** @returns {object|null} Announcement attributes or null if invalid */
function getAnnouncementAttributes(preview) {
    if (!preview) {
        return null;
    }
    
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementVisibility = searchParam.has('announcement_vis');
    
    if (!announcement || !announcementVisibility) {
        return null;
    }
    
    const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
    return {
        announcement: escapeExpression(announcement),
        announcementBackground: escapeExpression(announcementBackground)
    };
}

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
    const announcementAttrs = getAnnouncementAttributes(preview);
    
    if (announcementAttrs) {
        attrs.announcement = announcementAttrs.announcement;
        attrs['announcement-background'] = announcementAttrs.announcementBackground;
        attrs.preview = true;
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

/** @returns {boolean} True if preview context is active */
function isPreviewContext(dataRoot) {
    return dataRoot?.context?.includes('preview');
}

/** @returns {string} Post type or null */
function getPostType(dataRoot) {
    if (dataRoot.context?.includes('post')) {
        return 'post';
    }
    if (dataRoot.context?.includes('page')) {
        return 'page';
    }
    return null;
}

/** @returns {object} Tinybird configuration */
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

/** @returns {string} Tinybird parameters string */
function buildTinybirdParams(dataRoot) {
    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: getPostType(dataRoot),
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (value, key) => `tb_${key}="${value}"`).join(' ');
    
    return tbParams;
}

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

/** @returns {boolean} True if metadata should be added */
function shouldAddMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/** @returns {boolean} True if description exists */
function hasMetaDescription(meta) {
    return meta.metaDescription && meta.metaDescription.length > 0;
}

/** @returns {boolean} True if icon is configured */
function hasIconConfigured() {
    return settingsCache.get('icon');
}

/** @returns {boolean} True if in preview context */
function isInPreview(context) {
    return _.includes(context, 'preview');
}

/** @returns {boolean} True if not on paged context */
function isNotPaged(context) {
    return !_.includes(context, 'paged');
}

/** @returns {string[]} Metadata head tags */
function buildMetadataTags(meta, context, favicon, iconType, referrerPolicy) {
    const tags = [];
    
    if (hasMetaDescription(meta)) {
        tags.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }

    if (hasIconConfigured()) {
        tags.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
    }

    tags.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

    if (isInPreview(context)) {
        tags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        tags.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        tags.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }

    return tags;
}

/** @returns {string[]} Navigation link tags */
function buildNavigationTags(meta) {
    const tags = [];
    
    if (meta.previousUrl) {
        tags.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        tags.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }

    return tags;
}

/** @returns {string[]} Structured data tags */
function buildStructuredDataTags(meta, excludeList) {
    const tags = [];
    
    if (!excludeList.has('social_data')) {
        tags.push('');
        tags.push.apply(tags, finaliseStructuredData(meta));
        tags.push('');
    }

    if (!excludeList.has('schema') && meta.schema) {
        tags.push('<script type="application/ld+json">\n' +
            JSON.stringify(meta.schema, null, '    ') +
            '\n    </script>\n');
    }

    return tags;
}

/** @returns {boolean} True if custom fonts are valid */
function hasValidCustomFonts(headingFont, bodyFont) {
    return (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
           (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
}

/** @returns {FontSelection} Font selection object */
function buildFontSelection(headingFont, bodyFont) {
    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }
    return fontSelection;
}

/** @returns {string} Accent color style tag */
function buildAccentColorStyle(accentColor, head) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        return head[existingScriptIndex] + styleTag;
    }
    return styleTag;
}

/** @returns {object} Font configuration from settings or preview */
function getFontConfig(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    return {
        headingFont: isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font'),
        bodyFont: isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font')
    };
}

/** @returns {boolean} True if server error */
function isServerError(statusCode) {
    return statusCode >= 500;
}

/** @returns {boolean} True if context exists */
function hasContext(context) {
    return context !== null;
}

module.exports = async function ghost_head(options) {
    debug('begin');
    
    if (isServerError(options.data.root.statusCode)) {
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

        if (hasContext(context)) {
            if (shouldAddMetadata(excludeList)) {
                head.push(...buildMetadataTags(meta, context, favicon, iconType, referrerPolicy));
            }

            head.push(...buildNavigationTags(meta));

            if (isNotPaged(context) && useStructuredData) {
                head.push(...buildStructuredDataTags(meta, excludeList));
            }
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

        if (!excludeList.has('card_assets')) {
            if (cardAssets.hasFile('js')) {
                head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
            }
            if (cardAssets.hasFile('css')) {
                head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
            }
        }

        if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
        }

        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        if (options.data.site.accent_color) {
            const accentColor = escapeExpression(options.data.site.accent_color);
            const updatedTag = buildAccentColorStyle(accentColor, head);
            const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
            
            if (existingScriptIndex !== -1) {
                head[existingScriptIndex] = updatedTag;
            } else {
                head.push(updatedTag);
            }
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

        const fontConfig = getFontConfig(options);
        if (hasValidCustomFonts(fontConfig.headingFont, fontConfig.bodyFont)) {
            const fontSelection = buildFontSelection(fontConfig.headingFont, fontConfig.bodyFont);
            const customCSS = generateCustomFontCss(fontSelection);
            head.push(new SafeString(customCSS));
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;