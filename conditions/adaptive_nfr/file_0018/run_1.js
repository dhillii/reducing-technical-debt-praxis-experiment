```javascript
import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {getCurrencySymbol, getProductFromId, hasMultipleProductsFeature, isSameCurrency, formatNumber, hasMultipleNewsletters} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';

export const OfferPageStyles = () => {
    return `
.gh-portal-offer {
    padding-bottom: 0;
    overflow: unset;
    max-height: unset;
}

.gh-portal-offer-container {
    display: flex;
    flex-direction: column;
}

.gh-portal-plans-container.offer {
    justify-content: space-between;
    border-color: var(--grey12);
    border-top: none;
    border-top-left-radius: 0;
    border-top-right-radius: 0;
    padding: 12px 16px;
    font-size: 1.3rem;
}

.gh-portal-offer-bar {
    position: relative;
    padding: 26px 28px 28px;
    margin-bottom: 24px;
    /*border: 1px dashed var(--brandcolor);*/
    background-image: url("data:image/svg+xml,%3csvg width='100%25' height='99.9%25' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='100%25' height='100%25' fill='none' stroke='%23C3C3C3' stroke-width='3' stroke-dasharray='3%2c 9' stroke-dashoffset='0' stroke-linecap='square'/%3e%3c/svg%3e");
    background-color: var(--white);
    border-radius: 6px;
}

.gh-portal-offer-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.gh-portal-offer-title h4 {
    font-size: 1.8rem;
    margin: 0 110px 0 0;
    width: 100%;
}
html[dir="rtl"] .gh-portal-offer-title h4 {
    margin: 0 0 0 110px;
}

.gh-portal-offer-title h4.placeholder {
    opacity: 0.4;
}

.gh-portal-offer-bar .gh-portal-discount-label {
    position: absolute;
    top: 23px;
    right: 25px;
}

.gh-portal-offer-bar p {
    padding-bottom: 0;
    margin: 12px 0 0;
}

.gh-portal-offer-title h4 + p {
    margin: 12px 0 0;
}

.gh-portal-offer-details .gh-portal-plan-name,
.gh-portal-offer-details p {
    margin-inline-end: 8px;
}

.gh-portal-offer .footnote {
    font-size: 1.35rem;
    color: var(--grey8);
    margin: 4px 0 0;
}

.offer .gh-portal-product-card {
    max-width: unset;
    min-height: 0;
}

.offer .gh-portal-product-card .gh-portal-product-card-pricecontainer:not(.offer-type-trial) {
    margin-top: 0px;
}

.offer .gh-portal-product-card-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
}

.gh-portal-offer-oldprice {
    display: flex;
    position: relative;
    font-size: 1.8rem;
    font-weight: 300;
    color: var(--grey8);
    line-height: 1;
    white-space: nowrap;
    margin: 16px 0 4px;
}

.gh-portal-offer-oldprice:after {
    position: absolute;
    display: block;
    content: "";
    left: 0;
    top: 50%;
    right: 0;
    height: 1px;
    background: var(--grey8);
}

.gh-portal-offer-details p {
    margin-bottom: 12px;
}

.offer .after-trial-amount {
    margin-bottom: 0;
}

.offer .trial-duration {
    margin-top: 16px;
}

.gh-portal-cancel {
    white-space: nowrap;
}

.gh-portal-offer .gh-portal-signup-terms-wrapper {
    margin: 8px auto 16px;
}

