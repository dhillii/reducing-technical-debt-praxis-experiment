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
        this._setFieldAndSave(this.post, 'featured', !this.post.featured);
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this._setFieldAndSave(this.post, 'showTitleAndFeatureImage', event.target.checked);
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
        this._setFieldAndSave(this.post, 'customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        this._setFieldAndSave(this.post, 'codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        this._setFieldAndSave(this.post, 'codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        this._setFieldAndSave(this.post, 'metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        this._setFieldAndSave(this.post, 'metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        this._setFieldAndSave(this.post, 'canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        this._setFieldAndSave(this.post, 'ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        this._setFieldAndSave(this.post, 'ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        this._setFieldAndSave(this.post, 'twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        this._setFieldAndSave(this.post, 'twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        this._setFieldAndSave(this.post, 'featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setFieldAndSave(this.post, 'featureImage', '');
    }

    @action
    setOgImage(image) {
        this._setFieldAndSave(this.post, 'ogImage', image);
    }

    @action
    clearOgImage() {
        this._setFieldAndSave(this.post, 'ogImage', '');
    }

    @action
    setTwitterImage(image) {
        this._setFieldAndSave(this.post, 'twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setFieldAndSave(this.post, 'twitterImage', '');
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
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    /**
     * Saves the post and rolls back attributes on error.
     * @private
     */
    async _savePostWithRollback(post) {
        try {
            await this.savePostTask.perform();
        } catch (error) {
            this.showError(error);
            post.rollbackAttributes();
        }
    }

    /**
     * Validates a property and saves the post if not new.
     * @private
     */
    async _validateAndSave(post, property) {
        await post.validate({property});
        if (post.get('isNew')) {
            return;
        }
        await this._savePostWithRollback(post);
    }

    /**
     * Sets a field on the post, validates, and saves if necessary.
     * @private
     */
    async _setFieldAndSave(post, field, value) {
        if (value === post.get(field)) {
            return;
        }
        post.set(field, value);
        await this._validateAndSave(post, field);
    }
}