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

function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }
    let membersHelper = '';
    if (!excludeList.has('portal')) {
        membersHelper += buildPortalScript(data, frontendKey);
    }
    if (!excludeList.has('cta_styles')) {
        membersHelper += `<style id="gh-members-styles">${templateStyles}</style>`;
    }
    if (settingsCache.get('paid_members_enabled')) {
        membersHelper += buildStripeScript();
    }
    return membersHelper;
}

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

function buildStripeScript() {
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

function addMetadataToHead(head, meta, context, excludeList, referrerPolicy) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            const favicon = blogIcon.getIconUrl();
            const iconType = blogIcon.getIconType(favicon);
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
}

function addPaginationLinks(head, meta) {
    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' + escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' + escapeExpression(meta.nextUrl) + '">');
    }
}

function addStructuredData(head, meta, context, excludeList, useStructuredData) {
    if (!_.includes(context, 'paged') && useStructuredData) {
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
}

function addBasicMetaTags(head, meta, safeVersion) {
    head.push('<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">');
    head.push('<link rel="alternate" type="application/rss+xml" title="' +
        escapeExpression(meta.site.title) + '" href="' +
        escapeExpression(meta.rssUrl) + '">');
}

function addCardAssets(head, excludeList) {
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) {
            head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        }
        if (cardAssets.hasFile('css')) {
            head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
        }
    }
}

function addCommentCounts(head, excludeList) {
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
}

function addMemberAttribution(head) {
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

function addAnalytics(head, dataRoot) {
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }
}

function addAccentColor(head, accentColor) {
    if (accentColor) {
        const escapedColor = escapeExpression(accentColor);
        const styleTag = `<style>:root {--ghost-accent-color: ${escapedColor};}</style>`;
        const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

        if (existingScriptIndex !== -1) {
            head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
        } else {
            head.push(styleTag);
        }
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
    const postCodeInjection = dataRoot?.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head || null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (context) {
            addMetadataToHead(head, meta, context, excludeList, referrerPolicy);
            addPaginationLinks(head, meta);
            addStructuredData(head, meta, context, excludeList, useStructuredData);
        }

        addBasicMetaTags(head, meta, safeVersion);
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
        addAnalytics(head, dataRoot);
        addAccentColor(head, options.data.site.accent_color);
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