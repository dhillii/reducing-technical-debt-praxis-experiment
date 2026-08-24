import Component from '@ember/component';
import boundOneWay from 'ghost-admin/utils/bound-one-word';
import classic from 'ember-classic-decorator';
import moment from 'moment-timezone';
import {action, computed} from '@ember/object';
import {alias, or} from '@ember/object/computed';
import {inject} from 'ghost-admin/decorators/inject';
import {inject as service} from '@ember/service';
import {tagName} from '@ember-decorators/component';
import {tracked} from '@glimmer/tracking';

classic;
tagName;

/**
 * Strategy class for handling canonical URL parsing and path extraction
 */
class CanonicalUrlExtractor {
    constructor(urlString) {
        this.urlString = urlString;
        this.urlObject = null;
        this.parsed = false;
        this.parse();
    }

    parse() {
        try {
            this.urlObject = new URL(this.urlString);
            this.parsed = true;
        } catch (e) {
            // no-op, invalid URL
            this.parsed = false;
        }
    }

    get urlParts() {
        if (!this.parsed) {
            return [];
        }

        const host = this.urlObject.host;
        const pathSegments = this.urlObject.pathname.split('/').reject(p => !p);
        return [host, ...pathSegments];
    }

    isValid() {
        return this.parsed;
    }
}

/**
 * Strategy class for handling slug-based URL construction
 */
class SlugUrlBuilder {
    constructor(blogUrl, slug) {
        this.blogUrl = blogUrl;
        this.slug = slug;
        this.urlObject = null;
        this.parsed = false;
        this.parse();
    }

    parse() {
        try {
            this.urlObject = new URL(this.blogUrl);
            this.parsed = true;
        } catch (e) {
            this.parsed = false;
        }
    }

    get urlParts() {
        if (!this.parsed) {
            return [];
        }

        const host = this.urlObject.host;
        const pathSegments = this.urlObject.pathname.split('/').reject(p => !p);
        return [...pathSegments, this.slug];
    }
}

/**
 * Base validator strategy for property validation and saving
 */
class PropertyValidatorStrategy {
    constructor(component, property, valueAccessor, setter, isNewValidator) {
        this.component = component;
        this.property = property;
        this.valueAccessor = valueAccessor;
        this.setter = setter;
        this.isNewValidator = isNewValidator;
    }

    execute(newVal) {
        const currentValue = this.valueAccessor(this.component.post);
        if (newVal === currentValue) {
            return;
        }

        this.setter(this.component.post, newVal);
        return this.validateAndSave();
    }

    validateAndSave() {
        return this.component.post.validate({property: this.property})
            .then(() => {
                if (this.isNewValidator(this.component.post)) {
                    return;
                }
                return this.component.savePostTask.perform();
            });
    }
}

/**
 * Image management validator strategy
 */
class ImageValidatorStrategy {
    constructor(component, imageProperty) {
        this.component = component;
        this.imageProperty = imageProperty;
    }

    setNewImage(image) {
        this.component.set(`post.${this.imageProperty}`, image);
        return this.handleSave();
    }

    clearImage() {
        this.component.set(`post.${this.imageProperty}`, '');
        return this.handleSave();
    }

    handleSave() {
        if (this.component.get('post.isNew')) {
            return;
        }
        return this.component.savePostTask.perform().catch((error) => {
            this.component.showError(error);
            this.component.post.rollbackAttributes();
        });
    }
}

/**
 * Helper to extract and validate SEO title logic
 */
function getSeoTitle(post, metaTitleScratch) {
    return metaTitleScratch || post.titleScratch || '(Untitled)';
}

/**
 * Helper to extract canonical URL parts cleanly
 */
function getCanonicalUrlParts(post, configBlogUrl) {
    if (post.canonicalUrl) {
        const extractor = new CanonicalUrlExtractor(post.canonicalUrl);
        return extractor.urlParts;
    } else {
        const builder = new SlugUrlBuilder(configBlogUrl, post.slug);
        return builder.urlParts;
    }
}

/**
 * Helper to validate and save post with visibility tier changes
 */
async function setVisibilityInternal(post, segment, saveTask) {
    post.set('tiers', segment);
    try {
        await post.validate({property: 'visibility'});
        await post.validate({property: 'tiers'});
        if (post.get('isDraft') && post.changedAttributes().tiers) {
            await saveTask.perform();
        }
    } catch (e) {
        if (!e) {
            // validation error
            return;
        }
        throw e;
    }
}

/**
 * Helper to update.slug task wrapper
 */
function updateSlugAction(updateSlugTask, post) {
    return updateSlugTask
        .perform(post.slugValue)
        .catch((error) => {
            throw error;
        });
}

/**
 * Helper for setting property with equality check, validation, and save
 */
