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

/* ---------- Styles ---------- */
export const ProductsSectionStyles = () => {
    return `
        /* ... (styles unchanged) ... */
    `;
};

/* ---------- Context ---------- */
const ProductsContext = React.createContext({
    selectedInterval: 'month',
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

/* ---------- Helper Predicates ---------- */
/**
 * Determines if the portal supports both monthly and yearly plans.
 */
function hasBothPlans(portalPlans) {
    return portalPlans.includes('monthly') && portalPlans.includes('yearly');
}

/**
 * Returns the active interval based on selected interval, portal plans and default plan.
 */
function resolveActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    const hasMonthly = portalPlans.includes('monthly');
    const hasYearly = portalPlans.includes('yearly');

    if (selectedInterval === 'month' && hasMonthly) {
        return 'month';
    }
    if (selectedInterval === 'year' && hasYearly) {
        return 'year';
    }
    if (portalDefaultPlan) {
        if (portalDefaultPlan === 'monthly' && hasMonthly) {
            return 'month';
        }
        if (portalDefaultPlan === 'yearly' && hasYearly) {
            return 'year';
        }
    }
    if (hasYearly) {
        return 'year';
    }
    if (hasMonthly) {
        return 'month';
    }
    return undefined;
}

/* ---------- UI Sub‑components ---------- */
function ProductBenefits({product}) {
    if (!product.benefits?.length) {
        return null;
    }
    return product.benefits.map((benefit, idx) => {
        const key = benefit?.id || `benefit-${idx}`;
        return (
            <div className="gh-portal-product-benefit" key={key}>
                <CheckmarkIcon className="gh-portal-benefit-checkmark" alt="" />
                <div className="gh-portal-benefit-title">{benefit.name}</div>
            </div>
        );
    });
}

function ProductBenefitsContainer({product, hide = false}) {
    if (!product.benefits?.length || hide) {
        return null;
    }
    return (
        <div className="gh-portal-product-benefits">
            <ProductBenefits product={product} />
        </div>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (!hasBothPlans(portalPlans)) {
        return <div className="gh-portal-product-alternative-price"></div>;
    }
    return <div className="gh-portal-product-alternative-price">{getPriceString(price)}</div>;
}

/**
 * Renders discount label for trial days or yearly discount.
 */
function DiscountLabel({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);
    if (hasFreeTrialTier({site}) && trialDays) {
        return <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span>;
    }
    if (selectedInterval === 'year') {
        return <span className="gh-portal-discount-label">{t('{discount}% discount', {discount})}</span>;
    }
    return null;
}

/**
 * Renders the price display for a product.
 */
function PriceDisplay({price, interval, currencySymbol}) {
    return (
        <div className="gh-portal-product-price">
            <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
            <span className="amount" data-testid="product-amount">{formatNumber(getStripeAmount(price.amount))}</span>
            <span className="billing-period">/{interval}</span>
        </div>
    );
}

/**
 * Renders yearly discount label when applicable.
 */
function YearlyDiscount({discount}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    if (discount === 0 || !portalPlans.includes('monthly')) {
        return null;
    }
    const labelClass = hasFreeTrialTier({site}) ? 'gh-portal-discount-label-trial' : 'gh-portal-discount-label';
    return <span className={labelClass}>{t('{discount}% discount', {discount})}</span>;
}

/**
 * Renders the full price block for a product card.
 */
function ProductCardPrice({product}) {
    const {selectedInterval} = useContext(ProductsContext);
    const {site} = useContext(AppContext);
    const monthlyPrice = product.monthlyPrice;
    const yearlyPrice = product.yearlyPrice;
    const trialDays = product.trial_days;

    if (!monthlyPrice || !yearlyPrice) {
        return null;
    }

    const activePrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const alternatePrice = selectedInterval === 'month' ? yearlyPrice : monthlyPrice;
    const intervalLabel = activePrice.interval === 'year' ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(product.monthlyPrice.amount, product.yearlyPrice.amount);
    const currencySymbol = getCurrencySymbol(activePrice.currency);

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                <PriceDisplay price={activePrice} interval={intervalLabel} currencySymbol={currencySymbol} />
                <DiscountLabel trialDays={trialDays} discount={yearlyDiscount} selectedInterval={selectedInterval} />
            </div>
            {selectedInterval === 'year' && <YearlyDiscount discount={yearlyDiscount} />}
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

/* ---------- Core Card Components ---------- */
function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const product = getFreeProduct({site});
    const freeProductDescription = getFreeTierDescription({site}) || 'Free preview';
    const freeBenefits = getFreeProductBenefits({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    const cardBaseClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    const cardClass = hasOnlyFree && (!freeProductDescription && !freeBenefits.length) ? '' : `${cardBaseClass}${hasOnlyFree ? ' only-free' : ''}`;

    let disabled = ['signup:running'].includes(action) || isCookiesDisabled();

    // Determine currency symbol from first paid product if available
    let currencySymbol = '$';
    if (products?.[1]) {
        currencySymbol = getCurrencySymbol(products[1].monthlyPrice.currency);
    }

    return (
        <div className={cardClass} onClick={e => { e.stopPropagation(); setSelectedProduct('free'); }} data-test-tier="free">
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
    return <>{noOfProducts > 1 ? t('Choose') : t('Continue')}</>;
}

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const {action} = useContext(AppContext);
    const trialDays = product.trial_days;
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const noOfProducts = products?.filter(p => p.type === 'paid')?.length ?? 0;
    const disabled = ['signup:running', 'checkoutPlan:running'].includes(action) || isCookiesDisabled();

    let productDescription = product.description || 'Full access';

    return (
        <div className={cardClass} key={product.id} onClick={e => { e.stopPropagation(); setSelectedProduct(product.id); }} data-test-tier="paid">
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
                            trialDays={trialDays}
                        />
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

/* ---------- Card Collections ---------- */
function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return selectedPrice?.id && errors?.[selectedPrice.id] ? errors[selectedPrice.id] : null;
}

function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map(product => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});
        if (product.id === 'free') {
            return <FreeProductCard products={products} key={product.id} handleChooseSignup={handleChooseSignup} error={error} />;
        }
        return <ProductCard products={products} product={product} selectedInterval={selectedInterval} key={product.id} handleChooseSignup={handleChooseSignup} error={error} />;
    });
}

/* ---------- Price Switch ---------- */
function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const paidProducts = products.filter(p => p.type !== 'free');

    if (!hasBothPlans(portalPlans)) {
        return null;
    }

    const discounts = paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount));
    const highestYearlyDiscount = Math.max(...discounts);

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

