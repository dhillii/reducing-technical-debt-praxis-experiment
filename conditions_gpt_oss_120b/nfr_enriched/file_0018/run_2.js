import React from 'react';
import ActionButton from '../common/action-button';
import AppContext from '../../app-context';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import CloseButton from '../common/close-button';
import InputForm from '../common/input-form';
import {
    getCurrencySymbol,
    getProductFromId,
    hasMultipleProductsFeature,
    isSameCurrency,
    formatNumber,
    hasMultipleNewsletters
} from '../../utils/helpers';
import {ValidateInputForm} from '../../utils/form';
import {interceptAnchorClicks} from '../../utils/links';
import {sanitizeHtml} from '../../utils/sanitize-html';
import NewsletterSelectionPage from './newsletter-selection-page';
import {t} from '../../utils/i18n';

export const OfferPageStyles = () => `
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

    /** Determine if the name field should be displayed */
    shouldShowNameField(member, portalName) {
        if (!portalName) {
            return false;
        }
        if (member && !member?.name) {
            return false;
        }
        return true;
    }

    getFormErrors(state) {
        const checkboxRequired = this.context.site?.portal_signup_checkbox_required && this.context.site?.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    getInputFields({state, fieldNames}) {
        const {portal_name: portalName} = this.context.site || {};
        const {member} = this.context;
        const errors = state.errors || {};

        const baseFields = [
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

        if (this.shouldShowNameField(member, portalName)) {
            baseFields.unshift({
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

        baseFields[0].autoFocus = true;

        if (fieldNames?.length) {
            return baseFields.filter(f => fieldNames.includes(f.name));
        }
        return baseFields;
    }

    renderSignupTerms() {
        const termsHtml = this.context.site?.portal_signup_terms_html?.trim();
        if (!termsHtml) {
            return null;
        }

        const handleCheckboxChange = e => {
            this.setState({termsCheckboxChecked: e.target.checked});
        };

        const termsContent = (
            <div
                className="gh-portal-signup-terms-content"
                dangerouslySetInnerHTML={{__html: sanitizeHtml(termsHtml)}}
            />
        );

        const signupTerms = this.context.site?.portal_signup_checkbox_required ? (
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

    /** Validate form and trigger signup flow */
    handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;

        this.setState(state => ({
            errors: this.getFormErrors(state)
        }), () => {
            const {doAction} = this.context;
            const {name, email, phonenumber, errors} = this.state;
            const hasFormErrors = errors && Object.values(errors).some(Boolean);

            if (hasFormErrors) {
                return;
            }

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
                this.setState({errors: {}});
            }
        });
    }

    handleInputChange(e, field) {
        this.setState({[field.name]: e.target.value});
    }

    renderSiteLogo() {
        const siteLogo = this.context.site?.icon;
        if (!siteLogo) {
            return null;
        }
        return <img className="gh-portal-signup-logo" src={siteLogo} alt={this.context.site?.title} />;
    }

    renderFormHeader() {
        const siteTitle = this.context.site?.title || '';
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
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
                <div className="gh-portal-section">
                    <InputForm
                        fields={fields}
                        onChange={(e, field) => this.handleInputChange(e, field)}
                        onKeyDown={e => this.onKeyDown(e)}
                    />
                </div>
            </section>
        );
    }

    renderSubmitButton() {
        const {action, brandColor, pageData: offer} = this.context;
        let label = t('Continue');
        let isRunning = false;
        let retry = false;

        if (offer?.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
        }
        if (action === 'signup:running') {
            label = t('Sending...');
            isRunning = true;
        }
        if (action === 'signup:failed') {
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
                tabIndex={3}
                classes="sticky bottom"
            />
        );
    }

    renderLoginMessage() {
        if (this.context.member) {
            return null;
        }
        const {brandColor, doAction} = this.context;
        return (
            <div className="gh-portal-signup-message">
                <div>{t('Already a member?')}</div>
                <button
                    className="gh-portal-btn gh-portal-btn-link"
                    style={{color: brandColor}}
                    onClick={() => doAction('switchPage', {page: 'signin'})}
                >
                    <span>{t('Sign in')}</span>
                </button>
            </div>
        );
    }

    /** Render discount label based on offer type */
    renderOfferTag() {
        const {pageData: offer} = this.context;
        if (!offer || offer.amount <= 0) {
            return null;
        }

        if (offer.type === 'fixed') {
            return (
                <h5 className="gh-portal-discount-label">
                    {t('{amount} off', {
                        amount: `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`
                    })}
                </h5>
            );
        }

        if (offer.type === 'trial') {
            return (
                <h5 className="gh-portal-discount-label">
                    {t('{amount} days free', {amount: offer.amount})}
                </h5>
            );
        }

        return (
            <h5 className="gh-portal-discount-label">
                {t('{amount} off', {amount: `${offer.amount}%`})}
            </h5>
        );
    }

    renderBenefits({product}) {
        const benefits = product.benefits || [];
        if (!benefits.length) {
            return null;
        }
        return (
            <div className="gh-portal-product-benefits">
                {benefits.map((benefit, idx) => (
                    <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                        <CheckmarkIcon className="gh-portal-benefit-checkmark" />
                        <div className="gh-portal-benefit-title">{benefit.name}</div>
                    </div>
                ))}
            </div>
        );
    }

    getOriginalPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const amount = this.renderRoundedPrice(price.amount / 100);
        return `${getCurrencySymbol(price.currency)}${amount}/${offer.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const original = price.amount;

        if (offer.type === 'fixed' && isSameCurrency(offer.currency, price.currency)) {
            const updated = (original - offer.amount) / 100;
            return updated > 0 ? updated : 0;
        }

        if (offer.type === 'percent') {
            return (original - (original * offer.amount) / 100) / 100;
        }

        return original / 100;
    }

    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            return Number(Math.round(price * 100) / 100).toFixed(2);
        }
        return price;
    }

    getOffAmount({offer}) {
        if (offer.type === 'fixed') {
            return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
        }
        if (offer.type === 'percent') {
            return `${offer.amount}%`;
        }
        if (offer.type === 'trial') {
            return offer.amount;
        }
        return '';
    }

    /** Compute the textual label for the offer */
    computeOfferLabel({offer}) {
        const messages = {
            forever: t('{amount} off forever.', {amount: this.getOffAmount({offer})}),
            firstPeriod: t('{amount} off for first {period}.', {
                amount: this.getOffAmount({offer}),
                period: offer.cadence
            }),
            firstNMonths: t('{amount} off for first {number} months.', {
                amount: this.getOffAmount({offer}),
                number: offer.duration_in_months || ''
            })
        };

        const duration = offer.duration;
        if (duration === 'once') {
            return {label: messages.firstPeriod, showRenews: true};
        }
        if (duration === 'forever') {
            return {label: messages.forever, showRenews: false};
        }
        if (duration === 'repeating') {
            const months = offer.duration_in_months;
            const label = months === 1 ? messages.firstPeriod : messages.firstNMonths;
            return {label, showRenews: true};
        }
        return {label: '', showRenews: false};
    }

    renderOfferMessage({offer, product}) {
        if (offer.type === 'trial') {
            const original = this.getOriginalPrice({offer, product});
            return (
                <p className="footnote">
                    {t('Try free for {amount} days, then {originalPrice}.', {
                        amount: offer.amount,
                        originalPrice: original,
                        interpolation: {escapeValue: false}
                    })}{' '}
                    <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
                </p>
            );
        }

        const {label, showRenews} = this.computeOfferLabel({offer});
        const original = this.getOriginalPrice({offer, product});
        const renews = t('Renews at {price}.', {
            price: original,
            interpolation: {escapeValue: false}
        });

        return (
            <p className="footnote">
                {label} {showRenews ? renews : ''}
            </p>
        );
    }

    renderProductLabel({product, offer}) {
        const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');
        if (hasMultipleProductsFeature({site: this.context.site})) {
            return <h4 className="gh-portal-plan-name">{product.name} - {cadenceLabel}</h4>;
        }
        return <h4 className="gh-portal-plan-name">{cadenceLabel}</h4>;
    }

    renderOldTierPrice({offer, price}) {
        if (offer.type === 'trial') {
            return null;
        }
        return (
            <div className="gh-portal-offer-oldprice">
                {getCurrencySymbol(price.currency)} {formatNumber(price.amount / 100)}
            </div>
        );
    }

    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        const containerClass = offer.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';
        return (
            <div className={containerClass}>
                <div className="gh-portal-product-price">
                    <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price.currency)}</span>
                    <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
                </div>
            </div>
        );
    }

    /** Render the main product card (header, details, footer) */
    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }

        const cadenceLabel = offer.cadence === 'month' ? t('Monthly') : t('Yearly');

        return (
            <>
                <div className="gh-portal-product-card top">
                    <div className="gh-portal-product-card-header">
                        <h4 className="gh-portal-product-name">{product.name} - {cadenceLabel}</h4>
                        {this.renderOldTierPrice({offer, price})}
                        {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                        {this.renderOfferMessage({offer, product})}
                    </div>
                </div>

                <div>
                    <div className="gh-portal-product-card bottom">
                        <div className="gh-portal-product-card-detaildata">
                            {product.description && (
                                <div className="gh-portal-product-description">{product.description}</div>
                            )}
                            {benefits.length > 0 && this.renderBenefits({product})}
                        </div>
                    </div>

                    <div className="gh-portal-btn-container sticky m32">
                        <div className="gh-portal-signup-terms-wrapper">{this.renderSignupTerms()}</div>
                        {this.renderSubmitButton()}
                    </div>
                    {this.renderLoginMessage()}
                </div>
            </>
        );
    }

    render() {
        const {pageData: offer, site} = this.context;
        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }

        const price = offer.cadence === 'month' ? product.monthlyPrice : product.yearlyPrice;
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product.benefits || [];
        const currencyClass = getCurrencySymbol(price.currency).length > 1 ? 'long' : '';

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {this.renderFormHeader()}

                    <div className="gh-portal-offer-bar">
                        <div className="gh-portal-offer-title">
                            {offer.display_title ? (
                                <h4>{offer.display_title}</h4>
                            ) : (
                                <h4 className="placeholder">{t('Black Friday')}</h4>
                            )}
                            {this.renderOfferTag()}
                        </div>
                        {offer.display_description && <p>{offer.display_description}</p>}
                    </div>

                    {this.renderForm()}
                    {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
                </div>
            </>
        );
    }
}