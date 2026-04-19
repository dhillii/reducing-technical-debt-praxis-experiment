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
                // no-op, invalid URL
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

        const post = this.post;
        const errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }

        this.setSidebarWidthVariable(0);
    }

    /* ------------------------------------------------------------------ */
    /* Helper methods for common patterns                                 */
    /* ------------------------------------------------------------------ */

    /**
     * Handles errors from async operations by showing a notification
     * and rolling back post changes.
     */
    _handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Performs the savePostTask and handles errors.
     */
    _savePost() {
        return this.savePostTask.perform().catch((error) => this._handleSaveError(error));
    }

    /**
     * Sets a property on the post, validates it, and saves if the post is not new.
     */
    _setAndSave(property, value) {
        const post = this.post;
        if (post.get(property) === value) {
            return Promise.resolve();
        }
        post.set(property, value);
        return post.validate({property}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this._savePost();
        });
    }

    /**
     * Toggles a boolean property on the post and saves if the post is not new.
     */
    _toggleBoolean(property) {
        this.post.set(property, !this.post.get(property));
        if (this.post.isNew) {
            return;
        }
        this._savePost();
    }

    /**
     * Sets an image property on the post and saves if the post is not new.
     */
    _setImage(property, image) {
        this.post.set(property, image);
        if (this.post.isNew) {
            return;
        }
        this._savePost();
    }

    /**
     * Clears an image property on the post and saves if the post is not new.
     */
    _clearImage(property) {
        this.post.set(property, '');
        if (this.post.isNew) {
            return;
        }
        this._savePost();
    }

    /**
     * Handles author changes.
     */
    _changeAuthors(newAuthors) {
        const post = this.post;
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }
        post.set('authors', newAuthors);
        post.validate({property: 'authors'});
        if (post.get('isNew')) {
            return;
        }
        this._savePost();
    }

    /**
     * Performs the updateSlugTask and handles errors.
     */
    _updateSlugTask(newSlug) {
        return this.updateSlugTask.perform(newSlug).catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                            */
    /* ------------------------------------------------------------------ */

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
        this._toggleBoolean('featured');
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) {
            return;
        }
        this._savePost();
    }

    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    @action
    updateSlug(newSlug) {
        return this._updateSlugTask(newSlug);
    }

    @action
    setPublishedAtBlogDate(date) {
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            return this._savePost();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this._savePost();
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        const post = this.post;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this._savePost();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return this._setAndSave('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setAndSave('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setAndSave('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setAndSave('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setAndSave('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setAndSave('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setAndSave('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setAndSave('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setAndSave('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setAndSave('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        this._setImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._clearImage('featureImage');
    }

    @action
    setOgImage(image) {
        this._setImage('ogImage', image);
    }

    @action
    clearOgImage() {
        this._clearImage('ogImage');
    }

    @action
    setTwitterImage(image) {
        this._setImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._clearImage('twitterImage');
    }

    @action
    changeAuthors(newAuthors) {
        this._changeAuthors(newAuthors);
    }

    @action
    savePost() {
        this._savePost();
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

    /* ------------------------------------------------------------------ */
    /* Utility methods                                                   */
    /* ------------------------------------------------------------------ */

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