import {useModal} from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, {useEffect, useState, forwardRef} from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import {confirmIfDirty} from '../../utils/modals';
import Button, {ButtonColor, ButtonProps} from '../button';
import ButtonGroup from '../button-group';
import Heading from '../heading';
import StickyFooter from '../sticky-footer';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'bleed';

export interface ModalProps {

    /**
     * Possible values are: `sm`, `md`, `lg`, `xl, `full`, `bleed`. Yu can also use any number to set an arbitrary width.
     */
    size?: ModalSize;
    width?: 'full' | 'toSidebar' | number;
    height?: 'full' | number;
    align?: 'center' | 'left' | 'right';

    testId?: string;
    title?: string;
    okLabel?: string;
    okColor?: ButtonColor;
    okLoading?: boolean;
    cancelLabel?: string;
    leftButtonProps?: ButtonProps;
    buttonsDisabled?: boolean;
    okDisabled?: boolean;
    footer?: boolean | React.ReactNode;
    header?: boolean;
    padding?: boolean;
    onOk?: () => void;
    onCancel?: () => void;
    topRightContent?: 'close' | React.ReactNode;
    hideXOnMobile?: boolean;
    afterClose?: () => void;
    children?: React.ReactNode;
    backDrop?: boolean;
    backDropClick?: boolean;
    stickyFooter?: boolean;
    stickyHeader?:boolean;
    scrolling?: boolean;
    dirty?: boolean;
    animate?: boolean;
    formSheet?: boolean;
    enableCMDS?: boolean;
    allowBackgroundInteraction?: boolean;
}

export const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

