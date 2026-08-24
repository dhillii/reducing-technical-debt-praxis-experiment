return;
        }

        const classNameSelector = Array.from(element.classList).map(className => `.${className}`).join('');
        const targetsNew = `${classNameSelector} .new-number span`;
        const targetsOld = `${classNameSelector} .old-number span`;

        anime({
            targets: targetsNew,
            translateY: [10, 0],
            opacity: [0, 1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: targetsOld,
            translateY: [0, -10],
            opacity: [1, 0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }