```javascript
// # Ghost Head Helper
// Usage: `{{ghost_head}}`
//
// Outputs scripts and other assets at the top of a Ghost theme
const {
    metaData,
    settingsCache,
    config,
    blogIcon,
    urlUtils,
    getFrontendKey,
    settingsHelpers
} = require('../services/proxy');
const {escapeExpression, SafeString} = require('../services/handlebars');
const {
    generateCustomFontCss,
    isValidCustomFont,
    isValidCustomHeadingFont
} = require('@tryghost/custom-fonts');
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
 * @param {string} property
 * @param {string} content
 * @param {string} [type]
 * @returns {string}
 */
function writeMetaTag(property, content, type) {
    type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
    return `<meta ${type}="${property}" content="${content}">`;
}

/**
 * @param {object} meta
 * @returns {string[]}
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
 * @param {object} data
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function getMembersHelper(data, frontendKey, excludeList) {
    if (!settingsCache.get('members_enabled') &&
        !settingsCache.get('donations_enabled') &&
        !settingsCache.get('recommendations_enabled')) {
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
        const isFraudSignalsEnabled =
            process.env.NODE_ENV === 'testing-browser' ? '?advancedFraudSignals=false' : '';
        membersHelper += `<script async src="https://js.stripe.com/v3/${isFraudSignalsEnabled}"></script>`;
    }

    return membersHelper;
}

/**
 * @param {string} frontendKey
 * @returns {string}
 */
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

/**
 * @param {object} data
 * @returns {string}
 */
function getAnnouncementBarHelper(data) {
    const preview = data?.site?._preview;
    const isFilled =
        settingsCache.get('announcement_content') &&
        settingsCache.get('announcement_visibility').length;

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
        const announcementBackground = searchParam.has('announcement_bg')
            ? searchParam.get('announcement_bg')
            : '';
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

    const tbParams = _.map(
        {
            site_uuid: settingsCache.get('site_uuid'),
            post_uuid: dataRoot.post?.uuid,
            post_type: dataRoot.context?.includes('post')
                ? 'post'
                : dataRoot.context?.includes('page')
                ? 'page'
                : null,
            member_uuid: dataRoot.member?.uuid,
            member_status: dataRoot.member?.status
        },
        (value, key) => `tb_${key}="${value}"`
    ).join(' ');

    return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function getCardAssetsSection(dataRoot) {
    if (!cardAssets.hasFile('js') && !cardAssets.hasFile('css')) {
        return '';
    }

    const scripts = [];
    if (cardAssets.hasFile('js')) {
        scripts.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        scripts.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
    return scripts.join('');
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function getCommentCountsSection(dataRoot) {
    if (settingsCache.get('comments_enabled') === 'off') {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function getMemberAttributionSection(dataRoot) {
    if (!settingsCache.get('members_enabled') || !settingsCache.get('members_track_sources')) {
        return '';
    }
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

/**
 * @param {object} options
 * @returns {string}
 */
function buildAccentColorStyle(options) {
    if (!options.data.site.accent_color) {
        return '';
    }
    const accentColor = escapeExpression(options.data.site.accent_color);
    return `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
}

/**
 * @param {string} globalCodeinjection
 * @param {string} postCodeInjection
 * @param {string} tagCodeInjection
 * @returns {string[]}
 */
function buildCodeInjections(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    const injections = [];
    if (!_.isEmpty(globalCodeinjection)) {
        injections.push(globalCodeinjection);
    }
    if (!_.isEmpty(postCodeInjection)) {
        injections.push(postCodeInjection);
    }
    if (!_.isEmpty(tagCodeInjection)) {
        injections.push(tagCodeInjection);
    }
    return injections;
}

/**
 * @param {object} options
 * @returns {string}
 */
