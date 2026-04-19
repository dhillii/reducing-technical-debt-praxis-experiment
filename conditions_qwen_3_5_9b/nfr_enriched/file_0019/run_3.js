```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import SiteTitleBackButton from '../common/site-title-back-button';
import NewsletterSelectionPage from './newsletter-selection-page';
import ProductsSection from '../common/products-section';
import InputForm from '../common/input-form';
import {ValidateInputForm} from '../../utils/form';
import {getSiteProducts, getSitePrices, hasAvailablePrices, hasOnlyFreePlan, isInviteOnly, isFreeSignupAllowed, isPaidMembersOnly, freeHasBenefitsOrDescription, hasMultipleNewsletters, hasFreeTrialTier, isSignupAllowed, isSigninAllowed} from '../../utils/helpers';
import {ReactComponent as InvitationIcon} from '../../images/icons/invitation.svg';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';

export const SignupPageStyles = `
.gh-portal-back-sitetitle {
    position: absolute;
    top: 35px;
    left: 32px;
}
html[dir="rtl"] .gh-portal-back-sitetitle {
    left: unset;
    right: 32px;
}

.gh-portal-back-sitetitle .gh-portal-btn {
    padding: 0;
    border: 0;
    font-size: 1.5rem;
    height: auto;
    line-height: 1em;
    color: var(--grey1);
}

.gh-portal-popup-wrapper:not(.full-size) .gh-portal-back-sitetitle,
.gh-portal-popup-wrapper.preview .gh-portal-back-sitetitle {
    display: none;
}

.gh-portal-signup-logo {
    position: relative;
    display: block;
    background-position: 50%;
    background-size: cover;
    border-radius: 2px;
    width: 60px;
    height: 60px;
    margin: 12px 0 10px;
}

.gh-portal-signup-header,
.gh-portal-signin-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 32px;
    margin-bottom: 32px;
}

.gh-portal-popup-wrapper.full-size .gh-portal-signup-header {
    margin-top: 32px;
}

.gh-portal-signup-header .gh-portal-main-title,
.gh-portal-signin-header .gh-portal-main-title {
    margin-top: 12px;
}

.gh-portal-signup-logo + .gh-portal-main-title {
    margin: 4px 0 0;
}

.gh-portal-signup-header .gh-portal-main-subtitle {
    font-size: 1.5rem;
    text-align: center;
    line-height: 1.45em;
    margin: 4px 0 0;
    color: var(--grey3);
}

.gh-portal-logged-out-form-container {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
}

.signup .gh-portal-input-section:last-of-type {
    margin-bottom: 40px;
}

.gh-portal-signup-message {
    display: flex;
    justify-content: center;
    color: var(--grey4);
    font-size: 1.5rem;
    margin: 4px 0 0;
}

.gh-portal-signup-message,
.gh-portal-signup-message * {
    z-index: 9999;
}

.full-size .gh-portal-signup-message {
    margin: 24px 0 40px;
}

@media (max-width: 480px) {
    .preview .gh-portal-products + .gh-portal-signup-message {
        margin-bottom: 40px;
    }
}

.gh-portal-signup-message button {
    font-size: 1.4rem;
    font-weight: 600;
    margin-inline-start: 4px !important;
    margin-bottom: -1px;
}

.gh-portal-signup-message button span {
    display: inline-block;
    padding-bottom: 2px;
    margin-bottom: -2px;
}

.gh-portal-content.signup.invite-only {
    background: none;
}

footer.gh-portal-signup-footer,
footer.gh-portal-signin-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    padding-top: 24px;
    height: unset;
    gap: 12px;
}

footer.gh-portal-signin-footer.gh-button-row {
    flex-direction: row-reverse;
}

@media (max-width: 480px) {
    footer.gh-portal-signin-footer.gh-button-row {
        flex-direction: column;
    }
}

.gh-portal-content.signup,
.gh-portal-content.signin {
    max-height: unset !important;
    padding-bottom: 0;
}

