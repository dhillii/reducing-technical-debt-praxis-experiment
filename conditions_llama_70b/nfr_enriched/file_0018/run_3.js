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

    /**
     * Get form errors based on the current state.
     * @param {Object} state - The current state of the component.
     * @returns {Object} An object containing form errors.
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
     * Get input fields based on the current state and field names.
     * @param {Object} options - An object containing the current state and field names.
     * @param {Object} options.state - The current state of the component.
     * @param {Array} options.fieldNames - An array of field names to include.
     * @returns {Array} An array of input fields.
     */
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

        let showNameField = !!portalName;

        if (!!member && !member?.name) {
            showNameField = false;
        }

        if (showNameField) {
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
        if (fieldNames && fieldNames.length > 0) {
            return fields.filter((f) => {
                return fieldNames.includes(f.name);
            });
        }
        return fields;
    }

    /**
     * Render the signup terms.
     * @returns {JSX.Element} The signup terms element.
     */
    renderSignupTerms() {
        const {site} = this.context;
        if (!site.portal_signup_terms_html) {
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
            <div className={className} onClick={interceptAnchorClicks}>
                {signupTerms}
            </div>
        );
    }

    /**
     * Handle key down event.
     * @param {Event} e - The key down event.
     */
    onKeyDown(e) {
        if (e.keyCode === 13){
            this.handleSignup(e);
        }
    }

    /**
     * Handle signup.
     * @param {Event} e - The signup event.
     */
    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer || !offer.tier) {
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
            const hasFormErrors = (errors && Object.values(errors).filter(d => !!d).length > 0);
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

    /**
     * Handle input change.
     * @param {Event} e - The input change event.
     * @param {Object} field - The input field.
     */
    handleInputChange(e, field) {
        const fieldName = field.name;
        const value = e.target.value;
        this.setState({
            [fieldName]: value
        });
    }

    /**
     * Render the site logo.
     * @returns {JSX.Element} The site logo element.
     */
    renderSiteLogo() {
        const {site} = this.context;

        const siteLogo = site.icon;

        const logoStyle = {};

        if (siteLogo) {
            logoStyle.backgroundImage = `url(${siteLogo})`;
            return (
                <img className='gh-portal-signup-logo' src={siteLogo} alt={site.title} />
            );
        }
        return null;
    }

    /**
     * Render the form header.
     * @returns {JSX.Element} The form header element.
     */
    renderFormHeader() {
        const {site} = this.context;
        const siteTitle = site.title || '';
        return (
            <header className='gh-portal-signup-header'>
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
            </header>
        );
    }

    /**
     * Render the form.
     * @returns {JSX.Element} The form element.
     */
    renderForm() {
        const fields = this.getInputFields({state: this.state});

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

        return (
            <section>
                <div className='gh-portal-section'>
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={e => this.onKeyDown(e)}
                    />
                </div>
            </section>
        );
    }

    /**
     * Render the submit button.
     * @returns {JSX.Element} The submit button element.
     */
    renderSubmitButton() {
        const {action, brandColor} = this.context;
        const {pageData: offer} = this.context;
        let label = t('Continue');

        if (offer.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
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
                tabIndex={3}
                classes={'sticky bottom'}
            />
        );
    }

    /**
     * Render the login message.
     * @returns {JSX.Element} The login message element.
     */
    renderLoginMessage() {
        const {member} = this.context;
        if (member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
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

    /**
     * Render the offer tag.
     * @returns {JSX.Element} The offer tag element.
     */
    renderOfferTag() {
        const {pageData: offer} = this.context;

        if (offer.amount <= 0) {
            return (
                <></>
            );
        }

        if (offer.type === 'fixed') {
            return (
                <h5 className="gh-portal-discount-label">{t('{amount} off', {
                    amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                })}</h5>
            );
        }

        if (offer.type === 'trial') {
            return (
                <h5 className="gh-portal-discount-label">{t('{amount} days free', {amount: offer.amount})}</h5>
            );
        }

        return (
            <h5 className="gh-portal-discount-label">{t('{amount} off', {amount: offer.amount + '%'})}</h5>
        );
    }

    /**
     * Render the benefits.
     * @param {Object} options - An object containing the product.
     * @param {Object} options.product - The product.
     * @returns {JSX.Element} The benefits element.
     */
    renderBenefits({product}) {
        const benefits = product.benefits || [];
        if (!benefits?.length) {
            return;
        }
        const benefitsUI = benefits.map((benefit, idx) => {
            return (
                <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                    <CheckmarkIcon className='gh-portal-benefit-checkmark' />
                    <div className="gh-portal-benefit-title">{benefit.name}</div>
                </div>
            );
        });
        return (
            <div className="gh-portal-product-benefits">
                {benefitsUI}
            </div>
        );
    }

    /**
     * Get the original price.
     * @param {Object} options - An object containing the offer and product.
     * @param {Object} options.offer - The offer.
     * @param {Object} options.product - The product.
     * @returns {String} The original price.
     */
    getOriginalPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const originalAmount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${originalAmount}/${offer.cadence}`;
    }

    /**
     * Get the updated price.
     * @param {Object} options - An object containing the offer and product.
     * @param {Object} options.offer - The offer.
     * @param {Object} options.product - The product.
     * @returns {Number} The updated price.
     */
    getUpdatedPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const originalAmount = price.amount;
        let updatedAmount;
        if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
            updatedAmount = ((originalAmount - offer.amount)) / 100;
            return updatedAmount > 0 ? updatedAmount : 0;
        } else if (offer.type === 'percent') {
            updatedAmount = (originalAmount - ((originalAmount * offer.amount) / 100)) / 100;
            return updatedAmount;
        }
        return originalAmount / 100;
    }

    /**
     * Render the rounded price.
     * @param {Number} price - The price.
     * @returns {String} The rounded price.
     */
    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            const roundedPrice = Math.round(price * 100) / 100;
            return Number(roundedPrice).toFixed(2);
        }
        return price;
    }

    /**
     * Get the off amount.
     * @param {Object} options - An object containing the offer.
     * @param {Object} options.offer - The offer.
     * @returns {String} The off amount.
     */
    getOffAmount({offer}) {
        if (offer.type === 'fixed') {
            return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
        } else if (offer.type === 'percent') {
            return `${offer.amount}%`;
        } else if (offer.type === 'trial') {
            return offer.amount;
        }
        return '';
    }

    /**
     * Render the offer message.
     * @param {Object} options - An object containing the offer and product.
     * @param {Object} options.offer - The offer.
     * @param {Object} options.product - The product.
     * @returns {JSX.Element} The offer message element.
     */
    renderOfferMessage({offer, product}) {
        const offerMessages = {
            forever: t(`{amount} off forever.`, {
                amount: this.getOffAmount({offer})
            }),
            firstPeriod: t(`{amount} off for first {period}.`, {
                amount: this.getOffAmount({offer}),
                period: offer.cadence
            }),
            firstNMonths: t(`{amount} off for first {number} months.`, {
                amount: this.getOffAmount({offer}),
                number: offer.duration_in_months || ''
            })
        };

        const originalPrice = this.getOriginalPrice({offer, product});
        const renewsLabel = t(`Renews at {price}.`, {price: originalPrice, interpolation: {escapeValue: false}});

        let offerLabel = '';
        let useRenewsLabel = false;
        const discountDuration = offer.duration;
        if (discountDuration === 'once') {
            offerLabel = offerMessages.firstPeriod;
            useRenewsLabel = true;
        } else if (discountDuration === 'forever') {
            offerLabel = offerMessages.forever;
        } else if (discountDuration === 'repeating') {
            const durationInMonths = offer.duration_in_months || '';
            if (durationInMonths === 1) {
                offerLabel = offerMessages.firstPeriod;
            } else {
                offerLabel = offerMessages.firstNMonths;
            }
            useRenewsLabel = true;
        }
        if (discountDuration === 'trial') {
            return (
                <p className="footnote">{t('Try free for {amount} days, then {originalPrice}.', {
                    amount: offer.amount,
                    originalPrice: originalPrice,
                    interpolation: {escapeValue: false}
                })} <span className="gh-portal-cancel">{t('Cancel anytime.')}</span></p>
            );
        }
        return (
            <p className="footnote">{offerLabel} {useRenewsLabel ? renewsLabel : ''}</p>
        );
    }

    /**
     * Render the product label.
     * @param {Object} options - An object containing the product and offer.
     * @param {Object} options.product - The product.
     * @param {Object} options.offer - The offer.
     * @returns {JSX.Element} The product label element.
     */
    renderProductLabel({product, offer}) {
        const {site} = this.context;

        if (hasMultipleProductsFeature({site})) {
            return (
                <h4 className="gh-portal-plan-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
            );
        }
        return (
            <h4 className="gh-portal-plan-name">{(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
        );
    }

    /**
     * Render the updated tier price.
     * @param {Object} options - An object containing the offer, currency class, updated price, and price.
     * @param {Object} options.offer - The offer.
     * @param {String} options.currencyClass - The currency class.
     * @param {Number} options.updatedPrice - The updated price.
     * @param {Object} options.price - The price.
     * @returns {JSX.Element} The updated tier price element.
     */
    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        if (offer.type === 'trial') {
            return (
                <div className="gh-portal-product-card-pricecontainer offer-type-trial">
                    <div className="gh-portal-product-price">
                        <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                        <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                    </div>
                </div>
            );
        }
        return (
            <div className="gh-portal-product-card-pricecontainer">
                <div className="gh-portal-product-price">
                    <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                    <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                </div>
            </div>
        );
    }

    /**
     * Render the old tier price.
     * @param {Object} options - An object containing the offer and price.
     * @param {Object} options.offer - The offer.
     * @param {Object} options.price - The price.
     * @returns {JSX.Element} The old tier price element.
     */
    renderOldTierPrice({offer, price}) {
        if (offer.type === 'trial') {
            return null;
        }
        return (
            <div className="gh-portal-offer-oldprice">{getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}</div>
        );
    }

    /**
     * Render the product card.
     * @param {Object} options - An object containing the product, offer, currency class, updated price, price, and benefits.
     * @param {Object} options.product - The product.
     * @param {Object} options.offer - The offer.
     * @param {String} options.currencyClass - The currency class.
     * @param {Number} options.updatedPrice - The updated price.
     * @param {Object} options.price - The price.
     * @param {Array} options.benefits - The benefits.
     * @returns {JSX.Element} The product card element.
     */
    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }
        return (
            <>
                <div className='gh-portal-product-card top'>
                    <div className='gh-portal-product-card-header'>
                        <h4 className="gh-portal-product-name">{product.name} - {(offer.cadence === 'month' ? t('Monthly') : t('Yearly'))}</h4>
                        {this.renderOldTierPrice({offer, price})}
                        {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                        {this.renderOfferMessage({offer, product, price})}
                    </div>
                </div>

                <div>
                    <div className='gh-portal-product-card bottom'>
                        <div className='gh-portal-product-card-detaildata'>
                            {(product.description ? <div className="gh-portal-product-description">{product.description}</div> : '')}
                            {(benefits.length ? this.renderBenefits({product}) : '')}
                        </div>
                    </div>

                    <div className='gh-portal-btn-container sticky m32'>
                        <div className='gh-portal-signup-terms-wrapper'>
                            {this.renderSignupTerms()}
                        </div>
                        {this.renderSubmitButton()}
                    </div>
                    {this.renderLoginMessage()}
                </div>
            </>
        );
    }

    render() {
        const {pageData: offer, site} = this.context;
        if (!offer || !offer.tier) {
            return null;
        }
        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];

        const currencyClass = (getCurrencySymbol(price.currency)).length > 1 ? 'long' : '';

        return (
            <>
                <div className='gh-portal-content gh-portal-offer'>
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {(offer.display_title ? <h4>{offer.display_title}</h4> : <h4 className='placeholder'>{t('Black Friday')}</h4>)}
                            {this.renderOfferTag()}
                        </div>
                        {(offer.display_description ? <p>{offer.display_description}</p> : '')}
                    </div>

                    {this.renderForm()}
                    {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
                </div>
            </>
        );
    }
}