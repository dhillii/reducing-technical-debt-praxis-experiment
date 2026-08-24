handleSignup(e) {
        e.preventDefault();
        const {pageData: offer, site} = this.context;

        if (!offer?.tier) {
            return null;
        }

        const product = getProductFromId({site, productId: offer.tier.id});

        if (!product) {
            return null;
        }

        const price = this.getPriceForCadence({product, cadence: offer.cadence});

        this.updateFormErrors();

        const {doAction} = this.context;
        const {name, email, phonenumber, errors} = this.state;

        if (this.hasFormErrors({errors})) {
            return;
        }

        const signupData = {
            name,
            email,
            plan: price?.id,
            offerId: offer.id,
            phonenumber
        };

        if (hasMultipleNewsletters({site})) {
            this.handleNewsletterSelection({signupData});
        } else {
            this.handleDirectSignup({doAction, signupData});
        }
    }

    updateFormErrors() {
        this.setState((state) => ({
            errors: this.getFormErrors(state)
        }));
    }

    hasFormErrors({errors}) {
        return errors && Object.values(errors).some(err => !!err);
    }

    handleNewsletterSelection({signupData}) {
        this.setState({
            showNewsletterSelection: true,
            pageData: signupData,
            errors: {}
        });
    }

    handleDirectSignup({doAction, signupData}) {
        doAction('signup', signupData);
        this.setState({errors: {}});
    }