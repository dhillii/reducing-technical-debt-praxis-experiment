Here's the refactored code with reduced complexity through extracted helper methods, eliminated duplication, and improved organization:

```javascript
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

// Constants
const UNTITLED = '(Untitled)';
const EMPTY_STRING = '';

@classic
@tagName('')
export default class GhPostSettingsMenu extends Component {
    // Services
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

    // Tracked state
    @tracked showPostHistory = false;

    // Properties
    post = null;
    isViewingSubview = false;

    // Post scratch aliases
    @alias('post.canonicalUrlScratch') canonicalUrlScratch;
    @alias('post.customExcerptScratch') customExcerptScratch;
    @alias('post.codeinjectionFootScratch') codeinjectionFootScratch;
    @alias('post.codeinjectionHeadScratch') codeinjectionHeadScratch;
    @alias('post.metaDescriptionScratch') metaDescriptionScratch;
    @alias('post.metaTitleScratch') metaTitleScratch;
    @alias('post.ogDescriptionScratch') ogDescriptionScratch;
    @alias('post.ogTitleScratch') ogTitleScratch;
    @alias('post.twitterDescriptionScratch') twitterDescriptionScratch;
    @alias('post.twitterTitleScratch') twitterTitleScratch;

    // Bound one-way values
    @boundOneWay('post.slug') slugValue;
    @boundOneWay('post.uuid') uuidValue;

    // Computed OR properties
    @or('metaDescriptionScratch', 'customExcerptScratch') seoDescription;

    @or(
        'ogDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        EMPTY_STRING
    ) facebookDescription;

    @or(
        'post.ogImage',
        'post.featureImage',
        'settings.ogImage',
        'settings.coverImage'
    ) facebookImage;

    @or('ogTitleScratch', 'seoTitle') facebookTitle;

    @or(
        'twitterDescriptionScratch',
        'customExcerptScratch',
        'seoDescription',
        'post.excerpt',
        'settings.description',
        EMPTY_STRING
    ) twitterDescription;

    @or(
        'post.twitterImage',
        'post.featureImage',
        'settings.twitterImage',
        'settings.coverImage'
    ) twitterImage;

    @or('twitterTitleScratch', 'seoTitle') twitterTitle;

    @or(
        'session.user.isOwnerOnly',
        'session.user.isAdminOnly',
        'session.user.isEitherEditor'
    ) showVisibilityInput;

    // Computed properties
    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || UNTITLED;
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        return this._buildSeoURL();
    }

    get canViewPostHistory() {
        const {post} = this;

        if (post.isNew || post.lexical === null) {
            return false;
        }

        if (!post.isPublished && !post.isSent) {
            return true;
        }

        return !post.emailOnly;
    }

    get themeMissingShowTitleAndFeatureImage() {
        return !this.themeManagement.activeTheme.hasPageBuilderFeature('show_title_and_feature_image');
    }

    // Lifecycle hooks
    willDestroyElement() {
        super.willDestroyElement(...arguments);
        this._resetPublishDateOnError();
        this.setSidebarWidthVariable(0);
    }

    // Subview actions
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

    // Post history actions
    @action
    openPostHistory() {
        this.showPostHistory = true;
    }

    @action
    closePostHistory() {
        this.showPostHistory = false;
    }

    // Post property toggle actions
    @action
    toggleFeatured() {
        this.post.featured = !this.post.featured;
        this._saveIfNotNew();
    }

    @action
    toggleShowTitleAndFeatureImage(event) {
        this.post.showTitleAndFeatureImage = event.target.checked;
        this._saveIfNotNew();
    }

    // Slug action
    @action
    updateSlug(newSlug) {
        return this.updateSlugTask
            .perform(newSlug)
            .catch((error) => {
                this.showError(error);
                this.post.rollbackAttributes();
            });
    }

    // Date/time actions
    @action
    setPublishedAtBlogDate(date) {
        const {post} = this;
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
    setPublishedAtBlogTime(time) {
        const {post} = this;

        post.get('errors').remove('publishedAtBlogDate');

        if (post.get('isNew') || time === post.get('publishedAtBlogTime')) {
            post.validate({property: 'publishedAtBlog'});
        } else {
            post.set('publishedAtBlogTime', time);
            return this.savePostTask.perform();
        }
    }

    // Visibility action
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

    // Post field setter actions - using a unified pattern
    @action
    setCustomExcerpt(excerpt) {
        return this._setPostField('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setPostField('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setPostField('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setPostField('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setPostField('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostField('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setPostField('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setPostField('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setPostField('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setPostField('twitterDescription', twitterDescription);
    }

    // Image actions - using a unified pattern
    @action
    setCoverImage(image) {
        this._setPostImage('featureImage', image);
    }

    @action
    clearCoverImage() {
        this._setPostImage('featureImage', EMPTY_STRING);
    }

    @action
    setOgImage(image) {
        this._setPostImage('ogImage', image);
    }

    @action
    clearOgImage() {
        this._setPostImage('ogImage', EMPTY_STRING);
    }

    @action
    setTwitterImage(image) {
        this._setPostImage('twitterImage', image);
    }

    @action
    clearTwitterImage() {
        this._setPostImage('twitterImage', EMPTY_STRING);
    }

    // Author action
    @action
    changeAuthors(newAuthors) {
        const {post} = this;
        const authorsUnchanged = newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join();

        if (authorsUnchanged) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        if (!post.get('isNew')) {
            this.savePostTask.perform().catch((error) => {
                this.showError(error);
                post.rollbackAttributes();
            });
        }
    }

    // Save/delete actions
    @action
    savePost() {
        this._performSave();
    }

    @action
    deletePostInternal() {
        this.deletePost?.();
    }

    @action
    setSidebarWidthFromElement(element) {
        const width = element.getBoundingClientRect().width;
        this.setSidebarWidthVariable(width);
    }

    // Public utility methods
    showError(error) {
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }

    // Private helper methods
    _buildSeoURL() {
        const urlParts = [];

        if (this.post.canonicalUrl) {
            try {
                const {host, pathname} = new URL(this.post.canonicalUrl);
                urlParts.push(host, ...pathname.split('/').reject(p => !p));
            } catch (e) {
                // no-op, invalid URL
            }
        } else {
            const {host, pathname} = new URL(this.config.blogUrl);
            urlParts.push(host, ...pathname.split('/').reject(p => !p), this.post.slug);
        }

        return urlParts.join(' › ');
    }

    _resetPublishDateOnError() {
        const {post} = this;
        const errors = post.get('errors');

        if (errors.has('publishedAtBlogDate') || errors.has('publishedAtBlogTime')) {
            post.set('publishedAtBlogTZ', post.get('publishedAtUTC'));
            post.validate({attribute: 'publishedAtBlog'});
        }
    }

    _saveIfNotNew() {
        if (!this.post.isNew) {
            this._performSave();
        }
    }

    _performSave() {
        return this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    _setPostField(property, value) {
        const {post} = this;

        if (post.get(property) === value) {
            return;
        }

        post.set(property, value);

        return post.validate({property}).then(() => {
            if (!post.get('isNew')) {
                return this.savePostTask.perform();
            }
        });
    }

    _setPostImage(imageProperty, value) {
        this.set(`post.${imageProperty}`, value);

        if (!this.get('post.isNew')) {
            this._performSave();
        }
    }
}
```

Key refactoring improvements:

1. **Eliminated duplication** with `_setPostField()` — replaces 8 nearly identical setter actions (metaTitle, metaDescription, canonicalUrl, ogTitle, ogDescription, twitterTitle, twitterDescription, customExcerpt, etc.)

2. **Eliminated duplication** with `_setPostImage()` — replaces 6 nearly identical image set/clear actions

3. **Extracted `_performSave()`** — centralizes the save + error handling pattern used throughout

4. **Extracted `_saveIfNotNew()`** — simplifies `toggleFeatured` and `toggleShowTitleAndFeatureImage`

5. **Extracted `_buildSeoURL()`** — moves URL building logic out of the computed getter

6. **Extracted `_resetPublishDateOnError()`** — cleans up `willDestroyElement`

7. **Simplified `canViewPostHistory`** — removed redundant comments and flattened conditions

8. **Added constants** (`UNTITLED`, `EMPTY_STRING`) to avoid magic strings

9. **Used optional chaining** (`this.deletePost?.()`) to simplify the null check

10. **Consistent use of destructuring** (`const {post} = this`) throughout