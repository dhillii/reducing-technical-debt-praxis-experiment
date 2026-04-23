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
        const urlParts = [];

        if (this.post.canonicalUrl) {
            try {
                const canonicalUrl = new URL(this.post.canonicalUrl);
                urlParts.push(canonicalUrl.host);
                urlParts.push(...canonicalUrl.pathname.split('/').reject(p => !p));
            } catch (e) {
                // Invalid URL - continue with fallback
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').reject(p => !p));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this._isNewPost()) {
            return false;
        }

        if (this._isLexicalNull()) {
            return false;
        }

        if (this._isUnpublishedAndUnsent()) {
            return true;
        }

        if (this._isEmailOnly()) {
            return false;
        }

        return true;
    }

    /**
     * Check if post is new
     */
    _isNewPost() {
        return this.post.isNew;
    }

    /**
     * Check if post lexical is null
     */
    _isLexicalNull() {
        return this.post.lexical === null;
    }

    /**
     * Check if post is unpublished and unsent
     */
    _isUnpublishedAndUnsent() {
        return !this.post.isPublished && !this.post.isSent;
    }

    /**
     * Check if post is email only
     */
    _isEmailOnly() {
        return this.post.emailOnly;
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

        this._performSaveWithErrorHandling();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;

        if (this.post.isNew) {
            return;
        }

        this._performSaveWithErrorHandling();
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
                this._handleSaveError(error);
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
            if (e) {
                throw e;
            }
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
        return this._updatePostProperty('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        return this._updatePostProperty('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        return this._updatePostProperty('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        return this._updatePostProperty('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        return this._updatePostProperty('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        let post = this.post;
        let currentCanonicalUrl = post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        post.set('canonicalUrl', value);

        return post.validate({property: 'canonicalUrl'}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgTitle(ogTitle) {
        return this._updatePostProperty('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        return this._updatePostProperty('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._updatePostProperty('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._updatePostProperty('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        this._saveIfNotNew();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        this._saveIfNotNew();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        this._saveIfNotNew();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        this._saveIfNotNew();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        this._saveIfNotNew();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        this._saveIfNotNew();
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

        this._performSaveWithErrorHandling();
    }

    @action
    savePost() {
        this._performSaveWithErrorHandling();
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

    /**
     * Update a post property with validation and conditional save
     */
    _updatePostProperty(propertyName, newValue, validationProperty) {
        let post = this.post;
        let currentValue = post.get(propertyName);

        if (currentValue === newValue) {
            return;
        }

        post.set(propertyName, newValue);

        return post.validate({property: validationProperty}).then(() => {
            if (post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    /**
     * Perform save with error handling and rollback
     */
    _performSaveWithErrorHandling() {
        this.savePostTask.perform().catch((error) => {
            this._handleSaveError(error);
        });
    }

    /**
     * Handle save error with notification and rollback
     */
    _handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Save post if not new, with error handling
     */
    _saveIfNotNew() {
        if (this.get('post.isNew')) {
            return;
        }

        this._performSaveWithErrorHandling();
    }

    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}