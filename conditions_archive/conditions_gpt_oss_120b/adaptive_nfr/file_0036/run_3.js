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
 * Write a meta tag.
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || (property.substring(0, 7) === 'twitter' ? 'name' : 'property');
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * Build structured data tags.
 * @param {object} meta
 * @returns {string[]}
 */
function finaliseStructuredData(meta) {
    const head = [];

    _.each(meta.structuredData, (content, property) => {
        if (property === 'article:tag') {
            _.each(meta.keywords, keyword => {
                if (keyword !== '') {
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
 * Guard: members helper should be rendered.
 * @param {object} data
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMembersHelper(data, frontendKey, excludeList) {
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
        membersHelper += `<style id="gh-members-styles">${templateStyles}</style>`;
    }

    if (settingsCache.get('paid_members_enabled')) {
        const isFraudSignalsEnabled = process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }

    return membersHelper;
}

/**
 * Guard: search helper should be rendered.
 * @param {string} frontendKey
 * @returns {string}
 */
function getSearchHelper(frontendKey) {
    const {scriptUrl, stylesUrl} = getFrontendAppConfig('sodoSearch');
    if (!scriptUrl) {
        return '';
    }

    const attrs = {
        key: frontendKey,
        styles: stylesUrl,
        'sodo-search': urlUtils.getAdminUrl() || urlUtils.getSiteUrl(),
        locale: settingsCache.get('locale') || 'en'
    };
    const dataAttrs = getDataAttributes(attrs);
    return `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;
}

/**
 * Guard: announcement bar helper should be rendered.
 * @param {object} data
 * @returns {string}
 */
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

/**
 * Build webmention discovery link.
 * @returns {string}
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
 * Guard: tinybird tracker script should be rendered.
 * @param {object} dataRoot
 * @returns {string}
 */
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

/**
 * Predicate: should render metadata block.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderMetadata(excludeList) {
    return !excludeList.has('metadata');
}

/**
 * Predicate: should render social data.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderSocialData(excludeList) {
    return !excludeList.has('social_data');
}

/**
 * Predicate: should render schema block.
 * @param {Set<string>} excludeList
 * @param {object} meta
 * @returns {boolean}
 */
function shouldRenderSchema(excludeList, meta) {
    return !excludeList.has('schema') && !!meta.schema;
}

/**
 * Predicate: should render card assets.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderCardAssets(excludeList) {
    return !excludeList.has('card_assets');
}

/**
 * Predicate: should render comment counts.
 * @param {Set<string>} excludeList
 * @returns {boolean}
 */
function shouldRenderCommentCounts(excludeList) {
    return !excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off';
}

/**
 * Predicate: should render member attribution.
 * @returns {boolean}
 */
function shouldRenderMemberAttribution() {
    return settingsCache.get('members_enabled') && settingsCache.get('members_track_sources');
}

/**
 * Main helper exported to Handlebars.
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');

    if (isServerError(options)) {
        return;
    }

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

        if (context) {
            if (shouldRenderMetadata(excludeList)) {
                addMetaDescription(head, meta);
                addFavicon(head, favicon, iconType);
                head.push(`<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`);
                addReferrerMeta(head, context, referrerPolicy);
            }

            addPrevNextLinks(head, meta);
            if (!_.includes(context, 'paged') && useStructuredData) {
                if (shouldRenderSocialData(excludeList)) {
                    head.push('');
                    head.push.apply(head, finaliseStructuredData(meta));
                    head.push('');
                }
                if (shouldRenderSchema(excludeList, meta)) {
                    head.push('<script type="application/ld+json">\n' + JSON.stringify(meta.schema, null, '    ') + '\n    </script>\n');
                }
            }
        }

        head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
        head.push(`<link rel="alternate" type="application/rss+xml" title="${escapeExpression(meta.site.title)}" href="${escapeExpression(meta.rssUrl)}">`);

        head.push(getMembersHelper(options.data, frontendKey, excludeList));

        if (!excludeList.has('search')) {
            head.push(getSearchHelper(frontendKey));
        }

        if (!excludeList.has('announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        head.push(getWebmentionDiscoveryLink());

        if (shouldRenderCardAssets(excludeList)) {
            if (cardAssets.hasFile('js')) {
                head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
            }
            if (cardAssets.hasFile('css')) {
                head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
            }
        }

        if (shouldRenderCommentCounts(excludeList)) {
            head.push(`<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`);
        }

        if (shouldRenderMemberAttribution()) {
            head.push(`<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`);
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        addAccentColorStyle(head, options);
        addGlobalCodeInjection(head, globalCodeinjection);
        addPostCodeInjection(head, postCodeInjection);
        addTagCodeInjection(head, tagCodeInjection);
        addCustomFontStyles(head, options);

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

/**
 * Guard: server error page.
 * @param {object} options
 * @returns {boolean}
 */
function isServerError(options) {
    return options?.data?.root?.statusCode >= 500;
}

/**
 * Add meta description if present.
 * @param {string[]} head
 * @param {object} meta
 */
function addMetaDescription(head, meta) {
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
    }
}

/**
 * Add favicon link if icon is set.
 * @param {string[]} head
 * @param {string} href
 * @param {string} type
 */
function addFavicon(head, href, type) {
    if (settingsCache.get('icon')) {
        head.push(`<link rel="icon" href="${href}" type="image/${type}">`);
    }
}

/**
 * Add referrer meta based on context.
 * @param {string[]} head
 * @param {string[]} context
 * @param {string} policy
 */
function addReferrerMeta(head, context, policy) {
    if (_.includes(context, 'preview')) {
        head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
        head.push(writeMetaTag('referrer', 'same-origin', 'name'));
    } else {
        head.push(writeMetaTag('referrer', policy, 'name'));
    }
}

/**
 * Add previous/next link tags.
 * @param {string[]} head
 * @param {object} meta
 */
function addPrevNextLinks(head, meta) {
    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }
}

/**
 * Add accent color style tag.
 * @param {string[]} head
 * @param {object} options
 */
function addAccentColorStyle(head, options) {
    if (options.data.site.accent_color) {
        const accentColor = escapeExpression(options.data.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
        if (existingScriptIndex !== -1) {
            head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
        } else {
            head.push(styleTag);
        }
    }
}

/**
 * Add global code injection.
 * @param {string[]} head
 * @param {string} injection
 */
function addGlobalCodeInjection(head, injection) {
    if (!_.isEmpty(injection)) {
        head.push(injection);
    }
}

/**
 * Add post specific code injection.
 * @param {string[]} head
 * @param {string} injection
 */
function addPostCodeInjection(head, injection) {
    if (!_.isEmpty(injection)) {
        head.push(injection);
    }
}

/**
 * Add tag specific code injection.
 * @param {string[]} head
 * @param {string} injection
 */
function addTagCodeInjection(head, injection) {
    if (!_.isEmpty(injection)) {
        head.push(injection);
    }
}

/**
 * Add custom font styles if needed.
 * @param {string[]} head
 * @param {object} options
 */
function addCustomFontStyles(head, options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    const hasValidHeading = typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
    const hasValidBody = typeof bodyFont === 'string' && isValidCustomFont(bodyFont);

    if (hasValidHeading || hasValidBody) {
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
    }
}

module.exports.async = true;
```