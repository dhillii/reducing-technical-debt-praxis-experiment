@action
applyClasses(element) {
    if (!this.shouldAnimate ||
        (element.classList.contains('sent') && this.post.email.emailCount === this.previousSentCount) ||
        (element.classList.contains('opened') && this.post.email.openedCount === this.previousOpenedCount) ||
        (element.classList.contains('clicked') && this.post.count.clicks === this.previousClickedCount) ||
        (element.classList.contains('feedback') && this.totalFeedback === this.previousFeedbackCount) ||
        (element.classList.contains('conversions') && this.post.count.conversions === this.previousConversionsCount)
    ) {
        return;
    }

    const classSelector = Array.from(element.classList).map(className => `.${className}`).join('');
    const newNumberSelector = `${classSelector} .new-number span`;
    const oldNumberSelector = `${classSelector} .old-number span`;

    anime({
        targets: newNumberSelector,
        translateY: [10,0],
        // translateZ: 0,
        opacity: [0,1],
        easing: 'easeOutElastic',
        elasticity: 650,
        duration: 1000,
        delay: (el, i) => 100 + 30 * i
    });

    anime({
        targets: oldNumberSelector,
        translateY: [0,-10],
        opacity: [1,0],
        easing: 'easeOutExpo',
        duration: 400,
        delay: (el, i) => 100 + 10 * i
    });
}