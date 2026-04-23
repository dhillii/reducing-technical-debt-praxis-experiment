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
            } catch {
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
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

        this.post.get('errors').remove('publishedAtBlogDate');

        if (this.post.get('isNew') || date === this.post.get('publishedAtBlogDate')) {
            this.post.validate({property: 'publishedAtBlog'});
        } else {
            this.post.set('publishedAtBlogDate', dateString);
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
            throw e;
        }
    }

    @action
    setPublishedAtBlogTime(time) {
        if (this.post.get('isNew') || time === this.post.get('publishedAtBlogTime')) {
            this.post.validate({property: 'publishedAtBlog'});
        } else {
            this.post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    @action
    setCustomExcerpt(excerpt) {
        let currentExcerpt = this.post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        this.post.set('customExcerpt', excerpt);

        return this.post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        let currentCode = this.post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        this.post.set('codeinjectionHead', code);

        return this.post.validate({property: 'codeinjectionHead'}).then(() => this.savePostTask.perform());
    }

    @action
    setFooterInjection(code) {
        let currentCode = this.post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        this.post.set('codeinjectionFoot', code);

        return this.post.validate({property: 'codeinjectionFoot'}).then(() => this.savePostTask.perform());
    }

    @action
    setMetaTitle(metaTitle) {
        let currentTitle = this.post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        this.post.set('metaTitle', metaTitle);

        return this.post.validate({property: 'metaTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setMetaDescription(metaDescription) {
        let currentDescription = this.post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        this.post.set('metaDescription', metaDescription);

        return this.post.validate({property: 'metaDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setCanonicalUrl(value) {
        let currentCanonicalUrl = this.post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        this.post.set('canonicalUrl', value);

        return this.post.validate({property: 'canonicalUrl'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgTitle(ogTitle) {
        let currentTitle = this.post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        this.post.set('ogTitle', ogTitle);

        return this.post.validate({property: 'ogTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setOgDescription(ogDescription) {
        let currentDescription = this.post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        this.post.set('ogDescription', ogDescription);

        return this.post.validate({property: 'ogDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterTitle(twitterTitle) {
        let currentTitle = this.post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        this.post.set('twitterTitle', twitterTitle);

        return this.post.validate({property: 'twitterTitle'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterDescription(twitterDescription) {
        let currentDescription = this.post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        this.post.set('twitterDescription', twitterDescription);

        return this.post.validate({property: 'twitterDescription'}).then(() => {
            if (this.post.get('isNew')) {
                return;
            }

            return this.savePostTask.perform();
        });
    }

    @action
    setCoverImage(image) {
        this.set('post.featureImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    clearCoverImage() {
        this.set('post.featureImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    setOgImage(image) {
        this.set('post.ogImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    clearOgImage() {
        this.set('post.ogImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    setTwitterImage(image) {
        this.set('post.twitterImage', image);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    @action
    clearTwitterImage() {
        this.set('post.twitterImage', '');

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}