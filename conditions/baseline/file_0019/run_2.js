```jsx
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

const INITIAL_STATE = {
    name: '',
    email: '',
    plan: 'free',
    showNewsletterSelection: false,
    termsCheckboxChecked: false
};

const NOTIFICATION_CONFIGS = {
    inviteOnly: {
        className: 'gh-portal-invite-only-notification',
        testId: 'invite-only-notification-text',
        message: t('This site is invite-only, contact the owner for access.')
    },
    paidMembersOnly: {
        className: 'gh-portal-paid-members-only-notification',
        testId: 'paid-members-only-notification-text',
        message: t('This site only accepts paid members.')
    },
    membersDisabled: {
        className: 'gh-portal-members-disabled-notification',
        testId: 'members-disabled-notification-text',
        message: t('Memberships unavailable, contact the owner for access.')
    }
};

class SignupPage extends React.Component {
    static contextType = AppContext;

    constructor(props) {
        super(props);
        this.state = {...INITIAL_STATE};
        this.termsRef = React.createRef();
        this.handleSelectPlan = this.handleSelectPlan.bind(this);
    }

    // -------------------------
    // Lifecycle
    // -------------------------

    componentDidMount() {
        const {member} = this.context;
        if (member) {
            this.context.doAction('switchPage', {page: 'accountHome'});
        }
        this.syncSelectedPlan();
    }

    componentDidUpdate() {
        this.syncSelectedPlan();
    }

    componentWillUnmount() {
        clearTimeout(this.timeoutId);
    }

    // -------------------------
    // Plan helpers
    // -------------------------

    syncSelectedPlan() {
        const {site, pageQuery} = this.context;
        const prices = getSitePrices({site, pageQuery});
        const selectedPriceId = this.resolveSelectedPriceId(prices, this.state.plan);

        if (selectedPriceId !== this.state.plan) {
            this.setState({plan: selectedPriceId});
        }
    }

    resolveSelectedPriceId(prices = [], selectedPriceId) {
        if (!prices.length || selectedPriceId === 'free') {
            return 'free';
        }
        const isValid = prices.some(p => p.id === selectedPriceId);
        return isValid ? selectedPriceId : (prices[0].id || 'free');
    }

    // -------------------------
    // Form helpers
    // -------------------------

    getFormErrors(state) {
        const {site} = this.context;
        const checkboxRequired = site.portal_signup_checkbox_required && site.portal_signup_terms_html;
        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxRequired && !state.termsCheckboxChecked
        };
    }

    getInputFields({state, fieldNames} = {}) {
        const {site: {portal_name: portalName}} = this.context;
        const errors = state?.errors || {};

        const fields = [
            {
                type: 'email',
                value: state?.email,
                placeholder: t('jamie@example.com'),
                label: t('Email'),
                name: 'email',
                required: true,
                tabIndex: 2,
                errorMessage: errors.email || ''
            },
            {
                type: 'text',
                value: state?.phonenumber,
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
                value: state?.name,
                placeholder: t('Jamie Larson'),
                label: t('Name'),
                name: 'name',
                required: true,
                tabIndex: 1,