const Modal = forwardRef<HTMLElement, ModalProps>(({
    size = 'md',
    align = 'center',
    width,
    height,
    testId,
    title,
    okLabel = 'OK',
    okLoading = false,
    cancelLabel = 'Cancel',
    footer,
    header,
    leftButtonProps,
    buttonsDisabled,
    okDisabled,
    padding = true,
    onOk,
    okColor = 'black',
    onCancel,
    topRightContent,
    hideXOnMobile = false,
    afterClose,
    children,
    backDrop = true,
    backDropClick = true,
    stickyFooter = false,
    stickyHeader = false,
    scrolling = true,
    dirty = false,
    animate = true,
    formSheet = false,
    enableCMDS = true,
    allowBackgroundInteraction = false
}, ref) => {
    const modal = useModal();
    const {setGlobalDirtyState} = useGlobalDirtyState();
    const [animationFinished, setAnimationFinished] = useState(false);

    useEffect(() => {
        setGlobalDirtyState(dirty);
    }, [dirty, setGlobalDirtyState]);

    useEffect(() => {
        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleEscape(event);
            }
        };

        document.addEventListener('keydown', handleEscapeKey);

        return () => {
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [modal, dirty, afterClose, onCancel]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setAnimationFinished(true);
        }, 250);

        return () => clearTimeout(timeout);
    }, []);

    useEffect(() => {
        if (onOk && enableCMDS) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            
            window.addEventListener('keydown', handleCMDS);
            return () => {
                window.removeEventListener('keydown', handleCMDS);
            };
        }
    }, [onOk, enableCMDS]);

    const handleEscape = (event: KeyboardEvent) => {
        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
            return;
        }

        if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        
        setTimeout(() => {
            if (onCancel) {
                onCancel();
            } else {
                confirmIfDirty(dirty, () => {
                    modal.remove();
                    afterClose?.();
                });
            }
        });

        event.stopPropagation();
    };

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const getButtons = (): ButtonProps[] => {
        if (footer) {
            return [];
        }

        const buttons: ButtonProps[] = [];
        
        if (cancelLabel) {
            buttons.push({
                key: 'cancel-modal',
                label: cancelLabel,
                color: 'outline',
                onClick: (onCancel ? onCancel : () => {
                    removeModal();
                }),
                disabled: buttonsDisabled
            });
        }

        if (okLabel) {
            buttons.push({
                key: 'ok-modal',
                label: okLabel,
                color: okColor,
                className: 'min-w-[80px]',
                onClick: onOk,
                disabled: buttonsDisabled || okDisabled,
                loading: okLoading
            });
        }
        
        return buttons;
    };

    const getModalClasses = () => {
        let classes = clsx(
            'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black',
            align === 'center' && 'mx-auto',
            align === 'left' && 'mr-auto',
            align === 'right' && 'ml-auto',
            size !== 'bleed' && 'rounded',
            formSheet ? 'shadow-md' : 'shadow-xl',
            (animate && !formSheet && !animationFinished && align === 'center') && 'animate-modal-in',
            (animate && !formSheet && !animationFinished && align === 'right') && 'animate-modal-in-from-right',
            (formSheet && !animationFinished) && 'animate-modal-in-reverse',
            scrolling ? 'overflow-y-auto' : 'overflow-y-hidden'
        );

        switch (size) {
        case 'sm':
            classes = clsx(classes, 'max-w-[480px]');
            break;
        case 'md':
            classes = clsx(classes, 'max-w-[720px]');
            break;
        case 'lg':
            classes = clsx(classes, 'max-w-[1020px]');
            break;
        case 'xl':
            classes = clsx(classes, 'max-w-[1240px]0');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, 'h-full');
            break;
        }

        if (width === 'full') {
            classes = clsx(classes, 'w-full');
        } else if (width === 'toSidebar') {
            classes = clsx(
                classes,
                'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]'
            );
        }

        if (height === 'full') {
            classes = clsx(classes, 'h-full');
        }

        return classes;
    };

    const getBackdropClasses = () => {
        let classes = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        switch (size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
        case 'lg':
            classes = clsx(classes, 'p-4 md:p-[4vmin]');
            break;
        case 'xl':
        case 'full':
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
            break;
        default:
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
            break;
        }

        return clsx(classes, 'max-[800px]:!pb-20');
    };

    const getPaddingClasses = () => {
        if (!padding) {
            return 'p-0';
        }

        switch (size) {
        case 'sm':
        case 'md':
            return 'p-8';
        case 'lg':
            return 'p-7';
        case 'xl':
        case 'full':
        case 'bleed':
            return 'p-10';
        default:
            return 'p-8';
        }
    };

    const getHeaderClasses = () => {
        let classes = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5',
            stickyHeader && 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black'
        );

        const paddingClasses = getPaddingClasses();

        switch (size) {
        case 'sm':
        case 'md':
            classes = clsx(classes, paddingClasses, '-inset-x-8 pb-0');
            break;
        case 'lg':
            classes = clsx(classes, paddingClasses, '-inset-x-8 pb-0');
            break;
        case 'xl':
            classes = clsx(classes, paddingClasses, '-inset-x-10 -top-10 pb-0');
            break;
        case 'full':
        case 'bleed':
            classes = clsx(classes, paddingClasses, '-inset-x-10 pb-0');
            break;
        default:
            classes = clsx(classes, paddingClasses, '-inset-x-8 pb-0');
            break;
        }

        return classes;
    };

    const getContentClasses = () => {
        const paddingClasses = getPaddingClasses();
        let classes = clsx(paddingClasses, 'py-0');

        if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
            classes = clsx(classes, 'grow');
        }

        if (footer === false) {
            classes = clsx(classes, 'pb-0');
        }

        return classes;
    };

    const getFooterClasses = () => {
        const paddingClasses = getPaddingClasses();
        return clsx(
            `${paddingClasses} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const getFooterContent = () => {
        if (footer) {
            return footer;
        }
        
        if (footer === false) {
            return null;
        }

        const buttons = getButtons();
        const footerClasses = getFooterClasses();

        return (
            <div className={footerClasses}>
                <div>
                    {leftButtonProps && <Button {...leftButtonProps} />}
                </div>
                <div className='flex gap-3'>
                    <ButtonGroup buttons={buttons}/>
                </div>
            </div>
        );
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    const getModalStyles = () => {
        const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string;} = {};

        if (typeof width === 'number') {
            styles.width = '100%';
            styles.maxWidth = width + 'px';
        }

        if (typeof height === 'number') {
            styles.height = '100%';
            styles.maxHeight = height + 'px';
        }

        return styles;
    };

    const renderHeader = () => {
        if (header === false) {
            return '';
        }

        const headerClasses = getHeaderClasses();

        if (!topRightContent || topRightContent === 'close') {
            return (
                <header className={headerClasses}>
                    {title && <Heading level={3}>{title}</Heading>}
                    <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                        <Button 
                            className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' 
                            icon='close' 
                            iconColorClass='text-black dark:text-white' 
                            size='sm' 
                            testId='close-modal' 
                            unstyled 
                            onClick={removeModal} 
                        />
                    </div>
                </header>
            );
        }

        return (
            <header className={headerClasses}>
                {title && <Heading level={3}>{title}</Heading>}
                {topRightContent}
            </header>
        );
    };

    const modalClasses = getModalClasses();
    const backdropClasses = getBackdropClasses();
    const contentClasses = getContentClasses();
    const footerContent = getFooterContent();
    const modalStyles = getModalStyles();

    const wrappedFooterContent = stickyFooter ? (
        <StickyFooter height={84}>
            {footerContent}
        </StickyFooter>
    ) : (
        <>
            {footerContent}
        </>
    );

    return (
        <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section 
                ref={ref} 
                className={clsx(modalClasses, allowBackgroundInteraction && 'pointer-events-auto')} 
                data-testid={testId} 
                style={modalStyles}
            >
                {renderHeader()}
                <div className={contentClasses}>
                    {children}
                </div>
                {wrappedFooterContent}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;