function buildCustomFontCssSection(options) {
    const isSitePreview = options.data?.site?._preview ?? false;
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

    if (
        (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
        (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))
    ) {
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

/**
 * @param {object} meta
 * @param {string[]} context
 * @param {Set<string>} excludeList
 * @param {object} settings
 * @param {object} config
 * @param {object} urlUtils
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} referrerPolicy
 * @param {string} safeVersion
 * @returns {string[]}
 */
function buildMetaHead(
    meta,
    context,
    excludeList,
    settings,
    config,
    urlUtils,
    favicon,
    iconType,
    referrerPolicy,
    safeVersion
) {
    const head = [];

    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
            head.push(`<meta name="description" content="${escapeExpression(meta.metaDescription)}">`);
        }

        if (settings.get('icon')) {
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

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }

    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    if (!_.includes(context, 'paged') && useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push(...finaliseStructuredData(meta));
            head.push('');
        }

        if (!excludeList.has('schema') && meta.schema) {
            head.push(
                `<script type="application/ld+json">\n${JSON.stringify(
                    meta.schema,
                    null,
                    '    '
                )}\n    </script>\n`
            );
        }
    }

    head.push(`<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`);
    head.push(
        `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(
            meta.site.title
        )}" href="${escapeExpression(meta.rssUrl)}">`
    );

    return head;
}

/**
 * @param {object} options
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildMembersSection(options, frontendKey, excludeList) {
    return getMembersHelper(options.data, frontendKey, excludeList);
}

/**
 * @param {string} frontendKey
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildSearchSection(frontendKey, excludeList) {
    return !excludeList.has('search') ? getSearchHelper(frontendKey) : '';
}

/**
 * @param {object} options
 * @param {Set<string>} excludeList
 * @returns {string}
 */
function buildAnnouncementSection(options, excludeList) {
    return !excludeList.has('announcement') ? getAnnouncementBarHelper(options.data) : '';
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function buildWebmentionSection() {
    return getWebmentionDiscoveryLink();
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function buildCardAssetsSection(dataRoot) {
    return getCardAssetsSection(dataRoot);
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function buildCommentCountsSection(dataRoot) {
    return getCommentCountsSection(dataRoot);
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function buildMemberAttributionSection(dataRoot) {
    return getMemberAttributionSection(dataRoot);
}

/**
 * @param {object} dataRoot
 * @returns {string}
 */
function buildTinybirdScriptSection(dataRoot) {
    return getTinybirdTrackerScript(dataRoot);
}

/**
 * @param {object} options
 * @returns {string}
 */
function buildAccentColorStyleSection(options) {
    return buildAccentColorStyle(options);
}

/**
 * @param {string} globalCodeinjection
 * @param {string} postCodeInjection
 * @param {string} tagCodeInjection
 * @returns {string[]}
 */
function buildCodeInjectionsSection(globalCodeinjection, postCodeInjection, tagCodeInjection) {
    return buildCodeInjections(globalCodeinjection, postCodeInjection, tagCodeInjection);
}

/**
 * @param {object} options
 * @returns {string}
 */
function buildCustomFontCssSection(options) {
    return buildCustomFontCssSection(options);
}

/**
 * @param {object} options
 * @returns {Promise<SafeString>}
 */
module.exports = async function ghost_head(options) {
    debug('begin');

    if (options.data.root.statusCode >= 500) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals?.context ?? null;
    const safeVersion = dataRoot._locals?.safeVersion;
    const postCodeInjection = dataRoot?.post?.codeinjection_head ?? null;
    const tagCodeInjection = dataRoot?.tag?.codeinjection_head ?? null;
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

        const metaHead = buildMetaHead(
            meta,
            context,
            excludeList,
            settingsCache,
            config,
            urlUtils,
            favicon,
            iconType,
            referrerPolicy,
            safeVersion
        );
        head.push(...metaHead);

        head.push(buildMembersSection(options, frontendKey, excludeList));
        head.push(buildSearchSection(frontendKey, excludeList));
        head.push(buildAnnouncementSection(options, excludeList));

        try {
            head.push(buildWebmentionSection());
        } catch (err) {
            logging.warn(err);
        }

        if (!excludeList.has('card_assets')) {
            head.push(buildCardAssetsSection(dataRoot));
        }

        head.push(buildCommentCountsSection(dataRoot));
        head.push(buildMemberAttributionSection(dataRoot));

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(buildTinybirdScriptSection(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        head.push(buildAccentColorStyleSection(options));

        head.push(...buildCodeInjectionsSection(
            globalCodeinjection,
            postCodeInjection,
            tagCodeInjection
        ));

        head.push(buildCustomFontCssSection(options));

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;
```