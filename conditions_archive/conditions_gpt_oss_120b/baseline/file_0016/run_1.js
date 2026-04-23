import React, {useContext, useEffect, useState, createContext} from 'react';
import {ReactComponent as LoaderIcon} from '../../images/icons/loader.svg';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark.svg';
import {
    getCurrencySymbol,
    getPriceString,
    getStripeAmount,
    getMemberActivePrice,
    getProductFromPrice,
    getFreeTierTitle,
    getFreeTierDescription,
    getFreeProduct,
    getFreeProductBenefits,
    getSupportAddress,
    formatNumber,
    isCookiesDisabled,
    hasOnlyFreeProduct,
    isMemberActivePrice,
    hasFreeTrialTier,
    isComplimentaryMember
} from '../../utils/helpers';
import AppContext from '../../app-context';
import calculateDiscount from '../../utils/discount';
import Interpolate from '@doist/react-interpolate';
import {t} from '../../utils/i18n';

export const ProductsSectionStyles = () => `/* styles omitted for brevity */`;

const ProductsContext = createContext({
    selectedInterval: 'month',
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

function ProductBenefits({product}) {
    if (!product.benefits?.length) return null;
    return product.benefits.map((benefit, idx) => (
        <div className="gh-portal-product-benefit" key={benefit?.id || `benefit-${idx}`}>
            <CheckmarkIcon className="gh-portal-benefit-checkmark" alt="" />
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    ));
}

function ProductBenefitsContainer({product, hide = false}) {
    if (!product.benefits?.length || hide) return null;
    return (
        <div className="gh-portal-product-benefits">
            <ProductBenefits product={product} />
        </div>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) return null;
    return <div className="gh-portal-product-alternative-price">{getPriceString(price)}</div>;
}

function ProductCardTrialDays({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);
    if (hasFreeTrialTier({site})) {
        return trialDays ? <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span> : null;
    }
    return selectedInterval === 'year' ? <span className="gh-portal-discount-label">{t('{discount}% discount', {discount})}</span> : null;
}

function ProductCardPrice({product}) {
    const {selectedInterval} = useContext(ProductsContext);
    const {site} = useContext(AppContext);
    const {monthlyPrice, yearlyPrice, trial_days: trialDays} = product;
    const activePrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const alternatePrice = selectedInterval === 'month' ? yearlyPrice : monthlyPrice;
    if (!monthlyPrice || !yearlyPrice) return null;

    const yearlyDiscount = calculateDiscount(monthlyPrice.amount, yearlyPrice.amount);
    const currencySymbol = getCurrencySymbol(activePrice.currency);
    const intervalLabel = activePrice.interval === 'year' ? t('year') : t('month');

    const priceBlock = (
        <div className="gh-portal-product-price">
            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
            <span className="amount" data-testid="product-amount">{formatNumber(getStripeAmount(activePrice.amount))}</span>
            <span className="billing-period">/{intervalLabel}</span>
        </div>
    );

    if (hasFreeTrialTier({site})) {
        return (
            <>
                <div className="gh-portal-product-card-pricecontainer">
                    <div className="gh-portal-product-card-price-trial">
                        {priceBlock}
                        <ProductCardTrialDays trialDays={trialDays} discount={yearlyDiscount} selectedInterval={selectedInterval} />
                    </div>
                    {selectedInterval === 'year' && <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays} />}
                    <ProductCardAlternatePrice price={alternatePrice} />
                </div>
            </>
        );
    }

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                {priceBlock}
                {selectedInterval === 'year' && <YearlyDiscount discount={yearlyDiscount} />}
            </div>
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site}) || 'Free preview';
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    const disabled = action === 'signup:running' || isCookiesDisabled();
    const currencySymbol = products?.[1]?.monthlyPrice ? getCurrencySymbol(products[1].monthlyPrice.currency) : '$';
    const cardClass = [
        'gh-portal-product-card',
        'free',
        selectedProduct === 'free' && 'checked',
        hasOnlyFree && (!freeProductDescription && !freeBenefits.length) && 'only-free'
    ].filter(Boolean).join(' ');

    if (hasOnlyFree && !freeProductDescription && !freeBenefits.length) return null;

    return (
        <div className={cardClass} onClick={e => {e.stopPropagation(); setSelectedProduct('free');}} data-test-tier="free">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                    <ProductBenefitsContainer product={product} />
                </div>
                {!hasOnlyFree && (
                    <div className="gh-portal-btn-product">
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
                            disabled={disabled}
                            onClick={e => handleChooseSignup(e, 'free')}
                        >
                            {selectedProduct === 'free' && disabled ? <LoaderIcon className="gh-portal-loadingicon" /> : t('Choose')}
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) return <LoaderIcon className="gh-portal-loadingicon" />;
    if (trialDays > 0) {
        return (
            <Interpolate
                string={t('Start {amount}-day free trial')}
                mapping={{amount: trialDays}}
            />
        );
    }
    return t(noOfProducts > 1 ? 'Choose' : 'Continue');
}

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const {action} = useContext(AppContext);
    const disabled = ['signup:running', 'checkoutPlan:running'].includes(action) || isCookiesDisabled();
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const noOfProducts = products?.filter(p => p.type === 'paid')?.length ?? 0;
    const productDescription = product.description || (!product.benefits?.length && 'Full access');

    return (
        <div className={cardClass} key={product.id} onClick={e => {e.stopPropagation(); setSelectedProduct(product.id);}} data-test-tier="paid">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{productDescription}</div>
                    <ProductBenefitsContainer product={product} />
                </div>
                <div className="gh-portal-btn-product">
                    <button
                        data-test-button="select-tier"
                        disabled={disabled}
                        className="gh-portal-btn"
                        onClick={e => {
                            const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
                            handleChooseSignup(e, selectedPrice.id);
                        }}
                    >
                        <ProductCardButton
                            selectedProduct={selectedProduct}
                            product={product}
                            disabled={disabled}
                            noOfProducts={noOfProducts}
                            trialDays={product.trial_days}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return selectedPrice?.id && errors?.[selectedPrice.id] ? errors[selectedPrice.id] : null;
}

function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map(product => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});
        return product.id === 'free' ? (
            <FreeProductCard key={product.id} products={products} handleChooseSignup={handleChooseSignup} error={error} />
        ) : (
            <ProductCard
                key={product.id}
                product={product}
                products={products}
                selectedInterval={selectedInterval}
                handleChooseSignup={handleChooseSignup}
                error={error}
            />
        );
    });
}

