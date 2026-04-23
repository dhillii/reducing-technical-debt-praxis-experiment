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

export const SignupPageStyles = `
/* ... (styles unchanged) ... */
`;

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

    /* ---------- Helper methods for plan handling ---------- */
    handleSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const selectedPriceId = this.getSelectedPriceId(prices, this.state.plan);
        if (selectedPriceId !== this.state.plan) {
            this.setState({plan: selectedPriceId});
        }
    }

    getSelectedPriceId(prices = [], selectedPriceId) {
        if (!prices?.length || selectedPriceId === 'free') {
            return 'free';
        }
        const hasSelectedPlan = prices.some(p => p.id === selectedPriceId);
        if (!hasSelectedPlan) {
            return prices[0].id || 'free';
        }
        return selectedPriceId;
    }

    /* ---------- Validation ---------- */
    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    /* ---------- Signup flow ---------- */
    doSignup() {
        this.setState(state => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {site, doAction} = this.context;
            const {name, email, plan, phonenumber, token, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(Boolean);
            const otherErrors = {...errors};
            delete otherErrors.checkbox;
            const hasOnlyCheckboxError = errors?.checkbox && Object.values(otherErrors).every(Boolean === false);

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
        e?.preventDefault();
        this.timeoutId = setTimeout(() => {
            this.setState({plan: priceId});
        }, 5);
    };

    onKeyDown(e) {
        if (e.key === 'Enter') {
            this.handleSignup(e);
        }
    }

    /* ---------- Input fields ---------- */
    getInputFields({state, fieldNames}) {
        const {site: {portal_name: portalName}} = this.context;
        const errors = state.errors || {};

        const baseFields = [
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
            baseFields.unshift({
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

        baseFields[0].autoFocus = true;

        if (fieldNames?.length) {
            return baseFields.filter(f => fieldNames.includes(f.name));
        }
        return baseFields;
    }

    /* ---------- Render helpers ---------- */
    renderSignupTerms() {
        const {site} = this.context;
        if (!site.portal_signup_terms_html) {
            return null;
        }

        const handleCheckboxChange = e => {
            this.setState({termsCheckboxChecked: e.target.checked});
        };

        const termsContent = (
            <div
                className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(site.portal_signup_terms_html)}}
            />
        );

        const signupTerms = site.portal_signup_checkbox_required ? (
            <label>
                <input
                    type="checkbox"
                    checked={!!this.state.termsCheckboxChecked}
                    required
                    onChange={handleCheckboxChange}
                />
                <span className="checkbox" />
                {termsContent}
            </label>
        ) : (
            termsContent
        );

        const errorClass = this.state.errors?.checkbox ? 'gh-portal-error' : '';
        const className = `gh-portal-signup-terms ${errorClass}`;

        return (
            <div className={className} onClick={interceptAnchorClicks} ref={this.termsRef}>
                {signupTerms}
            </div>
        );
    }

    renderSubmitButton() {
        const {action, site, brandColor, pageQuery} = this.context;
        if (isInviteOnly({site}) || !hasAvailablePrices({site, pageQuery})) {
            return null;
        }

        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        if (!hasOnlyFreePlan({site}) && !showOnlyFree) {
            return null;
        }

        let label = t('Continue');
        if (hasOnlyFreePlan({site}) || showOnlyFree) {
            label = t('Sign up');
        }

        let isRunning = false;
        let retry = false;
        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        } else if (action === 'signup:failed') {
            label = t('Retry');
            retry = true;
        }

        const disabled = action === 'signup:running';

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

    renderProducts() {
        const {site, pageQuery} = this.context;
        const products = getSiteProducts({site, pageQuery});
        const errors = this.state.errors || {};
        const priceErrors = {};

        if (Object.keys(errors).length && this.state.plan) {
            priceErrors[this.state.plan] = t('Please fill in required fields');
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

    renderFreeTrialMessage() {
        const {site, pageQuery} = this.context;
        if (hasFreeTrialTier({site, pageQuery}) && !isInviteOnly({site}) && hasAvailablePrices({site, pageQuery})) {
            return (
                <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
                    {t('After a free trial ends, you will be charged the regular price for the tier you\'ve chosen. You can always cancel before then.')}
                </p>
            );
        }
        return null;
    }

    renderLoginMessage() {
        const {brandColor, doAction} = this.context;
        return (
            <div>
                {this.renderFreeTrialMessage()}
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

    renderPaidMembersOnlyMessage() {
        return (
            <section>
                <div className="gh-portal-section">
                    <p
                        className="gh-portal-paid-members-only-notification"
                        data-testid="paid-members-only-notification-text"
                    >
                        {t('This site only accepts paid members.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    renderInviteOnlyMessage() {
        return (
            <section>
                <div className="gh-portal-section">
                    <p
                        className="gh-portal-invite-only-notification"
                        data-testid="invite-only-notification-text"
                    >
                        {t('This site is invite-only, contact the owner for access.')}
                    </p>
                    {this.renderLoginMessage()}
                </div>
            </section>
        );
    }

    renderMembersDisabledMessage() {
        return (
            <section>
                <div className="gh-portal-section">
                    <p
                        className="gh-portal-members-disabled-notification"
                        data-testid="members-disabled-notification-text"
                    >
                        {t('Memberships unavailable, contact the owner for access.')}
                    </p>
                </div>
            </section>
        );
    }

    renderSiteIcon() {
        const {site, pageQuery} = this.context;
        if (site.icon) {
            return <img className="gh-portal-signup-logo" src={site.icon} alt={site.title} />;
        }
        if (!hasAvailablePrices({site, pageQuery}) || isInviteOnly({site}) || !isSignupAllowed({site})) {
            return <InvitationIcon className="gh-portal-icon gh-portal-icon-invitation" />;
        }
        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid="site-title-text">{siteTitle}</h1>
            </header>
        );
    }

    /* ---------- Decision helpers for renderForm ---------- */
    shouldShowNewsletterSelection() {
        return this.state.showNewsletterSelection;
    }

    shouldRenderInviteOnlyMessage() {
        return isInviteOnly({site: this.context.site});
    }

    shouldRenderPaidMembersOnlyMessage() {
        const {site, pageQuery} = this.context;
        return isPaidMembersOnly({site}) && pageQuery === 'free';
    }

    shouldRenderMembersDisabledMessage() {
        const {site} = this.context;
        return !isSignupAllowed({site}) && !isSigninAllowed({site});
    }

    shouldRenderSignupForm() {
        const {site, pageQuery} = this.context;
        return isSignupAllowed({site}) && hasAvailablePrices({site, pageQuery});
    }

    renderForm() {
        const {site, pageQuery} = this.context;

        if (this.shouldShowNewsletterSelection()) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        if (this.shouldRenderInviteOnlyMessage()) {
            return this.renderInviteOnlyMessage();
        }

        if (this.shouldRenderPaidMembersOnlyMessage()) {
            return this.renderPaidMembersOnlyMessage();
        }

        if (this.shouldRenderMembersDisabledMessage()) {
            return this.renderMembersDisabledMessage();
        }

        if (!this.shouldRenderSignupForm()) {
            return this.renderInviteOnlyMessage();
        }

        const fields = this.getInputFields({state: this.state});
        const signupTerms = this.renderSignupTerms();
        const showOnlyFree = pageQuery === 'free' && isFreeSignupAllowed({site});
        const hasOnlyFree = hasOnlyFreePlan({site}) || showOnlyFree;

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
                                    <div className="gh-portal-signup-terms-wrapper free-only">
                                        {signupTerms}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {signupTerms && (
                                    <div className="gh-portal-signup-terms-wrapper">
                                        {signupTerms}
                                    </div>
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

    /* ---------- Class name calculation ---------- */
    getClassNames() {
        const {site, pageQuery} = this.context;
        const plansData = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});
        let sectionClass = '';
        let footerClass = '';

        const singlePlanOrInvite = plansData.length <= 1 || isInviteOnly({site});
        if (singlePlanOrInvite) {
            const isFreeOnly = plansData.length === 1 && plansData[0].type === 'free';
            if (isFreeOnly || isInviteOnly({site, pageQuery})) {
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
                <div className={`gh-portal-content signup ${sectionClass}`}>
                    {this.renderFormHeader()}
                    {this.renderForm()}
                </div>
            </>
        );
    }
}

export default SignupPage;