class PopupContent extends React.Component {
    static contextType = AppContext;

    componentDidMount() {
        this.updateContainerHeight();
    }

    componentDidUpdate() {
        this.updateContainerHeight();
    }

    updateContainerHeight() {
        const containerHeight = this.containerRef.current.offsetHeight;
        this.context.dispatch('update', {
            containerHeight: containerHeight
        });
    }

    handlePopupClose(e) {
        e.preventDefault();
        if (e.target === e.currentTarget) {
            this.context.dispatch('update', {
                showPopup: false
            });
        }
    }

    render() {
        return (
            <div ref={(ref) => this.containerRef = ref}>
                <Search />
            </div>
        );
    }
}