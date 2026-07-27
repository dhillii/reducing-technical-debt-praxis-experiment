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
/* ...styles omitted for brevity... */
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
        this.updateSelectedPlan();
    }

    componentDidUpdate() {
        this.updateSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    /** Update plan based on available prices */
    updateSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const selectedId = this.getSelectedPriceId(prices, this.state.plan);
        if (selectedId !== this.state.plan) {
            this.setState({plan: selectedId});
        }
    }

    /** Determine the appropriate price id */
    getSelectedPriceId(prices = [], selectedId) {
        if (!prices.length || selectedId === 'free') {
            return 'free';
        }
        const exists = prices.some(p => p.id === selectedId);
        return exists ? selectedId : prices[0].id || 'free';
    }

    /** Validate form fields and checkbox */
    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    /** Perform signup flow */
    doSignup() {
        this.setState(state => ({errors: this.getFormErrors(state)}), () => {
            const {site, doAction} = this.context;
            const {name, email, plan, phonenumber, token, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(Boolean);
            const otherErrors = {...errors};
            delete otherErrors.checkbox;
            const hasOnlyCheckboxError = errors?.checkbox && Object.values(otherErrors).every(e => !e);

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
        const {name} = field;
        this.setState({[name]: e.target.value});
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

    /** Build input field definitions */
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

        if (fieldNames && fieldNames.length) {
            return baseFields.filter(f => fieldNames.includes(f.name));
        }
        return baseFields;
    }

    /** Render terms and conditions block */
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

        const termsElement = site.portal_signup_checkbox_required ? (
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
                {termsElement}
            </div>
        );
    }

    /** Render the primary submit button */
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
        let isRunning = false;
        let retry = false;

        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        } else if (action === 'signup:failed') {
            label = t('Retry');
            retry = true;
        } else if (hasOnlyFreePlan({site}) || showOnlyFree) {
            label = t('Sign up');
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

    /** Render product selection section */
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

    /** Render free trial notification */
    renderFreeTrialMessage() {
        const {site, pageQuery} = this.context;
        if (hasFreeTrialTier({site, pageQuery}) && !isInviteOnly({site}) && hasAvailablePrices({site, pageQuery})) {
            return (
                <p className="gh-portal-free-trial-notification" data-testid="free-trial-notification-text">
                    {t(
                        "After a free trial ends, you will be charged the regular price for the tier you've chosen. You can always cancel before then."
                    )}
                </p>
            );
        }
        return null;
    }

    /** Render login prompt */
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

    /** Determine if signup form should be displayed */
    shouldShowForm() {
        const {site, pageQuery} = this.context;
        if (isInviteOnly({site})) return false;
        if (isPaidMembersOnly({site}) && pageQuery === 'free') return false;
        if (!isSignupAllowed({site}) || !hasAvailablePrices({site, pageQuery})) return false;
        return true;
    }

    /** Render the main form content */
    renderFormContent() {
        const fields = this.getInputFields({state: this.state});
        const signupTerms = this.renderSignupTerms();

        return (
            <>
                <InputForm
                    fields={fields}
                    onChange={(e, field) => this.handleInputChange(e, field)}
                    onKeyDown={e => this.onKeyDown(e)}
                />
                {signupTerms && (
                    <div className="gh-portal-signup-terms-wrapper">
                        {signupTerms}
                    </div>
                )}
                {this.renderProducts()}
            </>
        );
    }

    /** Render the complete form handling all edge cases */
    renderForm() {
        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        if (!this.shouldShowForm()) {
            if (isInviteOnly({site: this.context.site})) {
                return this.renderInviteOnlyMessage();
            }
            if (isPaidMembersOnly({site: this.context.site}) && this.context.pageQuery === 'free') {
                return this.renderPaidMembersOnlyMessage();
            }
            if (!isSigninAllowed({site: this.context.site})) {
                return this.renderMembersDisabledMessage();
            }
            return this.renderInviteOnlyMessage();
        }

        const showOnlyFree = this.context.pageQuery === 'free' && isFreeSignupAllowed({site: this.context.site});
        const hasOnlyFree = hasOnlyFreePlan({site: this.context.site}) || showOnlyFree;

        return (
            <section className="gh-portal-signup">
                <div className="gh-portal-section">
                    <div className="gh-portal-logged-out-form-container">{this.renderFormContent()}</div>
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
            </section>
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
        const title = site.title || '';
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteIcon()}
                <h1 className="gh-portal-main-title" data-testid="site-title-text">
                    {title}
                </h1>
            </header>
        );
    }

    /** Compute CSS class names based on site configuration */
    getClassNames() {
        const {site, pageQuery} = this.context;
        const plans = getSitePrices({site, pageQuery});
        const fields = this.getInputFields({state: this.state});
        let sectionClass = '';
        let footerClass = '';

        if (plans.length <= 1 || isInviteOnly({site})) {
            if ((plans.length === 1 && plans[0].type === 'free') || isInviteOnly({site, pageQuery})) {
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