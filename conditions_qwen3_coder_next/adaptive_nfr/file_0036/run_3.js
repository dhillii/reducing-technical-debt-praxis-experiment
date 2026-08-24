function isServerErrorPage(dataRoot) {
    return dataRoot.statusCode >= 500;
}

function shouldExclude(excludeList, key) {
    return !excludeList.has(key);
}

function hasContext(dataRoot) {
    return dataRoot._locals?.context?.length > 0;
}

function hasMetaDescription(meta) {
    return meta.metaDescription && meta.metaDescription.length > 0;
}

function isPreviewContext(context) {
    return context && context.includes('preview');
}

function isPagedContext(context) {
    return context && context.includes('paged');
}

function hasPost(dataRoot) {
    return dataRoot && dataRoot.post;
}

function hasTag(dataRoot) {
    return dataRoot && dataRoot.tag;
}

function hasCodeInjection(injection) {
    return !_.isEmpty(injection);
}

function isSitePreview(data) {
    return !!data?.site?._preview;
}

function hasValidHeadingFont(headingFont) {
    return typeof headingFont === 'string' && isValidCustomHeadingFont(headingFont);
}

function hasValidBodyFont(bodyFont) {
    return typeof bodyFont === 'string' && isValidCustomFont(bodyFont);
}

function hasCustomFonts(headingFont, bodyFont) {
    return hasValidHeadingFont(headingFont) || hasValidBodyFont(bodyFont);
}

function getFontSelection(headingFont, bodyFont) {
    const fontSelection = {};
    if (headingFont) {
        fontSelection.heading = headingFont;
    }
    if (bodyFont) {
        fontSelection.body = bodyFont;
    }
    return fontSelection;
}

function getExistingScriptIndex(head) {
    return _.findLastIndex(head, str => str.match(/<\/(style|script)>/));
}

module.exports = async function ghost_head(options) { // eslint-disable-line camelcase
    debug('begin');
    const dataRoot = options.data.root;

    if (isServerErrorPage(dataRoot)) {
        return;
    }

    const excludeList = new Set(options?.hash?.exclude?.split(',') || []);
    const head = [];
    const context = dataRoot._locals.context || null;
    const safeVersion = dataRoot._locals.safeVersion;
    const postCodeInjection = hasPost(dataRoot) ? dataRoot.post.codeinjection_head : null;
    const tagCodeInjection = hasTag(dataRoot) ? dataRoot.tag.codeinjection_head : null;
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

        if (hasContext(dataRoot)) {
            if (shouldExclude(excludeList, 'metadata')) {
                if (hasMetaDescription(meta)) {
                    head.push('<meta name="description" content="' + escapeExpression(meta.metaDescription) + '">');
                }

                if (settingsCache.get('icon')) {
                    head.push('<link rel="icon" href="' + favicon + '" type="image/' + iconType + '">');
                }

                head.push('<link rel="canonical" href="' + escapeExpression(meta.canonicalUrl) + '">');

                if (isPreviewContext(context)) {
                    head.push(writeMetaTag('robots', 'noindex,nofollow', 'name'));
                    head.push(writeMetaTag('referrer', 'same-origin', 'name'));
                } else {
                    head.push(writeMetaTag('referrer', referrerPolicy, 'name'));
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

            if (!isPagedContext(context) && useStructuredData) {
                if (shouldExclude(excludeList, 'social_data')) {
                    head.push('');
                    head.push.apply(head, finaliseStructuredData(meta));
                    head.push('');
                }

                if (shouldExclude(excludeList, 'schema') && meta.schema) {
                    head.push('<script type="application/ld+json">\n' +
                        JSON.stringify(meta.schema, null, '    ') +
                        '\n    </script>\n');
                }
            }
        }

        head.push('<meta name="generator" content="Ghost ' +
            escapeExpression(safeVersion) + '">');
        head.push('<link rel="alternate" type="application/rss+xml" title="' +
            escapeExpression(meta.site.title) + '" href="' +
            escapeExpression(meta.rssUrl) + '">');

        head.push(getMembersHelper(options.data, frontendKey, excludeList));

        if (shouldExclude(excludeList, 'search')) {
            head.push(getSearchHelper(frontendKey));
        }

        if (shouldExclude(excludeList, 'announcement')) {
            head.push(getAnnouncementBarHelper(options.data));
        }

        try {
            head.push(getWebmentionDiscoveryLink());
        } catch (err) {
            logging.warn(err);
        }

        if (shouldExclude(excludeList, 'card_assets')) {
            if (cardAssets.hasFile('js')) {
                head.push(`<script defer src="${getAssetUrl('public/cards.min.js')}"></script>`);
            }
            if (cardAssets.hasFile('css')) {
                head.push(`<link rel="stylesheet" type="text/css" href="${getAssetUrl('public/cards.min.css')}">`);
            }
        }

        if (shouldExclude(excludeList, 'comment_counts') && settingsCache.get('comments_enabled') !== 'off') {
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
            const existingScriptIndex = getExistingScriptIndex(head);

            if (existingScriptIndex !== -1) {
                head[existingScriptIndex] = head[existingScriptIndex] + styleTag;
            } else {
                head.push(styleTag);
            }
        }

        if (hasCodeInjection(globalCodeinjection)) {
            head.push(globalCodeinjection);
        }

        if (hasCodeInjection(postCodeInjection)) {
            head.push(postCodeInjection);
        }

        if (hasCodeInjection(tagCodeInjection)) {
            head.push(tagCodeInjection);
        }

        const isSitePreview = isSitePreview(options.data);
        const headingFont = isSitePreview ? options.data?.site?.heading_font : settingsCache.get('heading_font');
        const bodyFont = isSitePreview ? options.data?.site?.body_font : settingsCache.get('body_font');

        if (hasCustomFonts(headingFont, bodyFont)) {
            const fontSelection = getFontSelection(headingFont, bodyFont);
            const customCSS = generateCustomFontCss(fontSelection);
            head.push(new SafeString(customCSS));
        }

        debug('end');
        return new SafeString(head.join('\n    ').trim());
    } catch (error) {
        logging.error(error);
        return new SafeString(head.join('\n    ').trim());
    }
};

module.exports.async = true;