.gh-portal-offer .gh-portal-signup-terms.gh-portal-error {
    margin: 0;
}
    `;
};

/**
 * Determines if name field should be displayed based on portal settings and member state
 * @param {Object} portalName - Portal name setting
 * @param {Object} member - Current member object
 * @returns {boolean} Whether to show name field
 */
const shouldShowNameField = (portalName, member) => {
    if (!portalName) {
        return false;
    }
    return !member || !!member?.name;
};

/**
 * Determines if terms checkbox is required
 * @param {Object} site - Site configuration
 * @returns {boolean} Whether checkbox is required
 */
const isCheckboxRequired = (site) => {
    return site?.portal_signup_checkbox_required && site?.portal_signup_terms_html;
};

/**
 * Determines if terms HTML exists
 * @param {string} termsHtml - Terms HTML content
 * @returns {boolean} Whether terms HTML is present
 */
const hasTermsHtml = (termsHtml) => {
    return termsHtml !== null && termsHtml !== '';
};

/**
 * Gets the appropriate offer tag label based on offer type
 * @param {Object} offer - Offer configuration
 * @returns {string} Formatted offer label
 */
const getOfferTagLabel = (offer) => {
    const labelStrategies = {
        fixed: () => t('{amount} off', {
            amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
        }),
        trial: () => t('{amount} days free', {amount: offer.amount}),
        percent: () => t('{amount} off', {amount: offer.amount + '%'})
    };
    return labelStrategies[offer.type]?.() || '';
};

/**
 * Gets the submit button label based on action and offer type
 * @param {string} action - Current action state
 * @param {Object} offer - Offer configuration
 * @returns {Object} Label and state flags
 */
const getSubmitButtonState = (action, offer) => {
    const states = {
        'signup:running': {
            label: t('Sending...'),
            isRunning: true,
            retry: false,
            disabled: true
        },
        'signup:failed': {
            label: t('Retry'),
            isRunning: false,
            retry: true,
            disabled: false
        }
    };

    if (states[action]) {
        return states[action];
    }

    const label = offer?.type === 'trial'
        ? t('Start {amount}-day free trial', {amount: offer?.amount})
        : t('Continue');

    return {
        label,
        isRunning: false,
        retry: false,
        disabled: false
    };
};

/**
 * Calculates updated price based on offer type
 * @param {number} originalAmount - Original price amount
 * @param {Object} offer - Offer configuration
 * @param {Object} price - Price object with currency
 * @returns {number} Updated price amount
 */
const calculateUpdatedPrice = (originalAmount, offer, price) => {
    const priceCalculators = {
        fixed: () => {
            if (isSameCurrency(offer.currency, price.currency)) {
                const updated = (originalAmount - offer.amount) / 100;
                return updated > 0 ? updated : 0;
            }
            return originalAmount / 100;
        },
        percent: () => (originalAmount - ((originalAmount * offer.amount) / 100)) / 100,
        trial: () => originalAmount / 100
    };

    return priceCalculators[offer.type]?.() ?? originalAmount / 100;
};

/**
 * Gets the discount amount display string
 * @param {Object} offer - Offer configuration
 * @returns {string} Formatted discount amount
 */
const getDiscountAmountDisplay = (offer) => {
    const displayStrategies = {
        fixed: () => `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
        percent: () => `${offer.amount}%`,
        trial: () => offer.amount
    };
    return displayStrategies[offer.type]?.() ?? '';
};

/**
 * Gets offer message based on duration type
 * @param {Object} offer - Offer configuration
 * @param {string} originalPrice - Formatted original price
 * @returns {Object} Offer label and renewal flag
 */
const getOfferMessageData = (offer, originalPrice) => {
    const amount = getDiscountAmountDisplay(offer);
    const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});

    const messageStrategies = {
        once: {
            label: t(`{amount} off for first {period}.`, {
                amount,
                period: offer.cadence
            }),
            useRenewsLabel: true
        },
        forever: {
            label: t(`{amount} off forever.`, {amount}),
            useRenewsLabel: false
        },
        repeating: {
            label: offer.duration_in_months === 1
                ? t(`{amount} off for first {period}.`, {amount, period: offer.cadence})
                : t(`{amount} off for first {number} months.`, {amount, number: offer.duration_in_months || ''}),
            useRenewsLabel: true
        }
    };

    return messageStrategies[offer.duration] || {label: '', useRenewsLabel: false};
};

export default class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false
        };
    }

    getFormErrors(state) {
        const checkboxRequired = isCheckboxRequired(this.context.site);
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context.site;
        const {member} = this.context;
        const errors = state.errors || {};
        const fields = [
            {
                type: 'email',
                value: member?.email || state.email,
                placeholder: t('jamie@example.com'),
                label: t('Email'),
                name: 'email',
                disabled: !!member,
                required: true,
                tabIndex: 2,
                errorMessage: errors.email || ''
            }
        ];

        if (shouldShowNameField(portalName, member)) {
            fields.unshift({
                type: 'text',
                value: member?.name || state.name,
                placeholder: t('Jamie Larson'),
                label: t('Name'),
                name: 'name',
                disabled: !!member,
                required: true,
                tabIndex: 1,
                errorMessage: errors.name || ''
            });
        }

        fields[0].autoFocus = true;

        if (fieldNames?.length > 0) {
            return fields.filter((f) => fieldNames.includes(f.name));
        }

        return fields;
    }

    renderSignupTerms() {
        const {site} = this.context;

        if (!hasTermsHtml(site.portal_signup_terms_html)) {
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

        const signupTerms = isCheckboxRequired(site) ? (
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
            <div className={className} onClick={interceptAnchorClicks}>
                {signupTerms}
            </div>
        );
    }

    onKeyDown(e) {
        if (e.keyCode === 13) {
            this.handleSignup(e);
        }
    }

    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;

        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

        this.setState((state) => {
            return {
                errors: this.getFormErrors(state)
            };
        }, () => {
            const {doAction} = this.context;
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).filter(d => !!d).length > 0;

            if (!hasFormErrors) {
                const signupData = {
                    name,
                    email,
                    plan: price?.id,
                    offerId: offer?.id,
                    phonenumber
                };

                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: signupData,
                        errors: {}
                    });
                } else {
                    doAction('signup', signupData);
                    this.setState({
                        errors: {}
                    });
                }
            }
        });
    }

    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({
            [fieldName]: value
        });
    }

    renderSiteLogo() {
        const {site} = this.context;
        const siteLogo = site.icon;

        if (siteLogo) {
            return (
                <img className='gh-portal-signup-logo' src={siteLogo} alt={site.title} />
            );
        }

        return null;
    }

    renderForm