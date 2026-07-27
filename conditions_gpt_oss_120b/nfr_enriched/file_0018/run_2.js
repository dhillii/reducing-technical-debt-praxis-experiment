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

/* ...styles omitted for brevity... */
    `;
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

    /** Validate form and checkbox state */
    getFormErrors(state) {
        const checkboxRequired = this.context?.site?.portal_signup_checkbox_required && this.context?.site?.portal_signup_terms_html;
        const checkboxError = checkboxRequired && !state.termsCheckboxChecked;

        return {
            ...ValidateInputForm({fields: this.getInputFields({state})}),
            checkbox: checkboxError
        };
    }

    /** Build input field definitions */
    getInputFields({state, fieldNames}) {
        const portalName = this.context?.site?.portal_name;
        const member = this.context?.member;
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
        if (member && !member?.name) {
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

        if (fieldNames?.length) {
            return fields.filter(f => fieldNames.includes(f.name));
        }
        return fields;
    }

    /** Render terms and conditions checkbox if required */
    renderSignupTerms() {
        const termsHtml = this.context?.site?.portal_signup_terms_html;
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

        const signupTerms = this.context?.site?.portal_signup_checkbox_required ? (
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

    /** Process signup form submission */
    handleSignup(e) {
        e.preventDefault();

        const offer = this.context?.pageData;
        const site = this.context?.site;
        const productId = offer?.tier?.id;
        if (!productId) {
            return null;
        }

        const product = getProductFromId({site, productId});
        const price = offer?.cadence === 'month' ? product?.monthlyPrice : product?.yearlyPrice;

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
        const siteLogo = this.context?.site?.icon;
        if (!siteLogo) {
            return null;
        }
        return <img className="gh-portal-signup-logo" src={siteLogo} alt={this.context?.site?.title} />;
    }

    renderFormHeader() {
        const siteTitle = this.context?.site?.title || '';
        return (
            <header className="gh-portal-signup-header">
                {this.renderSiteLogo()}
                <h2 className="gh-portal-main-title">{siteTitle}</h2>
            </header>
        );
    }

    renderForm() {
        const fields = this.getInputFields({state: this.state});

        if (this.state.showNewsletterSelection) {
            return (
                <NewsletterSelectionPage
                    pageData={this.state.pageData}
                    onBack={() => this.setState({showNewsletterSelection: false})}
                />
            );
        }

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
        if (offer?.type === 'trial') {
            label = t('Start {amount}-day free trial', {amount: offer.amount});
        }
        if (action === 'signup:running') {
            label = t('Sending...');
        } else if (action === 'signup:failed') {
            label = t('Retry');
        }

        const disabled = action === 'signup:running';
        const retry = action === 'signup:failed';
        const isRunning = action === 'signup:running';

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
        if (this.context?.member) {
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

    renderOfferTag() {
        const offer = this.context?.pageData;
        if (!offer || offer.amount <= 0) {
            return <></>;
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
        const benefits = product?.benefits || [];
        if (!benefits.length) {
            return null;
        }
        const benefitsUI = benefits.map((benefit, idx) => (
            <div className="gh-portal-product-benefit" key={`${benefit.name}-${idx}`}>
                <CheckmarkIcon className="gh-portal-benefit-checkmark" />
                <div className="gh-portal-benefit-title">{benefit.name}</div>
            </div>
        ));
        return <div className="gh-portal-product-benefits">{benefitsUI}</div>;
    }

    getOriginalPrice({offer, product}) {
        const price = offer?.cadence === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
        const originalAmount = this.renderRoundedPrice(price?.amount / 100);
        return `${getCurrencySymbol(price?.currency)}${originalAmount}/${offer?.cadence}`;
    }

    getUpdatedPrice({offer, product}) {
        const price = offer?.cadence === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
        const originalAmount = price?.amount;
        if (offer?.type === 'fixed' && isSameCurrency(offer?.currency, price?.currency)) {
            const updated = (originalAmount - offer.amount) / 100;
            return updated > 0 ? updated : 0;
        }
        if (offer?.type === 'percent') {
            return (originalAmount - (originalAmount * offer.amount) / 100) / 100;
        }
        return originalAmount / 100;
    }

    renderRoundedPrice(price) {
        if (price % 1 !== 0) {
            const rounded = Math.round(price * 100) / 100;
            return Number(rounded).toFixed(2);
        }
        return price;
    }

    getOffAmount({offer}) {
        if (offer?.type === 'fixed') {
            return `${getCurrencySymbol(offer.currency)}${offer.amount / 100}`;
        }
        if (offer?.type === 'percent') {
            return `${offer.amount}%`;
        }
        if (offer?.type === 'trial') {
            return offer.amount;
        }
        return '';
    }

    /** Render the textual description of the offer */
    renderOfferMessage({offer, product}) {
        const offerMessages = {
            forever: t('{amount} off forever.', {amount: this.getOffAmount({offer})}),
            firstPeriod: t('{amount} off for first {period}.', {
                amount: this.getOffAmount({offer}),
                period: offer?.cadence
            }),
            firstNMonths: t('{amount} off for first {number} months.', {
                amount: this.getOffAmount({offer}),
                number: offer?.duration_in_months || ''
            })
        };

        const originalPrice = this.getOriginalPrice({offer, product});
        const renewsLabel = t('Renews at {price}.', {
            price: originalPrice,
            interpolation: {escapeValue: false}
        });

        const discountDuration = offer?.duration;
        let offerLabel = '';
        let useRenewsLabel = false;

        if (discountDuration === 'once') {
            offerLabel = offerMessages.firstPeriod;
            useRenewsLabel = true;
        } else if (discountDuration === 'forever') {
            offerLabel = offerMessages.forever;
        } else if (discountDuration === 'repeating') {
            const months = offer?.duration_in_months || '';
            offerLabel = months === 1 ? offerMessages.firstPeriod : offerMessages.firstNMonths;
            useRenewsLabel = true;
        }

        if (discountDuration === 'trial') {
            return (
                <p className="footnote">
                    {t('Try free for {amount} days, then {originalPrice}.', {
                        amount: offer?.amount,
                        originalPrice,
                        interpolation: {escapeValue: false}
                    })}{' '}
                    <span className="gh-portal-cancel">{t('Cancel anytime.')}</span>
                </p>
            );
        }

        return (
            <p className="footnote">
                {offerLabel} {useRenewsLabel ? renewsLabel : ''}
            </p>
        );
    }

    renderProductLabel({product, offer}) {
        const site = this.context?.site;
        if (hasMultipleProductsFeature({site})) {
            return (
                <h4 className="gh-portal-plan-name">
                    {product?.name} - {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
                </h4>
            );
        }
        return (
            <h4 className="gh-portal-plan-name">
                {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
            </h4>
        );
    }

    renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price}) {
        const priceContent = (
            <div className="gh-portal-product-price">
                <span className={'currency-sign ' + currencyClass}>{getCurrencySymbol(price?.currency)}</span>
                <span className="amount">{formatNumber(this.renderRoundedPrice(updatedPrice))}</span>
            </div>
        );

        const containerClass = offer?.type === 'trial' ? 'gh-portal-product-card-pricecontainer offer-type-trial' : 'gh-portal-product-card-pricecontainer';

        return (
            <div className={containerClass}>
                {priceContent}
            </div>
        );
    }

    renderOldTierPrice({offer, price}) {
        if (offer?.type === 'trial') {
            return null;
        }
        return (
            <div className="gh-portal-offer-oldprice">
                {getCurrencySymbol(price?.currency)} {formatNumber(price?.amount / 100)}
            </div>
        );
    }

    /** Render product header including name, old price, new price, and offer message */
    _renderProductHeader({product, offer, currencyClass, updatedPrice, price}) {
        return (
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">
                    {product?.name} - {offer?.cadence === 'month' ? t('Monthly') : t('Yearly')}
                </h4>
                {this.renderOldTierPrice({offer, price})}
                {this.renderUpdatedTierPrice({offer, currencyClass, updatedPrice, price})}
                {this.renderOfferMessage({offer, product})}
            </div>
        );
    }

    /** Render product description and benefits */
    _renderProductDetails({product, benefits}) {
        return (
            <div className="gh-portal-product-card-detaildata">
                {product?.description ? <div className="gh-portal-product-description">{product.description}</div> : null}
                {benefits?.length ? this.renderBenefits({product}) : null}
            </div>
        );
    }

    /** Render footer with terms, submit button, and login message */
    _renderProductFooter() {
        return (
            <div className="gh-portal-btn-container sticky m32">
                <div className="gh-portal-signup-terms-wrapper">{this.renderSignupTerms()}</div>
                {this.renderSubmitButton()}
                {this.renderLoginMessage()}
            </div>
        );
    }

    /** Render the full product card */
    renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits}) {
        if (this.state.showNewsletterSelection) {
            return null;
        }
        return (
            <>
                <div className="gh-portal-product-card top">
                    {this._renderProductHeader({product, offer, currencyClass, updatedPrice, price})}
                </div>
                <div>
                    <div className="gh-portal-product-card bottom">
                        {this._renderProductDetails({product, benefits})}
                    </div>
                    {this._renderProductFooter()}
                </div>
            </>
        );
    }

    /** Render the offer bar with title and tag */
    _renderOfferBar() {
        const offer = this.context?.pageData;
        return (
            <div className="gh-portal-offer-bar">
                <div className="gh-portal-offer-title">
                    {offer?.display_title ? <h4>{offer.display_title}</h4> : <h4 className="placeholder">{t('Black Friday')}</h4>}
                    {this.renderOfferTag()}
                </div>
                {offer?.display_description ? <p>{offer.display_description}</p> : null}
            </div>
        );
    }

    render() {
        const offer = this.context?.pageData;
        const site = this.context?.site;
        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});
        if (!product) {
            return null;
        }

        const price = offer?.cadence === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
        const updatedPrice = this.getUpdatedPrice({offer, product});
        const benefits = product?.benefits || [];
        const currencyClass = (getCurrencySymbol(price?.currency)).length > 1 ? 'long' : '';

        return (
            <>
                <div className="gh-portal-content gh-portal-offer">
                    <CloseButton />
                    {this.renderFormHeader()}
                    {this._renderOfferBar()}
                    {this.renderForm()}
                    {this.renderProductCard({product, offer, currencyClass, updatedPrice, price, benefits})}
                </div>
            </>
        );
    }
}