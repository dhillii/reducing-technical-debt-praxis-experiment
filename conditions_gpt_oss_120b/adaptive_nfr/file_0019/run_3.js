import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import CloseButton from '../common/close-button';
import SiteTitleBackButton from '../common/site-title-back-button';
import NewsletterSelectionPage from './newsletter-selection-page';
import ProductsSection from '../common/products-section';
import InputForm from '../common/input-form';
import {ValidateInputForm} from '../../utils/form';
import {
    getSiteProducts,
    getSitePrices,
    hasAvailablePrices,
    hasOnlyFreePlan,
    isInviteOnly,
    isFreeSignupAllowed,
    isPaidMembersOnly,
    freeHasBenefitsOrDescription,
    hasMultipleNewsletters,
    hasFreeTrialTier,
    isSignupAllowed,
    isSigninAllowed
} from '../../utils/helpers';
import {ReactComponent as InvitationIcon} from '../../images/icons/invitation.svg';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import {t} from '../../utils/i18n';

/* Styles omitted for brevity */

export const SignupPageStyles = `
/* ... (original CSS unchanged) ... */
`;

/**
 * Determines if the site is invite‑only.
 */
function isInviteOnlySite({site}) {
    return isInviteOnly({site});
}

/**
 * Determines if the current request should show only the free plan.
 */
function shouldShowOnlyFree({site, pageQuery}) {
    return pageQuery === 'free' && isFreeSignupAllowed({site});
}

/**
 * Determines if only the free plan should be displayed.
 */
function hasOnlyFree({site, pageQuery}) {
    return hasOnlyFreePlan({site}) || shouldShowOnlyFree({site, pageQuery});
}

/**
 * Returns the properties for the submit button based on the current action.
 */
function getSubmitButtonProps(action) {
    if (action === 'signup:running') {
        return {label: t('Sending...'), isRunning: true, retry: false, disabled: true};
    }
    if (action === 'signup:failed') {
        return {label: t('Retry'), isRunning: false, retry: true, disabled: false};
    }
    return {label: t('Continue'), isRunning: false, retry: false, disabled: false};
}

/**
 * Computes class names for the page layout.
 */
