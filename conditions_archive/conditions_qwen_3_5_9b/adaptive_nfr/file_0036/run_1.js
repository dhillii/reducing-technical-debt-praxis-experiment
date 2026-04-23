```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
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
 * Check if status code indicates server error
 * @param {number} statusCode - HTTP status code
 * @returns {boolean}
 */
function isServerErrorCode(statusCode) {
    return statusCode >= 500;
}

/**
 * Check if context includes preview
 * @param {Array} context - Context array
 * @returns {boolean}
 */
function isPreviewContext(context) {
    return _.includes(context, 'preview');
}

/**
 * Check if context includes paged
 * @param {Array} context - Context array
 * @returns {boolean}
 */
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/**
 * Check if members feature is enabled
 * @returns {boolean}
 */
function isMembersEnabled() {
    return settingsCache.get('members_enabled');
}

/**
 * Check if donations feature is enabled
 * @returns {boolean}
 */
function isDonationsEnabled() {
    return settingsCache.get('donations_enabled');
}

/**
 * Check if recommendations feature is enabled
 * @returns {boolean}
 */
function isRecommendationsEnabled() {
    return settingsCache.get('recommendations_enabled');
}

/**
 * Check if paid members feature is enabled
 * @returns {boolean}
 */
function isPaidMembersEnabled() {
    return settingsCache.get('paid_members_enabled');
}

/**
 * Check if comments feature is enabled
 * @returns {boolean}
 */
function isCommentsEnabled() {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Check if web analytics is enabled
 * @returns {boolean}
 */
function isWebAnalyticsEnabled() {
    return settingsHelpers.isWebAnalyticsEnabled();
}

/**
 * Check if site is in preview mode
 * @param {Object} data - Site data
 * @returns {boolean}
 */
function isSitePreview(data) {
    return data?.site?._preview ?? false;
}

/**
 * Check if site has accent color
 * @param {Object} data - Site data
 * @returns {boolean}
 */
function hasAccentColor(data) {
    return data?.site?.accent_color;
}

/**
 * Check if custom fonts should be injected
 * @param {Object} data - Site data
 * @param {Object} settingsCache - Settings cache
 * @returns {boolean}
 */
function hasCustomFonts(data, settingsCache) {
    const headingFont = isSitePreview(data) ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview(data) ? data?.site?.body_font : settingsCache.get('body_font');
    return (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
           (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
}

/**
 * Inject accent color style into head
 * @param {Array} head - Head array
 * @param {string} accentColor - Accent color value
 * @returns {Array} Modified head array
 */
function injectAccentStyle(head, accentColor) {
    if (!accentColor) {
        return head;
    }
    
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
    
    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
    
    return head;
}

/**
 * Inject code injection into head
 * @param {Array} head - Head array
 * @param {string} codeInjection - Code injection string
 * @returns {Array} Modified head array
 */
function injectCodeInjection(head, codeInjection) {
    if (!codeInjection || _.isEmpty(codeInjection)) {
        return head;
    }
    
    head.push(codeInjection);
    return head;
}

/**
 * Get members helper script
 * @param {Object} data - Site data
 * @param {string} frontendKey - Frontend key
 * @param {Set} excludeList - Exclude list
 * @returns {string} Members helper script
 */
function getMembersHelper(data, frontendKey, excludeList) {
    // Guard clause: Don't load Portal if all membership features are disabled
    if (!isMembersEnabled() && !isDonationsEnabled() && !isRecommendationsEnabled()) {
        return '';
    }
    
    let membersHelper = '';
    
    // Guard clause: Skip portal if excluded
    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = (data?.site?._preview && data.site.accent_color) ? data.site.accent_color : '';
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
    
    // Guard clause: Add styles if not excluded
    if (!excludeList.has('cta_styles')) {
        membersHelper += (`<style id="gh-members-styles">${templateStyles}</style>`);
    }
    
    // Guard clause: Add Stripe script if paid members enabled
    if (isPaidMembersEnabled()) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }
    
    return membersHelper;
}

/**
 * Get search helper script
 * @param {string} frontendKey - Frontend key
 * @returns {string} Search helper script
 */
function getSearchHelper(frontendKey) {
    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    
    // Guard clause: Return empty if scriptUrl not available
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
 * Get announcement bar helper script
 * @param {Object} data - Site data
 * @returns {string} Announcement bar helper script
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    
    // Guard clause: Return empty if not filled and not preview
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
    
    // Guard clause: Handle preview mode
    if (preview) {
        const searchParam = new URLSearchParams(preview);
        const announcement = searchParam.get('announcement');
        const announcementBackground = searchParam.has('announcement_bg') ? searchParam.get('announcement_bg') : '';
        const announcementVisibility = searchParam.has('announcement_vis');
        
        // Guard clause: Return if announcement or visibility not set
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
 * Get webmention discovery link
 * @returns {string} Webmention discovery link
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
 * Get Tinybird tracker script
 * @param {Object} dataRoot - Data root
 * @returns {string} Tinybird tracker script
 */
function getTinybirdTrackerScript(dataRoot) {
    const preview = dataRoot?.context?.includes('preview');
    
    // Guard clause: Return empty for preview
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
 * Get font injection script
 * @param {Object} data - Site data
 * @param {Object} settingsCache - Settings cache
 * @returns {string} Font injection script
 */
function getFontInjectionScript(data, settingsCache) {
    const isSitePreview = data?.site?._preview ?? false;
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
    
    if (!hasCustomFonts(data, settingsCache)) {
        return '';
    }
    
    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }
    
    const customCSS = generateCustomFontCss(fontSelection);
    return new SafeString(customCSS);
}

/**
 * Finalize structured data
 * @param {Object} meta - Meta data
 * @returns {Array} Structured data array
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

/**
 * Write meta tag
 * @param {string} property - Meta property
 * @param {string} content - Meta content
 * @param {string} type - Meta type
 * @returns {string} Meta tag
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    
    // Guard clause: Skip if server error
    if (isServerErrorCode(options.data.root.statusCode)) {
        return new SafeString('');
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
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    
    debug('preparation complete, begin fetch');
    
    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();
        
        debug('end fetch');
        
        // Process metadata if context exists
        if (context) {
            // Skip metadata if excluded
            if (!excludeList.has('metadata')) {
                // Add meta description if available
                if (meta.metaDescription && meta.metaDescription.length > 0) {
                    head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
                }
                
                // Add favicon if icon is set
                if (settingsCache.get('icon')) {
                    head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
                }
                
                head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');
                
                // Add robots and referrer tags based on context
                if (isPreviewContext(context)) {
                    head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
                    head.push(writeMetaTag('referrer', 'same-origin', 'name'));
                } else {
                    head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
                }
            }
            
            // Add previous/next links if available
            if (meta.previousUrl) {
                head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
            }
            
            if (meta.nextUrl) {
                head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
            }
            
            // Add structured data if not paged and enabled
            if (!isPagedContext(context) && useStructuredData) {
                // Add social data if not excluded
                if (!excludeList.has('social_data')) {
                    head.push('');
                    head.push.apply(head, finaliseStructuredData(meta));
                    head.push('');
                }
                
                // Add schema if not excluded and available
                if (!excludeList.has('schema') && meta.schema) {
                    head.push('<script type="application/ld+json">\n' +
                        JSON.stringify(meta.schema, null, '    ') +
                        '\n    </script>\n');
                }
            }
        }
        
        head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
        head.push('<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">');
        
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        
        // Add search helper if not excluded
        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }
        
        // Add announcement bar if not excluded
        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }
        
        // Add webmention discovery link
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }
        
        // Add card assets if not excluded
        if (!excludeList.has('card_assets')) {
            if (cardAssets.hasFile('js')) {
                head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
            }
            if (cardAssets.hasFile('css')) {
                head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
            }
        }
        
        // Add comment counts script if enabled
        if (isCommentsEnabled()) {
            head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
        }
        
        // Add member attribution script if members enabled and tracking sources
        if (isMembersEnabled() && settingsCache.get('members_track_sources')) {
            head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
        }
        
        // Add Tinybird tracker if web analytics enabled
        if (isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }
        
        // Add accent color style if available
        if (hasAccentColor(options.data)) {
            injectAccentStyle(head, escapeExpression(options.data.site.accent_color));
        }
        
        // Add global code injection if available
        if (!_.isEmpty(globalCodeinjection)) {
            injectCodeInjection(head, globalCodeinjection);
        }
        
        // Add post code injection if available
        if (!_.isEmpty(postCodeInjection)) {
            injectCodeInjection(head, postCodeInjection);
        }
        
        // Add tag code injection if available
        if (!_.isEmpty(tagCodeInjection)) {
            injectCodeInjection(head, tagCodeInjection);
        }
        
        // Add custom fonts if available
        if (hasCustomFonts(options.data, settingsCache)) {
            const fontScript = getFontInjectionScript(options.data, settingsCache);
            if (fontScript) {
                head.push(fontScript);
            }
        }
        
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```