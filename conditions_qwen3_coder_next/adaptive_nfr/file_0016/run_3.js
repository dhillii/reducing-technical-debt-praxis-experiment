function FreeProductCard({products, handleChooseSignup, error}) {
    const {site, action} = useContext(AppContext);
    const {selectedProduct, setSelectedProduct} = useContext(ProductsContext);

    const cardClass = selectedProduct === 'free' ? 'gh-portal-product-card free checked' : 'gh-portal-product-card free';
    const product = getFreeProduct({site});
    let freeProductDescription = getFreeTierDescription({site});

    const isDisabled = useMemo(() => {
        if (action === 'signup:running') {
            return true;
        }
        if (isCookiesDisabled()) {
            return true;
        }
        return false;
    }, [action]);

    const currencySymbol = useMemo(() => {
        if (products && products[1]) {
            return getCurrencySymbol(products[1].monthlyPrice.currency);
        }
        return '$';
    }, [products]);

    const hasOnlyFree = hasOnlyFreeProduct({site});
    const freeBenefits = getFreeProductBenefits({site});

    if (hasOnlyFree && !freeProductDescription && !freeBenefits.length) {
        return null;
    }

    if (!freeProductDescription && !freeBenefits.length) {
        freeProductDescription = 'Free preview';
    }

    if (hasOnlyFree) {
        // eslint-disable-next-line no-param-reassign
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
                    {(!hasOnlyFree ?
                        <div className="gh-portal-product-card-pricecontainer free-trial-disabled">
                            <div className="gh-portal-product-price">
                                <span className={'currency-sign' + (currencySymbol.length > 1 ? ' long' : '')}>{currencySymbol}</span>
                                <span className="amount" data-testid="product-amount">0</span>
                            </div>
                        </div>
                        : '')}
                </div>
                <div className='gh-portal-product-card-details'>
                    <div className='gh-portal-product-card-detaildata'>
                        {freeProductDescription
                            ? <div className="gh-portal-product-description" data-testid="product-description">{freeProductDescription}</div>
                            : null
                        }
                        <ProductBenefitsContainer product={product} />
                    </div>
                    {(!hasOnlyFree ?
                        <div className='gh-portal-btn-product'>
                            <button
                                data-test-button='select-tier'
                                className='gh-portal-btn'
                                disabled={isDisabled}
                                onClick={(e) => {
                                    handleChooseSignup(e, 'free');
                                }}>
                                {((selectedProduct === 'free' && isDisabled) ? <LoaderIcon className='gh-portal-loadingicon' /> : t('Choose'))}
                            </button>
                            {error && <div className="gh-portal-error-message">{error}</div>}
                        </div>
                        : null)}
                </div>
            </div>
        </>
    );
}