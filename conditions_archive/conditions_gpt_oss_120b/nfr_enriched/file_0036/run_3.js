```javascript
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

/**
 * Build a meta tag string.
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Convert structured data into meta tags.
 */
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

/**
 * Build the members helper script/style block.
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') && !settingsCache.get('donations_enabled') && !settingsCache.get('recommendations_enabled')) {
        return '';
    }

    let output = '';

    if (!excludeList.has('portal')) {
        const {scriptUrl} = getFrontendAppConfig('portal');
        const accent = _.has(data, 'site._preview') && data.site.accent_color ? data.site.accent_color : '';
        const attrs = {
            i18n: true,
            ghost: urlUtils.getSiteUrl(),
            key: frontendKey,
            api: urlUtils.urlFor('api', {type: 'content'}, true),
            locale: settingsCache.get('locale') || 'en'
        };
        if (accent) {
            attrs['accent-color'] = accent;
        }
        const dataAttrs = getDataAttributes(attrs);
        output += `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
    }

    if (!excludeList.has('cta_styles')) {
        output += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const fraudFlag = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        output += `<script async src="https://js.stripe.com/v3/${fraudFlag}"></script>`;
    }

    return output;
}

/**
 * Build the search helper script.
 */
function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    if (!scriptUrl) {
        return '';
    }

    const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
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
 * Build the announcement bar helper script.
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const hasContent = settingsCache.get('announcement_content') && settingsCache.get('announcement_visibility').length;

    if (!hasContent && !preview) {
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
        const params = new URLSearchParams(preview);
        const announcement = params.get('announcement');
        const background = params.has('announcement_bg') ? params.get('announcement_bg') : '';
        const visibility = params.has('announcement_vis');

        if (!announcement || !visibility) {
            return '';
        }
        attrs.announcement = escapeExpression(announcement);
        attrs['announcement-background'] = escapeExpression(background);
        attrs.preview = true;
    }

    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Build the webmention discovery link.
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
 * Build the Tinybird analytics script.
 */
function getTinybirdTrackerScript(dataRoot) {
    if (dataRoot?.context?.includes('preview')) {
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
 * Append accent color CSS to the head array.
 */
function addAccentColorStyle(head, accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
    const lastTagIdx = _.findLastIndex(head, str => /<\/(style|script)>/.test(str));

    if (lastTagIdx !== -1) {
        head[lastTagIdx] = head[lastTagIdx] + styleTag;
    } else {
        head.push(styleTag);
    }
}

/**
 * Append custom font CSS if valid fonts are provided.
 */
function addCustomFontStyles(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (!hasValidHeading && !hasValidBody) {
        return;
    }

    /** @type FontSelection */
    const fontSelection = {};
    if (headingFont) fontSelection.heading = headingFont;
    if (bodyFont) fontSelection.body = bodyFont;

    const customCSS = generateCustomFontCss(fontSelection);
    head.push(new SafeString(customCSS));
}

/**
 * Main helper – builds the `<head>` content for Ghost themes.
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    // Server error page – nothing to render
    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context || null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postCodeInjection = dataRoot.post?.codeinjection_head || null;
    const tagCodeInjection = dataRoot.tag?.codeinjection_head || null;
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

        // ---------- Meta tags ----------
        if (context && !excludeList.has('metadata')) {
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

        // ---------- Pagination links ----------
        if (meta.previousUrl) {
            head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
        }
        if (meta.nextUrl) {
            head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
        }

        // ---------- Structured data ----------
        if (context && !_.includes(context, 'paged') && useStructuredData) {
            if (!excludeList.has('social_data')) {
                head.push('');
                head.push(...finaliseStructuredData(meta));
                head.push('');
            }

            if (!excludeList.has('schema') && meta.schema) {
                head.push('<script type="application/ld+json">\n' +
                    JSON.stringify(meta.schema, null, '    ') +
                    '\n    </script>\n');
            }
        }

        // ---------- Generator & RSS ----------
        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

        // ---------- Members ----------
        head.push(getMembersHelper(options.data, frontendKey, excludeList));

        // ---------- Search ----------
        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }

        // ---------- Announcement Bar ----------
        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        // ---------- Webmention ----------
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        // ---------- Card assets ----------
        if (!excludeList.has('card_assets')) {
            if (cardAssets.hasFile('js')) {
                head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
            }
            if (cardAssets.hasFile('css')) {
                head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
            }
        }

        // ---------- Comment counts ----------
        if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
        }

        // ---------- Member attribution ----------
        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
        }

        // ---------- Analytics ----------
        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        // ---------- Accent color ----------
        if (options.data.site.accent_color) {
            addAccentColorStyle(head, escapeExpression(options.data.site.accent_color));
        }

        // ---------- Global code injection ----------
        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }

        // ---------- Post / Tag code injection ----------
        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }
        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }

        // ---------- Custom fonts ----------
        addCustomFontStyles(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```