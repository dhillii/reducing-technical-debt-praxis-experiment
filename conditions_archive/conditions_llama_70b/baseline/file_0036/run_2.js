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
  settingsHelpers,
} = require('../services/proxy');
const { escapeExpression, SafeString } = require('../services/handlebars');
const {
  generateCustomFontCss,
  isValidCustomFont,
  isValidCustomHeadingFont,
} = require('@tryghost/custom-fonts');
const { cardAssets } = require('../services/assets-minification');

const logging = require('@tryghost/logging');
const _ = require('lodash');
const debug = require('@tryghost/debug')('ghost_head');
const templateStyles = require('./tpl/styles');
const { getFrontendAppConfig, getDataAttributes } = require('../utils/frontend-apps');

const { get: getMetaData, getAssetUrl } = metaData;

function writeMetaTag(property, content, type) {
  type = type || property.substring(0, 7) === 'twitter' ? 'name' : 'property';
  return `<meta ${type}="${property}" content="${escapeExpression(content)}">`;
}

function finaliseStructuredData(meta) {
  const head = [];

  _.each(meta.structuredData, (content, property) => {
    if (property === 'article:tag') {
      _.each(meta.keywords, (keyword) => {
        if (keyword !== '') {
          keyword = escapeExpression(keyword);
          head.push(writeMetaTag(property, escapeExpression(keyword)));
        }
      });
    } else if (content !== null && content !== undefined) {
      head.push(writeMetaTag(property, escapeExpression(content)));
    }
  });

  return head;
}