function createPropertySetter(
    component,
    property,
    scratchAccessor,
    isNewCheck = (post) => post.isNew
) {
    return function (newVal) {
        let post = component.post;
        let currentVal = scratchAccessor ? scratchAccessor(post) : post.get(property);

        if (newVal === currentVal) {
            return;
        }

        post.set(property, newVal);
        return post.validate({property})
            .then(() => {
                if (isNewCheck(post)) {
                    return;
                }
                return component.savePostTask.perform();
            });
    };
}

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
        return getSeoTitle(this.post, this.metaTitleScratch);
    }

    @computed('post.{slug,canonicalUrl}', 'config.blogUrl')
    get seoURL() {
        const urlParts = getCanonicalUrlParts(this.post, this.config.blogUrl);
        return urlParts.join(' › ');
    }

    get canViewPostHistory() {
        // Cannot view history for new posts
        if (this.post.isNew) {
            return false;
        }

        // Can only view history for lexical posts
        if (this.post.lexical === null) {
            return false;
        }

        // Can view history for all unpublished/unsent posts
        if (!this.post.isPublished && !this.post.isSent) {
            return true;
        }

        // Cannot view history for published posts if there isn't a web version
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

        // reset the publish date if it has an error
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
        let post = this.post;
        let dateString = moment.tz(date, this.settings.get('timezone')).format('YYYY-MM-DD');

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
        await setVisibilityInternal(this.post, segment, this.savePostTask);
    }

    @action
    setPublishedAtBlogTime(time) {
        let post = this.post;

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
        let post = this.post;
        let currentExcerpt = post.get('customExcerpt');

        if (excerpt === currentExcerpt) {
            return;
        }

        post.set('customExcerpt', excerpt);
        return post.validate({property: 'customExcerpt'}).then(() => this.savePostTask.perform());
    }

    @action
    setHeaderInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionHead');

        if (code === currentCode) {
            return;
        }

        post.set('codeinjectionHead', code);
        return post.validate({property: 'codeinjectionHead'}).then(() => this.savePostTask.perform());
    }

    @action
    setFooterInjection(code) {
        let post = this.post;
        let currentCode = post.get('codeinjectionFoot');

        if (code === currentCode) {
            return;
        }

        post.set('codeinjectionFoot', code);
        return post.validate({property: 'codeinjectionFoot'}).then(() => this.savePostTask.perform());
    }

    @action
    setMetaTitle(metaTitle) {
        let post = this.post;
        let currentTitle = post.get('metaTitle');

        if (currentTitle === metaTitle) {
            return;
        }

        post.set('metaTitle', metaTitle);
        return post.validate({property: 'metaTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setMetaDescription(metaDescription) {
        let post = this.post;
        let currentDescription = post.get('metaDescription');

        if (currentDescription === metaDescription) {
            return;
        }

        post.set('metaDescription', metaDescription);
        return post.validate({property: 'metaDescription'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setCanonicalUrl(value) {
        let post = this.post;
        let currentCanonicalUrl = post.canonicalUrl;

        if (currentCanonicalUrl === value) {
            return;
        }

        post.set('canonicalUrl', value);
        return post.validate({property: 'canonicalUrl'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setOgTitle(ogTitle) {
        let post = this.post;
        let currentTitle = post.get('ogTitle');

        if (currentTitle === ogTitle) {
            return;
        }

        post.set('ogTitle', ogTitle);
        return post.validate({property: 'ogTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setOgDescription(ogDescription) {
        let post = this.post;
        let currentDescription = post.get('ogDescription');

        if (currentDescription === ogDescription) {
            return;
        }

        post.set('ogDescription', ogDescription);
        return post.validate({property: 'ogDescription'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterTitle(twitterTitle) {
        let post = this.post;
        let currentTitle = post.get('twitterTitle');

        if (currentTitle === twitterTitle) {
            return;
        }

        post.set('twitterTitle', twitterTitle);
        return post.validate({property: 'twitterTitle'}).then(() => {
            if (post.get('isNew')) {
                return;
            }
            return this.savePostTask.perform();
        });
    }

    @action
    setTwitterDescription(twitterDescription) {
        let post = this.post;
        let currentDescription = post.get('twitterDescription');

        if (currentDescription === twitterDescription) {
            return;
        }

        post.set('twitterDescription', twitterDescription);
        return post.validate({property: 'twitterDescription'}).then(() => {
            if (post.get('isNew')) {
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

        // return if nothing changed
        if (newAuthors.mapBy('id').join() === post.get('authors').mapBy('id').join()) {
            return;
        }

        post.set('authors', newAuthors);
        post.validate({property: 'authors'});

        // if this is a new post (never been saved before), don't try to save it
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
        // TODO: remove null check once ValidationEngine has been removed
        if (error) {
            this.notifications.showAPIError(error);
        }
    }

    setSidebarWidthVariable(width) {
        document.documentElement.style.setProperty('--editor-sidebar-width', `${width}px`);
        document.documentElement.style.setProperty('--kg-breakout-adjustment', `${width}px`);
    }
}