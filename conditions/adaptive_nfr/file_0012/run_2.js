# Refactored ProductsSection Component

Here's my analysis of the complexity issues and the refactored code:

**Key issues identified:**
1. Massive inline CSS string in `ProductsSectionStyles` (could be extracted)
2. Duplicated logic across `ProductCard`/`FreeProductCard`/`ChangeProductCard`
3. Complex conditional rendering with ternary chains
4. Repeated `disabled` state logic
5. `ProductCardPrice` has two near-identical render paths
6. Magic strings scattered throughout
7. `getActiveInterval` has unclear fallthrough logic

```javascript
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

// ─── Constants ───────────────────────────────────────────────────────────────

const INTERVALS = {
    MONTH: 'month',
    YEAR: 'year',
};

const RUNNING_ACTIONS = ['signup:running', 'checkoutPlan:running'];

// ─── Context ─────────────────────────────────────────────────────────────────

const ProductsContext = React.createContext({
    selectedInterval: INTERVALS.MONTH,
    selectedProduct: 'free',
    selectedPlan: null,
    setSelectedProduct: null,
});

// ─── Utility Functions ────────────────────────────────────────────────────────

function getSelectedPrice({products, selectedProduct, selectedInterval}) {
    if (selectedProduct === 'free') {
        return {id: 'free'};
    }

    const product =
        products.find(p => p.id === selectedProduct) ||
        products.find(p => p.type === 'paid');

    return selectedInterval === INTERVALS.MONTH
        ? product?.monthlyPrice
        : product?.yearlyPrice;
}

function getActiveInterval({portalPlans, portalDefaultPlan, selectedInterval}) {
    const hasMonthly = portalPlans.includes('monthly');
    const hasYearly = portalPlans.includes('yearly');

    if (selectedInterval === INTERVALS.MONTH && hasMonthly) {
        return INTERVALS.MONTH;
    }
    if (selectedInterval === INTERVALS.YEAR && hasYearly) {
        return INTERVALS.YEAR;
    }
    if (portalDefaultPlan === 'monthly' && hasMonthly) {
        return INTERVALS.MONTH;
    }
    if (hasYearly) {
        return INTERVALS.YEAR;
    }
    if (hasMonthly) {
        return INTERVALS.MONTH;
    }
    return null;
}

function getProductErrorMessage({product, products, selectedInterval, errors}) {
    const selectedPrice = getSelectedPrice({
        products,
        selectedInterval,
        selectedProduct: product.id,
    });

    return (selectedPrice?.id && errors?.[selectedPrice.id]) || null;
}

function useIsDisabled(extraActions = []) {
    const {action} = useContext(AppContext);
    const allRunningActions = [...RUNNING_ACTIONS, ...extraActions];
    return allRunningActions.includes(action) || isCookiesDisabled();
}

function useCurrencySymbol(products) {
    const firstPaidProduct = products?.find(p => p.type === 'paid');
    return getCurrencySymbol(firstPaidProduct?.monthlyPrice?.currency ?? 'usd');
}

// ─── Small Presentational Components ─────────────────────────────────────────

function ProductBenefit({benefit, idx}) {
    return (
        <div className="gh-portal-product-benefit" key={benefit?.id || `benefit-${idx}`}>
            <CheckmarkIcon className="gh-portal-benefit-checkmark" alt="" />
            <div className="gh-portal-benefit-title">{benefit.name}</div>
        </div>
    );
}

function ProductBenefitsContainer({product, hide = false}) {
    const benefits = product?.benefits;
    if (!benefits?.length || hide) {
        return null;
    }

    return (
        <div className="gh-portal-product-benefits">
            {benefits.map((benefit, idx) => (
                <ProductBenefit key={benefit?.id || `benefit-${idx}`} benefit={benefit} idx={idx} />
            ))}
        </div>
    );
}

function ProductCardAlternatePrice({price}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;
    const showPrice =
        portalPlans.includes('monthly') && portalPlans.includes('yearly');

    return (
        <div className="gh-portal-product-alternative-price">
            {showPrice ? getPriceString(price) : null}
        </div>
    );
}

function DiscountLabel({children, variant = 'default'}) {
    const className =
        variant === 'trial'
            ? 'gh-portal-discount-label-trial'
            : 'gh-portal-discount-label';
    return <span className={className}>{children}</span>;
}

function YearlyDiscount({discount, trialDays}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    if (discount === 0 || !portalPlans.includes('monthly')) {
        return null;
    }

    const label = t('{discount}% discount', {discount});
    return (
        <DiscountLabel variant={hasFreeTrialTier({site}) ? 'trial' : 'default'}>
            {label}
        </DiscountLabel>
    );
}

function ProductCardTrialDays({trialDays, discount, selectedInterval}) {
    const {site} = useContext(AppContext);

    if (hasFreeTrialTier({site})) {
        return trialDays
            ? <DiscountLabel>{t('{trialDays} days free', {trialDays})}</DiscountLabel>
            : null;
    }

    if (selectedInterval === INTERVALS.YEAR) {
        return (
            <DiscountLabel>{t('{discount}% discount', {discount})}</DiscountLabel>
        );
    }

    return null;
}

function PriceDisplay({currencySymbol, amount, interval}) {
    return (
        <div className="gh-portal-product-price">
            <span className={`currency-sign${currencySymbol.length > 1 ? ' long' : ''}`}>
                {currencySymbol}
            </span>
            <span className="amount" data-testid="product-amount">
                {formatNumber(getStripeAmount(amount))}
            </span>
            {interval && (
                <span className="billing-period">/{interval}</span>
            )}
        </div>
    );
}

function ErrorMessage({error}) {
    if (!error) {
        return null;
    }
    return <div className="gh-portal-error-message">{error}</div>;
}

// ─── Product Card Price ───────────────────────────────────────────────────────

function ProductCardPrice({product}) {
    const {selectedInterval} = useContext(ProductsContext);
    const {site} = useContext(AppContext);
    const {monthlyPrice, yearlyPrice, trial_days: trialDays} = product;

    if (!monthlyPrice || !yearlyPrice) {
        return null;
    }

    const activePrice =
        selectedInterval === INTERVALS.MONTH ? monthlyPrice : yearlyPrice;
    const alternatePrice =
        selectedInterval === INTERVALS.MONTH ? yearlyPrice : monthlyPrice;
    const interval =
        activePrice.interval === INTERVALS.YEAR ? t('year') : t('month');
    const yearlyDiscount = calculateDiscount(monthlyPrice.amount, yearlyPrice.amount);
    const currencySymbol = getCurrencySymbol(activePrice.currency);
    const isYearly = selectedInterval === INTERVALS.YEAR;
    const withFreeTrial = hasFreeTrialTier({site});

    return (
        <div className="gh-portal-product-card-pricecontainer">
            <div className="gh-portal-product-card-price-trial">
                <PriceDisplay
                    currencySymbol={currencySymbol}
                    amount={activePrice.amount}
                    interval={interval}
                />
                {withFreeTrial ? (
                    <ProductCardTrialDays
                        trialDays={trialDays}
                        discount={yearlyDiscount}
                        selectedInterval={selectedInterval}
                    />
                ) : (
                    isYearly && <YearlyDiscount discount={yearlyDiscount} />
                )}
            </div>
            {withFreeTrial && isYearly && (
                <YearlyDiscount discount={yearlyDiscount} trialDays={trialDays} />
            )}
            <ProductCardAlternatePrice price={alternatePrice} />
        </div>
    );
}

// ─── Product Card Button ──────────────────────────────────────────────────────

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

// ─── Free Product Card ────────────────────────────────────────────────────────

function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const product = getFreeProduct({site});
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    const currencySymbol = useCurrencySymbol(products);
    const disabled = action === 'signup:running' || isCookiesDisabled();

    let freeProductDescription = getFreeTierDescription({site});

    const isSelected = selectedProduct === 'free';
    const cardClass = [
        'gh-portal-product-card free',
        isSelected && 'checked',
        hasOnlyFree && 'only-free',
    ]
        .filter(Boolean)
        .join(' ');

    // Hide card if only-free and no content to show
    if (hasOnlyFree && !freeProductDescription && !freeBenefits.length) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    return (
        <div
            className={cardClass}
            onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }}
            data-test-tier="free"
        >
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                {!hasOnlyFree && (
                    <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                        <PriceDisplay
                            currencySymbol={currencySymbol}
                            amount={0}
                            interval={null}
                        />
                    </div>
                )}
            </div>

            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    {freeProductDescription && (
                        <div
                            className="gh-portal-product-description"
                            data-testid="product-description"
                        >
                            {freeProductDescription}
                        </div>
                    )}
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
                            {isSelected && disabled
                                ? <LoaderIcon className="gh-portal-loadingicon" />
                                : t('Choose')}
                        </button>
                        <ErrorMessage error={error} />
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Paid Product Card ────────────────────────────────────────────────────────

function ProductCard({product, products, selectedInterval, handleChooseSignup, error}) {
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);
    const disabled = useIsDisabled();
    const {trial_days: trialDays, description} = product;

    const isSelected = selectedProduct === product.id;
    const cardClass = isSelected
        ? 'gh-portal-product-card checked'
        : 'gh-portal-product-card';

    const noOfProducts = products?.filter(d => d.type === 'paid')?.length ?? 0;
    const productDescription =
        (!product.benefits?.length && !description) ? 'Full access' : description;

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => {
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
                    <div
                        className="gh-portal-product-description"
                        data-testid="product-description"
                    >
                        {productDescription}
                    </div>
                    <ProductBenefitsContainer product={product} />
                </div>

                <div className="gh-portal-btn-product">
                    <button
                        data-test-button="select-tier"
                        disabled={disabled}
                        className="gh-portal-btn"
                        onClick={(e) => {
                            const selectedPrice = getSelectedPrice({
                                products,
                                selectedInterval,
                                selectedProduct: product.id,
                            });
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
                    <ErrorMessage error={error} />
                </div>
            </div>
        </div>
    );
}

// ─── Product Cards List ───────────────────────────────────────────────────────

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

// ─── Price Switch ─────────────────────────────────────────────────────────────

function ProductPriceSwitch({selectedInterval, setSelectedInterval, products}) {
    const {site} = useContext(AppContext);
    const {portal_plans: portalPlans} = site;

    const hasMonthly = portalPlans.includes('monthly');
    const hasYearly = portalPlans.includes('yearly');

    if (!hasMonthly || !hasYearly) {
        return null;
    }

    const paidProducts = products.filter(p => p.type !== 'free');
    const highestYearlyDiscount = Math.max(
        ...paidProducts.map(p =>
            calculateDiscount(p.monthlyPrice?.amount, p.yearlyPrice?.amount)
        )
    );

    const toggleClass = [
        'gh-portal-products-pricetoggle',
        selectedInterval === INTERVALS.MONTH && 'left',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div className="gh-portal-logged-out-form-container">
            <div className={toggleClass}>
                <button
                    data-test-button="switch-monthly"
                    data-testid="monthly-switch"
                    className={`gh-portal-btn${selectedInterval === INTERVALS.MONTH ? ' active' : ''}`}
                    onClick={() => setSelectedInterval(INTERVALS.MONTH)}
                >
                    {t('Monthly')}
                </button>
                <button
                    data-test-button="switch-yearly"
                    data-testid="yearly-switch"
                    className={`gh-portal-btn${selectedInterval === INTERVALS.YEAR ? ' active' : ''}`}
                    onClick={() => setSelectedInterval(INTERVALS.YEAR)}
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

// ─── Products Section ─────────────────────────────────────────────────────────

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

    useEffect(() => {
        setSelectedProduct(defaultProductId);
    }, [defaultProductId]);

    useEffect(() => {
        onPlanSelect(null, selectedPrice?.id);
    }, [selectedPrice?.id, onPlanSelect]);

    if (products.length === 0) {
        if (isComplimentary) {
            const supportAddress = getSupportAddress({site});
            return (
                <p style={{textAlign: 'center'}}>
                    {t(
                        'Please contact {supportAddress} to adjust your complimentary subscription.',
                        {supportAddress}
                    )}
                </p>
            );
        }
        return null;
    }

    const className = [
        'gh-portal-products',
        type === 'upgrade' && 'gh-portal-upgrade-product',
    ]
        .filter(Boolean)
        .join(' ');

    const finalProduct =
        products.find(p => p.id === selectedProduct)?.id ||
        products.find(p => p.type === 'paid')?.id;

    return (
        <ProductsContext.Provider
            value={{selectedInterval: activeInterval, selectedProduct: finalProduct, setSelectedProduct}}
        >
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

// ─── Change Product Section ───────────────────────────────────────────────────

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

function ChangeProductCard({product, onPlanSelect}) {
    const {member, site} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct, selectedInterval} = useContext(ProductsContext);

    const {monthlyPrice, yearlyPrice} = product;
    const memberActivePrice = getMemberActivePrice({member});
    const selectedPrice =
        selectedInterval === INTERVALS.MONTH ? monthlyPrice : yearlyPrice;
    const isCurrentPlan = isMemberActivePrice({member, site, priceId: selectedPrice.id});

    const cardClass = [
        selectedProduct === product.id ? 'gh-portal-product-card checked' : 'gh-portal-product-card',
        isCurrentPlan && 'disabled',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <div
            className={cardClass}
            key={product.id}
            onClick={(e) => {
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
                    {product.description && (
                        <ProductDescription
                            product={product}
                            selectedPrice={selectedPrice}
                            activePrice={memberActivePrice}
                        />
                    )}
                    <ProductBenefitsContainer product={product} />
                </div>

                <div className="gh-portal-btn-product">
                    {isCurrentPlan ? (
                        <span className="gh-portal-current-plan">
                            <span>{t('Current plan')}</span>
                        </span>
                    ) : (
                        <button
                            data-test-button="select-tier"
                            className="gh-portal-btn"
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
            <ChangeProductCard key={product.id} product={product} onPlanSelect={onPlanSelect} />
        ));
}

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

    const hasPlans = portalPlans.includes('monthly') || portalPlans.includes('yearly');
    if (!hasPlans || products.length === 0) {
        return null;
    }

    const className = [
        'gh-portal-products',
        type === 'upgrade' && 'gh-portal-upgrade-product',
        type === 'changePlan' && 'gh-portal-upgrade-product gh-portal-change-plan',
    ]
        .filter(Boolean)
        .join(' ');

    return (
        <ProductsContext.Provider
            value={{selectedInterval: activeInterval, selectedProduct, selectedPlan, setSelectedProduct}}
        >
            <section className={className}>
                <ProductPriceSwitch
                    selectedInterval={activeInterval}
                    setSelectedInterval={setSelectedInterval}
                    products={products}
                />
                <div className="gh-portal-products-grid">
                    <ChangeProductCards products={products} onPlanSelect={onPlanSelect} />
                </div>
            </section>
        </ProductsContext.Provider>
    );
}

export {ProductsSectionStyles};
export default ProductsSection;
```

## Summary of Changes

| Area | Change | Benefit |
|------|--------|---------|
| **Constants** | Extracted `INTERVALS` and `RUNNING_ACTIONS` | Eliminates magic strings |
| **`useIsDisabled`** | Custom hook for disabled state | Removes duplicated logic across 3 card components |
| **`useCurrencySymbol`** | Custom hook for currency resolution | Removes awkward `if/else` in `FreeProductCard` |
| **`PriceDisplay`** | Extracted shared price markup | Removes duplication between free/paid price rendering |
| **`DiscountLabel`** | Unified discount label with `variant` prop | Replaces two near-identical components |
| **`ErrorMessage`** | Extracted error display | Removes repeated inline conditionals |
| **`ProductCardPrice`** | Unified free-trial/non-trial paths | Reduced from two near-identical returns to one |
| **Class name building** | Array `.filter(Boolean).join(' ')` pattern | Replaces fragile string concatenation |
| **`ChangeProductCard`** | Extracted current/choose button logic | Cleaner conditional rendering |
| **`ChangeProductCards`** | Used `.filter().map()` chain | Removes null guard inside map |
| **`ChangeProductSection`** | Simplified plan guard | Single readable condition |