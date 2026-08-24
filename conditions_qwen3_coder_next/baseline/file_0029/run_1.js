}

        const classSelector = Array.from(element.classList).map(className => `.${className}`).join('');
        anime({
            targets: `${classSelector} .new-number span`,
            translateY: [10,0],
            // translateZ: 0,
            opacity: [0,1],
            easing: 'easeOutElastic',
            elasticity: 650,
            duration: 1000,
            delay: (el, i) => 100 + 30 * i
        });

        anime({
            targets: `${classSelector} .old-number span`,
            translateY: [0,-10],
            opacity: [1,0],
            easing: 'easeOutExpo',
            duration: 400,
            delay: (el, i) => 100 + 10 * i
        });
    }