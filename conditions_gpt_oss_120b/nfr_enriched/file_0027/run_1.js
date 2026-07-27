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
            const parts = this._extractUrlParts(this.post.canonicalUrl);
            if (parts) {
                urlParts.push(...parts);
            }
        } else {
            const blogUrl = new URL(this.config.blogUrl);
            urlParts.push(blogUrl.host);
            urlParts.push(...blogUrl.pathname.split('/').filter(p => p));
            urlParts.push(this.post.slug);
        }

        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        if (this.post.isNew) return false;
        if (this.post.lexical === null) return false;
        if (!this.post.isPublished && !this.post.isSent) return true;
        if (this.post.emailOnly) return false;
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
        if (this.post.isNew) return;
        return this._performSave();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) return;
        return this._performSave();
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
            return this._performSave();
        }
    }

    @action
    async setVisibility(segment) {
        this.post.set('tiers', segment);
        await this.post.validate({property: 'visibility'});
        await this.post.validate({property: 'tiers'});
        if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
            return this._performSave();
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
            return this._performSave();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        const post = this.post;
        if (excerpt === post.get('customExcerpt')) return;
        post.set('customExcerpt', excerpt);
        return post.validate({property: 'customExcerpt'}).then(() => this._performSave());
    }

    @action
    setHeaderInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionHead')) return;
        post.set('codeinjectionHead', code);
        return post.validate({property: 'codeinjectionHead'}).then(() => this._performSave());
    }

    @action
    setFooterInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionFoot')) return;
        post.set('codeinjectionFoot', code);
        return post.validate({property: 'codeinjectionFoot'}).then(() => this._performSave());
    }

    @action
    setMetaTitle(metaTitle) {
        return this._validateAndSave('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._validateAndSave('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._validateAndSave('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._validateAndSave('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._validateAndSave('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._validateAndSave('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._validateAndSave('twitterDescription', twitterDescription);
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        if (this.get('post.isNew')) return;
        return this._performSave();
    }

    @action
    changeAuthors(newAuthors) {
        const post = this.post;
        const currentIds = post.get('authors').mapBy('id').join();
        const newIds = newAuthors.mapBy('id').join();

        if (currentIds === newIds) return;

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (post.get('isNew')) return;
        return this._performSave();
    }

    @action
    savePost() {
        return this._performSave();
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
     * Safely extracts host and path parts from a URL string.
     * Returns an array of parts or null if the URL is invalid.
     */
    _extractUrlParts(urlString) {
        try {
            const url = new URL(urlString);
            const parts = [url.host];
            parts.push(...url.pathname.split('/').filter(p => p));
            return parts;
        } catch (e) {
            console.warn('Invalid URL provided for SEO URL:', urlString);
            return null;
        }
    }

    /**
     * Performs the save task and handles errors uniformly.
     */
    _performSave() {
        return this.savePostTask.perform().catch(error => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    /**
     * Validates a property, updates it if changed, and saves if appropriate.
     */
    _validateAndSave(property, newValue) {
        const post = this.post;
        const current = post.get(property);
        if (current === newValue) return;
        post.set(property, newValue);
        return post.validate({property}).then(() => {
            if (post.get('isNew')) return;
            return this._performSave();
        });
    }
}