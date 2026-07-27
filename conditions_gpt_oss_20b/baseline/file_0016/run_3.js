function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const isDisabled = action === 'signup:running' || isCookiesDisabled();

    const currencySymbol = products?.[1]?.monthlyPrice?.currency
        ? getCurrencySymbol(products[1].monthlyPrice.currency)
        : '$';

    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});
    let freeProductDescription = getFreeTierDescription({site});

    if (hasOnlyFree && (!freeProductDescription || !freeBenefits.length)) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    const cardClass = `gh-portal-product-card free${selectedProduct === 'free' ? ' checked' : ''}${hasOnlyFree ? ' only-free' : ''}`;
    const freeTierTitle = getFreeTierTitle({site});
    const product = getFreeProduct({site});

    const priceContainer = !hasOnlyFree && (
        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
            <div className="gh-portal-product-price">
                <span className={`currency-sign${currencySymbol.length > 1 ? ' long' : ''}`}>{currencySymbol}</span>
                <span className="amount" data-testid="product-amount">0</span>
            </div>
        </div>
    );

    const button = !hasOnlyFree && (
        <div className="gh-portal-btn-product">
            <button
                data-test-button="select-tier"
                className="gh-portal-btn"
                disabled={isDisabled}
                onClick={e => handleChooseSignup(e, 'free')}
            >
                {selectedProduct === 'free' && isDisabled ? <LoaderIcon className="gh-portal-loadingicon" /> : t('Choose')}
            </button>
            {error && <div className="gh-portal-error-message">{error}</div>}
        </div>
    );

    return (
        <div className={cardClass} onClick={e => { e.stopPropagation(); setSelectedProduct('free'); }} data-test-tier="free">
            <div className="gh-portal-product-card-header">
                <h4 className="gh-portal-product-name">{freeTierTitle}</h4>
                {priceContainer}
            </div>
            <div className="gh-portal-product-card-details">
                <div className="gh-portal-product-card-detaildata">
                    {freeProductDescription && (
                        <div className="gh-portal-product-description" data-testid="product-description">
                            {freeProductDescription}
                        </div>
                    )}
                    <ProductBenefitsContainer product={product} />
                </div>
                {button}
            </div>
        </div>
    );
}