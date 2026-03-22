Here's the refactored code with reduced complexity, improved readability, and better separation of concerns:

```jsx
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

// ─── Context ────────────────────────────────────────────────────────────────

const ProductsContext = React.createContext({
    selectedInterval: 'month',
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null
});

// ─── Hooks ──────────────────────────────────────────────────────────────────

function useProductsContext() {
    return useContext(ProductsContext);
}

function useAppContext() {
    return useContext(AppContext);
}

function useIsDisabled(actions = ['signup:running']) {
    const {action} = useAppContext();
    return actions.includes(action) || isCookiesDisabled();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }

    const product = products.find(p => p.id === selectedProduct) 
        ?? products.find(p => p.type === 'paid');

    return selectedInterval === 'month' ? product?.monthlyPrice : product?.yearlyPrice;
}

function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    const intervalMap = {month: 'monthly', year: 'yearly'};
    const planKey = intervalMap[selectedInterval];

    if (planKey && portalPlans.includes(planKey)) {
        return selectedInterval;
    }

    if (portalDefaultPlan === 'monthly' && portalPlans.includes('monthly')) {
        return 'month';
    }

    if (portalPlans.includes('yearly')) {
        return 'year';
    }

    if (portalPlans.includes('monthly')) {
        return 'month';
    }
}

function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
    return (selectedPrice?.id && errors?.[selectedPrice.id]) || null;
}

function getCurrencySymbolForProducts(products) {
    return getCurrencySymbol(products?.[1]?.monthlyPrice?.currency) ?? '$';
}

function buildClassName(base, conditions = {}) {
    return Object.entries(conditions)
        .filter(([, active]) => active)
        .reduce((cls, [name]) => `${cls} ${name}`, base);
}

// ─── Small UI Components ─────────────────────────────────────────────────────

function ProductBenefits({product}) {
    if (!product.benefits?.length) {
        return null;
    }

    return product.benefits.map((benefit, idx) => (
        <div className="gh-portal-product-benefit" key={benefit?.id ?? `benefit-${idx}`}>
            <CheckmarkIcon className='gh-portal-benefit-checkmark' alt=''/>
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    ));
}

function ProductBenefitsContainer({product, hide = false}) {
    if (!product.benefits?.length || hide) {
        return null;
    }

    return (
        <div className="gh-portal-product-benefits">
            <ProductBenefits product={product}/>
        </div>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useAppContext();
    const {portal_plans: portalPlans} = site;
    const showPrice = portalPlans.includes('monthly') && portalPlans.includes('yearly');

    return (
        <div className="gh-portal-product-alternative-price">
            {showPrice ? getPriceString(price) : ''}
        </div>
    );
}

function ProductCardTrialDays({trialDays, discount, selectedInterval}) {
    const {site} = useAppContext();

    if (hasFreeTrialTier({site})) {
        return trialDays
            ? <span className="gh-portal-discount-label">{t('{trialDays} days free', {trialDays})}</span>
            : null;
    }

    if (selectedInterval === 'year') {
        return <span className="gh-portal-discount-label">{t('{discount}% discount', {discount})}</span>;
    }

    return null;
}

function YearlyDiscount({discount}) {
    const {site} = useAppContext();
    const {portal_plans: portalPlans} = site;

    if (discount === 0 || !portalPlans.includes('monthly')) {
        return null;
    }

    const labelClass = hasFreeTrialTier({site})
        ? 'gh-portal-discount-label-trial'
        : 'gh-portal-discount-label';

    return <span className={labelClass}>{t('{discount}% discount', {discount})}</span>;
}

function ProductDescription({product}) {
    if (!product?.description) {
        return null;
    }

    return (
        <div className="gh-portal-product-description" data-testid="product-description">
            {product.description}
        </div>
    );
}

// ─── Price Components ────────────────────────────────────────────────────────

function PriceDisplay({activePrice, interval}) {
    const currencySymbol = getCurrencySymbol(activePrice.currency);

    return (
        <div className="gh-portal-product-price">
            <span className={`currency-sign${currencySymbol.length > 1 ? ' long' : ''}`}>
                {currencySymbol}
            </span>
            <span className="amount" data-testid="product-amount">
                {formatNumber(getStripeAmount(activePrice.amount))}
            </span>
            <span className="billing-period">/{interval}</span>
        </div>
    );
}

function ProductCardPrice({product}) {
    const {selectedInterval} = useProductsContext();
    const {site} = useAppContext();

    const {monthlyPrice, yearlyPrice, trial_days: trialDays} = product;

    if (!monthlyPrice || !yearlyPrice) {
        return null;
    }

    const activePrice = selectedInterval === 'month' ? monthlyPrice : yearlyPrice;
    const alternatePrice = selectedInterval === 'month' ? yearlyPrice : monthlyPrice;
    const interval = activePrice.interval === 'year' ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(monthlyPrice.amount, yearlyPrice.amount);
    const isTrialTier = hasFreeTrialTier({site});

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                <PriceDisplay activePrice={activePrice} interval={interval}/>
                {isTrialTier
                    ? <ProductCardTrialDays trialDays={trialDays} discount={yearlyDiscount} selectedInterval={selectedInterval}/>
                    : selectedInterval === 'year' && <YearlyDiscount discount={yearlyDiscount}/>
                }
            </div>
            {isTrialTier && selectedInterval === 'year' && (
                <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays}/>
            )}
            <ProductCardAlternatePrice price={alternatePrice}/>
        </div>
    );
}

// ─── Product Card Button ─────────────────────────────────────────────────────

function ProductCardButton({selectedProduct, product, disabled, noOfProducts, trialDays}) {
    if (selectedProduct === product.id && disabled) {
        return <LoaderIcon className='gh-portal-loadingicon'/>;
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

// ─── Free Product Card ───────────────────────────────────────────────────────

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useAppContext();
    const {selectedProduct, setSelectedProduct} = useProductsContext();

    const product = getFreeProduct({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    const freeDescription = getFreeTierDescription({site}) || (!freeBenefits.length ? 'Free preview' : '');
    const currencySymbol = getCurrencySymbolForProducts(products);
    const disabled = action === 'signup:running' || isCookiesDisabled();
    const isSelected = selectedProduct === 'free';

    const cardClass = buildClassName('gh-portal-product-card free', {
        checked: isSelected,
        'only-free': hasOnlyFree
    });

    if (hasOnlyFree && !freeDescription && !freeBenefits.length) {
        return null;
    }

    return (
        <div
            className={cardClass}
            onClick={(e) => { e.stopPropagation(); setSelectedProduct('free'); }}
            data-test-tier="free"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <div className="gh-portal-product-price">
                            <span className={`currency-sign${currencySymbol.length > 1 ? ' long' : ''}`}>
                                {currencySymbol}
                            </span>
                            <span className="amount" data-testid="product-amount">0</span>
                        </div>
                    </div>
                )}
            </div>
            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    {freeDescription && (
                        <div className="gh-portal-product-description" data-testid="product-description">
                            {freeDescription}
                        </div>
                    )}
                    <ProductBenefitsContainer product={product}/>
                </div>
                {!hasOnlyFree && (
                    <div className='gh-portal-btn-product'>
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            disabled={disabled}
                            onClick={(e) => handleChooseSignup(e, 'free')}
                        >
                            {isSelected && disabled
                                ? <LoaderIcon className='gh-portal-loadingicon'/>
                                : t('Choose')
                            }
                        </button>
                        {error && <div className="gh-portal-error-message">{error}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Paid Product Card ───────────────────────────────────────────────────────

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useProductsContext();
    const disabled = useIsDisabled(['signup:running', 'checkoutPlan:running']);

    const {trial_days: trialDays} = product;
    const cardClass = buildClassName('gh-portal-product-card', {checked: selectedProduct === product.id});
    const noOfProducts = products?.filter(d => d.type === 'paid')?.length;
    const productDescription = product.description
        || (!product.benefits?.length ? 'Full access' : '');

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => { e.stopPropagation(); setSelectedProduct(product.id); }}
            data-test-tier="paid"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product}/>
            </div>
            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    <div className="gh-portal-product-description" data-testid="product-description">
                        {productDescription}
                    </div>
                    <ProductBenefitsContainer product={product}/>
                </div>
                <div className='gh-portal-btn-product'>
                    <button
                        data-test-button='select-tier'
                        disabled={disabled}
                        className='gh-portal-btn'
                        onClick={(e) => {
                            const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct: product.id});
                            handleChooseSignup(e, selectedPrice.id);
                        }}
                    >
                        <ProductCardButton {...{selectedProduct, product, disabled, noOfProducts, trialDays}}/>
                    </button>
                    {error && <div className="gh-portal-error-message">{error}</div>}
                </div>
            </div>
        </div>
    );
}

function ProductCards({products, selectedInterval, handleChooseSignup, errors}) {
    return products.map((product) => {
        const error = getProductErrorMessage({product, products, selectedInterval, errors});

        if (product.id === 'free') {
            return (
                <FreeProductCard
                    key={product.id}
                    products={products}
                    handleChooseSignup={handleChooseSignup}
                    error={error}
                />
            );
        }

        return (
            <ProductCard
                key={product.id}
                products={products}
                product={product}
                selectedInterval={selectedInterval}
                handleChooseSignup={handleChooseSignup}
                error={error}
            />
        );
    });
}

// ─── Price Switch ────────────────────────────────────────────────────────────

function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useAppContext();
    const {portal_plans: portalPlans} = site;
    const paidProducts = products.filter(p => p.type !== 'free');

    const highestYearlyDiscount = Math.max(
        ...paidProducts.map(p => calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount))
    );

    if (!portalPlans.includes('monthly') || !portalPlans.includes('yearly')) {
        return null;
    }

    const toggleClass = buildClassName('gh-portal-products-pricetoggle', {
        left: selectedInterval === 'month'
    });

    return (
        <div className='gh-portal-logged-out-form-container'>
            <div className={toggleClass}>
                <button
                    data-test-button='switch-monthly'
                    data-testid="monthly-switch"
                    className={`gh-portal-btn${selectedInterval === 'month' ? ' active' : ''}`}
                    onClick={() => setSelectedInterval('month')}
                >
                    {t('Monthly')}
                </button>
                <button
                    data-test-button='switch-yearly'
                    data-testid="yearly-switch"
                    className={`gh-portal-btn${selectedInterval === 'year' ? ' active' : ''}`}
                    onClick={() => setSelectedInterval('year')}
                >
                    {t('Yearly')}
                    {highestYearlyDiscount > 0 && (
                        <span className='gh-portal-maximum-discount'>
                            {t('(save {highestYearlyDiscount}%)', {highestYearlyDiscount})}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}

// ─── Change Plan Components ──────────────────────────────────────────────────

function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useAppContext();
    const {selectedProduct, setSelectedProduct, selectedInterval} = useProductsContext();

    const selectedPrice = selectedInterval === 'month' ? product.monthlyPrice : product.yearlyPrice;
    const currentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});
    const memberActivePrice = getMemberActivePrice({member});

    const cardClass = buildClassName('gh-portal-product-card', {
        checked: selectedProduct === product.id,
        disabled: currentPlan
    });

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => { e.stopPropagation(); setSelectedProduct(product.id); }}
            data-test-tier="paid"
        >
            <div className='gh-portal-product-card-header'>
                <h4 className="gh-portal-product-name">{product.name}</h4>
                <ProductCardPrice product={product}/>
            </div>
            <div className='gh-portal-product-card-details'>
                <div className='gh-portal-product-card-detaildata'>
                    {product.description && (
                        <ProductDescription
                            product={product}
                            selectedPrice={selectedPrice}
                            activePrice={memberActivePrice}
                        />
                    )}
                    <ProductBenefitsContainer product={product}/>
                </div>
                <div className='gh-portal-btn-product'>
                    {currentPlan ? (
                        <span className='gh-portal-current-plan'>
                            <span>{t('Current plan')}</span>
                        </span>
                    ) : (
                        <button
                            data-test-button='select-tier'
                            className='gh-portal-btn'
                            onClick={() => onPlanSelect(null, selectedPrice?.id)}
                        >
                            {t('Choose')}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function ChangeProductCards({products, onPlanSelect}) {
    return products
        .filter(product => product && product.id !== 'free')
        .map(product => (
            <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect}/>
        ));
}

// ─── Main Section Components ─────────────────────────────────────────────────

function ProductsSection({onPlanSelect, products, type = null, handleChooseSignup, errors}) {
    const {site, member} = useAppContext();
    const {portal_plans: portalPlans, portal_default_plan: portalDefaultPlan} = site;

    const defaultProductId = products[0]?.id ?? 'free';
    const [selectedInterval, setSelectedInterval] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);

    const selectedPrice = getSelectedPrice({products, selectedInterval, selectedProduct});
    const activeInterval = getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval});
    const isComplimentary = isComplimentaryMember({member});
    const hasOnlyFree = hasOnlyFreeProduct({site});

    useEffect(() => { setSelectedProduct(defaultProductId); }, [defaultProductId]);
    useEffect(() => { onPlanSelect(null, selectedPrice.id); }, [selectedPrice.id, onPlanSelect]);

    if (products.length === 0) {
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

    const className = buildClassName('gh-portal-products', {
        'gh-portal-upgrade-product': type === 'upgrade'
    });

    const finalProduct = products.find(p => p.id === selectedProduct)?.id
        ?? products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct: finalProduct, setSelectedProduct}}>
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

export function ChangeProductSection({onPlanSelect, selectedPlan, products, type = null}) {
    const {site, member} = useAppContext();
    const {portal_plans: portalPlans} = site;

    const activePrice = getMemberActivePrice({member});
    const activeMemberProduct = getProductFromPrice({site, priceId: activePrice.id});
    const defaultInterval = getActiveInterval({portalPlans, selectedInterval: activePrice.interval});
    const defaultProductId = activeMemberProduct?.id ?? products?.[0]?.id;

    const [selectedInterval, setSelectedInterval] = useState(defaultInterval);
    const [selectedProduct, setSelectedProduct] = useState(defaultProductId);
    const activeInterval = getActiveInterval({portalPlans, selectedInterval});

    useEffect(() => { setSelectedProduct(defaultProductId); }, [defaultProductId]);

    const hasValidPlans = portalPlans.includes('monthly') || portalPlans.includes('yearly');
    if (!hasValidPlans || products.length === 0) {
        return null;
    }

    const className = buildClassName('gh-portal-products', {
        'gh-portal-upgrade-product': type === 'upgrade' || type === 'changePlan',
        'gh-portal-change-plan': type === 'changePlan'
    });

    return (
        <ProductsContext.Provider value={{selectedInterval: activeInterval, selectedProduct, selectedPlan, setSelectedProduct}}>
            <section className={className}>
                <ProductPriceSwitch
                    selectedInterval={activeInterval}
                    setSelectedInterval={setSelectedInterval}
                    products={products}
                />
                <div className="gh-portal-products-grid">
                    <ChangeProductCards products={products} onPlanSelect={onPlanSelect}/>
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

export {ProductsSectionStyles};
export default ProductsSection;
```

Key refactoring changes made:

1. **Custom hooks** (`useProductsContext`, `useAppContext`, `useIsDisabled`) to reduce repetitive `useContext` calls and encapsulate logic.

2. **`buildClassName` utility** to replace verbose ternary-based class string construction throughout the components.

3. **`PriceDisplay` component** extracted from `ProductCardPrice` to eliminate duplicated price rendering markup.

4. **Simplified `ProductCardPrice`** by removing the duplicated `hasFreeTrialTier` branch — the logic now flows through a single return with conditional rendering.

5. **`getCurrencySymbolForProducts` helper** to centralize the repeated currency symbol fallback logic.

6. **Eliminated fragment wrappers** (`<>...</>`) where they were unnecessary (single root elements).

7. **Replaced ternary-with-empty-string** patterns (e.g., `condition ? <X/> : ''`) with proper conditional rendering (`condition && <X/>`).

8. **`ChangeProductCards` filter** replaced the `if (!product || product.id === 'free') return null` pattern with a `.filter()` before `.map()`.

9. **`getActiveInterval`** simplified with an interval map lookup to reduce repetition.

10. **`ChangeProductSection`** early-return conditions merged into a single guard clause.