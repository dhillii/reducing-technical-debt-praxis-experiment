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
    // Do not load Portal if both Memberships and Tips & Donations and Recommendations are disabled
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
        // disable fraud detection for e2e tests to reduce waiting time
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

function getMetaTags(meta, context, excludeList) {
    const metaTags = [];

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            metaTags.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            metaTags.push('<link rel="icon" href="' + blogIcon.getIconUrl() + '" type="image/' + blogIcon.getIconType(blogIcon.getIconUrl()) + '">');
        }

        metaTags.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

        if (_.includes(context, 'preview')) {
            metaTags.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            metaTags.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            metaTags.push(writeMetaTag('referrer', config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade', 'name'));
        }
    }

    if (meta.previousUrl) {
        metaTags.push('<link rel="prev" href="' +
            escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        metaTags.push('<link rel="next" href="' +
            escapeExpression(meta.nextUrl) + '">');
    }

    return metaTags;
}

function getStructuredData(meta, context, excludeList) {
    const structuredData = [];

    if (!_.includes(context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
        if (!excludeList.has('social_data')) {
            structuredData.push('');
            structuredData.push.apply(structuredData, finaliseStructuredData(meta));
            structuredData.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            structuredData.push('<script type="application/ld+json">\n' +
                JSON.stringify(meta.schema, null, '    ') +
                '\n    </script>\n');
        }
    }

    return structuredData;
}

function getCustomAssets(excludeList, frontendKey, data) {
    const customAssets = [];

    customAssets.push('<meta name="generator" content="Ghost ' +
        escapeExpression(data._locals.safeVersion) + '">');
    customAssets.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(data.site.title) + '" href="' +
        escapeExpression(data.rssUrl) + '">');

    customAssets.push(getMembersHelper(data, frontendKey, excludeList));
    if (!excludeList.has('search')) {
        customAssets.push(getSearchHelper(frontendKey));
    }
    if (!excludeList.has('announcement')) {
        customAssets.push(getAnnouncementBarHelper(data));
    }
    try {
        customAssets.push(getWebmentionDiscoveryLink());
    } catch (err) {
        logging.warn(err);
    }

    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            customAssets.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            customAssets.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }

    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        customAssets.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        customAssets.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        customAssets.push(getTinybirdTrackerScript(data));
        if (data._locals) {
            data._locals.ghostAnalytics = true;
        }
    }

    return customAssets;
}

function getCustomFonts(data, excludeList) {
    const customFonts = [];

    if (data.site.accent_color) {
        const accentColor = escapeExpression(data.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        customFonts.push(styleTag);
    }

    if (!_.isEmpty(settingsCache.get('codeinjection_head'))) {
        customFonts.push(settingsCache.get('codeinjection_head'));
    }

    if (!_.isEmpty(data.post?.codeinjection_head)) {
        customFonts.push(data.post.codeinjection_head);
    }

    if (!_.isEmpty(data.tag?.codeinjection_head)) {
        customFonts.push(data.tag.codeinjection_head);
    }

    const isSitePreview = data?.site?._preview ?? false;
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        const fontSelection = {};

        if (headingFont) {
            fontSelection.heading = headingFont;
        }
        if (bodyFont) {
            fontSelection.body = bodyFont;
        }
        const customCSS = generateCustomFontCss(fontSelection);
        customFonts.push(new SafeString(customCSS));
    }

    return customFonts;
}

// We use the name ghost_head to match the helper for consistency:
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    // if server error page do nothing
    if (options.data.root.statusCode >= 500) {
        return;
    }
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const meta = await getMetaData(dataRoot, dataRoot);
    const frontendKey = await getFrontendKey();

    debug('end fetch');

    const metaTags = getMetaTags(meta, context, excludeList);
    const structuredData = getStructuredData(meta, context, excludeList);
    const customAssets = getCustomAssets(excludeList, frontendKey, options.data);
    const customFonts = getCustomFonts(options.data, excludeList);

    const head = [...metaTags, ...structuredData, ...customAssets, ...customFonts];

    debug('end');
    return new SafeString(head.join('\n    ').trim());
};

module.exports.async = true;