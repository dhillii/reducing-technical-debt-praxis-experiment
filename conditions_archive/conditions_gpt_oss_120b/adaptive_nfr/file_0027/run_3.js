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
                // Invalid URL – ignore and fallback to blog URL
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
        if (!this.post.isNew) {
            this._savePostWithErrorHandling();
        }
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (!this.post.isNew) {
            this._savePostWithErrorHandling();
        }
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
        return this.updateSlugTask.perform(newSlug).catch(error => {
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
            return this.savePostTask.perform();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this.savePostTask.perform();
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
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        this._updateField('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        this._updateField('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        this._updateField('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        this._updateField('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        this._updateField('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        this._updateField('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        this._updateField('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        this._updateField('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        this._updateField('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        this._updateField('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        this._setImageField('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setImageField('featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setImageField('ogImage', image);
    }

    @action
    clearOgImage() {
        this._setImageField('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setImageField('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setImageField('twitterImage', '');
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this._savePostWithErrorHandling();
        }
    }

    @action
    savePost() {
        this._savePostWithErrorHandling();
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

    /**
     * Generic field updater with validation and conditional save.
     *
     * @private
     * @param {string} field - The model field to update.
     * @param {*} value - The new value.
     */
    _updateField(field, value) {
        const post = this.post;
        if (post.get(field) === value) {
            return;
        }

        post.set(field, value);
        post.validate({property: field}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        }).catch(error => {
            this.showError(error);
            post.rollbackAttributes();
        });
    }

    /**
     * Set image field and optionally persist.
     *
     * @private
     * @param {string} field - Image field name on the post.
     * @param {string} value - Image URL or empty string.
     */
    _setImageField(field, value) {
        this.set(`post.${field}`, value);
        if (!this.get('post.isNew')) {
            this._savePostWithErrorHandling();
        }
    }

    /**
     * Save the post task with error handling.
     *
     * @private
     */
    _savePostWithErrorHandling() {
        this.savePostTask.perform().catch(error => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }
}