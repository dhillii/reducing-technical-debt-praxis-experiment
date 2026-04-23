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

function writeMetaTag(property, content, type = property.startsWith('twitter') ? 'name' : 'property') {
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

function getMembersHelper(data, frontendKey, excludeSet) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let out = '';

    if (!excludeSet.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const accent = _.has(data, 'site._preview') && data.site.accent_color ? data.site.accent_color : '';
        const attrs = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en',
            ...(accent && {'accent-color': accent})
        };
        out += `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
    }

    if (!excludeSet.has('cta_styles')) {
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
    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
}

function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const hasContent = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

    if (!hasContent && !preview) return '';

    const {scriptUrl} = getFrontendAppConfig('announcementBar');
    const siteUrl = urlUtils.getSiteUrl();
    const announcementUrl = new URL('members/api/announcement/', siteUrl);
    const attrs = {
        'announcement-bar': siteUrl,
        'api-url': announcementUrl
    };

    if (preview) {
        const params = new URLSearchParams(preview);
        const ann = params.get('announcement');
        const bg = params.has('announcement_bg') ? params.get('announcement_bg') : '';
        const vis = params.has('announcement_vis');

        if (!ann || !vis) return '';
        attrs.announcement = escapeExpression(ann);
        attrs['announcement-background'] = escapeExpression(bg);
        attrs.preview = true;
    }

    return `<script defer src="${scriptUrl}" ${getDataAttributes(attrs)} crossorigin="anonymous"></script>`;
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

function addAccentColor(head, accent) {
    const escaped = escapeExpression(accent);
    const styleTag = `<style>:root {--ghost-accent-color: ${escaped};}</style>`;
    const lastTagIdx = _.findLastIndex(head, s => /<\/(style|script)>/.test(s));
    if (lastTagIdx !== -1) {
        head[lastTagIdx] = head[lastTagIdx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

function addCustomFonts(head, data) {
    const isPreview = data?.site?._preview ?? false;
    const heading = isPreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const body = isPreview ? data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeading = typeof heading === 'string' && isValidCustomHeadingFont(heading);
    const hasValidBody = typeof body === 'string' && isValidCustomFont(body);

    if (!hasValidHeading && !hasValidBody) return;

    const selection = {};
    if (heading) selection.heading = heading;
    if (body) selection.body = body;

    head.push(new SafeString(generateCustomFontCss(selection)));
}

async function buildHead(options) {
    const excludeSet = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context || null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postInject = dataRoot?.post?.codeinjection_head ?? null;
    const tagInject = dataRoot?.tag?.codeinjection_head ?? null;
    const globalInject = settingsCache.get('codeinjection_head');
    const useStructured = !config.isPrivacyDisabled('useStructuredData');
    const refPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    const meta = await getMetaData(dataRoot, dataRoot);
    const frontendKey = await getFrontendKey();

    if (context && !excludeSet.has('metadata')) {
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
            head.push(writeMetaTag('referrer', refPolicy, 'name'));
        }
    }

    if (meta.previousUrl) head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    if (meta.nextUrl) head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);

    if (context && !_.includes(context, 'paged') && useStructured) {
        if (!excludeSet.has('social_data')) {
            head.push('', ...finaliseStructuredData(meta), '');
        }
        if (!excludeSet.has('schema') && meta.schema) {
            head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
        }
    }

    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

    head.push(getMembersHelper(options.data, frontendKey, excludeSet));
    if (!excludeSet.has('search')) head.push(getSearchHelper(frontendKey));
    if (!excludeSet.has('announcement')) head.push(getAnnouncementBarHelper(options.data));
    head.push(getWebmentionDiscoveryLink());

    if (!excludeSet.has('card_assets')) {
        if (cardAssets.hasFile('js')) head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
        if (cardAssets.hasFile('css')) head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }

    if (!excludeSet.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
        head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
    }

    if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
        head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
    }

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) dataRoot._locals.ghostAnalytics = true;
    }

    if (options.data.site.accent_color) addAccentColor(head, options.data.site.accent_color);
    if (globalInject) head.push(globalInject);
    if (postInject) head.push(postInject);
    if (tagInject) head.push(tagInject);
    addCustomFonts(head, options.data);

    return head;
}

module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (options.data.root.statusCode >= 500) return;

    try {
        const head = await buildHead(options);
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (err) {
        logging.error(err);
        return new SafeString('');
    }
};

module.exports.async = true;