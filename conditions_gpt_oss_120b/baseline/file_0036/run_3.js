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
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

function finaliseStructuredData(meta) {
    const head = [];
    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, keyword => {
                if (keyword) {
                    head.push(writeMetaTag(property, escapeExpression(keyword)));
                }
            });
            head.push('');
        } else if (content != null) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });
    return head;
}

function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }
    let out = '';
    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const colorString = _.has(data, 'site._preview') && data.site.accent_color ? data.site.accent_color : '';
        const attrs = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (colorString) attrs['accent-color'] = colorString;
        const dataAttrs = getDataAttributes(attrs);
        out += `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
    }
    if (!excludeList.has('cta_styles')) {
        out += `<style id="gh-members-styles">${templateStyles}</style>`;
    }
    if (settingsCache.get('paid_members_enabled')) {
        const fraud = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        out += `<script async src="https://js.stripe.com/v3/${fraud}"></script>`;
    }
    return out;
}

function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    if (!scriptUrl) return '';
    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': urlUtils.getAdminUrl() || urlUtils.getSiteUrl(),
        locale: settingsCache.get('locale') || 'en'
    };
    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;
    if (!isFilled && !preview) return '';
    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };
    if (preview) {
        const sp = new URLSearchParams(preview);
        const ann = sp.get('announcement');
        const bg = sp.has('announcement_bg') ? sp.get('announcement_bg') : '';
        const vis = sp.has('announcement_vis');
        if (!ann || !vis) return '';
        attrs.announcement = escapeExpression(ann);
        attrs['announcement-background'] = escapeExpression(bg);
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
    if (dataRoot?.context?.includes('preview')) return '';
    const src = getAssetUrl('public/ghost-stats.min.js', false);
    const env = config.get('env');
    const stats = config.get('tinybird:tracker');
    const local = config.get('tinybird:tracker:local') || {};
    const enabled = local.enabled ?? false;
    const endpoint = enabled ? local.endpoint : stats.endpoint;
    const token = enabled ? local.token : stats.token;
    const datasource = enabled ? local.datasource : stats.datasource;

    const tbParams = _.map({
        site_uuid: settingsCache.get('site_uuid'),
        post_uuid: dataRoot.post?.uuid,
        post_type: dataRoot.context?.includes('post') ? 'post' : dataRoot.context?.includes('page') ? 'page' : null,
        member_uuid: dataRoot.member?.uuid,
        member_status: dataRoot.member?.status
    }, (v, k) => `tb_${k}="${v}"`).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false"${datasource ? ` data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}"${token && env !== 'production' ? ` data-token="${token}"` : ''} ${tbParams}></script>`;
}

/* Helper sections for building head */
function addMetaData(head, meta, context, excludeList, safeVersion, referrerPolicy, favicon, iconType) {
    if (excludeList.has('metadata')) return;
    if (meta.metaDescription) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }
    if (settingsCache.get('icon')) {
        head.push(`<link rel="icon" href="${favicon}" type="image/${iconType}">`);
    }
    head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);
    if (_.includes(context, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
    }
}

function addPrevNext(head, meta) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

function addStructuredAndSchema(head, meta, context, excludeList, useStructuredData) {
    if (_.includes(context, 'paged') || !useStructuredData) return;
    if (!excludeList.has('social_data')) {
        head.push('');
        head.push(...finaliseStructuredData(meta));
        head.push('');
    }
    if (!excludeList.has('schema') && meta.schema) {
        head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
    }
}

function addGeneratorAndRss(head, safeVersion, meta) {
    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);
}

function addAssets(head, excludeList, frontendKey, options) {
    head.push(getMembersHelper(options.data, frontendKey, excludeList));
    if (!excludeList.has('search')) head.push(getSearchHelper(frontendKey));
    if (!excludeList.has('announcement')) head.push(getAnnouncementBarHelper(options.data));
    try {
        head.push(getWebmentionDiscoveryLink());
    } catch (e) {
        logging.warn(e);
    }
    if (!excludeList.has('card_assets')) {
        if (cardAssets.hasFile('js')) head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        if (cardAssets.hasFile('css')) head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
    if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }
    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }
}

function addAnalytics(head, dataRoot, excludeList) {
    if (excludeList.has('analytics')) return;
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) dataRoot._locals.ghostAnalytics = true;
    }
}

function addAccentColor(head, options) {
    const accent = options.data.site.accent_color;
    if (!accent) return;
    const escaped = escapeExpression(accent);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const idx = _.findLastIndex(head, s => /<\/(style|script)>/.test(s));
    if (idx !== -1) {
        head[idx] = head[idx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

function addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection) {
    if (!_.isEmpty(globalCodeinjection)) head.push(globalCodeinjection);
    if (!_.isEmpty(postCodeInjection)) head.push(postCodeInjection);
    if (!_.isEmpty(tagCodeInjection)) head.push(tagCodeInjection);
}

function addCustomFonts(head, options, dataRoot) {
    const isPreview = options.data?.site?._preview ?? false;
    const headingFont = isPreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isPreview ? options.data?.site?.body_font : settingsCache.get('body_font');
    const hasValid = (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
                     (typeof bodyFont === 'string' && isValidCustomFont(bodyFont));
    if (!hasValid) return;
    const selection = {};
    if (headingFont) selection.heading = headingFont;
    if (bodyFont) selection.body = bodyFont;
    const css = generateCustomFontCss(selection);
    head.push(new SafeString(css));
}

/* Main helper */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (options.data.root.statusCode >= 500) return;
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context || null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head || null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (context) {
            addMetaData(head, meta, context, excludeList, safeVersion, referrerPolicy, favicon, iconType);
            addPrevNext(head, meta);
            addStructuredAndSchema(head, meta, context, excludeList, useStructuredData);
        }

        addGeneratorAndRss(head, safeVersion, meta);
        addAssets(head, excludeList, frontendKey, options);
        addAnalytics(head, dataRoot, excludeList);
        addAccentColor(head, options);
        addCodeInjections(head, globalCodeinjection, postCodeInjection, tagCodeInjection);
        addCustomFonts(head, options, dataRoot);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;