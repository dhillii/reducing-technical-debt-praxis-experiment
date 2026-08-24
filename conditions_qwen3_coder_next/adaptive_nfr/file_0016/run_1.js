function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    const product = getFreeProduct({site});
    let freeProductDescription = getFreeTierDescription({site});

    const isActionRunning = action === 'signup:running';
    const isCookiesDisabledFlag = isCookiesDisabled();
    const disabled = isActionRunning || isCookiesDisabledFlag;

    const currencySymbol = getCurrencySymbolFromProducts(products);
    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});

    if (hasOnlyFree && !freeProductDescription && !freeBenefits.length) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    if (hasOnlyFree) {
        cardClass += ' only-free';
    }

    return (
        <>
            <div className={cardClass} onClick={(e) => {
                e.stopPropagation();
                setSelectedProduct('free');
            }} data-test-tier="free">
                <div className='gh-portal-product-card-header'>
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
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription && (
                            <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                        )}
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {!hasOnlyFree && (
                        <div className='gh-portal-btn-product'>
                            <button
                                data-test-button='select-tier'
                                className='gh-portal-btn'
                                disabled={disabled}
                                onClick={(e) => {
                                    handleChooseSignup(e, 'free');
                                }}>
                                {selectedProduct === 'free' && disabled ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose')}
                            </button>
                            {error && <div className="gh-portal-error-message">{error}</div>}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function getCurrencySymbolFromProducts(products) {
    if (products && products[1]) {
        return getCurrencySymbol(products[1].monthlyPrice.currency);
    }
    return '$';
}