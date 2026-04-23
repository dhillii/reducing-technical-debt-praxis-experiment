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

/**
 * @typedef {import('@tryghost/custom-fonts').FontSelection} FontSelection
 */

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
            return '';
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

/* Predicate helpers */
function isServerError(options) {
    return options.data.root.statusCode >= 500;
}
function getContext(dataRoot) {
    return dataRoot._locals.context ? dataRoot._locals.context : null;
}
function getPostCodeInjection(dataRoot) {
    return dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
}
function getTagCodeInjection(dataRoot) {
    return dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
}
function isExcluded(excludeList, key) {
    return excludeList.has(key);
}
function isPagedContext(context) {
    return _.includes(context, 'paged');
}

/* Builder helpers */
function buildMetadata(head, meta, context, referrerPolicy, favicon, iconType) {
    if (meta.metaDescription && meta.metaDescription.length > 0) {
        head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
    }
    if (settingsCache.get('icon')) {
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
function buildLink(rel, url) {
    return '<link rel="' + rel + '" href="' + escapeExpression(url) + '">';
}
function buildSchemaScript(schema) {
    return '<script type="application/ld+json">\n' + JSON.stringify(schema, null, '    ') + '\n    </script>\n';
}
function buildGeneratorTag(safeVersion) {
    return '<meta name="generator" content="Ghost ' + escapeExpression(safeVersion) + '">';
}
function buildRSSLink(meta) {
    return '<link rel="alternate" type="application/rss+xml" title="' + escapeExpression(meta.site.title) + '" href="' + escapeExpression(meta.rssUrl) + '">';
}
function addCardAssets(head) {
    if (cardAssets.hasFile('js')) {
        head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
    }
    if (cardAssets.hasFile('css')) {
        head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
    }
}
function buildCommentCountsScript() {
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
}
function buildMemberAttributionScript() {
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}
function addAccentColorStyle(head, data) {
    if (data.site.accent_color) {
        const accentColor = escapeExpression(data.site.accent_color);
        const styleTag = `<style>:root {--ghost-accent-color: ${accentColor};}</style>`;
        const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
        if (existingScriptIndex !== -1) {
            head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
        } else {
            head.push(styleTag);
        }
    }
}
function addGlobalCodeInjection(head, globalCodeinjection) {
    if (!_.isEmpty(globalCodeinjection)) {
        head.push(globalCodeinjection);
    }
}
function addPostCodeInjection(head, postCodeInjection) {
    if (!_.isEmpty(postCodeInjection)) {
        head.push(postCodeInjection);
    }
}
function addTagCodeInjection(head, tagCodeInjection) {
    if (!_.isEmpty(tagCodeInjection)) {
        head.push(tagCodeInjection);
    }
}
function addCustomFontStyle(head, data) {
    const isSitePreview = data?.site?._preview ?? false;
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
        head.push(new SafeString(customCSS));
    }
}

/* Main helper */
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    if (isServerError(options)) {
        return;
    }
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = getContext(dataRoot);
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = getPostCodeInjection(dataRoot);
    const tagCodeInjection = getTagCodeInjection(dataRoot);
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
            if (!isExcluded(excludeList, 'metadata')) {
                buildMetadata(head, meta, context, referrerPolicy, favicon, iconType);
            }
            if (meta.previousUrl) {
                head.push(buildLink('prev', meta.previousUrl));
            }
            if (meta.nextUrl) {
                head.push(buildLink('next', meta.nextUrl));
            }
            if (!isPagedContext(context) && useStructuredData) {
                if (!isExcluded(excludeList, 'social_data')) {
                    head.push('');
                    head.push.apply(head, finaliseStructuredData(meta));
                    head.push('');
                }
                if (!isExcluded(excludeList, 'schema') && meta.schema) {
                    head.push(buildSchemaScript(meta.schema));
                }
            }
        }
        head.push(buildGeneratorTag(safeVersion));
        head.push(buildRSSLink(meta));
        head.push(getMembersHelper(options.data, frontendKey, excludeList));
        if (!isExcluded(excludeList, 'search')) {
            head.push(getSearchHelper(frontendKey));
        }
        if (!isExcluded(excludeList, 'announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }
        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }
        if (!isExcluded(excludeList, 'card_assets')) {
            addCardAssets(head);
        }
        if (!isExcluded(excludeList, 'comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(buildCommentCountsScript());
        }
        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(buildMemberAttributionScript());
        }
        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }
        addAccentColorStyle(head, options.data);
        addGlobalCodeInjection(head, globalCodeinjection);
        addPostCodeInjection(head, postCodeInjection);
        addTagCodeInjection(head, tagCodeInjection);
        addCustomFontStyle(head, options.data);
        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;