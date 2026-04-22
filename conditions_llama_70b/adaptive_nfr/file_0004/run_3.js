```javascript
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

const modalSizeClasses = {
  sm: {
    modal: 'max-w-[480px]',
    backdrop: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    header: '-inset-x-8',
  },
  md: {
    modal: 'max-w-[720px]',
    backdrop: 'p-4 md:p-[8vmin]',
    padding: 'p-8',
    header: '-inset-x-8',
  },
  lg: {
    modal: 'max-w-[1020px]',
    backdrop: 'p-4 md:p-[4vmin]',
    padding: 'p-7',
    header: '-inset-x-8',
  },
  xl: {
    modal: 'max-w-[1240px]',
    backdrop: 'p-4 md:p-[3vmin]',
    padding: 'p-10',
    header: '-inset-x-10 -top-10',
  },
  full: {
    modal: 'h-full',
    backdrop: 'p-4 md:p-[3vmin]',
    padding: 'p-10',
    header: '-inset-x-10',
  },
  bleed: {
    modal: 'h-full',
    padding: 'p-10',
    header: '-inset-x-10',
  },
};

const Modal = forwardRef<HTMLElement, ModalProps>(
  ({
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
    allowBackgroundInteraction = false,
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

    const getModalClasses = () => {
      const classes = clsx(
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

      if (size in modalSizeClasses) {
        return clsx(classes, modalSizeClasses[size].modal);
      }

      return classes;
    };

    const getBackdropClasses = () => {
      const classes = clsx(
        'fixed inset-0 z-[1000] h-[100dvh] w-[100dvw]',
        allowBackgroundInteraction && 'pointer-events-none'
      );

      if (size in modalSizeClasses) {
        return clsx(classes, modalSizeClasses[size].backdrop);
      }

      return clsx(classes, 'p-4 md:p-[8vmin]');
    };

    const getPaddingClasses = () => {
      if (!padding) {
        return 'p-0';
      }

      if (size in modalSizeClasses) {
        return modalSizeClasses[size].padding;
      }

      return 'p-8';
    };

    const getHeaderClasses = () => {
      const classes = clsx(
        (!topRightContent || topRightContent === 'close') ? '' : 'flex items-center justify-between gap-5'
      );

      if (stickyHeader) {
        classes = clsx(classes, 'sticky top-0 z-[300] -mb-4 bg-white !pb-4 dark:bg-black');
      }

      if (size in modalSizeClasses) {
        return clsx(classes, modalSizeClasses[size].header);
      }

      return clsx(classes, '-inset-x-8');
    };

    const getContentClasses = () => {
      const classes = clsx(getPaddingClasses(), 'py-0');

      if (size === 'full' || size === 'bleed' || height === 'full' || typeof height === 'number') {
        return clsx(classes, 'grow');
      }

      return classes;
    };

    const getFooterClasses = () => {
      const classes = clsx(getPaddingClasses(), stickyFooter ? 'py-6' : '', 'flex w-full items-center justify-between');

      return classes;
    };

    const getModalStyles = () => {
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

    const getFooterContent = () => {
      if (footer) {
        return footer;
      }

      if (footer === false) {
        return <></>;
      }

      const buttons: ButtonProps[] = [];

      if (cancelLabel) {
        buttons.push({
          key: 'cancel-modal',
          label: cancelLabel,
          color: 'outline',
          onClick: (onCancel ? onCancel : () => {
            confirmIfDirty(dirty, () => {
              modal.remove();
              afterClose?.();
            });
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

      return (
        <div className={getFooterClasses()}>
          <div>
            {leftButtonProps && <Button {...leftButtonProps} />}
          </div>
          <div className="flex gap-3">
            <ButtonGroup buttons={buttons} />
          </div>
        </div>
      );
    };

    return (
      <div className={getBackdropClasses()} id="modal-backdrop" onMouseDown={handleBackdropClick}>
        <div
          className={clsx(
            'pointer-events-none fixed inset-0 z-0',
            (backDrop && !formSheet) && topLevelBackdropClasses,
            formSheet && 'bg-[rgba(98,109,121,0.08)]'
          )}
        />
        <section ref={ref} className={getModalClasses()} data-testid={testId} style={getModalStyles()}>
          {header === false ? (
            <></>
          ) : (
            <header className={getHeaderClasses()}>
              {title && <Heading level={3}>{title}</Heading>}
              <div
                className={`${topRightContent !== 'close' && 'md:!invisible md:!hidden'} ${
                  hideXOnMobile && 'hidden'
                } absolute right-6 top-6`}
              >
                <Button
                  className="-m-2 cursor-pointer p-2 opacity-50 hover:opacity-100"
                  icon="close"
                  iconColorClass="text-black dark:text-white"
                  size="sm"
                  testId="close-modal"
                  unstyled
                  onClick={() => {
                    confirmIfDirty(dirty, () => {
                      modal.remove();
                      afterClose?.();
                    });
                  }}
                />
              </div>
              {topRightContent !== 'close' && topRightContent}
            </header>
          )}
          <div className={getContentClasses()}>{children}</div>
          {stickyFooter ? (
            <StickyFooter height={84}>{getFooterContent()}</StickyFooter>
          ) : (
            getFooterContent()
          )}
        </section>
      </div>
    );
  }
);

Modal.displayName = 'Modal';

export default Modal;
```