import Component from '@ember/component';
import boundOneWay from 'ghost-admin/utils/bound-one-way';
import classic from 'ember-classic-decorator';
import moment from 'moment-timezone';
import {action, computed} from '@ember/object';
import {alias, or} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tagName} from '@ember-decorators/component';
import {tracked} from '@glimmer/tracking';

/**
 * Extracted helper to canonicalize URL path parts for SEO display.
 * Handles both valid and invalid URLs gracefully.
 */
function extractUrlPathParts(url, blogBase = '') {
    if (!url) {
        return [];
    }

    try {
        const urlObj = new URL(url);
        return [...urlObj.host.split('.'), ...urlObj.pathname.split('/').filter(Boolean)];
    } catch (e) {
        return [];
    }
}

/**
 * Extracted helper to construct SEO URL string from post and config.
 */
function buildSeoUrl(post, configBlogUrl) {
    const baseParts = extractUrlPathParts(post.canonicalUrl);
    if (baseParts.length > 0) {
        return baseParts.join(' › ');
    }

    const blogParts = extractUrlPathParts(configBlogUrl);
    const slugParts = post.slug ? [post.slug] : [];
    return [...blogParts, ...slugParts].join(' › ');
}

/**
 * Extracted helper to perform atomic update and save with error handling.
 */
function updateAndSaveAttribute(post, key, value, options = {}) {
    if (value === post.get(key)) {
        return;
    }

    post.set(key, value);
    return post.validate({property: key})
        .then(() => {
            if (options.isNew || post.isNew) {
                return;
            }
            return post.save();
        })
        .catch((error) => {
            post.rollbackAttributes();
            throw error;
        });
}

/**
 * Extracted helper for actionable SEO UI field setters.
 * Handles invalidation, validation, and conditional saving.
 */
function handleMetaFieldSet(post, field, value, isNew) {
    if (value === post.get(field)) {
        return;
    }

    post.set(field, value);
    return post.validate({property: field})
        .then(() => {
            if (isNew || post.isNew) {
                return;
            }
            return post.save();
        })
        .catch((error) => {
            post.rollbackAttributes();
            throw error;
        });
}

/**
 * Extracted helper to safely set entity field and save when not new.
 * Returns early if value matches current and no save is needed.
 */
function setEntityAndSave(entity, key, value, isNew) {
    if (value === entity.get(key)) {
        return;
    }

    entity.set(key, value);

    if (isNew || entity.isNew) {
        return;
    }

    return entity.save().catch((error) => {
        entity.rollbackAttributes();
        throw error;
    });
}

@classic
@tagName('')
export default class GhPostSettingsMenu extends Component {
    @service feature;
    @service store;
    @service ajax;
    @service ghostPaths;
    @service notifications;
    @service slugGenerator;
    @service session;
    @service settings;
    @service themeManagement;
    @service ui;

    @inject config;

    @tracked showPostHistory = false;

    post = null;
    isViewingSubview = false;

    @alias('post.canonicalUrlScratch')
        canonicalUrlScratch;

    @alias('post.customExcerptScratch')
        customExcerptScratch;

    @alias('post.codeinjectionFootScratch')
        codeinjectionFootScratch;

    @alias('post.codeinjectionHeadScratch')
        codeinjectionHeadScratch;

    @alias('post.metaDescriptionScratch')
        metaDescriptionScratch;

    @alias('post.metaTitleScratch')
        metaTitleScratch;

    @alias('post.ogDescriptionScratch')
        ogDescriptionScratch;

    @alias('post.ogTitleScratch')
        ogTitleScratch;

    @alias('post.twitterDescriptionScratch')
        twitterDescriptionScratch;

    @alias('post.twitterTitleScratch')
        twitterTitleScratch;

    @boundOneWay('post.slug')
        slugValue;

    @boundOneWay('post.uuid')
        uuidValue;

    @or('metaDescriptionScratch', 'customExcerptScratch')
        seoDescription;

    @or(
        'ogDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
        facebookDescription;

    @or(
        'post.ogImage',
        'post.featureImage',
        'settings.ogImage',
        'settings.coverImage'
    )
        facebookImage;

    @or('ogTitleScratch', 'seoTitle')
        facebookTitle;

    @or(
        'twitterDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        ''
    )
        twitterDescription;

    @or(
        'post.twitterImage',
        'post.featureImage',
        'settings.twitterImage',
        'settings.coverImage'
    )
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle')
        twitterTitle;

    @or(
        'session.user.isOwnerOnly',
        'session.user.isAdminOnly',
        'session.user.isEitherEditor'
    )
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        return buildSeoUrl(this.post, this.config.blogUrl);
    }

    get canViewPostHistory() {
        if (this.post.isNew) {
            return false;
        }

        if (this.post.lexical === null) {
            return false;
        }

        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

        if (this.post.emailOnly) {
            return false;
        }

        return true;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);

        let post = this.post;
        let errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    @action
    showSubview(subview) {
        this.set('isViewingSubview', true);
        this.set('subview', subview);
    }

    @action
    closeSubview() {
        this.set('isViewingSubview', false);
        this.set('subview', null);
    }

    @action
    discardEnter() {
        return false;
    }

    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;

        if (this.post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (this.post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    /**
     * triggered by user manually changing slug
     */
    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    @action
    setPublishedAtBlogDate(date) {
        let post = this.post;
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            return this.savePostTask.perform();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});
            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this.savePostTask.perform();
            }
        } catch (e) {
            // no-op, validation error
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        let post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return handleMetaFieldSet(this.post, 'customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return handleMetaFieldSet(this.post, 'codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return handleMetaFieldSet(this.post, 'codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return handleMetaFieldSet(this.post, 'metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return handleMetaFieldSet(this.post, 'metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return handleMetaFieldSet(this.post, 'canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return handleMetaFieldSet(this.post, 'ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return handleMetaFieldSet(this.post, 'ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return handleMetaFieldSet(this.post, 'twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return handleMetaFieldSet(this.post, 'twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        return setEntityAndSave(this.post, 'featureImage', image);
    }

    @action
    clearCoverImage() {
        return setEntityAndSave(this.post, 'featureImage', '');
    }

    @action
    setOgImage(image) {
        return setEntityAndSave(this.post, 'ogImage', image);
    }

    @action
    clearOgImage() {
        return setEntityAndSave(this.post, 'ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return setEntityAndSave(this.post, 'twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return setEntityAndSave(this.post, 'twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        let post = this.post;

        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            post.rollbackAttributes();
        });
    }

    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    deletePostInternal() {
        if (this.deletePost) {
            this.deletePost();
        }
    }

    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this.setSidebarWidthVariable(width);
    }

    showError(error) {
        // TODO: remove null check once ValidationEngine has been removed
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}