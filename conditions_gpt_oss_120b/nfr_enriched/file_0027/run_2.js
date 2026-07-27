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
        const parts = this._buildSeoUrlParts();
        return parts.join(' › ');
    }

    /** Build URL parts for SEO display, handling invalid URLs gracefully */
    _buildSeoUrlParts() {
        const urlParts = [];

        if (this.post.canonicalUrl) {
            const canonicalParts = this._extractUrlParts(this.post.canonicalUrl);
            if (canonicalParts) {
                urlParts.push(...canonicalParts);
                return urlParts;
            }
        }

        const blogParts = this._extractUrlParts(this.config.blogUrl);
        if (blogParts) {
            urlParts.push(...blogParts);
        }
        urlParts.push(this.post.slug);
        return urlParts;
    }

    /** Extract host and path segments from a URL string; returns null if invalid */
    _extractUrlParts(urlString) {
        try {
            const url = new URL(urlString);
            const parts = [url.host];
            const pathSegments = url.pathname.split('/').filter(p => p);
            parts.push(...pathSegments);
            return parts;
        } catch (e) {
            // Invalid URL – log for debugging and return null
            console.warn('Invalid URL encountered:', urlString, e);
            return null;
        }
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
        if (this.post.isNew) {
            return;
        }
        this._savePostTask();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        if (this.post.isNew) {
            return;
        }
        this._savePostTask();
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
        return this.updateSlugTask
            .perform(newSlug)
            .catch(error => {
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
        try {
            await this.post.validate({property: 'visibility'});
            await this.post.validate({property: 'tiers'});
            if (this.post.get('isDraft') && this.post.changedAttributes().tiers) {
                await this.savePostTask.perform();
            }
        } catch (e) {
            if (!e) {
                return;
            }
            throw e;
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
        const post = this.post;
        if (excerpt === post.get('customExcerpt')) {
            return;
        }
        post.set('customExcerpt', excerpt);
        return post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionHead')) {
            return;
        }
        post.set('codeinjectionHead', code);
        return post.validate({property: 'codeinjectionHead'}).then(() => this.savePostTask.perform());
    }

    @action
    setFooterInjection(code) {
        const post = this.post;
        if (code === post.get('codeinjectionFoot')) {
            return;
        }
        post.set('codeinjectionFoot', code);
        return post.validate({property: 'codeinjectionFoot'}).then(() => this.savePostTask.perform());
    }

    @action
    setMetaTitle(metaTitle) {
        const post = this.post;
        if (metaTitle === post.get('metaTitle')) {
            return;
        }
        post.set('metaTitle', metaTitle);
        return post.validate({property: 'metaTitle'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setMetaDescription(metaDescription) {
        const post = this.post;
        if (metaDescription === post.get('metaDescription')) {
            return;
        }
        post.set('metaDescription', metaDescription);
        return post.validate({property: 'metaDescription'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setCanonicalUrl(value) {
        const post = this.post;
        if (value === post.canonicalUrl) {
            return;
        }
        post.set('canonicalUrl', value);
        return post.validate({property: 'canonicalUrl'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setOgTitle(ogTitle) {
        const post = this.post;
        if (ogTitle === post.get('ogTitle')) {
            return;
        }
        post.set('ogTitle', ogTitle);
        return post.validate({property: 'ogTitle'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setOgDescription(ogDescription) {
        const post = this.post;
        if (ogDescription === post.get('ogDescription')) {
            return;
        }
        post.set('ogDescription', ogDescription);
        return post.validate({property: 'ogDescription'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setTwitterTitle(twitterTitle) {
        const post = this.post;
        if (twitterTitle === post.get('twitterTitle')) {
            return;
        }
        post.set('twitterTitle', twitterTitle);
        return post.validate({property: 'twitterTitle'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setTwitterDescription(twitterDescription) {
        const post = this.post;
        if (twitterDescription === post.get('twitterDescription')) {
            return;
        }
        post.set('twitterDescription', twitterDescription);
        return post.validate({property: 'twitterDescription'}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');
        if (!this.get('post.isNew')) {
            this._savePostTask();
        }
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
            this._savePostTask();
        }
    }

    @action
    savePost() {
        this._savePostTask();
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

    /** Centralized save with error handling and rollback */
    _savePostTask() {
        this.savePostTask.perform().catch(error => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }
}