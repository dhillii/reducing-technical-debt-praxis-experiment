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
        if (onOk) {
            const handleCMDS = (e: KeyboardEvent) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                    e.preventDefault();
                    onOk();
                }
            };
            if (enableCMDS) {
                window.addEventListener('keydown', handleCMDS);
                return () => {
                    window.removeEventListener('keydown', handleCMDS);
                };
            }
        }
    });

    const removeModal = () => {
        confirmIfDirty(dirty, () => {
            modal.remove();
            afterClose?.();
        });
    };

    const buildButtons = (): ButtonProps[] => {
        const buttons: ButtonProps[] = [];

        if (!footer) {
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
        }

        return buttons;
    };

    const buildModalClasses = (): string => {
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

        if (size === 'sm') {
            classes = clsx(classes, 'max-w-[480px]');
        } else if (size === 'md') {
            classes = clsx(classes, 'max-w-[720px]');
        } else if (size === 'lg') {
            classes = clsx(classes, 'max-w-[1020px]');
        } else if (size === 'xl') {
            classes = clsx(classes, 'max-w-[1240px]');
        } else if (size === 'full' || size === 'bleed') {
            classes = clsx(classes, 'h-full');
        }

        if (width === 'full') {
            classes = clsx(classes, 'w-full');
        } else if (width === 'toSidebar') {
            classes = clsx(classes, 'w-full max-w-[calc(100dvw_-_280px)] lg:max-w-full min-[1280px]:max-w-[calc(100dvw_-_320px)]');
        } else if (typeof width === 'number') {
            classes = clsx(classes, 'w-full');
        }

        if (height === 'full' || typeof height === 'number') {
            classes = clsx(classes, 'h-full');
        }

        return classes;
    };

    const buildBackdropClasses = (): string => {
        let classes = clsx(
            'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
            allowBackgroundInteraction && 'pointer-events-none'
        );

        if (size === 'sm' || size === 'md') {
            classes = clsx(classes, 'p-4 md:p-[8vmin]');
        } else if (size === 'lg') {
            classes = clsx(classes, 'p-4 md:p-[4vmin]');
        } else if (size === 'xl' || size === 'full' || size === 'bleed') {
            classes = clsx(classes, 'p-4 md:p-[3vmin]');
        }

        if (typeof height === 'number') {
            classes = clsx(classes, 'max-[800px]:!pb-20');
        }

        return classes;
    };

    const buildHeaderClasses = (): string => {
        let classes = clsx(
            (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
        );

        if (stickyHeader) {
            classes = clsx(classes, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
        }

        if (size === 'sm' || size === 'md') {
            classes = clsx(classes, '-inset-x-8');
        } else if (size === 'xl') {
            classes = clsx(classes, '-inset-x-10 -top-10');
        } else if (size === 'full' || size === 'bleed') {
            classes = clsx(classes, '-inset-x-10');
        }

        return classes;
    };

    const buildContentClasses = (): string => {
        let classes = 'py-0';

        if (!padding) {
            classes = 'p-0';
        }

        if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
            classes = clsx(classes, 'grow');
        }

        return classes;
    };

    const buildFooterClasses = (): string => {
        return clsx(
            `${padding ? 'p-8' : 'p-0'} ${stickyFooter ? 'py-6' : ''}`,
            'flex w-full items-center justify-between'
        );
    };

    const buildModalStyles = (): {width?: string; height?: string; maxWidth?: string; maxHeight?: string} => {
        const styles: {width?: string; height?: string; maxWidth?: string; maxHeight?: string} = {};

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

    const buildFooterContent = (): React.ReactNode => {
        let content;

        if (footer) {
            content = footer;
        } else if (footer === false) {
            content = null;
        } else {
            const buttons = buildButtons();
            content = (
                <div className={buildFooterClasses()}>
                    <div>
                        {leftButtonProps && <Button {...leftButtonProps} />}
                    </div>
                    <div className='flex gap-3'>
                        <ButtonGroup buttons={buttons}/>
                    </div>
                </div>
            );
        }

        return stickyFooter ?
            <StickyFooter height={84}>
                {content}
            </StickyFooter>
            :
            content;
    };

    const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget && backDropClick) {
            removeModal();
        }
    };

    return (
        <div className={buildBackdropClasses()} id='modal-backdrop' onMouseDown={handleBackdropClick}>
            <div className={clsx(
                'pointer-events-none fixed inset-0 z-0',
                (backDrop && !formSheet) && topLevelBackdropClasses,
                formSheet && 'bg-[rgba(98,109,121,0.08)]'
            )}></div>
            <section ref={ref} className={clsx(
                buildModalClasses(),
                allowBackgroundInteraction && 'pointer-events-auto'
            )} data-testid={testId} style={buildModalStyles()}>
                {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
                    (<header className={buildHeaderClasses()}>
                        {title && <Heading level={3}>{title}</Heading>}
                        <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
                            <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
                        </div>
                    </header>)
                    :
                    (<header className={buildHeaderClasses()}>
                        {title && <Heading level={3}>{title}</Heading>}
                        {topRightContent}
                    </header>))}
                <div className={buildContentClasses()}>
                    {children}
                </div>
                {buildFooterContent()}
            </section>
        </div>
    );
});

Modal.displayName = 'Modal';

export default Modal;