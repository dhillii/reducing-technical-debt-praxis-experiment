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
 * Writes a meta tag string based on property and content.
 * @param {string} property - The meta property or name.
 * @param {string} content - The meta content value.
 * @param {string} type - The meta tag type (name or property).
 * @returns {string} The formatted meta tag HTML.
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

/**
 * Finalizes structured data into an array of meta tags.
 * @param {Object} meta - The metadata object containing structured data.
 * @returns {string[]} Array of meta tag strings.
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
 * Determines if the members helper should be rendered.
 * @param {Object} data - The template data.
 * @param {string} frontendKey - The frontend key for the portal.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if members helper should be rendered.
 */
function shouldRenderMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return false;
    }
    if (excludeList.has('portal')) {
        return false;
    }
    return true;
}

/**
 * Generates the members helper script and styles.
 * @param {Object} data - The template data.
 * @param {string} frontendKey - The frontend key for the portal.
 * @param {Set} excludeList - List of excluded components.
 * @returns {string} The members helper HTML string.
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!shouldRenderMembersHelper(data, frontendKey, excludeList)) {
        return '';
    }

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
    let membersHelper = `<script defer src="${scriptUrl}" ${dataAttributes} crossorigin="anonymous"></script>`;

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
 * Determines if the search helper should be rendered.
 * @param {string} frontendKey - The frontend key for the search.
 * @returns {boolean} True if search helper should be rendered.
 */
function shouldRenderSearchHelper(frontendKey) {
    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');

    if (!scriptUrl) {
        return false;
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
 * Generates the search helper script.
 * @param {string} frontendKey - The frontend key for the search.
 * @returns {string} The search helper HTML string.
 */
function getSearchHelper(frontendKey) {
    return shouldRenderSearchHelper(frontendKey) ? shouldRenderSearchHelper(frontendKey) : '';
}

/**
 * Determines if the announcement bar helper should be rendered.
 * @param {Object} data - The template data.
 * @returns {boolean} True if announcement bar helper should be rendered.
 */
function shouldRenderAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

    if (!isFilled && !preview) {
        return false;
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
            return false;
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
 * Generates the announcement bar helper script.
 * @param {Object} data - The template data.
 * @returns {string} The announcement bar helper HTML string.
 */
function getAnnouncementBarHelper(data) {
    return shouldRenderAnnouncementBarHelper(data) ? shouldRenderAnnouncementBarHelper(data) : '';
}

/**
 * Generates the webmention discovery link.
 * @returns {string} The webmention link HTML string.
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
 * Determines if the Tinybird tracker script should be rendered.
 * @param {Object} dataRoot - The root data object.
 * @returns {boolean} True if Tinybird tracker script should be rendered.
 */
function shouldRenderTinybirdTrackerScript(dataRoot) {
    const preview = dataRoot?.context?.includes('preview');
    if (preview) {
        return false;
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
 * Generates the Tinybird tracker script.
 * @param {Object} dataRoot - The root data object.
 * @returns {string} The Tinybird tracker script HTML string.
 */
function getTinybirdTrackerScript(dataRoot) {
    return shouldRenderTinybirdTrackerScript(dataRoot) ? shouldRenderTinybirdTrackerScript(dataRoot) : '';
}

/**
 * Determines if the accent color style should be injected.
 * @param {Object} data - The template data.
 * @returns {boolean} True if accent color style should be injected.
 */
function shouldInjectAccentColorStyle(data) {
    return data?.site?.accent_color ? true : false;
}

/**
 * Injects the accent color style into the head.
 * @param {Object} data - The template data.
 * @param {string[]} head - The current head array.
 * @returns {string[]} The updated head array.
 */
function injectAccentColorStyle(data, head) {
    if (!shouldInjectAccentColorStyle(data)) {
        return head;
    }

    const accentColor = escapeExpression(data.site.accent_color);
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
 * Determines if custom fonts should be injected.
 * @param {Object} data - The template data.
 * @param {boolean} isSitePreview - Whether the request is for a site preview.
 * @returns {boolean} True if custom fonts should be injected.
 */
function shouldInjectCustomFonts(data, isSitePreview) {
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
    return (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
           (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
}

/**
 * Injects custom font CSS into the head.
 * @param {Object} data - The template data.
 * @param {boolean} isSitePreview - Whether the request is for a site preview.
 * @param {string[]} head - The current head array.
 * @returns {string[]} The updated head array.
 */
function injectCustomFonts(data, isSitePreview, head) {
    if (!shouldInjectCustomFonts(data, isSitePreview)) {
        return head;
    }

    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
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

    return head;
}

/**
 * Determines if global code injection should be rendered.
 * @param {string} globalCodeinjection - The global code injection string.
 * @returns {boolean} True if global code injection should be rendered.
 */
function shouldRenderGlobalCodeInjection(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

/**
 * Determines if post code injection should be rendered.
 * @param {string} postCodeInjection - The post code injection string.
 * @returns {boolean} True if post code injection should be rendered.
 */
function shouldRenderPostCodeInjection(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

/**
 * Determines if tag code injection should be rendered.
 * @param {string} tagCodeInjection - The tag code injection string.
 * @returns {boolean} True if tag code injection should be rendered.
 */
function shouldRenderTagCodeInjection(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 * Determines if card assets CSS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets CSS should be rendered.
 */
function shouldRenderCardAssetsCSS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('css');
}

/**
 * Determines if metadata should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if metadata should be rendered.
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Determines if social data should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if social data should be rendered.
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Determines if schema should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @param {Object} meta - The metadata object.
 * @returns {boolean} True if schema should be rendered.
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && meta.schema;
}

/**
 * Determines if search should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if search should be rendered.
 */
function shouldRenderSearch(excludeList) {
    return !excludeList.has('search');
}

/**
 * Determines if announcement should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if announcement should be rendered.
 */
function shouldRenderAnnouncement(excludeList) {
    return !excludeList.has('announcement');
}

/**
 * Determines if webmention discovery link should be rendered.
 * @returns {boolean} True if webmention discovery link should be rendered.
 */
function shouldRenderWebmentionDiscoveryLink() {
    return true;
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if comment counts script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if comment counts script should be rendered.
 */
function shouldRenderCommentCountsScript(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Determines if member attribution script should be rendered.
 * @param {Object} settingsCache - The settings cache object.
 * @returns {boolean} True if member attribution script should be rendered.
 */
function shouldRenderMemberAttributionScript(settingsCache) {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Determines if card assets should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets should be rendered.
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Determines if card assets JS should be rendered.
 * @param {Set} excludeList - List of excluded components.
 * @returns {boolean} True if card assets JS should be rendered.
 */
function shouldRenderCardAssetsJS(excludeList) {
    return shouldRenderCardAssets(excludeList) && cardAssets.hasFile('js');
}

/**
 *