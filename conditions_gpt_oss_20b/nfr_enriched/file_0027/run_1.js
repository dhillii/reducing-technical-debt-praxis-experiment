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
        return this._parseSeoURLParts();
    }

    get canViewPostHistory() {
        return this._canViewPostHistory();
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    willDestroyElement() {
        super.willDestroyElement(...arguments);
        this._resetPublishDateIfError();
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
        const newValue = !this.post.featured;
        this._setAndValidate('featured', newValue, true);
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        const newValue = event.target.checked;
        this._setAndValidate('showTitleAndFeatureImage', newValue, true);
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
        const post = this.post;
        const dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || date === post.get('publishedAtBlogDate')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogDate', dateString);
            return this._performSaveTask();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this._performSaveTask();
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
            return this._performSaveTask();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        return this._setAndValidate('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setAndValidate('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setAndValidate('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setAndValidate('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setAndValidate('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setAndValidate('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setAndValidate('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setAndValidate('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setAndValidate('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setAndValidate('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        return this._setAndValidate('featureImage', image, true);
    }

    @action
    clearCoverImage() {
        return this._setAndValidate('featureImage', '', true);
    }

    @action
    setOgImage(image) {
        return this._setAndValidate('ogImage', image, true);
    }

    @action
    clearOgImage() {
        return this._setAndValidate('ogImage', '', true);
    }

    @action
    setTwitterImage(image) {
        return this._setAndValidate('twitterImage', image, true);
    }

    @action
    clearTwitterImage() {
        return this._setAndValidate('twitterImage', '', true);
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }
        post.set('authors', newAuthors);
        post.validate({property: 'authors'});
        if (post.get('isNew')) {
            return;
        }
        this._performSaveTask();
    }

    @action
    savePost() {
        this._performSaveTask();
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
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    /* ------------------------------------------------------------------ */
    /* Private helper methods                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Handles errors from save operations by showing a notification
     * and rolling back post attributes.
     */
    _handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Performs the savePostTask and handles any errors.
     */
    _performSaveTask() {
        return this.savePostTask.perform().catch((error) => this._handleSaveError(error));
    }

    /**
     * Sets a post property, validates it, and saves the post if necessary.
     *
     * @param {string} property - The property name on the post.
     * @param {*} value - The new value to set.
     * @param {boolean} [skipNew=false] - If true, skip saving when the post is new.
     * @returns {Promise|undefined}
     */
    _setAndValidate(property, value, skipNew = false) {
        const post = this.post;
        if (post.get(property) === value) {
            return;
        }
        post.set(property, value);
        return post.validate({property}).then(() => {
            if (skipNew || post.get('isNew')) {
                return;
            }
            return this._performSaveTask();
        });
    }

    /**
     * Resets the publish date if there are errors related to it.
     */
    _resetPublishDateIfError() {
        const post = this.post;
        const errors = post.get('errors');
        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }
    }

    /**
     * Parses the SEO URL parts for the seoURL computed property.
     */
    _parseSeoURLParts() {
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

    /**
     * Determines whether the post can be viewed in history.
     */
    _canViewPostHistory() {
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
}