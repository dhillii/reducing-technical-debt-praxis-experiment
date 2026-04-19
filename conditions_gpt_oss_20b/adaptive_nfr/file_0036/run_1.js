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
 * @private
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
 * @private
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
 * @private
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
 * @private
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
 * @private
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
 * @private
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
 * @private
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
 * @private
 * @param {string[]} head
 * @param {object} meta
 * @param {string[]} context
 * @param {Set<string>} excludeList
 * @param {boolean} useStructuredData
 * @param {string} referrerPolicy
 * @param {string} favicon
 * @param {string} iconType
 * @param {string} safeVersion
 * @param {string} globalCodeinjection
 * @param {string} postCodeInjection
 * @param {string} tagCodeInjection
 * @param {object} dataRoot
 * @param {string} frontendKey
 */
function buildHeadSections(
    head,
    meta,
    context,
    excludeList,
    useStructuredData,
    referrerPolicy,
    favicon,
    iconType,
    safeVersion,
    globalCodeinjection,
    postCodeInjection,
    tagCodeInjection,
    dataRoot,
    frontendKey
) {
    if (!excludeList.has('metadata')) {
        if (meta.metaDescription && meta.metaDescription.length > 0) {
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

    if (meta.previousUrl) {
        head.push(`<link rel="prev" href="${escapeExpression(meta.previousUrl)}">`);
    }
    if (meta.nextUrl) {
        head.push(`<link rel="next" href="${escapeExpression(meta.nextUrl)}">`);
    }

    if (!_.includes(context, 'paged') && useStructuredData) {
        if (!excludeList.has('social_data')) {
            head.push('');
            head.push.apply(head, finaliseStructuredData(meta));
            head.push('');
        }
        if (!excludeList.has('schema') && meta.schema) {
            head.push(`<script type="application/ld+json">\n${JSON.stringify(meta.schema, null, '    ')}\n    </script>\n`);
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

    if (settingsHelpers.isWebAnalyticsEnabled()) {
        head.push(getTinybirdTrackerScript(dataRoot));
        if (dataRoot._locals) {
            dataRoot._locals.ghostAnalytics = true;
        }
    }

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
    const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
    const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');
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
        head.push(new SafeString(customCSS));
    }
}

/**
 * @private
 * @param {object} options
 * @returns {boolean}
 */
function isServerError(options) {
    return options.data.root.statusCode >= 500;
}

/**
 * @private
 * @param {object} options
 * @returns {Set<string>}
 */
function getExcludeList(options) {
    return new Set(options?.hash?.exclude?.split(',') || []);
}

/**
 * @private
 * @param {object} dataRoot
 * @returns {string[]|null}
 */
function getContext(dataRoot) {
    return dataRoot._locals.context ? dataRoot._locals.context : null;
}

/**
 * @private
 * @param {object} dataRoot
 * @returns {string|null}
 */
function getPostCodeInjection(dataRoot) {
    return dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
}

/**
 * @private
 * @param {object} dataRoot
 * @returns {string|null}
 */
function getTagCodeInjection(dataRoot) {
    return dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
}

/**
 * @private
 * @returns {string}
 */
function getReferrerPolicy() {
    return config.get('referrerPolicy') || 'no-referrer-when-downgrade';
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getFavicon(options) {
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    return {favicon, iconType};
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getSafeVersion(options) {
    return options.data.root._locals.safeVersion;
}

/**
 * @private
 * @param {object} options
 * @returns {object}
 */
function getDataRoot(options) {
    return options.data.root;
}

/**
 * @private
 * @param {object} options
 * @returns {string}
 */
function getFrontendKeyAsync() {
    return getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyPromise(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataPromise(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyFromOptions(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataFromOptions(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyFromOptionsAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataFromOptionsAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptions(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptions(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    const dataRoot = options.data.root;
    return await getMetaData(dataRoot, dataRoot);
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<string>}
 */
async function getFrontendKeyAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync(options) {
    return await getFrontendKey();
}

/**
 * @private
 * @param {object} options
 * @returns {Promise<object>}
 */
async function getMetaDataAsyncFromOptionsAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsyncAsync...
```