function getMembersHelper(data, frontendKey, excludeList) {
  if (
    !settingsCache.get('members_enabled') &&
    !settingsCache.get('donations_enabled') &&
    !settingsCache.get('recommendations_enabled')
  ) {
    return '';
  }

  let membersHelper = '';
  if (!excludeList.has('portal')) {
    const { scriptUrl } = getFrontendAppConfig('portal');
    const colorString = data.site.accent_color;
    const attributes = {
      i18n: true,
      ghost: urlUtils.getSiteUrl(),
      key: frontendKey,
      api: urlUtils.urlFor('api', { type: 'content' }, true),
      locale: settingsCache.get('locale') || 'en',
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

function getSearchHelper(frontendKey) {
  const adminUrl = urlUtils.getAdminUrl() || urlUtils.getSiteUrl();
  const { scriptUrl, stylesUrl } = getFrontendAppConfig('sodoSearch');

  if (!scriptUrl) {
    return '';
  }

  const attrs = {
    key: frontendKey,
    styles: stylesUrl,
    'sodo-search': adminUrl,
    locale: settingsCache.get('locale') || 'en',
  };
  const dataAttrs = getDataAttributes(attrs);
  let helper = `<script defer src="${scriptUrl}" ${dataAttrs} crossorigin="anonymous"></script>`;

  return helper;
}

function getAnnouncementBarHelper(data) {
  const preview = data?.site?._preview;
  const isFilled =
    settingsCache.get('announcement_content') &&
    settingsCache.get('announcement_visibility').length;

  if (!isFilled && !preview) {
    return '';
  }

  const { scriptUrl } = getFrontendAppConfig('announcementBar');
  const siteUrl = urlUtils.getSiteUrl();
  const announcementUrl = new URL('members/api/announcement/', siteUrl);
  const attrs = {
    'announcement-bar': siteUrl,
    'api-url': announcementUrl,
  };

  if (preview) {
    const searchParam = new URLSearchParams(preview);
    const announcement = searchParam.get('announcement');
    const announcementBackground = searchParam.has('announcement_bg')
      ? searchParam.get('announcement_bg')
      : '';
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
      member_status: dataRoot.member?.status,
    },
    (value, key) => `tb_${key}="${value}"`
  ).join(' ');

  return `<script defer src="${src}" data-stringify-payload="false" ${datasource ? `data-datasource="${datasource}"` : ''} data-storage="localStorage" data-host="${endpoint}" ${token && env !== 'production' ? `data-token="${token}"` : ''} ${tbParams}></script>`;
}

class GhostHeadHelper {
  constructor(options) {
    this.options = options;
    this.dataRoot = options.data.root;
    this.context = this.dataRoot._locals.context;
    this.safeVersion = this.dataRoot._locals.safeVersion;
    this.excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    this.head = [];
  }

  async getMetaData() {
    return await getMetaData(this.dataRoot, this.dataRoot);
  }

  async getFrontendKey() {
    return await getFrontendKey();
  }

  getFavicon() {
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);
    return `<link rel="icon" href="${favicon}" type="image/${iconType}">`;
  }

  getCanonicalUrl(meta) {
    return `<link rel="canonical" href="${escapeExpression(meta.canonicalUrl)}">`;
  }

  getRobotsMetaTag() {
    const referrerPolicy = config.get('referrerPolicy') || 'no-referrer-when-downgrade';
    if (this.context.includes('preview')) {
      return writeMetaTag('robots', 'noindex,nofollow', 'name');
    } else {
      return writeMetaTag('referrer', referrerPolicy, 'name');
    }
  }

  getPreviousAndNextUrls(meta) {
    const previousUrl = meta.previousUrl;
    const nextUrl = meta.nextUrl;
    const previousLink = previousUrl
      ? `<link rel="prev" href="${escapeExpression(previousUrl)}">`
      : '';
    const nextLink = nextUrl
      ? `<link rel="next" href="${escapeExpression(nextUrl)}">`
      : '';
    return previousLink + nextLink;
  }

  getStructuredData(meta) {
    if (!this.context.includes('paged') && !config.isPrivacyDisabled('useStructuredData')) {
      if (!this.excludeList.has('social_data')) {
        return finaliseStructuredData(meta).join('\n');
      }
      if (!this.excludeList.has('schema') && meta.schema) {
        return `<script type="application/ld+json">\n${JSON.stringify(
          meta.schema,
          null,
          '    '
        )}\n    </script>\n`;
      }
    }
    return '';
  }

  getGeneratorMetaTag() {
    return `<meta name="generator" content="Ghost ${escapeExpression(
      this.safeVersion
    )}">`;
  }

  getRssLink(meta) {
    return `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(
      meta.site.title
    )}" href="${escapeExpression(meta.rssUrl)}">`;
  }

  getMembersHelper(frontendKey) {
    return getMembersHelper(this.options.data, frontendKey, this.excludeList);
  }

  getSearchHelper(frontendKey) {
    if (this.excludeList.has('search')) {
      return '';
    }
    return getSearchHelper(frontendKey);
  }

  getAnnouncementBarHelper() {
    if (this.excludeList.has('announcement')) {
      return '';
    }
    return getAnnouncementBarHelper(this.options.data);
  }

  getWebmentionDiscoveryLink() {
    try {
      return getWebmentionDiscoveryLink();
    } catch (err) {
      logging.warn(err);
      return '';
    }
  }

  getCardAssets() {
    if (this.excludeList.has('card_assets')) {
      return '';
    }
    const cardAssetsJs = cardAssets.hasFile('js')
      ? `<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`
      : '';
    const cardAssetsCss = cardAssets.hasFile('css')
      ? `<link rel="stylesheet" type="text/css" href="${getAssetUrl(
          'public/cards.min.css'
        )}">`
      : '';
    return cardAssetsJs + cardAssetsCss;
  }

  getCommentCounts() {
    if (
      this.excludeList.has('comment_counts') ||
      settingsCache.get('comments_enabled') === 'off'
    ) {
      return '';
    }
    return `<script defer src="${getAssetUrl(
      'public/comment-counts.min.js'
    )}" data-ghost-comments-counts-api="${urlUtils.getSiteUrl(true)}members/api/comments/counts/"></script>`;
  }

  getMemberAttribution() {
    if (
      !settingsCache.get('members_enabled') ||
      !settingsCache.get('members_track_sources')
    ) {
      return '';
    }
    return `<script defer src="${getAssetUrl(
      'public/member-attribution.min.js'
    )}"></script>`;
  }

  getTinybirdTrackerScript() {
    if (!settingsHelpers.isWebAnalyticsEnabled()) {
      return '';
    }
    const script = getTinybirdTrackerScript(this.dataRoot);
    if (this.dataRoot._locals) {
      this.dataRoot._locals.ghostAnalytics = true;
    }
    return script;
  }

  getAccentColor() {
    const accentColor = this.options.data.site.accent_color;
    if (!accentColor) {
      return '';
    }
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(
      accentColor
    )};}</style>`;
    return styleTag;
  }

  getCodeInjection() {
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const postCodeInjection = this.dataRoot.post?.codeinjection_head;
    const tagCodeInjection = this.dataRoot.tag?.codeinjection_head;
    return [globalCodeinjection, postCodeInjection, tagCodeInjection]
      .filter((code) => code)
      .join('\n');
  }

  getCustomFonts() {
    const isSitePreview = this.options.data?.site?._preview ?? false;
    const headingFont = isSitePreview
      ? this.options.data?.site?.heading_font
      : settingsCache.get('heading_font');
    const bodyFont = isSitePreview
      ? this.options.data?.site?.body_font
      : settingsCache.get('body_font');
    if (
      (typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont)) ||
      (typeof bodyFont === 'string' && isValidCustomFont(bodyFont))
    ) {
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

  async render() {
    if (this.dataRoot.statusCode >= 500) {
      return;
    }
    const meta = await this.getMetaData();
    const frontendKey = await this.getFrontendKey();

    this.head.push(this.getFavicon());
    this.head.push(this.getCanonicalUrl(meta));
    this.head.push(this.getRobotsMetaTag());
    this.head.push(this.getPreviousAndNextUrls(meta));
    this.head.push(this.getStructuredData(meta));
    this.head.push(this.getGeneratorMetaTag());
    this.head.push(this.getRssLink(meta));
    this.head.push(this.getMembersHelper(frontendKey));
    this.head.push(this.getSearchHelper(frontendKey));
    this.head.push(this.getAnnouncementBarHelper());
    this.head.push(this.getWebmentionDiscoveryLink());
    this.head.push(this.getCardAssets());
    this.head.push(this.getCommentCounts());
    this.head.push(this.getMemberAttribution());
    this.head.push(this.getTinybirdTrackerScript());
    this.head.push(this.getAccentColor());
    this.head.push(this.getCodeInjection());
    this.head.push(this.getCustomFonts());

    return new SafeString(this.head.join('\n    ').trim());
  }
}

module.exports = async function ghost_head(options) {
  const helper = new GhostHeadHelper(options);
  return helper.render();
};

module.exports.async = true;
```