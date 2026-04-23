```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
const {metaData, settingsCache, config, blogIcon, urlUtils, getFrontendKey, settingsHelpers} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {generateCustomFontCss, isValidCustomFont, isValidCustomHeadingFont} = require('@tryghost/custom-fonts');
const {cardAssets} = require('../services/assets-minification'); // TODO: fix this require
const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const {getFrontendAppConfig, getDataAttributes} = require('../utils/frontend-apps');

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

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
        } else if (content != null) {
            head.push(writeMetaTag(property, escapeExpression(content)));
        }
    });

    return head;
}

/* -------------------------------------------------------------------------- */
/* Helper builders                                                            */
/* -------------------------------------------------------------------------- */

function buildMembersHelper(data, frontendKey, excludeSet) {
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

function buildSearchHelper(frontendKey) {
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

function buildAnnouncementHelper(data) {
    const preview = data?.site?._preview;
    const filled = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

    if (!filled && !preview) return '';

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

function buildWebmentionLink() {
    try {
        const siteUrl = urlUtils.getSiteUrl();
        const wmUrl = new URL('webmentions/receive/', siteUrl);
        return `<link href="${wmUrl.href}" rel="webmention">`;
    } catch (e) {
        logging.warn(e);
        return '';
    }
}

function buildTinybirdTracker(dataRoot) {
    const preview = dataRoot?.context?.includes('preview');
    if (preview) return '';

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

/* -------------------------------------------------------------------------- */
/* Main helper                                                                */
/* -------------------------------------------------------------------------- */

module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (options.data.root.statusCode >= 500) return;

    const excludeSet = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context || null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postInject = dataRoot?.post?.codeinjection_head || null;
    const tagInject = dataRoot?.tag?.codeinjection_head || null;
    const globalInject = settingsCache.get('codeinjection_head');
    const useStructured = !config.isPrivacyDisabled('useStructuredData');
    const refPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        if (context) {
            if (!excludeSet.has('metadata')) {
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

            if (!_.includes(context, 'paged') && useStructured) {
                if (!excludeSet.has('social_data')) {
                    head.push('', ...finaliseStructuredData(meta), '');
                }
                if (!excludeSet.has('schema') && meta.schema) {
                    head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
                }
            }
        }

        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

        head.push(buildMembersHelper(options.data, frontendKey, excludeSet));
        if (!excludeSet.has('search')) head.push(buildSearchHelper(frontendKey));
        if (!excludeSet.has('announcement')) head.push(buildAnnouncementHelper(options.data));
        head.push(buildWebmentionLink());

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
            head.push(buildTinybirdTracker(dataRoot));
            if (dataRoot._locals) dataRoot._locals.ghostAnalytics = true;
        }

        if (options.data.site?.accent_color) {
            const accent = escapeExpression(options.data.site.accent_color);
            const styleTag = `<style>:root {--ghost-accent-color: ${accent};}</style>`;
            const idx = _.findLastIndex(head, s => /<\/(style|script)>/.test(s));
            if (idx !== -1) head[idx] += styleTag;
            else head.push(styleTag);
        }

        if (!_.isEmpty(globalInject)) head.push(globalInject);
        if (!_.isEmpty(postInject)) head.push(postInject);
        if (!_.isEmpty(tagInject)) head.push(tagInject);

        const isPreview = options.data?.site?._preview ?? false;
        const headingFont = isPreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
        const bodyFont = isPreview ? options.data?.site?.body_font : settingsCache.get('body_font');

        if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
            /** @type FontSelection */
            const selection = {};
            if (headingFont) selection.heading = headingFont;
            if (bodyFont) selection.body = bodyFont;
            head.push(new SafeString(generateCustomFontCss(selection)));
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (err) {
        logging.error(err);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```