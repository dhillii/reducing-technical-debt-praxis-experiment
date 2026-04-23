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
        this._setAndSave('featured', !this.post.featured);
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this._setAndSave('showTitleAndFeatureImage', event.target.checked);
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
     * Update the post slug.
     * @param {string} newSlug
     * @returns {Promise<void>}
     */
    @action
    updateSlug(newSlug) {
        return this._setAndSave('slug', newSlug);
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
        const currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        return this._setAndSave('customExcerpt', excerpt, 'customExcerpt');
    }

    @action
    setHeaderInjection(code) {
        const post = this.post;
        const currentCode = post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        return this._setAndSave('codeinjectionHead', code, 'codeinjectionHead');
    }

    @action
    setFooterInjection(code) {
        const post = this.post;
        const currentCode = post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        return this._setAndSave('codeinjectionFoot', code, 'codeinjectionFoot');
    }

    @action
    setMetaTitle(metaTitle) {
        const post = this.post;
        const currentTitle = post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        return this._setAndSave('metaTitle', metaTitle, 'metaTitle');
    }

    @action
    setMetaDescription(metaDescription) {
        const post = this.post;
        const currentDescription = post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        return this._setAndSave('metaDescription', metaDescription, 'metaDescription');
    }

    @action
    setCanonicalUrl(value) {
        const post = this.post;
        const currentCanonicalUrl = post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        return this._setAndSave('canonicalUrl', value, 'canonicalUrl');
    }

    @action
    setOgTitle(ogTitle) {
        const post = this.post;
        const currentTitle = post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        return this._setAndSave('ogTitle', ogTitle, 'ogTitle');
    }

    @action
    setOgDescription(ogDescription) {
        const post = this.post;
        const currentDescription = post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        return this._setAndSave('ogDescription', ogDescription, 'ogDescription');
    }

    @action
    setTwitterTitle(twitterTitle) {
        const post = this.post;
        const currentTitle = post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        return this._setAndSave('twitterTitle', twitterTitle, 'twitterTitle');
    }

    @action
    setTwitterDescription(twitterDescription) {
        const post = this.post;
        const currentDescription = post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        return this._setAndSave('twitterDescription', twitterDescription, 'twitterDescription');
    }

    @action
    setCoverImage(image) {
        return this._setAndSave('featureImage', image);
    }

    @action
    clearCoverImage() {
        return this._setAndSave('featureImage', '');
    }

    @action
    setOgImage(image) {
        return this._setAndSave('ogImage', image);
    }

    @action
    clearOgImage() {
        return this._setAndSave('ogImage', '');
    }

    @action
    setTwitterImage(image) {
        return this._setAndSave('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        return this._setAndSave('twitterImage', '');
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

    /**
     * Helper to set a property on the post, validate it, and persist changes.
     * @param {string} property - The property name on the post.
     * @param {*} value - The value to set.
     * @param {string|Array<string>} [validateProps] - Property or properties to validate.
     * @returns {Promise<void>}
     */
    async _setAndSave(property, value, validateProps) {
        const post = this.post;
        post.set(property, value);

        if (validateProps) {
            if (Array.isArray(validateProps)) {
                for (const prop of validateProps) {
                    await post.validate({property: prop});
                }
            } else {
                await post.validate({property: validateProps});
            }
        }

        if (!post.isNew) {
            try {
                await this.savePostTask.perform();
            } catch (error) {
                this.showError(error);
                post.rollbackAttributes();
            }
        }
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