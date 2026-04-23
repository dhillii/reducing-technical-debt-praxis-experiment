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
                // invalid URL – ignore
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

    // ---------- Helper Methods ----------

    /**
     * Centralised error handling for save operations.
     */
    _handleSaveError(error) {
        this.showError(error);
        this.post.rollbackAttributes();
    }

    /**
     * Perform save if the post is not new, handling errors uniformly.
     */
    _saveIfNotNew() {
        if (this.post.isNew) {
            return;
        }
        return this.savePostTask.perform().catch(this._handleSaveError.bind(this));
    }

    /**
     * Validate a property and save if the post is not new.
     */
    _validateAndSave(property) {
        return this.post.validate({property}).then(() => {
            if (this.post.isNew) {
                return;
            }
            return this._saveIfNotNew();
        });
    }

    // ---------- Actions ----------

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
        this._saveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) {
            return;
        }
        this._saveIfNotNew();
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
        return this.updateSlugTask.perform(newSlug).catch(this._handleSaveError.bind(this));
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
            return this._saveIfNotNew();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            await this._saveIfNotNew();
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
            return this._saveIfNotNew();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        const post = this.post;
        if (excerpt === post.get('customExcerpt')) {
            return;
        }
        post.set('customExcerpt', excerpt);
        return this._validateAndSave('customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionHead')) {
            return;
        }
        post.set('codeinjectionHead', code);
        return this._validateAndSave('codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionFoot')) {
            return;
        }
        post.set('codeinjectionFoot', code);
        return this._validateAndSave('codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        const post = this.post;
        if (metaTitle === post.get('metaTitle')) {
            return;
        }
        post.set('metaTitle', metaTitle);
        return this._validateAndSave('metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        const post = this.post;
        if (metaDescription === post.get('metaDescription')) {
            return;
        }
        post.set('metaDescription', metaDescription);
        return this._validateAndSave('metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        const post = this.post;
        if (value === post.canonicalUrl) {
            return;
        }
        post.set('canonicalUrl', value);
        return this._validateAndSave('canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        const post = this.post;
        if (ogTitle === post.get('ogTitle')) {
            return;
        }
        post.set('ogTitle', ogTitle);
        return this._validateAndSave('ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        const post = this.post;
        if (ogDescription === post.get('ogDescription')) {
            return;
        }
        post.set('ogDescription', ogDescription);
        return this._validateAndSave('ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        const post = this.post;
        if (twitterTitle === post.get('twitterTitle')) {
            return;
        }
        post.set('twitterTitle', twitterTitle);
        return this._validateAndSave('twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        const post = this.post;
        if (twitterDescription === post.get('twitterDescription')) {
            return;
        }
        post.set('twitterDescription', twitterDescription);
        return this._validateAndSave('twitterDescription');
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
        const post = this.post;
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) {
            return;
        }

        this._saveIfNotNew();
    }

    @action
    savePost() {
        this._saveIfNotNew();
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
}