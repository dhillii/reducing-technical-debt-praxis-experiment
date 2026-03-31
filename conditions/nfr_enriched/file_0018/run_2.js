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

class OfferPage extends React.Component {
    static contextType = AppContext;

    constructor(props, context) {
        super(props, context);
        this.state = {
            name: context?.member?.name || '',
            email: context?.member?.email || '',
            plan: 'free',
            showNewsletterSelection: false,
            termsCheckboxChecked: false,
            errors: {}
        };
    }

    getFormErrors(state) {
        const checkboxRequired = this.context.site.portal_signup_checkbox_required && this.context.site.portal_signup_terms_html;
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
        
        const emailField = {
            type: 'email',
            value: member?.email || state.email,
            placeholder: t('jamie@example.com'),
            label: t('Email'),
            name: 'email',
            disabled: !!member,
            required: true,
            tabIndex: 2,
            errorMessage: errors.email || ''
        };

        const nameField = {
            type: 'text',
            value: member?.name || state.name,
            placeholder: t('Jamie Larson'),
            label: t('Name'),
            name: 'name',
            disabled: !!member,
            required: true,
            tabIndex: 1,
            errorMessage: errors.name || ''
        };

        const showNameField = portalName && (!member || member?.name);
        const fields = showNameField ? [nameField, emailField] : [emailField];
        
        fields[0].autoFocus = true;

        if (fieldNames?.length > 0) {
            return fields.filter((f) => fieldNames.includes(f.name));
        }
        return fields;
    }

    renderSignupTerms() {
        const {site} = this.context;
        const termsHtml = site.portal_signup_terms_html;

        if (!termsHtml) {
            return null;
        }

        const handleCheckboxChange = (e) => {
            this.setState({termsCheckboxChecked: e.target.checked});
        };

        const termsContent = (
            <div className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
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
        ) : termsContent;

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
        const {pageData: offer, site, doAction} = this.context;
        
        if (!offer?.tier) {
            return;
        }

        this.setState((state) => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(error => !!error);

            if (!hasFormErrors) {
                const signupData = {name, email, plan: this.getSelectedPriceId(offer, site), offerId: offer?.id, phonenumber};

                if (hasMultipleNewsletters({site})) {
                    this.setState({
                        showNewsletterSelection: true,
                        pageData: signupData,
                        errors: {}
                    });
                } else {
                    doAction('signup', signupData);
                    this.setState({errors: {}});
                }
            }
        });
    }

    getSelectedPriceId(offer, site) {
        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        return price?.id;
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    renderSiteLogo() {
        const {site} = this.context;
        const siteLogo = site.icon;

        if (siteLogo) {
            return <img className='gh-portal-signup-logo' src={siteLogo} alt={site.title} />;
        }
        return null;
    }

    renderFormHeader() {
        const {site} = this.context;
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{site.title || ''}</h2>
            </header>
        );
    }

    renderForm() {
        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

        const fields = this.getInputFields({state: this.state});
        return (
            <section>
                <div className='gh-portal-section'>
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={(e) => this.onKeyDown(e)}
                    />
                </div>
            </section>
        );
    }

    getSubmitButtonLabel() {
        const {action, pageData: offer} = this.context;

        if (action === 'signup:running') {
            return t('Sending...');
        }
        if (action === 'signup:failed') {
            return t('Retry');
        }
        if (offer.type === 'trial') {
            return t('Start {amount}-day free trial', {amount: offer.amount});
        }
        return t('Continue');
    }

    renderSubmitButton() {
        const {action, brandColor} = this.context;
        const isRunning = action === 'signup:running';
        const retry = action === 'signup:failed';
        const disabled = isRunning;

        return (
            <ActionButton
                style={{width: '100%'}}
                retry={retry}
                onClick={(e) => this.handleSignup(e)}
                disabled={disabled}
                brandColor={brandColor}
                label={this.getSubmitButtonLabel()}
                isRunning={isRunning}
                tabIndex={3}
                classes='sticky bottom'
            />
        );
    }

    renderLoginMessage() {
        const {member, brandColor, doAction} = this.context;
        
        if (member) {
            return null;
        }

        return (
            <div className='gh-portal-signup-message'>
                <div>{t('Already a member?')}</div>
                <button
                    className='gh-portal-btn gh-portal-btn-link'
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        );
    }

    renderOfferTag() {
        const {pageData: offer} = this.context;

        if (offer.amount <= 0) {
            return null;
        }

        const tagContent = {
            fixed: t('{amount} off', {amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`}),
            trial: t('{amount} days free', {amount: offer.amount}),
            percent: t('{amount} off', {amount: `${offer.amount}%`})
        };

        return (
            <h5 className="gh-portal-discount-label">{tagContent[offer.type] || ''}</h5>
        );
    }

    renderBenefits({product}) {
        const benefits = product.benefits || [];
        if (!benefits?.length) {
            return null;
        }

        return (
            <div className="gh-portal-product-benefits">
                {benefits.map((benefit, idx) => (
                    <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                        <CheckmarkIcon className='gh-portal-benefit-checkmark' />
                        <div className="gh-portal-benefit-title">{benefit.name}</div>
                    </div>
                ))}
            </div>
        );
    }

    getPrice(offer, product) {
        return offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
    }

    getOriginalPrice({offer, product}) {
        const price = this.getPrice(offer, product);
        const originalAmount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${originalAmount}/${offer.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
        const price = this.getPrice(offer, product);
        const originalAmount = price.amount;

        if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
            const updatedAmount = (originalAmount - offer.amount) / 100;
            return updatedAmount > 0 ? updatedAmount : 0;
        }
        if (offer.type === 'percent') {
            return (originalAmount - ((originalAmount * offer.amount) / 100)) / 100;
        }
        return originalAmount / 100;
    }

    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            return Number(Math.round(price * 100) / 100).toFixed(2);
        }
        return price;
    }

    getOffAmount({offer}) {
        const amounts = {
            fixed: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`,
            percent: `