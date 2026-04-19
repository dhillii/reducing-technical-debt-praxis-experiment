```javascript
/**
 * **NOTE**
 * Express adds `_locals`, see https://github.com/expressjs/express/blob/4.15.4/lib/response.js#L962.
 * But `options.data.root.context` is available next to `root._locals.context`, because
 * Express creates a `renderOptions` object, see https://github.com/expressjs/express/blob/4.15.4/lib/application.js#L554
 * and merges all locals to the root of the object. Very confusing, because the data is available in different layers.
 *
 * Express forwards the data like this to the hbs engine:
 * {
 *   post: {},             - res.render('view', databaseResponse)
 *   context: ['post'],    - from res.locals
 *   safeVersion: '1.x',   - from res.locals
 *   _locals: {
 *     context: ['post'],
 *     safeVersion: '1.x'
 *   }
 * }
 *
 * hbs forwards the data to any hbs helper like this
 * {
 *   data: {
 *     site: {},
 *     labs: {},
 *     config: {},
 *     root: {
 *       post: {},
 *       context: ['post'],
 *       locals: {...}
 *     }
 *  }
 *
 * `site`, `labs` and `config` are the templateOptions, search for `hbs.updateTemplateOptions` in the code base.
 *  Also see how the root object gets created, https://github.com/wycats/handlebars.js/blob/v4.0.6/lib/handlebars/runtime.js#L259
 */
// We use the name ghost_head to match the helper for consistency:
module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    // if server error page do nothing
    if (options.data.root.statusCode >= 500) {
        return;
    }
    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const dataRoot = options.data.root;
    const context = dataRoot._locals.context ? dataRoot._locals.context : null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = dataRoot && dataRoot.post ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = dataRoot && dataRoot.tag ? dataRoot.tag.codeinjection_head : null;
    const globalCodeinjection = settingsCache.get('codeinjection_head');
    const useStructuredData = !config.isPrivacyDisabled('useStructuredData');
    const referrerPolicy = config.get('referrerPolicy') ? config.get('referrerPolicy') : 'no-referrer-when-downgrade';
    const favicon = blogIcon.getIconUrl();
    const iconType = blogIcon.getIconType(favicon);

    debug('preparation complete, begin fetch');

    try {
        const meta = await getMetaData(dataRoot, dataRoot);
        const frontendKey = await getFrontendKey();

        debug('end fetch');

        if (context) {
            if (!excludeList.has('metadata')) {
                head.push(metadataHelper(meta, excludeList));
            }

            if (meta.previousUrl) {
                head.push(prevNextLinkHelper('prev', meta.previousUrl));
            }

            if (meta.nextUrl) {
                head.push(prevNextLinkHelper('next', meta.nextUrl));
            }

            if (!_.includes(context, 'paged') && useStructuredData) {
                if (!excludeList.has('social_data')) {
                    head.push('');
                    head.push.apply(head, finaliseStructuredData(meta));
                    head.push('');
                }

                if (!excludeList.has('schema') && meta.schema) {
                    head.push(schemaHelper(meta.schema));
                }
            }
        }

        head.push(generatorHelper(safeVersion));
        head.push(rssLinkHelper(meta.site.title, meta.rssUrl));

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
                head.push(cardAssetsHelper('js'));
            }
            if (cardAssets.hasFile('css')) {
                head.push(cardAssetsHelper('css'));
            }
        }

        if (!excludeList.has('comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
            head.push(commentCountsHelper(urlUtils.getSiteUrl(true)));
        }

        if (settingsCache.get('members_enabled') && settingsCache.get('members_track_sources')) {
            head.push(memberAttributionHelper());
        }

        if (settingsHelpers.isWebAnalyticsEnabled()) {
            head.push(getTinybirdTrackerScript(dataRoot));
            if (dataRoot._locals) {
                dataRoot._locals.ghostAnalytics = true;
            }
        }

        if (options.data.site.accent_color) {
            head.push(accentColorHelper(options.data.site.accent_color));
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
            head.push(customFontHelper(headingFont, bodyFont));
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

function metadataHelper(meta, excludeList) {
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

function prevNextLinkHelper(rel, url) {
    return `<link rel="${rel}" href="${escapeExpression(url)}">`;
}

function schemaHelper(schema) {
    return `<script type="application/ld+json">\n${JSON.stringify(schema, null, '    ')}</script>\n`;
}

function generatorHelper(safeVersion) {
    return `<meta name="generator" content="Ghost ${escapeExpression(safeVersion)}">`;
}

function rssLinkHelper(title, url) {
    return `<link rel="alternate" type="application/rss+xml" title="${escapeExpression(title)}" href="${escapeExpression(url)}">`;
}

function cardAssetsHelper(type) {
    const assetUrl = getAssetUrl(`public/cards.min.${type === 'js' ? 'js' : 'css'}`);
    return `<${type === 'js' ? 'script' : 'link'} defer src="${assetUrl}"></${type === 'js' ? 'script' : 'link'}>`;
}

function commentCountsHelper(url) {
    return `<script defer src="${getAssetUrl('public/comment-counts.min.js')}" data-ghost-comments-counts-api="${url}"></script>`;
}

function memberAttributionHelper() {
    return `<script defer src="${getAssetUrl('public/member-attribution.min.js')}"></script>`;
}

function accentColorHelper(accentColor) {
    const styleTag = `<style>:root {--ghost-accent-color: ${escapeExpression(accentColor)};}</style>`;
    const existingScriptIndex = _.findLastIndex(head, str => str.match(/<\/(style|script)>/));

    if (existingScriptIndex !== -1) {
        head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
    } else {
        head.push(styleTag);
    }
}

function customFontHelper(headingFont, bodyFont) {
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
```