.gh-portal-content.signin {
    padding-bottom: 4px;
}

.gh-portal-content.signup .gh-portal-section {
    margin-bottom: 0;
}

.gh-portal-content.signup.single-field {
    margin-bottom: 4px;
}

.gh-portal-content.signup.single-field .gh-portal-input,
.gh-portal-content.signin .gh-portal-input {
    margin-bottom: 12px;
}

.gh-portal-content.signup.single-field + .gh-portal-signup-footer,
footer.gh-portal-signin-footer {
    padding-top: 12px;
}

.gh-portal-content.signin .gh-portal-section {
    margin-bottom: 0;
}

footer.gh-portal-signup-footer.invite-only {
    height: unset;
}

footer.gh-portal-signup-footer.invite-only .gh-portal-signup-message {
    margin-top: 0;
}

.gh-portal-invite-only-notification, .gh-portal-members-disabled-notification, .gh-portal-paid-members-only-notification {
    margin: 8px 32px 24px;
    padding: 0;
    text-align: center;
    color: var(--grey2);
}

.gh-portal-icon-invitation {
    width: 44px;
    height: 44px;
    margin: 12px 0 2px;
}

.gh-portal-popup-wrapper.full-size .gh-portal-popup-container.preview footer.gh-portal-signup-footer {
    padding-bottom: 32px;
}

.gh-portal-invite-only-notification + .gh-portal-signup-message, .gh-portal-paid-members-only-notification + .gh-portal-signup-message {
    margin-bottom: 12px;
}

.gh-portal-free-trial-notification {
    max-width: 480px;
    text-align: center;
    margin: 24px auto;
    color: var(--grey4);
}

.gh-portal-signup-terms-wrapper {
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
}

.signup.single-field .gh-portal-signup-terms-wrapper {
    margin-top: 12px;
}

.signup.single-field .gh-portal-products:not(:has(.gh-portal-product-card)) {
    margin-top: -16px;
}

.gh-portal-signup-terms {
    margin: 0 0 36px;
}

.gh-portal-signup-terms-wrapper.free-only .gh-portal-signup-terms {
    margin: 0 0 24px;
}

.gh-portal-products:has(.gh-portal-product-card) + .gh-portal-signup-terms-wrapper.free-only {
    margin: 20px auto 0 !important;
}

.gh-portal-signup-terms label {
    position: relative;
    display: flex;
    gap: 10px;
    cursor: pointer;
}

.gh-portal-signup-terms input {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: none;
}

.gh-portal-signup-terms .checkbox {
    position: relative;
    top: -1px;
    flex-shrink: 0;
    display: inline-block;
    float: left;
    width: 18px;
    height: 18px;
    margin: 1px 0 0;
    background: var(--white);
    border: 1px solid var(--grey10);
    border-radius: 4px;
    transition: background 0.15s ease-in-out, border-color 0.15s ease-in-out;
}
html[dir=rtl] .gh-portal-signup-terms .checkbox {
    float: right;
}

.gh-portal-signup-terms label:hover input:not(:checked) + .checkbox {
    border-color: var(--grey9);
}

.gh-portal-signup-terms .checkbox:before {
    content: "";
    position: absolute;
    top: 4px;
    left: 3px;
    width: 10px;
    height: 6px;
    border: 2px solid var(--white);
    border-top: none;
    border-right: none;
    opacity: 0;
    transition: opacity 0.15s ease-in-out;
    transform: rotate(-45deg);
}
html[dir=rtl] .gh-portal-signup-terms .checkbox:before {
    left: unset;
    right: 3px;
}

.gh-portal-signup-terms input:checked + .checkbox {
    border-color: var(--black);
    background: var(--black);
}

.gh-portal-signup-terms input:checked + .checkbox:before {
    opacity: 1;
}