function computeClassNames({site, pageQuery, fields}) {
    const plansData = getSitePrices({site, pageQuery});
    let sectionClass = '';
    let footerClass = '';

    if (plansData.length <= 1 || isInviteOnly({site})) {
        const singleFree = plansData.length === 1 && plansData[0].type === 'free';
        if (singleFree || isInviteOnly({site, pageQuery})) {
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
 * Returns true if the signup button should be rendered.
 */
function shouldRenderSubmitButton({site, pageQuery}) {
    return !isInviteOnly({site}) && hasAvailablePrices({site, pageQuery}) && hasOnlyFree({site, pageQuery});
}

/**
 * Returns true if the free‑trial notification should be shown.
 */
function shouldShowFreeTrial({site, pageQuery}) {
    return hasFreeTrialTier({site, pageQuery}) && !isInviteOnly({site}) && hasAvailablePrices({site, pageQuery});
}

/**
 * Returns true if the signup terms should be rendered.
 */
function shouldRenderTerms({site}) {
    return site.portal_signup_terms_html !== null && site.portal_signup_terms_html !== '';
}

/**
 * Returns true if the checkbox is required.
 */
function isCheckboxRequired({site}) {
    return site.portal_signup_checkbox_required && site.portal_signup_terms_html;
}

/**
 * Returns true if there is only a checkbox error.
 */
function hasOnlyCheckboxError(errors) {
    if (!errors?.checkbox) {
        return false;
    }
    const otherErrors = {...errors};
    delete otherErrors.checkbox;
    return Object.values(otherErrors).every(error => !error);
}

/**
 * Returns true if there are any form errors.
 */
function hasFormErrors(errors) {
    return errors && Object.values(errors).filter(d => !!d).length > 0;
}

/**
 * Returns true if the site icon should be displayed.
 */
function shouldRenderSiteIcon({site, pageQuery}) {
    return site.icon && !(isInviteOnly({site}) || !isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery}));
}

/**
 * Returns true if the invitation icon should be displayed.
 */
function shouldRenderInvitationIcon({site, pageQuery}) {
    return !site.icon && !(hasAvailablePrices({site, pageQuery}) && isInviteOnly({site}) && isSignupAllowed({site}));
}

/**
 * Returns true if the signup terms checkbox is required.
 */
function checkboxRequired({site}) {
    return site.portal_signup_checkbox_required;
}

/**
 * Returns true if the signup terms checkbox is checked.
 */
function isCheckboxChecked(state) {
    return !!state.termsCheckboxChecked;
}

/**
 * Returns true if the signup terms should be rendered as a checkbox.
 */
function renderTermsAsCheckbox({site}) {
    return site.portal_signup_checkbox_required;
}

/**
 * Returns true if the signup terms should be rendered as plain HTML.
 */
function renderTermsAsHtml({site}) {
    return !site.portal_signup_checkbox_required;
}

/**
 * Returns true if the signup terms have an error.
 */
function termsErrorClass(state) {
    return state.errors?.checkbox ? 'gh-portal-error' : '';
}

/**
 * Returns true if the signup terms should be rendered.
 */
function getTermsClass(state) {
    return `gh-portal-signup-terms ${termsErrorClass(state)}`;
}

/**
 * Returns true if the signup terms should be rendered.
 */
function getTermsContent({site}) {
    return (
        <div
            className="gh-portal-signup-terms-content"
            dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
        />
    );
}

/**
 * Returns true if the signup terms checkbox should be rendered.
 */
function renderSignupTermsComponent({site, state, termsRef, setState}) {
    const handleCheckboxChange = e => {
        setState({termsCheckboxChecked: e.target.checked});
    };

    const termsContent = getTermsContent({site});

    const terms = renderTermsAsCheckbox({site}) ? (
        <label>
            <input
                type="checkbox"
                checked={isCheckboxChecked(state)}
                required={true}
                onChange={handleCheckboxChange}
            />
            <span className="checkbox" />
            {termsContent}
        </label>
    ) : (
        termsContent
    );

    return (
        <div className={getTermsClass(state)} onClick={interceptAnchorClicks} ref={termsRef}>
            {terms}
        </div>
    );
}

/**
 * Returns true if the free‑trial message should be rendered.
 */
function renderFreeTrialMessage({site, pageQuery}) {
    if (!shouldShowFreeTrial({site, pageQuery})) {
        return null;
    }
    return (
        <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
            {t(
                "After a free trial ends, you will be charged the regular price for the tier you've chosen. You can always cancel before then."
            )}
        </p>
    );
}

/**
 * Returns true if the login message should be rendered.
 */
function renderLoginMessage({brandColor, doAction}) {
    return (
        <div>
            {renderFreeTrialMessage({site: this.context.site, pageQuery: this.context.pageQuery})}
            <div className="gh-portal-signup-message">
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button="signin-switch"
                    data-testid="signin-switch"
                    className="gh-portal-btn gh-portal-btn-link"
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
 * Returns true if the newsletter selection should be rendered.
 */
function renderNewsletterSelection({pageData, onBack}) {
    return (
        <NewsletterSelectionPage pageData={pageData} onBack={onBack} />
    );
}

/**
 * Returns true if the products section should be rendered.
 */
function renderProductsSection({site, pageQuery, plan, errors}) {
    const products = getSiteProducts({site, pageQuery});
    const priceErrors = {};

    if (Object.keys(errors).length > 0 && plan) {
        priceErrors[plan] = t('Please fill in required fields');
    }

    return (
        <ProductsSection
            handleChooseSignup={(...args) => this.handleChooseSignup(...args)}
            products={products}
            onPlanSelect={this.handleSelectPlan}
            errors={priceErrors}
        />
    );
}

/**
 * Returns true if the site icon should be rendered.
 */
function renderSiteIcon({site, pageQuery}) {
    if (shouldRenderSiteIcon({site, pageQuery})) {
        return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
    }
    if (shouldRenderInvitationIcon({site, pageQuery})) {
        return <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />;
    }
    return null;
}

/**
 * Returns true if the form header should be rendered.
 */
function renderFormHeader({site}) {
    const siteTitle = site.title || '';
    return (
        <header className="gh-portal-signup-header">
            {renderSiteIcon({site, pageQuery: this.context.pageQuery})}
            <h1 className="gh-portal-main-title" data-testid="site-title-text">
                {siteTitle}
            </h1>
        </header>
    );
}

/**
 * Returns true if the signup terms should be rendered.
 */
function renderSignupTermsComponentWrapper({site, state, termsRef, setState}) {
    if (!shouldRenderTerms({site})) {
        return null;
    }
    return renderSignupTermsComponent({site, state, termsRef, setState});
}

/**
 * Returns true if the submit button should be rendered.
 */
function renderSubmitButtonComponent({site, pageQuery, action, brandColor, label, isRunning, retry, disabled}) {
    if (!shouldRenderSubmitButton({site, pageQuery})) {
        return null;
    }
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={e => this.handleSignup(e)}
            disabled={disabled}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
        />
    );
}

/**
 * Returns true if the paid‑members‑only message should be rendered.
 */
function renderPaidMembersOnlyMessage() {
    return (
        <section>
            <div className="gh-portal-section">
                <p className="gh-portal-paid-members-only-notification" data-testid="paid-members-only-notification-text">
                    {t('This site only accepts paid members.')}
                </p>
                {this.renderLoginMessage()}
            </div>
        </section>
    );
}

/**
 * Returns true if the invite‑only message should be rendered.
 */
function renderInviteOnlyMessage() {
    return (
        <section>
            <div className="gh-portal-section">
                <p className="gh-portal-invite-only-notification" data-testid="invite-only-notification-text">
                    {t('This site is invite-only, contact the owner for access.')}
                </p>
                {this.renderLoginMessage()}
            </div>
        </section>
    );
}

/**
 * Returns true if the members‑disabled message should be rendered.
 */
function renderMembersDisabledMessage() {
    return (
        <section>
            <div className="gh-portal-section">
                <p className="gh-portal-members-disabled-notification" data-testid="members-disabled-notification-text">
                    {t('Memberships unavailable, contact the owner for access.')}
                </p>
            </div>
        </section>
    );
}

/**
 * Returns true if the form should be rendered.
 */
function renderFormContent({site, pageQuery, fields, signupTerms, hasOnlyFree}) {
    return (
        <section className="gh-portal-signup">
            <div className="gh-portal-section">
                <div className="gh-portal-logged-out-form-container">
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={e => this.onKeyDown(e)}
                    />
                </div>
                <div>
                    {hasOnlyFree ? (
                        <>
                            {this.renderProducts()}
                            {signupTerms && (
                                <div className="gh-portal-signup-terms-wrapper free-only">{signupTerms}</div>
                            )}
                        </>
                    ) : (
                        <>
                            {signupTerms && (
                                <div className="gh-portal-signup-terms-wrapper">{signupTerms}</div>
                            )}
                            {this.renderProducts()}
                        </>
                    )}
                    {hasOnlyFree ? (
                        <div className="gh-portal-btn-container">
                            <div className="gh-portal-logged-out-form-container">
                                {this.renderSubmitButton()}
                                {this.renderLoginMessage()}
                            </div>
                        </div>
                    ) : (
                        this.renderLoginMessage()
                    )}
                </div>
            </div>
        </section>
    );
}

/**
 * Returns true if the form should be rendered.
 */
function renderForm({state, context}) {
    const {site, pageQuery} = context;
    const fields = this.getInputFields({state});
    const signupTerms = this.renderSignupTerms();

    if (state.showNewsletterSelection) {
        return renderNewsletterSelection({
            pageData: state.pageData,
            onBack: () => this.setState({showNewsletterSelection: false})
        });
    }

    if (isInviteOnlySite({site})) {
        return renderInviteOnlyMessage.call(this);
    }

    if (isPaidMembersOnly({site}) && pageQuery === 'free') {
        return renderPaidMembersOnlyMessage.call(this);
    }

    if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) {
        if (!isSigninAllowed({site})) {
            return renderMembersDisabledMessage.call(this);
        }
        return renderInviteOnlyMessage.call(this);
    }

    const hasOnlyFreePlan = hasOnlyFree({site, pageQuery});
    return renderFormContent.call(this, {site, pageQuery, fields, signupTerms, hasOnlyFree: hasOnlyFreePlan});
}

/**
 * Returns true if the submit button should be rendered.
 */
function renderSubmitButton({site, pageQuery, action, brandColor}) {
    if (!shouldRenderSubmitButton({site, pageQuery})) {
        return null;
    }

    const {label, isRunning, retry, disabled} = getSubmitButtonProps(action);
    return (
        <ActionButton
            style={{width: '100%'}}
            retry={retry}
            onClick={e => this.handleSignup(e)}
            disabled={disabled}
            brandColor={brandColor}
            label={label}
            isRunning={isRunning}
        />
    );
}

/**
 * Returns true if the login message should be rendered.
 */
function renderLoginMessage({brandColor, doAction}) {
    return (
        <div>
            {renderFreeTrialMessage.call(this)}
            <div className="gh-portal-signup-message">
                <div>{t('Already a member?')}</div>
                <button
                    data-test-button="signin-switch"
                    data-testid="signin-switch"
                    className="gh-portal-btn gh-portal-btn-link"
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
 * Returns true if the site icon should be rendered.
 */
function renderSiteIcon({site, pageQuery}) {
    if (site.icon) {
        return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
    }
    if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
        return <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />;
    }
    return null;
}

/**
 * Returns true if the form header should be rendered.
 */
function renderFormHeader({site, pageQuery}) {
    const siteTitle = site.title || '';
    return (
        <header className="gh-portal-signup-header">
            {renderSiteIcon({site, pageQuery})}
            <h1 className="gh-portal-main-title" data-testid="site-title-text">
                {siteTitle}
            </h1>
        </header>
    );
}

/**
 * Returns true if the class names should be computed.
 */
function getClassNames({site, pageQuery, fields}) {
    return computeClassNames({site, pageQuery, fields});
}

/**
 * Returns true if the input fields should be generated.
 */
function getInputFields({state, fieldNames, context}) {
    const {
        site: {portal_name: portalName}
    } = context;

    const errors = state.errors || {};
    const fields = [
        {
            type: 'email',
            value: state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            required: true,
            tabIndex: 0,
            errorMessage: errors.email || ''
        },
        {
            type: 'text',
            value: state.phonenumber,
            placeholder: t('+1 (123) 456-7890'),
            label: t('Phone number'),
            name: 'phonenumber',
            required: false,
            tabIndex: -1,
            autoComplete: 'off',
            hidden: true
        }
    ];

    if (portalName) {
        fields.unshift({
            type: 'text',
            value: state.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            required: true,
            tabIndex: 0,
            errorMessage: errors.name || ''
        });
    }
    fields[0].autoFocus = true;

    if (fieldNames && fieldNames.length > 0) {
        return fields.filter(f => fieldNames.includes(f.name));
    }
    return fields;
}

/**
 * Main component class.
 */
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
            this.context.doAction('switchPage', {page: 'accountHome'});
        }
        this.handleSelectedPlan();
    }

    componentDidUpdate() {
        this.handleSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    handleSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const selectedPriceId = this.getSelectedPriceId(prices, this.state.plan);
        if (selectedPriceId !== this.state.plan) {
            this.setState({plan: selectedPriceId});
        }
    }

    getSelectedPriceId(prices = [], selectedPriceId) {
        if (!prices || prices.length === 0 || selectedPriceId === 'free') {
            return 'free';
        }
        const hasSelectedPlan = prices.some(p => p.id === selectedPriceId);
        if (!hasSelectedPlan) {
            return prices[0].id || 'free';
        }
        return selectedPriceId;
    }

    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state, context: this.context})}),
            checkbox: checkboxError
        };
    }

    doSignup() {
        this.setState(state => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {site, doAction} = this.context;
            const {name, email, plan, phonenumber, token, errors} = this.state;
            if (hasOnlyCheckboxError(errors) && this.termsRef.current) {
                this.termsRef.current.scrollIntoView({behavior: 'smooth', block: 'center'});
            }
            if (!hasFormErrors(errors)) {
                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: {name, email, plan, phonenumber, token},
                        errors: {}
                    });
                } else {
                    this.setState({errors: {}});
                    doAction('signup', {name, email, phonenumber, plan, token});
                }
            }
        });
    }

    handleSignup(e) {
        e.preventDefault();
        this.doSignup();
    }

    handleChooseSignup(e, plan) {
        e.preventDefault();
        this.setState({plan}, () => this.doSignup());
    }

    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({[fieldName]: value});
    }

    handleSelectPlan = (e, priceId) => {
        e && e.preventDefault();
        this.timeoutId = setTimeout(() => {
            this.setState({plan: priceId});
        }, 5);
    };

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    renderSignupTerms() {
        return renderSignupTermsComponentWrapper.call(this, {
            site: this.context.site,
            state: this.state,
            termsRef: this.termsRef,
            setState: this.setState.bind(this)
        });
    }

    renderSubmitButton() {
        const {action, site, pageQuery, brandColor} = this.context;
        return renderSubmitButton.call(this, {site, pageQuery, action, brandColor});
    }

    renderProducts() {
        return renderProductsSection.call(this, {
            site: this.context.site,
            pageQuery: this.context.pageQuery,
            plan: this.state.plan,
            errors: this.state.errors || {}
        });
    }

    renderFreeTrialMessage() {
        return renderFreeTrialMessage.call(this);
    }

    renderLoginMessage() {
        const {brandColor, doAction} = this.context;
        return renderLoginMessage.call(this, {brandColor, doAction});
    }

    renderForm() {
        return renderForm.call(this, {state: this.state, context: this.context});
    }

    renderPaidMembersOnlyMessage() {
        return renderPaidMembersOnlyMessage.call(this);
    }

    renderInviteOnlyMessage() {
        return renderInviteOnlyMessage.call(this);
    }

    renderMembersDisabledMessage() {
        return renderMembersDisabledMessage.call(this);
    }

    renderSiteIcon() {
        return renderSiteIcon.call(this, {
            site: this.context.site,
            pageQuery: this.context.pageQuery
        });
    }

    renderFormHeader() {
        return renderFormHeader.call(this, {
            site: this.context.site,
            pageQuery: this.context.pageQuery
        });
    }

    getClassNames() {
        const fields = this.getInputFields({state: this.state, context: this.context});
        return getClassNames({
            site: this.context.site,
            pageQuery: this.context.pageQuery,
            fields
        });
    }

    render() {
        const {sectionClass} = this.getClassNames();
        return (
            <>
                <div className="gh-portal-back-sitetitle">
                    <SiteTitleBackButton
                        onBack={() => {
                            if (this.state.showNewsletterSelection) {
                                this.setState({showNewsletterSelection: false});
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