function YearlyDiscount({discount}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (discount === 0 || !portalPlans.includes('monthly')) return null;
    const labelClass = hasFreeTrialTier({site}) ? 'gh-portal-discount-label-trial' : 'gh-portal-discount-label';
    return <span className={labelClass}>{t('{discount}% discount', {discount})}</span>;
}

function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const paidProducts = products.filter(p => p.type !== 'free');
    const highestYearlyDiscount = Math.max(
        ...paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount))
    );

    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) return null;

    return (
        <div className="gh-portal-logged-out-form-container">
            <div className={'gh-portal-products-pricetoggle' + (selectedInterval === 'month' ? ' left' : '')}>
                <button
                    data-test-button="switch-monthly"
                    data-testid="monthly-switch"
                    className={'gh-portal-btn' + (selectedInterval === 'month' ? ' active' : '')}
                    onClick={() => setSelectedInterval('month')}
                >
                    {t('Monthly')}
                </button>
                <button
                    data-test-button="switch-yearly"
                    data-testid="yearly-switch"
                    className={'gh-portal-btn' + (selectedInterval === 'year' ? ' active' : '')}
                    onClick={() => setSelectedInterval('year')}
                >
                    {t('Yearly')}
                    {highestYearlyDiscount > 0 && (
                        <span className="gh-portal-maximum-discount">
                            {t('(save {highestYearlyDiscount}%)', {highestYearlyDiscount})}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') return {id: 'free'};
    const product = products.find(p => p.id === selectedProduct) ?? products.find(p => p.type === 'paid');
    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    if (selectedInterval && portalPlans.includes(selectedInterval === 'month' ? 'monthly' : 'yearly')) {
        return selectedInterval;
    }
    if (portalDefaultPlan) {
        const defaultKey = portalDefaultPlan === 'monthly' ? 'monthly' : 'yearly';
        if (portalPlans.includes(defaultKey)) return defaultKey === 'monthly' ? 'month' : 'year';
    }
    return portalPlans.includes('yearly') ? 'year' : portalPlans.includes('monthly') ? 'month' : undefined;
}

/* Helper to render empty state for ProductsSection */
function renderEmptyState({isComplimentary, site}) {
    if (!isComplimentary) return null;
    const supportAddress = getSupportAddress({site});
    return (
        <p style={{textAlign: 'center'}}>
            {t('Please contact {supportAddress} to adjust your complimentary subscription.', {supportAddress})}
        </p>
    );
}

function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;
    const defaultProductId = products[0]?.id ?? 'free';

    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});

    const isComplimentary = isComplimentaryMember({member});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => setSelectedProduct(defaultProductId), [defaultProductId]);
    useEffect(() => onPlanSelect(null, selectedPrice.id), [selectedPrice.id, onPlanSelect]);

    if (!products.length) return renderEmptyState({isComplimentary, site});

    const className = [
        'gh-portal-products',
        type === 'upgrade' && 'gh-portal-upgrade-product'
    ].filter(Boolean).join(' ');

    const finalProductId = products.find(p => p.id === selectedProduct)?.id ?? products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct: finalProductId, setSelectedProduct}}>
            <section className={className}>
                {!hasOnlyFree && (
                    <ProductPriceSwitch
                        products={products}
                        selectedInterval={activeInterval}
                        setSelectedInterval={setSelectedInterval}
                    />
                )}
                <div className="gh-portal-products-grid">
                    <ProductCards
                        products={products}
                        selectedInterval={activeInterval}
                        handleChooseSignup={handleChooseSignup}
                        errors={errors}
                    />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

