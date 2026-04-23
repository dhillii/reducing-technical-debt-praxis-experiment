import React, {useContext, useEffect, useState} from 'react';
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

export const ProductsSectionStyles = () => {
    return `
        /* (styles omitted for brevity – unchanged) */
    `;
};

const ProductsContext = React.createContext({
    selectedInterval: 'month',
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

/* ---------- Helper Components ---------- */

/**
 * Renders a list of benefit items.
 */
function ProductBenefits({product}) {
    if (!product.benefits?.length) {
        return null;
    }
    return product.benefits.map((benefit, idx) => {
        const key = benefit?.id || \`benefit-\${idx}\`;
        return (
            <div className="gh-portal-product-benefit" key={key}>
                <CheckmarkIcon className="gh-portal-benefit-checkmark" alt="" />
                <div className="gh-portal-benefit-title">{benefit.name}</div>
            </div>
        );
    });
}

/**
 * Wrapper for benefits – hides when empty or explicitly hidden.
 */
function ProductBenefitsContainer({product, hide = false}) {
    if (hide || !product.benefits?.length) {
        return null;
    }
    return (
        <div className="gh-portal-product-benefits">
            <ProductBenefits product={product} />
        </div>
    );
}

/**
 * Shows the alternative price when both monthly & yearly plans exist.
 */
function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) {
        return <div className="gh-portal-product-alternative-price"></div>;
    }
    return <div className="gh-portal-product-alternative-price">{getPriceString(price)}</div>;
}

/**
 * Renders trial‑day or discount label based on plan configuration.
 */
function ProductCardTrialDays({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);
    if (hasFreeTrialTier({site})) {
        return trialDays ? <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span> : null;
    }
    return selectedInterval === 'year' ? <span className="gh-portal-discount-label">{t('{discount}% discount', {discount})}</span> : null;
}

/**
 * Renders the price block for a product.
 */
function ProductCardPrice({product}) {
    const {selectedInterval} = useContext(ProductsContext);
    const {site} = useContext(AppContext);
    const {monthlyPrice, yearlyPrice, trial_days: trialDays} = product;

    if (!monthlyPrice || !yearlyPrice) {
        return null;
    }

    const activePrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const alternatePrice = selectedInterval === 'month' ? yearlyPrice : monthlyPrice;
    const intervalLabel = activePrice.interval === 'year' ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(product.monthlyPrice.amount, product.yearlyPrice.amount);
    const currencySymbol = getCurrencySymbol(activePrice.currency);
    const currencyClass = currencySymbol.length > 1 ? ' currency-sign long' : ' currency-sign';

    const priceBlock = (
        <div className="gh-portal-product-price">
            <span className={currencyClass}>{currencySymbol}</span>
            <span className="amount" data-testid="product-amount">{formatNumber(getStripeAmount(activePrice.amount))}</span>
            <span className="billing-period">/{intervalLabel}</span>
        </div>
    );

    const trialLabel = (
        <ProductCardTrialDays trialDays={trialDays} discount={yearlyDiscount} selectedInterval={selectedInterval} />
    );

    const yearlyDiscountLabel = selectedInterval === 'year' ? <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays} /> : null;

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                {priceBlock}
                {trialLabel}
            </div>
            {yearlyDiscountLabel}
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

/**
 * Renders a free‑tier product card.
 */
function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const product = getFreeProduct({site});
    const freeDescription = getFreeTierDescription({site});
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    const isRunning = ['signup:running'].includes(action) || isCookiesDisabled();
    const currencySymbol = products?.[1]?.monthlyPrice ? getCurrencySymbol(products[1].monthlyPrice.currency) : '$';
    const cardBaseClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    const cardClass = hasOnlyFree ? \`\${cardBaseClass} only-free\` : cardBaseClass;

    if (hasOnlyFree && !freeDescription && !freeBenefits.length) {
        return null;
    }

    const description = freeDescription || 'Free preview';

    return (
        <div className={cardClass} onClick={e => { e.stopPropagation(); setSelectedProduct('free'); }} data-test-tier="free">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={currencySymbol.length > 1 ? 'currency-sign long' : 'currency-sign'}>{currencySymbol}</span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                )}
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{description}</div>
                    <ProductBenefitsContainer product={product} />
                </div>
                {!hasOnlyFree && (
                    <div className="gh-portal-btn-product">
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
                            disabled={isRunning}
                            onClick={e => handleChooseSignup(e, 'free')}
                        >
                            {selectedProduct === 'free' && isRunning ? <LoaderIcon className="gh-portal-loadingicon" /> : t('Choose')}
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Determines the button label for a paid product card.
 */
function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) {
        return <LoaderIcon className="gh-portal-loadingicon" />;
    }
    if (trialDays > 0) {
        return (
            <Interpolate
                string={t('Start {amount}-day free trial')}
                mapping={{amount: trialDays}}
            />
        );
    }
    return noOfProducts > 1 ? t('Choose') : t('Continue');
}

/**
 * Renders a paid product card.
 */
function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const {action} = useContext(AppContext);
    const trialDays = product.trial_days;
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const paidCount = products?.filter(p => p.type === 'paid')?.length ?? 0;
    const disabled = ['signup:running', 'checkoutPlan:running'].includes(action) || isCookiesDisabled();

    const description = product.description || (product.benefits?.length ? '' : 'Full access');

    return (
        <div className={cardClass} key={product.id} onClick={e => { e.stopPropagation(); setSelectedProduct(product.id); }} data-test-tier="paid">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    <div className="gh-portal-product-description" data-testid="product-description">{description}</div>
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
                            noOfProducts={paidCount}
                            trialDays={trialDays}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

/**
 * Retrieves an error message for a specific product/price.
 */
function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return selectedPrice?.id && errors?.[selectedPrice.id] ? errors[selectedPrice.id] : null;
}

/**
 * Renders all product cards (free + paid).
 */
function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map(product => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});
        if (product.id === 'free') {
            return <FreeProductCard key={product.id} products={products} handleChooseSignup={handleChooseSignup} error={error} />;
        }
        return <ProductCard key={product.id} product={product} products={products} selectedInterval={selectedInterval} handleChooseSignup={handleChooseSignup} error={error} />;
    });
}

/**
 * Shows yearly discount label when applicable.
 */
function YearlyDiscount({discount, trialDays}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (discount === 0 || !portalPlans.includes('monthly')) {
        return null;
    }
    const labelClass = hasFreeTrialTier({site}) ? 'gh-portal-discount-label-trial' : 'gh-portal-discount-label';
    return <span className={labelClass}>{t('{discount}% discount', {discount})}</span>;
}

/**
 * Renders the monthly/yearly toggle switch.
 */
function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const paidProducts = products.filter(p => p.type !== 'free');

    const discounts = paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount));
    const highestYearlyDiscount = Math.max(...discounts);

    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) {
        return null;
    }

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

/**
 * Returns the selected price object based on current selections.
 */
function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }
    let product = products.find(p => p.id === selectedProduct) || products.find(p => p.type === 'paid');
    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

/**
 * Determines the active billing interval respecting site configuration.
 */
function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    if (selectedInterval && portalPlans.includes(selectedInterval === 'month' ? 'monthly' : 'yearly')) {
        return selectedInterval;
    }
    if (portalDefaultPlan) {
        const defaultKey = portalDefaultPlan === 'monthly' ? 'monthly' : 'yearly';
        if (portalPlans.includes(defaultKey)) {
            return defaultKey === 'monthly' ? 'month' : 'year';
        }
    }
    return portalPlans.includes('yearly') ? 'year' : 'month';
}

/**
 * Main products section component.
 */
function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;
    const defaultProductId = products.length ? products[0].id : 'free';

    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});

    const isComplimentary = isComplimentaryMember({member});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    useEffect(() => {
        onPlanSelect(null, selectedPrice.id);
    }, [selectedPrice.id, onPlanSelect]);

    if (!products.length) {
        if (isComplimentary) {
            const supportAddress = getSupportAddress({site});
            return (
                <p style={{textAlign: 'center'}}>
                    {t('Please contact {supportAddress} to adjust your complimentary subscription.', {supportAddress})}
                </p>
            );
        }
        return null;
    }

    const containerClass = ['gh-portal-products', type === 'upgrade' && 'gh-portal-upgrade-product'].filter(Boolean).join(' ');
    const finalProductId = products.find(p => p.id === selectedProduct)?.id || products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct: finalProductId, setSelectedProduct}}>
            <section className={containerClass}>
                {!hasOnlyFree && (
                    <ProductPriceSwitch
                        products={products}
                        selectedInterval={activeInterval}
                        setSelectedInterval={setSelectedInterval}
                    />
                )}
                <div className="gh-portal-products-grid">
                    <ProductCards products={products} selectedInterval={activeInterval} handleChooseSignup={handleChooseSignup} errors={errors} />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

/* ---------- Change Plan Section ---------- */

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

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    if (!portalPlans.includes('monthly') && !portalPlans.includes('yearly')) {
        return null;
    }
    if (!products.length) {
        return null;
    }

    const containerClass = [
        'gh-portal-products',
        type === 'upgrade' && 'gh-portal-upgrade-product',
        type === 'changePlan' && 'gh-portal-upgrade-product gh-portal-change-plan'
    ].filter(Boolean).join(' ');

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct, selectedPlan, setSelectedProduct}}>
            <section className={containerClass}>
                <ProductPriceSwitch selectedInterval={activeInterval} setSelectedInterval={setSelectedInterval} products={products} />
                <div className="gh-portal-products-grid">
                    <ChangeProductCards products={products} onPlanSelect={onPlanSelect} />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

/**
 * Renders a product description if present.
 */
function ProductDescription({product}) {
    return product?.description ? (
        <div className="gh-portal-product-description" data-testid="product-description">
            {product.description}
        </div>
    ) : null;
}

/**
 * Card used in the change‑plan flow.
 */
function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct, selectedInterval} = useContext(ProductsContext);
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const {monthlyPrice, yearlyPrice} = product;
    const selectedPrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const currentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});

    return (
        <div className={\`\${cardClass}\${currentPlan ? ' disabled' : ''}\`} key={product.id} onClick={e => { e.stopPropagation(); setSelectedProduct(product.id); }} data-test-tier="paid">
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
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
                            onClick={() => onPlanSelect(null, selectedPrice?.id)}
                        >
                            {t('Choose')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * Renders change‑plan cards, skipping free tier.
 */
function ChangeProductCards({products, onPlanSelect}) {
    return products.map(product => {
        if (!product || product.id === 'free') {
            return null;
        }
        return <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect} />;
    });
}

export default ProductsSection;