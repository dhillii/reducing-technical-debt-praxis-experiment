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

function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    if (excludeList.has('portal')) {
        return '';
    }

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

function isServerErrorResponse(statusCode) {
    return statusCode >= 500;
}

function isPreviewContext(context) {
    return _.includes(context, 'preview');
}

function isPagedContext(context) {
    return _.includes(context, 'paged');
}

function isStructuredDataEnabled(useStructuredData) {
    return useStructuredData;
}

function isExcludeListPresent(excludeList, key) {
    return excludeList.has(key);
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccentColorPresent(data) {
    return data?.site?.accent_color;
}

function isGlobalCodeInjectionPresent(globalCodeinjection) {
    return !_.isEmpty(globalCodeinjection);
}

function isPostCodeInjectionPresent(postCodeInjection) {
    return !_.isEmpty(postCodeInjection);
}

function isTagCodeInjectionPresent(tagCodeInjection) {
    return !_.isEmpty(tagCodeInjection);
}

function isCommentsEnabled(settingsCache) {
    return settingsCache.get('comments_enabled') !== 'off';
}

function isMembersEnabled(settingsCache) {
    return settingsCache.get('members_enabled');
}

function isMembersTrackSourcesEnabled(settingsCache) {
    return settingsCache.get('members_track_sources');
}

function isWebAnalyticsEnabled(settingsHelpers) {
    return settingsHelpers.isWebAnalyticsEnabled();
}

function isSitePreview(options) {
    return options.data?.site?._preview ?? false;
}

function isCustomFontValid(font, validator) {
    return (typeof font === 'string' && validator(font));
}

function isAccent