/* ChangeProductSection and related components remain unchanged */
export function ChangeProductSection({onPlanSelect, selectedPlan, products, type = null}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const activePrice = getMemberActivePrice({member});
    const activeMemberProduct = getProductFromPrice({site, priceId: activePrice.id});
    const defaultInterval = getActiveInterval({portalPlans, selectedInterval: activePrice.interval});
    const defaultProductId = activeMemberProduct?.id || products?.[0]?.id;
    const [selectedInterval, setSelectedInterval] = useState(defaultInterval);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);
    const activeInterval = getActiveInterval({portalPlans, selectedInterval});

    useEffect(() => setSelectedProduct(defaultProductId), [defaultProductId]);

    if (!portalPlans.includes('monthly') && !portalPlans.includes('yearly')) return null;
    if (!products.length) return null;

    const className = [
        'gh-portal-products',
        type === 'upgrade' && 'gh-portal-upgrade-product',
        type === 'changePlan' && 'gh-portal-upgrade-product gh-portal-change-plan'
    ].filter(Boolean).join(' ');

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct, selectedPlan, setSelectedProduct}}>
            <section className={className}>
                <ProductPriceSwitch selectedInterval={activeInterval} setSelectedInterval={setSelectedInterval} products={products} />
                <div className="gh-portal-products-grid">
                    <ChangeProductCards products={products} onPlanSelect={onPlanSelect} />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

function ProductDescription({product}) {
    return product?.description ? (
        <div className="gh-portal-product-description" data-testid="product-description">
            {product.description}
        </div>
    ) : null;
}

function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct, selectedInterval} = useContext(ProductsContext);
    const cardClass = [
        'gh-portal-product-card',
        selectedProduct === product.id && 'checked',
        isMemberActivePrice({member, site, priceId: (selectedInterval === 'month' ? product.monthlyPrice : product.yearlyPrice)?.id}) && 'disabled'
    ].filter(Boolean).join(' ');
    const selectedPrice = selectedInterval === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const currentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});

    return (
        <div className={cardClass} key={product.id} onClick={e => {e.stopPropagation(); setSelectedProduct(product.id);}} data-test-tier="paid">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    {product.description && <ProductDescription product={product} />}
                    <ProductBenefitsContainer product={product} />
                </div>
                {currentPlan ? (
                    <div className="gh-portal-btn-product">
                        <span className="gh-portal-current-plan"><span>{t('Current plan')}</span></span>
                    </div>
                ) : (
                    <div className="gh-portal-btn-product">
                        <button data-test-button="select-tier" className="gh-portal-btn" onClick={() => onPlanSelect(null, selectedPrice?.id)}>
                            {t('Choose')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function ChangeProductCards({products, onPlanSelect}) {
    return products.map(product => product && product.id !== 'free' ? (
        <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect} />
    ) : null);
}

export default ProductsSection;