.gh-portal-signup-terms.gh-portal-error .checkbox,
.gh-portal-signup-terms.gh-portal-error label:hover input:not(:checked) + .checkbox {
    border: 1px solid var(--red);
    box-shadow: 0 0 0 3px rgb(240, 37, 37, .15);
}

.gh-portal-signup-terms.gh-portal-error input:checked + .checkbox {
    box-shadow: none;
}

.gh-portal-signup-terms-content p {
    margin-bottom: 0;
    color: var(--grey4);
    font-size: 1.4rem;
    line-height: 1.25em;
}

.gh-portal-error .gh-portal-signup-terms-content {
    line-height: 1.5em;
}

.gh-portal-signup-terms-content a {
    color: var(--brandcolor);
    font-weight: 500;
    text-decoration: none;
}

@media (min-width: 480px) {

}

@media (max-width: 480px) {
    .gh-portal-signup-logo {
        width: 48px;
        height: 48px;
    }
}

@media (min-width: 480px) and (max-width: 820px) {
    .gh-portal-powered.outside {
        left: 50%;
        transform: translateX(-50%);
    }
}
`;

/**
 * Configuration for form input fields with their properties.
 * tabIndex is set to 0 for focusable fields and -1 for hidden fields.
 */
const INPUT_FIELD_CONFIG = {
    email: {
        type: 'email',
        name: 'email',
        required: true,
        placeholder: t('jamie@example.com'),
        label: t('Email'),
        tabIndex: 0
    },
    phonenumber: {
        type: 'text',
        name: 'phonenumber',
        required: false,
        placeholder: t('+1 (123) 456-7890'),
        label: t('Phone number'),
        tabIndex: -1,
        autoComplete: 'off',
        hidden: true
    },
    name: {
        type: 'text',
        name: 'name',
        required: true,
        placeholder: t('Jamie Larson'),
        label: t('Name'),
        tabIndex: 0
    }
};

class SignupPage extends React.Component {
    static contextType = AppContext;

    constructor(props) {
        super(props);
        this.state = {
            name: '',
            email: '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };

        this.termsRef = React.createRef();
    }

    componentDidMount() {
        const {member} = this.context;
        if (member) {
            this.context.doAction('switchPage', {
                page: 'accountHome'
            });
        }

        this.handleSelectedPlan();
    }

    componentDidUpdate() {
        this.handleSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    /**
     * Handles the selected plan based on site prices and current state.
     */
    handleSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});

        const selectedPriceId = this.getSelectedPriceId(prices, this.state.plan);
        if (selectedPriceId !== this.state.plan) {
            this.setState({
                plan: selectedPriceId
            });
        }
    }

    /**
     * Retrieves the appropriate price ID based on available plans.
     * @param {Array} prices - Array of available price objects.
     * @param {string} selectedPriceId - Currently selected price ID.
     * @returns {string} The selected or default price ID.
     */
    getSelectedPriceId(prices = [], selectedPriceId) {
        if (!prices || prices.length === 0 || selectedPriceId === 'free') {
            return 'free';
        }
        const hasSelectedPlan = prices.some((p) => {
            return p.id === selectedPriceId;
        });

        if (!hasSelectedPlan) {
            return prices[0].id || 'free';
        }

        return selectedPriceId;
    }

    /**
     * Validates the form and returns error objects.
     * @param {Object} state - Current form state.
     * @returns {Object} Error object with field validation results.
     */
    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    /**
     * Builds the input fields configuration based on current state.
     * @param {Object} options - Options object containing state and field names.
     * @returns {Array} Array of input field configurations.
     */
    getInputFields({state, fieldNames}) {
        const {site: {portal_name: portalName}} = this.context;

        const errors = state.errors || {};
        const fields = [
            {
                ...INPUT_FIELD_CONFIG.email,
                value: state.email,
                errorMessage: errors.email || ''
            },
            {
                ...INPUT_FIELD_CONFIG.phonenumber,
                value: state.phonenumber,
                errorMessage: errors.phonenumber || ''
            }
        ];

        if (portalName) {
            fields.unshift({
                ...INPUT_FIELD_CONFIG.name,
                value: state.name,
                errorMessage: errors.name || ''
            });
        }

        fields[0].autoFocus = true;
        if (fieldNames && fieldNames.length > 0) {
            return fields.filter((f) => {
                return fieldNames.includes(f.name);
            });
        }
        return fields;
    }

    /**
     * Handles form submission by validating and processing signup.
     */
    doSignup() {
        this.setState((state) => {
            return {
                errors: this.getFormErrors(state)
            };
        }, () => {
            const {site, doAction} = this.context;
            const {name, email, plan, phonenumber, token, errors} = this.state;
            const hasFormErrors = (errors && Object.values(errors).filter(d => !!d).length > 0);

            const otherErrors = {...errors};
            delete otherErrors.checkbox;
            const hasOnlyCheckboxError = errors?.checkbox && Object.values(otherErrors).every(error => !error);

            if (hasOnlyCheckboxError && this.termsRef.current) {
                this.termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
            }

            if (!hasFormErrors) {
                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: {name, email, plan, phonenumber, token},
                        errors: {}
                    });
                } else {
                    this.setState({
                        errors: {}
                    });
                    doAction('signup', {name, email, phonenumber, plan, token});
                }
            }
        });
    }

    /**
     * Handles the signup form submit event.
     * @param {Event} e - Submit event.
     */
    handleSignup(e) {
        e.preventDefault();
        this.doSignup();
    }

    /**
     * Handles plan selection and triggers signup.
     * @param {Event} e - Event object.
     * @param {string} plan - Selected plan ID.
     */
    handleChooseSignup(e, plan) {
        e.preventDefault();
        this.setState({plan}, () => {
            this.doSignup();
        });
    }

    /**
     * Handles input field changes.
     * @param {Event} e - Change event.
     * @param {Object} field - Field configuration object.
     */
    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({
            [fieldName]: value
        });
    }

    /**
     * Handles plan selection with a small delay to sync React state.
     * @param {Event} e - Event object.
     * @param {string} priceId - Selected price ID.
     */
    handleSelectPlan = (e, priceId) => {
        e && e.preventDefault();
        this.timeoutId = setTimeout(() => {
            this.setState(() => {
                return {
                    plan: priceId
                };
            });
        }, 5);
    };

    /**
     * Handles keyboard events for form submission.
     * @param {KeyboardEvent} e - Keyboard event.
     */
    onKeyDown(e) {
        if (e.keyCode === 13){
            this.handleSignup(e);
        }
    }

    /**
     * Renders the signup terms checkbox and text.
     * @returns {ReactElement|null} Terms component or null if not configured.
     */
    renderSignupTerms() {
        const {site} = this.context;

        if (site.portal_signup_terms_html === null || site.portal_signup_terms_html === '') {
            return null;
        }

        const handleCheckboxChange = (e) => {
            this.setState({
                termsCheckboxChecked: e.target.checked
            });
        };

        const termsText = (
            <div className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
            ></div>
        );

        const signupTerms = site.portal_signup_checkbox_required ? (
            <label>
                <input
                    type="checkbox"
                    checked={!!this.state.termsCheckboxChecked}
                    required={true}
                    onChange={handleCheckboxChange}
                />
                <span className="checkbox"></span>
                {termsText}
            </label>
        ) : termsText;

        const errorClassName = this.state.errors?.checkbox ? 'gh-portal-error' : '';

        const className = `gh-portal-signup-terms ${errorClassName}`;

        return (
            <div className={className} onClick={interceptAnchorClicks} ref={this.termsRef}>
                {signupTerms}
            </div>
        );
    }

    /**
     * Renders the submit button with appropriate label and state.
     * @returns {ReactElement|null} Submit button or null if not applicable.
     */
    renderSubmitButton() {
        const {action, site, brandColor, pageQuery} = this.context;

        if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
            return null;
        }

        let label = t('Continue');
        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});

        if (hasOnlyFreePlan({site}) || showOnlyFree) {
            label = t('Sign up');
        } else {
            return null;
        }

        let isRunning = false;
        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        }
        let retry = false;
        if (action === 'signup:failed') {
            label = t('Retry');
            retry = true;
        }

        const disabled = (action === 'signup:running') ? true : false;
        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={e => this.handleSignup(e)}
                disabled={disabled}
                brandColor={brandColor}
                label={label}
                isRunning={isRunning}
                tabIndex={0}
            />
        );
    }

    /**
     * Renders the products section for plan selection.
     * @returns {ReactElement} Products section component.
     */
    renderProducts() {
        const {site, pageQuery} = this.context;
        const products = getSiteProducts({site, pageQuery});
        const errors = this.state.errors || {};
        const priceErrors = {};

        if (Object.keys(errors).length > 0 && this.state.plan) {
            priceErrors[this.state.plan] = t('Please fill in required fields');
        }

        return (
            <>
                <ProductsSection
                    handleChooseSignup={(...args) => this.handleChooseSignup(...args)}
                    products={products}
                    onPlanSelect={this.handleSelectPlan}
                    errors={priceErrors}
                />
            </>
        );
    }

    /**
     * Renders the free trial notification message.
     * @returns {ReactElement|null} Free trial notification or null.
     */
    renderFreeTrialMessage() {
        const {site, pageQuery} = this.context;
        if (hasFreeTrialTier({site, pageQuery}) && !isInviteOnly({site}) && hasAvailablePrices({site, pageQuery})) {
            return (
                <p className='gh-portal-free-trial-notification' data-testid="free-trial-notification-text">
                    {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
                </p>
            );
        }
        return null;
    }

    /**
     * Renders the login switch message.
     * @returns {ReactElement} Login message component.
     */
    renderLoginMessage() {
        const {brandColor, doAction} = this.context;
        return (
            <div>
                {this.renderFreeTrialMessage()}
                <div className='gh-portal-signup-message'>
                    <div>{t('Already a member?')}</div>
                    <button
                        data-test-button='signin-switch'
                        data-testid='signin-switch'
                        className='gh-portal-btn gh-portal-btn-link'
                        style={{color: brandColor}}
                        onClick={() => doAction('switchPage', {page: 'signin'})}
                    >
                        <span>{t('Sign in')}</span>
                    </button>
                </div>
            </div>
        );
    }

    /**
     * Renders the main signup form section.
     * @returns {ReactElement} Form section component.
     */
    renderForm() {
        const fields = this.getInputFields({state: this.state});
        const {site, pageQuery} = this.context;

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => {
                        this.setState({
                            showNewsletterSelection: false
                        });
                    }}
                />
            );
        }

        if (isInviteOnly({site})) {
            return this.renderInviteOnlyMessage();
        }

        if (isPaidMembersOnly({site}) && pageQuery === 'free') {
            return this.renderPaidMembersOnlyMessage();
        }

        if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
            if (!isSigninAllowed({site})) {
                return this.renderMembersDisabledMessage();
            }

            return this.renderInviteOnlyMessage();
        }

        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

        const signupTerms = this.renderSignupTerms();

        return (
            <section className="gh-portal-signup">
                <div className='gh-portal-section'>
                    <div className='gh-portal-logged-out-form-container'>
                        <InputForm
                            fields={fields}
                            onChange={(e, field) => this.handleInputChange(e, field)}
                            onKeyDown={e => this.onKeyDown(e)}
                        />
                    </div>
                    <div>
                        {(hasOnlyFree ?
                            <>
                                {this.renderProducts()}
                                {signupTerms &&
                                <div className='gh-portal-signup-terms-wrapper free-only'>
                                    {signupTerms}
                                </div>
                                }
                            </> :
                            <>
                                {signupTerms &&
                                <div className='gh-portal-signup-terms-wrapper'>
                                    {signupTerms}
                                </div>
                                }
                                {this.renderProducts()}
                            </>)}

                        {(hasOnlyFree ?
                            <div className='gh-portal-btn-container'>
                                <div className='gh-portal-logged-out-form-container'>
                                    {this.renderSubmitButton()}
                                    {this.renderLoginMessage()}
                                </div>
                            </div>
                            :
                            this.renderLoginMessage())}
                    </div>
                </div>
            </section>
        );
    }

    /**
     * Renders the paid members only notification.
     * @returns {ReactElement} Paid members notification component.
     */
    renderPaidMembersOnlyMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-paid-members-only-notification'
                        data-testid="paid-members-only-notification-text"
                    >
                        {t('This site only accepts paid members.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    /**
     * Renders the invite only notification.
     * @returns {ReactElement} Invite only notification component.
     */
    renderInviteOnlyMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-invite-only-notification'
                        data-testid="invite-only-notification-text"
                    >
                        {t('This site is invite-only, contact the owner for access.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    /**
     * Renders the members disabled notification.
     * @returns {ReactElement} Members disabled notification component.
     */
    renderMembersDisabledMessage() {
        return (
            <section>
                <div className='gh-portal-section'>
                    <p
                        className='gh-portal-members-disabled-notification'
                        data-testid="members-disabled-notification-text"
                    >
                        {t('Memberships unavailable, contact the owner for access.')}
                    </p>
                </div>
            </section>
        );
    }

    /**
     * Renders the site icon or invitation icon based on site configuration.
     * @returns {ReactElement|null} Site icon or invitation icon.
     */
    renderSiteIcon() {
        const {site, pageQuery} = this.context;
        const siteIcon = site.icon;

        if (siteIcon) {
            return (
                <img className='gh-portal-signup-logo' src={siteIcon} alt={site.title} />
            );
        }

        if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
            return (
                <InvitationIcon className='gh-portal-icon gh-portal-icon-invitation' />
            );
        }

        return null;
    }

    /**
     * Renders the form header with site title and icon.
     * @returns {ReactElement} Form header component.
     */
    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid='site-title-text'>{siteTitle}</h1>
            </header>
        );
    }

    /**
     * Determines the appropriate CSS class names for the section and footer.
     * @returns {Object} Object containing sectionClass and footerClass.
     */
    getClassNames() {
        const {site, pageQuery} = this.context;
        const plansData = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});
        let sectionClass = '';
        let footerClass = '';

        if (plansData.length <= 1 || isInviteOnly({site})) {
            if ((plansData.length === 1 && plansData[0].type === 'free') || isInviteOnly({site, pageQuery})) {
                sectionClass = freeHasBenefitsOrDescription({site}) ? 'singleplan' : 'noplan';
                if (fields.length === 1) {
                    sectionClass = 'single-field';
                }
                if (isInviteOnly({site})) {
                    footerClass = 'invite-only';
                    sectionClass = 'invite-only';
                }
            } else {
                sectionClass = 'singleplan';
            }
        }

        return {sectionClass, footerClass};
    }

    /**
     * Renders the main component with header, form, and navigation.
     * @returns {ReactElement} Complete signup page component.
     */
    render() {
        let {sectionClass} = this.getClassNames();
        return (
            <>
                <div className='gh-portal-back-sitetitle'>
                    <SiteTitleBackButton
                        onBack={() => {
                            if (this.state.showNewsletterSelection) {
                                this.setState({
                                    showNewsletterSelection: false
                                });
                            } else {
                                this.context.doAction('closePopup');
                            }
                        }}
                    />
                </div>
                <CloseButton />
                <div className={'gh-portal-content signup ' + sectionClass}>
                    {this.renderFormHeader()}
                    {this.renderForm()}
                </div>
            </>
        );
    }
}

export default SignupPage;
```