/* ---------- Price Selection Helpers ---------- */
function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }
    let product = products.find(p => p.id === selectedProduct) || products.find(p => p.type === 'paid');
    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

/* ---------- Main Sections ---------- */
function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;
    const defaultProductId = products.length ? products[0].id : 'free';

    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = resolveActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});

    const isComplimentary = isComplimentaryMember({member});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    useEffect(() => {
        onPlanSelect(null, selectedPrice.id);
    }, [selectedPrice.id, onPlanSelect]);

    if (!products.length) {
        return isComplimentary ? (
            <p style={{textAlign: 'center'}}>
                {t('Please contact {supportAddress} to adjust your complimentary subscription.', {
                    supportAddress: getSupportAddress({site})
                })}
            </p>
        ) : null;
    }

    const containerClass = `gh-portal-products${type === 'upgrade' ? ' gh-portal-upgrade-product' : ''}`;
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
function ChangeProductSection({onPlanSelect, selectedPlan, products, type = null}) {
    const {site, member} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const activePrice = getMemberActivePrice({member});
    const activeMemberProduct = getProductFromPrice({site, priceId: activePrice.id});
    const defaultInterval = resolveActiveInterval({portalPlans, selectedInterval: activePrice.interval});
    const defaultProductId = activeMemberProduct?.id || products?.[0]?.id;

    const [selectedInterval, setSelectedInterval] = useState(defaultInterval);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);
    const activeInterval = resolveActiveInterval({portalPlans, selectedInterval});

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    if (!hasBothPlans(portalPlans) || !products.length) {
        return null;
    }

    const containerClass = `gh-portal-products${type === 'upgrade' ? ' gh-portal-upgrade-product' : ''}${type === 'changePlan' ? ' gh-portal-upgrade-product gh-portal-change-plan' : ''}`;

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

/* ---------- Change Product Cards ---------- */
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
    const cardClass = selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card';
    const monthlyPrice = product.monthlyPrice;
    const yearlyPrice = product.yearlyPrice;
    const memberActivePrice = getMemberActivePrice({member});
    const selectedPrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const isCurrentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});

    return (
        <div
            className={cardClass + (isCurrentPlan ? ' disabled' : '')}
            key={product.id}
            onClick={e => {
                e.stopPropagation();
                setSelectedProduct(product.id);
            }}
            data-test-tier="paid"
        >
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product} />
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    {product.description && <ProductDescription product={product} />}
                    <ProductBenefitsContainer product={product} />
                </div>
                {isCurrentPlan ? (
                    <div className="gh-portal-btn-product">
                        <span className="gh-portal-current-plan">
                            <span>{t('Current plan')}</span>
                        </span>
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

function ChangeProductCards({products, onPlanSelect}) {
    return products.map(product => {
        if (!product || product.id === 'free') {
            return null;
        }
        return <ChangeProductCard product={product} key={product.id} onPlanSelect={onPlanSelect} />;
    });
}

/* ---------- Export ---------- */
export default ProductsSection;
export {ChangeProductSection};