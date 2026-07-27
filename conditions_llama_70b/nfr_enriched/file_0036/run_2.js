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
    // Write a meta tag with the given property, content, and type
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return '<meta ' + type + '="' + property + '" content="' + content + '">';
}

function finaliseStructuredData(meta) {
    // Finalize the structured data for the given meta object
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
    // Get the members helper HTML
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
    // Get the search helper HTML
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
    // Get the announcement bar helper HTML
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
    // Get the webmention discovery link HTML
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
    // Get the Tinybird tracker script HTML
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
    // Get the meta tags HTML
    const head = [];

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
        }

        if (settingsCache.get('icon')) {
            head.push('<link rel="icon" href="' + blogIcon.getIconUrl() + '" type="image/' + blogIcon.getIconType(blogIcon.getIconUrl()) + '">');
        }

        head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

        if (_.includes(context, 'preview')) {
            head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
            head.push(writeMetaTag('referrer', 'same-origin', 'name'));
        } else {
            head.push(writeMetaTag('referrer', config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade', 'name'));
        }
    }

    if (meta.previousUrl) {
        head.push('<link rel="prev" href="' +
            escapeExpression(meta.previousUrl) + '">');
    }

    if (meta.nextUrl) {
        head.push('<link rel="next" href="' +
            escapeExpression(meta.nextUrl) + '">');
    }

    return head;
}

function getStructuredData(meta, context, excludeList) {
    // Get the structured data HTML
    const head = [];

    if (!_.includes(context, 'paged') && !config.isPrivacyDisabled('useStructuredData')) {
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

    return head;
}

function getCustomFonts(data, isSitePreview) {
    // Get the custom fonts HTML
    const headingFont = isSitePreview ? data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? data?.site?.body_font : settingsCache.get('body_font');
    if ((typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
            (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))) {
        /** @type FontSelection */
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
    return '';
}

function getAccentColor(data) {
    // Get the accent color HTML
    if (data.site.accent_color) {
        const accentColor = escapeExpression(data.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        return styleTag;
    }
    return '';
}

function getAnalyticsScript(dataRoot) {
    // Get the analytics script HTML
    if (settingsHelpers.isWebAnalyticsEnabled()) {
        const script = getTinybirdTrackerScript(dataRoot);
        // Set a flag in response locals to indicate tracking script is being served
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
        return script;
    }
    return '';
}

function getOtherScripts(data, frontendKey, excludeList) {
    // Get the other scripts HTML
    const head = [];

    head.push(getMembersHelper(data, frontendKey, excludeList));
    if (!excludeList.has('search')) {
        head.push(getSearchHelper(frontendKey));
    }
    if (!excludeList.has('announcement')) {
        head.push(getAnnouncementBarHelper(data));
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

    return head.join('');
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
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        const head = [];

        head.push(...getMetaTags(meta, context, excludeList));
        head.push(...getStructuredData(meta, context, excludeList));
        head.push('<meta name="generator" content="Ghost ' +
            escapeExpression(safeVersion) + '">');
        head.push('<link rel="alternate" type="application/rss+xml" title="' +
            escapeExpression(meta.site.title) + '" href="' +
            escapeExpression(meta.rssUrl) + '">');

        head.push(getOtherScripts(options.data, frontendKey, excludeList));
        head.push(getAnalyticsScript(dataRoot));

        if (!_.isEmpty(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }

        if (!_.isEmpty(postCodeInjection)) {
            head.push(postCodeInjection);
        }

        if (!_.isEmpty(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }

        const isSitePreview = options.data?.site?._preview ?? false;
        const accentColor = getAccentColor(options.data);
        const customFonts = getCustomFonts(options.data, isSitePreview);

        if (accentColor) {
            const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

            if (existingScriptIndex !== -1) {
                head[existingScriptIndex] = head[existingScriptIndex] + accentColor;
            } else {
                head.push(accentColor);
            }
        }

        if (customFonts) {
            head.push(customFonts);
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);

        // Return what we have so far (currently nothing)
        return new SafeString([]);
    }
};

module.exports.async = true;