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

// Maps post image properties to their field names
const IMAGE_FIELDS = {
    coverImage: 'featureImage',
    ogImage: 'ogImage',
    twitterImage: 'twitterImage'
};

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

    @boundOneWay('post.slug') slugValue;
    @boundOneWay('post.uuid') uuidValue;

    // Computed social/SEO properties
    @or('metaDescriptionScratch', 'customExcerptScratch') seoDescription;

    @or('ogDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        facebookDescription;

    @or('post.ogImage', 'post.featureImage', 'settings.ogImage', 'settings.coverImage')
        facebookImage;

    @or('ogTitleScratch', 'seoTitle') facebookTitle;

    @or('twitterDescriptionScratch', 'customExcerptScratch', 'seoDescription', 'post.excerpt', 'settings.description', '')
        twitterDescription;

    @or('post.twitterImage', 'post.featureImage', 'settings.twitterImage', 'settings.coverImage')
        twitterImage;

    @or('twitterTitleScratch', 'seoTitle') twitterTitle;

    @or('session.user.isOwnerOnly', 'session.user.isAdminOnly', 'session.user.isEitherEditor')
        showVisibilityInput;

    @computed('metaTitleScratch', 'post.titleScratch')
    get seoTitle() {
        return this.metaTitleScratch || this.post.titleScratch || '(Untitled)';
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = this._buildUrlParts();
        return urlParts.join(' › ');
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

    // Lifecycle

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

    // Published date/time actions

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

    // Post field setter actions - these all follow the same pattern:
    // check if changed, set value, validate, save if not new

    @action
    setCustomExcerpt(excerpt) {
        return this._setPostFieldAndSave('customExcerpt', excerpt);
    }

    @action
    setHeaderInjection(code) {
        return this._setPostFieldAndSave('codeinjectionHead', code);
    }

    @action
    setFooterInjection(code) {
        return this._setPostFieldAndSave('codeinjectionFoot', code);
    }

    @action
    setMetaTitle(metaTitle) {
        return this._setPostFieldAndSave('metaTitle', metaTitle);
    }

    @action
    setMetaDescription(metaDescription) {
        return this._setPostFieldAndSave('metaDescription', metaDescription);
    }

    @action
    setCanonicalUrl(value) {
        return this._setPostFieldAndSave('canonicalUrl', value);
    }

    @action
    setOgTitle(ogTitle) {
        return this._setPostFieldAndSave('ogTitle', ogTitle);
    }

    @action
    setOgDescription(ogDescription) {
        return this._setPostFieldAndSave('ogDescription', ogDescription);
    }

    @action
    setTwitterTitle(twitterTitle) {
        return this._setPostFieldAndSave('twitterTitle', twitterTitle);
    }

    @action
    setTwitterDescription(twitterDescription) {
        return this._setPostFieldAndSave('twitterDescription', twitterDescription);
    }

    // Image actions - set/clear follow the same pattern

    @action
    setCoverImage(image) {
        this._setPostImage(IMAGE_FIELDS.coverImage, image);
    }

    @action
    clearCoverImage() {
        this._setPostImage(IMAGE_FIELDS.coverImage, '');
    }

    @action
    setOgImage(image) {
        this._setPostImage(IMAGE_FIELDS.ogImage, image);
    }

    @action
    clearOgImage() {
        this._setPostImage(IMAGE_FIELDS.ogImage, '');
    }

    @action
    setTwitterImage(image) {
        this._setPostImage(IMAGE_FIELDS.twitterImage, image);
    }

    @action
    clearTwitterImage() {
        this._setPostImage(IMAGE_FIELDS.twitterImage, '');
    }

    // Authors action

    @action
    changeAuthors(newAuthors) {
        const {post} = this;
        const authorsUnchanged = newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join();

        if (authorsUnchanged) {
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

    // Save/delete actions

    @action
    savePost() {
        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
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

    _buildUrlParts() {
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

        return urlParts;
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
        if (this.post.isNew) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }

    _setPostFieldAndSave(property, value) {
        const {post} = this;

        if (post.get(property) === value) {
            return;
        }

        post.set(property, value);

        return post.validate({property}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    _setPostImage(field, value) {
        this.set(`post.${field}`, value);

        if (this.get('post.isNew')) {
            return;
        }

        this.savePostTask.perform().catch((error) => {
            this.showError(error);
            this.post.rollbackAttributes();
        });
    }
}
```

Key refactoring changes made:

1. **Extracted `_setPostFieldAndSave`**: Eliminated ~10 near-identical action methods (setMetaTitle, setMetaDescription, setCanonicalUrl, etc.) by consolidating them into a single private helper that accepts a property name and value.

2. **Extracted `_setPostImage`**: Consolidated 6 image set/clear actions (setCoverImage, clearCoverImage, setOgImage, etc.) into a single private helper.

3. **Extracted `_saveIfNotNew`**: Removed repeated save-with-error-handling pattern used in `toggleFeatured` and `toggleShowTitleAndFeatureImage`.

4. **Extracted `_buildUrlParts`**: Moved URL construction logic out of the `seoURL` getter for clarity.

5. **Extracted `_resetPublishDateOnError`**: Moved publish date reset logic out of `willDestroyElement`.

6. **Simplified `canViewPostHistory`**: Removed redundant comments and simplified the conditional logic.

7. **Used optional chaining**: Replaced the `if (this.deletePost)` guard with `this.deletePost?.()`.

8. **Added `IMAGE_FIELDS` constant**: Provides a clear mapping of image field names, avoiding magic strings.

9. **Consistent use of `const {post} = this`**: Replaced repeated `let post = this.post` with destructuring.