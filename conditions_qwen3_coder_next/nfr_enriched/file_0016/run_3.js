function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const handleSelection = (e) => {
        e.stopPropagation();
        setSelectedProduct('free');
    };

    const handleChooseFree = (e) => {
        handleChooseSignup(e, 'free');
    };

    const isDisabled = () => {
        if (action === 'signup:running') {
            return true;
        }
        if (isCookiesDisabled()) {
            return true;
        }
        return false;
    };

    const getCurrencySymbolForFreeTier = () => {
        if (products && products[1]) {
            return getCurrencySymbol(products[1].monthlyPrice.currency);
        }
        return '$';
    };

    const shouldRenderCard = () => {
        const product = getFreeProduct({site});
        const freeProductDescription = getFreeTierDescription({site});
        const freeBenefits = getFreeProductBenefits({site});
        const hasOnlyFree = hasOnlyFreeProduct({site});

        if (hasOnlyFree) {
            return !(!freeProductDescription && !freeBenefits.length);
        }
        return !(!freeProductDescription && !freeBenefits.length);
    };

    const renderFreeTrialDisabledPrice = (currencySymbol) => {
        if (hasOnlyFreeProduct({site})) {
            return null;
        }
        return (
            <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                <div className="gh-portal-product-price">
                    <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                    <span className="amount" data-testid="product-amount">0</span>
                </div>
            </div>
        );
    };

    if (!shouldRenderCard()) {
        return null;
    }

    const cardClass = `${selectedProduct === 'free' ? 'checked ' : ''}gh-portal-product-card free${hasOnlyFreeProduct({site}) ? ' only-free' : ''}`;
    const currencySymbol = getCurrencySymbolForFreeTier();
    const product = getFreeProduct({site});
    let freeProductDescription = getFreeTierDescription({site}) || 'Free preview';
    const freeBenefits = getFreeProductBenefits({site});

    return (
        <>
            <div className={cardClass} onClick={handleSelection} data-test-tier="free">
                <div className='gh-portal-product-card-header'>
                    <h4 className="gh-portal-product-name">{getFreeTierTitle({site})}</h4>
                    {renderFreeTrialDisabledPrice(currencySymbol)}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription && (
                            <div className="gh-portal-product-description" data-testid="product-description">
                                {freeProductDescription}
                            </div>
                        )}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {!hasOnlyFreeProduct({site}) && (
                        <div className='gh-portal-btn-product'>
                            <button
                                data-test-button='select-tier'
                                className='gh-portal-btn'
                                disabled={isDisabled()}
                                onClick={handleChooseFree}
                            >
                                {(selectedProduct === 'free' && isDisabled()) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose')}
                            </button>
                            {error && <div className="gh-portal-error-message">{error}</div>}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}