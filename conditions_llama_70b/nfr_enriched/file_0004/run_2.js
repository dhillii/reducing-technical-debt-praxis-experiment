```typescript
import { useModal } from '@ebay/nice-modal-react';
import clsx from 'clsx';
import React, { useEffect, useState, forwardRef } from 'react';
import useGlobalDirtyState from '../../hooks/use-global-dirty-state';
import { confirmIfDirty } from '../../utils/modals';
import Button, { ButtonColor, ButtonProps } from '../button';
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
  stickyHeader?: boolean;
  scrolling?: boolean;
  dirty?: boolean;
  animate?: boolean;
  formSheet?: boolean;
  enableCMDS?: boolean;
  allowBackgroundInteraction?: boolean;
}

const topLevelBackdropClasses = 'bg-[rgba(98,109,121,0.2)] backdrop-blur-[3px]';

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
  const { setGlobalDirtyState } = useGlobalDirtyState();
  const [animationFinished, setAnimationFinished] = useState(false);

  useEffect(() => {
    setGlobalDirtyState(dirty);
  }, [dirty, setGlobalDirtyState]);

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Don't close modal if user is in Koenig's link input (which handles ESC itself)
        const activeEl = document.activeElement;
        if (activeEl?.hasAttribute('data-kg-link-input')) {
          return;
        }

        // Fix for Safari - if an element in the modal is focused, closing it will jump to
        // the bottom of the page because Safari tries to focus the "next" element in the DOM
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        // Close the modal on the next tick so that the blur registers
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

        // Prevent the event from bubbling up to the window level
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);

    // Clean up the event listener when the modal is closed
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
  }, [onOk, enableCMDS]);

  const getModalClasses = (size: ModalSize, align: 'center' | 'left' | 'right', animate: boolean, animationFinished: boolean, formSheet: boolean, scrolling: boolean) => {
    // The animation classes apply a transform to the modal, which breaks anything inside using position:fixed
    // We should remove the class as soon as the animation is finished
    const baseClasses = 'relative z-50 flex max-h-[100%] w-full flex-col justify-between overflow-x-hidden bg-white dark:bg-black';
    const alignmentClasses = {
      center: 'mx-auto',
      left: 'mr-auto',
      right: 'ml-auto',
    };
    const sizeClasses = {
      sm: 'max-w-[480px]',
      md: 'max-w-[720px]',
      lg: 'max-w-[1020px]',
      xl: 'max-w-[1240px]',
      full: 'h-full',
      bleed: 'h-full',
    };
    const animationClasses = {
      center: animate && !formSheet && !animationFinished ? 'animate-modal-in' : '',
      right: animate && !formSheet && !animationFinished ? 'animate-modal-in-from-right' : '',
    };
    const scrollingClasses = scrolling ? 'overflow-y-auto' : 'overflow-y-hidden';

    return clsx(
      baseClasses,
      alignmentClasses[align],
      sizeClasses[size],
      animationClasses[align],
      scrollingClasses,
      formSheet ? 'shadow-md' : 'shadow-xl',
    );
  };

  const getBackdropClasses = (backDrop: boolean, allowBackgroundInteraction: boolean, formSheet: boolean) => {
    const baseClasses = 'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]';
    const interactionClasses = allowBackgroundInteraction ? 'pointer-events-none' : '';
    const formSheetClasses = formSheet ? 'bg-[rgba(98,109,121,0.08)]' : '';

    return clsx(
      baseClasses,
      interactionClasses,
      formSheetClasses,
    );
  };

  const getHeaderClasses = (stickyHeader: boolean, padding: boolean) => {
    const baseClasses = 'pb-0';
    const stickyClasses = stickyHeader ? 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black' : '';

    return clsx(
      baseClasses,
      stickyClasses,
      padding ? 'p-8' : 'p-0',
    );
  };

  const getContentClasses = (padding: boolean, size: ModalSize, height: 'full' | number) => {
    const baseClasses = padding ? 'p-8' : 'p-0';
    const sizeClasses = size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number' ? 'grow' : '';

    return clsx(
      baseClasses,
      sizeClasses,
    );
  };

  const getFooterClasses = (padding: boolean, stickyFooter: boolean) => {
    const baseClasses = padding ? 'p-8' : 'p-0';
    const stickyClasses = stickyFooter ? 'py-6' : '';

    return clsx(
      baseClasses,
      stickyClasses,
    );
  };

  const getModalStyles = (width: 'full' | 'toSidebar' | number, height: 'full' | number) => {
    const styles: { width?: string; height?: string; maxWidth?: string; maxHeight?: string } = {};

    if (typeof width === 'number') {
      styles.width = '100%';
      styles.maxWidth = width + 'px';
    } else if (width === 'full') {
      styles.width = '100%';
    } else if (width === 'toSidebar') {
      styles.width = '100%';
      styles.maxWidth = 'calc(100dvw - 280px)';
    }

    if (typeof height === 'number') {
      styles.height = '100%';
      styles.maxHeight = height + 'px';
    } else if (height === 'full') {
      styles.height = '100%';
    }

    return styles;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && backDropClick) {
      confirmIfDirty(dirty, () => {
        modal.remove();
        afterClose?.();
      });
    }
  };

  const removeModal = () => {
    confirmIfDirty(dirty, () => {
      modal.remove();
      afterClose?.();
    });
  };

  const getButtons = (okLabel: string, okColor: ButtonColor, okLoading: boolean, cancelLabel: string, buttonsDisabled: boolean, okDisabled: boolean, onOk: () => void, onCancel: () => void) => {
    const buttons: ButtonProps[] = [];

    if (cancelLabel) {
      buttons.push({
        key: 'cancel-modal',
        label: cancelLabel,
        color: 'outline',
        onClick: (onCancel ? onCancel : () => {
          removeModal();
        }),
        disabled: buttonsDisabled,
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
        loading: okLoading,
      });
    }

    return buttons;
  };

  const getFooterContent = (footer: boolean | React.ReactNode, leftButtonProps: ButtonProps | undefined, buttons: ButtonProps[], stickyFooter: boolean) => {
    if (footer) {
      return footer;
    } else if (footer === false) {
      return <></>;
    } else {
      return (
        <div className={getFooterClasses(padding, stickyFooter)}>
          <div>
            {leftButtonProps && <Button {...leftButtonProps} />}
          </div>
          <div className='flex gap-3'>
            <ButtonGroup buttons={buttons} />
          </div>
        </div>
      );
    }
  };

  const modalClasses = getModalClasses(size, align, animate, animationFinished, formSheet, scrolling);
  const backdropClasses = getBackdropClasses(backDrop, allowBackgroundInteraction, formSheet);
  const headerClasses = getHeaderClasses(stickyHeader, padding);
  const contentClasses = getContentClasses(padding, size, height);
  const footerClasses = getFooterClasses(padding, stickyFooter);
  const modalStyles = getModalStyles(width, height);
  const buttons = getButtons(okLabel, okColor, okLoading, cancelLabel, buttonsDisabled, okDisabled, onOk, onCancel);
  const footerContent = getFooterContent(footer, leftButtonProps, buttons, stickyFooter);

  return (
    <div className={backdropClasses} id='modal-backdrop' onMouseDown={handleBackdropClick}>
      <div className={clsx(
        'pointer-events-none fixed inset-0 z-0',
        (backDrop && !formSheet) && topLevelBackdropClasses,
        formSheet && 'bg-[rgba(98,109,121,0.08)]'
      )}></div>
      <section ref={ref} className={clsx(
        modalClasses,
        allowBackgroundInteraction && 'pointer-events-auto'
      )} data-testid={testId} style={modalStyles}>
        {header === false ? '' : (!topRightContent || topRightContent === 'close' ?
          (<header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            <div className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${hideXOnMobile && 'hidden'} absolute right-6 top-6`}>
              <Button className='-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100' icon='close' iconColorClass='text-black dark:text-white' size='sm' testId='close-modal' unstyled onClick={removeModal} />
            </div>
          </header>)
          :
          (<header className={headerClasses}>
            {title && <Heading level={3}>{title}</Heading>}
            {topRightContent}
          </header>))}
        <div className={contentClasses}>
          {children}
        </div>
        {stickyFooter ? (
          <StickyFooter height={84}>
            {footerContent}
          </StickyFooter>
        ) : (
          footerContent
        )}
      </section>
    </div>
  );
});

Modal.displayName = 'Modal';

export default Modal;
```