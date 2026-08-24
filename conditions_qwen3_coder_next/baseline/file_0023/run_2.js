this.sendContainerHeightChangeEvent();
    }

    sendContainerHeightChangeEvent() {
        const container = document.querySelector('.gh-root-frame');
        if (container) {
            this.context.dispatch('update', {height: container.offsetHeight});
        }
    }

    componentDidUpdate() {