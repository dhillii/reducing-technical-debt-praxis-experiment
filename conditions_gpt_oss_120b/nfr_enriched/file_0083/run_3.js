import router, { useRouter } from 'next/router'
import {
  type FormEvent,
  Fragment,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { Button } from '@keystar/ui/button'
import { AlertDialog, DialogContainer, DialogTrigger } from '@keystar/ui/dialog'
import { Icon } from '@keystar/ui/icon'
import { fileWarningIcon } from '@keystar/ui/icon/icons/fileWarningIcon'
import { Box, VStack } from '@keystar/ui/layout'
import { ProgressCircle } from '@keystar/ui/progress'
import { SlotProvider } from '@keystar/ui/slots'
import { toastQueue } from '@keystar/ui/toast'
import { Heading, Text } from '@keystar/ui/typography'

import { CombinedGraphQLErrors, gql, useMutation } from '../../../../admin-ui/apollo'
import { CreateButtonLink } from '../../../../admin-ui/components/CreateButtonLink'
import { ErrorDetailsDialog } from '../../../../admin-ui/components/Errors'
import { GraphQLErrorNotice } from '../../../../admin-ui/components/GraphQLErrorNotice'
import { PageContainer } from '../../../../admin-ui/components/PageContainer'
import { useList, useListItem } from '../../../../admin-ui/context'
import {
  deserializeItemToValue,
  Fields,
  serializeValueToOperationItem,
  useHasChanges,
  useInvalidFields,
} from '../../../../admin-ui/utils'
import type {
  ActionMeta,
  BaseListTypeInfo,
  ConditionalFilter,
  ConditionalFilterCase,
  ListMeta,
} from '../../../../types'
import { BaseToolbar, ColumnLayout, ItemPageHeader, StickySidebar } from './common'

type ItemPageProps = {
  listKey: string
}

/**
 * Stable callback that always references the latest version of the provided function.
 */
function useEventCallback<Func extends (...args: any[]) => unknown>(callback: Func): Func {
  const callbackRef = useRef(callback)
  const cb = useCallback((...args: any[]) => {
    return callbackRef.current(...args)
  }, [])
  useEffect(() => {
    callbackRef.current = callback
  })
  return cb as any
}

/**
 * Handles the delete mutation and navigation after a successful delete.
 */
async function handleDeleteItem(
  deleteItem: () => Promise<any>,
  list: ListMeta,
  routerInstance: ReturnType<typeof useRouter>,
  setErrorDialogValue: (err: Error | null) => void
) {
  try {
    await deleteItem()
    toastQueue.neutral(`${list.singular} deleted.`, { timeout: 5000 })
    routerInstance.push(list.isSingleton ? '/' : `/${list.path}`)
  } catch (err: any) {
    toastQueue.critical('Unable to delete item', {
      actionLabel: 'Details',
      onAction: () => setErrorDialogValue(err),
      shouldCloseOnAction: true,
    })
  }
}

/**
 * Delete button with confirmation dialog.
 */
function DeleteButton({
  list,
  itemId,
  itemLabel,
}: {
  list: ListMeta
  itemId: string
  itemLabel: string
}) {
  const [errorDialogValue, setErrorDialogValue] = useState<Error | null>(null)
  const routerInstance = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  const onConfirmDelete = async () => {
    await handleDeleteItem(deleteItem, list, routerInstance, setErrorDialogValue)
  }

  return (
    <Fragment>
      <DialogTrigger>
        <Button tone="critical">Delete</Button>
        <AlertDialog
          tone="critical"
          title="Delete item"
          cancelLabel="Cancel"
          primaryActionLabel="Yes, delete"
          onPrimaryAction={onConfirmDelete}
        >
          <Text>
            Are you sure you want to delete{' '}
            <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>
            ? This action cannot be undone.
          </Text>
        </AlertDialog>
      </DialogTrigger>

      <DialogContainer onDismiss={() => setErrorDialogValue(null)} isDismissable>
        {errorDialogValue && (
          <ErrorDetailsDialog title="Unable to delete item" error={errorDialogValue} />
        )}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Renders a not‑found UI with optional children.
 */
function ItemNotFound(props: PropsWithChildren) {
  return (
    <VStack
      alignItems="center"
      backgroundColor="surface"
      borderRadius="medium"
      gap="large"
      justifyContent="center"
      minHeight="scale.3000"
      padding="xlarge"
    >
      <Icon src={fileWarningIcon} color="neutralEmphasis" size="large" />
      <Heading align="center">Not found</Heading>
      <SlotProvider slots={{ text: { align: 'center', maxWidth: 'scale.5000' } }}>
        {props.children}
      </SlotProvider>
    </VStack>
  )
}

/**
 * Reset button with confirmation dialog.
 */
function ResetButton(props: { onReset: () => void; hasChanges?: boolean }) {
  return (
    <DialogTrigger>
      <Button tone="accent" isDisabled={!props.hasChanges}>
        Reset
      </Button>
      <AlertDialog
        title="Reset changes"
        cancelLabel="Cancel"
        primaryActionLabel="Yes, reset"
        autoFocusButton="primary"
        onPrimaryAction={props.onReset}
      >
        Are you sure? Lost changes cannot be recovered.
      </AlertDialog>
    </DialogTrigger>
  )
}

/**
 * Handles the save operation for an item form.
 */
function useSaveHandler({
  list,
  itemId,
  initialValue,
  onSaveSuccess,
  invalidFields,
  setUpdateError,
}: {
  list: ReturnType<typeof useList>
  itemId: string
  initialValue: Record<string, unknown>
  onSaveSuccess: () => void
  invalidFields: Set<string>
  setUpdateError: (err: Error | null) => void
}) {
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [forceValidation, setForceValidation] = useState(false)

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()
    const needsValidation = invalidFields.size !== 0
    setForceValidation(needsValidation)
    if (needsValidation) return

    const { error: gqlError } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const errorToShow = CombinedGraphQLErrors.is(gqlError)
      ? gqlError.errors.find(x => x.path === undefined || x.path?.length === 1)
      : gqlError

    if (errorToShow) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(errorToShow.message)),
        shouldCloseOnAction: true,
      })
      return
    }

    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })
    onSaveSuccess()
  })

  return { onSave, loading, error, forceValidation, setForceValidation }
}

/**
 * Form for editing an item.
 */
function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [value, setValue] = useState(() => initialValue)

  useEffect(() => setValue(() => initialValue), [initialValue])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const { onSave, loading } = useSaveHandler({
    list,
    itemId,
    initialValue,
    onSaveSuccess,
    invalidFields,
    setUpdateError,
  })

  const onChange = useCallback((v: any) => setValue(v), [setValue])

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice
            errors={
              CombinedGraphQLErrors.is(error)
                ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
                : [error]
            }
          />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={onChange}
            value={value}
            isRequireds={isRequireds}
          />
        </VStack>

        <StickySidebar>
          <Fields
            view="itemView"
            position="sidebar"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            onChange={onChange}
            value={value}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            isRequireds={isRequireds}
          />
        </StickySidebar>

        <BaseToolbar>
          <Button
            isDisabled={!hasChangedFields}
            isPending={loading}
            prominence="high"
            type="submit"
          >
            Save
          </Button>
          <ResetButton hasChanges={hasChangedFields} onReset={() => setValue(() => initialValue)} />
          <Box flex />
          {!list.hideDelete && (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          )}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

/**
 * Extracts meta information (actions, field modes, positions, required flags) from the list and query data.
 */
function useMetaExtraction(data: any, list: ReturnType<typeof useList>) {
  return useMemo(() => {
    const actionModes: Record<string, any> = {}
    const fieldModes: Record<string, any> = {}
    const fieldPositions: Record<string, any> = {}
    const isRequireds: Record<string, any> = {}

    // Base definitions from list schema
    Object.entries(list.actions).forEach(([k, v]) => {
      actionModes[k] = v.itemView.actionMode
    })
    Object.entries(list.fields).forEach(([k, v]) => {
      fieldModes[k] = v.itemView.fieldMode
      fieldPositions[k] = v.itemView.fieldPosition
      isRequireds[k] = v.itemView.isRequired
    })

    // Override with admin meta if present
    data?.keystone?.adminMeta?.list?.fields?.forEach((field: any) => {
      if (!field?.itemView || !field.key) return
      const { fieldMode, fieldPosition, isRequired } = field.itemView
      if (fieldMode) fieldModes[field.key] = fieldMode
      if (fieldPosition) fieldPositions[field.key] = fieldPosition
      if (isRequired !== undefined) isRequireds[field.key] = isRequired
    })

    data?.keystone?.adminMeta?.list?.actions?.forEach((action: any) => {
      if (!action?.itemView?.actionMode || !action.key) return
      actionModes[action.key] = action.itemView.actionMode
    })

    const actionsInContext = list.actions
      .map(action => ({
        ...action,
        itemView: {
          ...action.itemView,
          actionMode: actionModes[action.key],
        },
      }))
      .filter(action => action.itemView.actionMode !== 'hidden')

    return { actionsInContext, fieldModes, fieldPositions, isRequireds }
  }, [data?.keystone?.adminMeta, list])
}

/**
 * Handles navigation after an item action.
 */
function useActionNavigator(list: ListMeta, routerInstance: ReturnType<typeof useRouter>, refetch: () => void) {
  return useCallback(
    (action: ActionMeta, resultId: string | null, currentItemId: string | null) => {
      const { navigation } = action.itemView

      if ((navigation === 'follow' && resultId === currentItemId) || navigation === 'refetch') {
        refetch()
      } else if (navigation === 'follow' && resultId) {
        routerInstance.push(`/${list.path}/${resultId}`)
      } else {
        routerInstance.push(list.isSingleton ? '/' : `/${list.path}`)
      }
    },
    [list, routerInstance, refetch]
  )
}

/**
 * Renders the appropriate not‑found UI based on list type and ID.
 */
function renderNotFound({
  list,
  itemId,
  pageLabel,
}: {
  list: ListMeta
  itemId: string | undefined
  pageLabel: string | undefined
}) {
  if (list.isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>“{list.label}” doesn’t exist, or you don’t have access to it.</Text>
          {!list.hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID <strong>“{itemId}”</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>“{itemId}”</strong> doesn’t exist, or you don’t have access to it.
      </Text>
    </ItemNotFound>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const routerInstance = useRouter()
  const idParam = useRouter().query.id
  const [itemId] = Array.isArray(idParam) ? idParam : [idParam]
  const { data, error, loading, refetch } = useListItem(listKey, itemId ?? null)

  const item = data?.item
  const rawLabel = item?.[list.labelField] ?? item?.id
  const itemLabel = typeof rawLabel === 'string' ? rawLabel : itemId ?? ''

  const pageLoading = loading || itemId === undefined
  const pageLabel = itemLabel || itemId
  const pageTitle =
    list.isSingleton || typeof pageLabel !== 'string' ? list.label : pageLabel

  const initialValue = useMemo(() => {
    if (!item) return null
    return deserializeItemToValue(list.fields, item)
  }, [list.fields, item])

  const { actionsInContext, fieldModes, fieldPositions, isRequireds } = useMetaExtraction(
    data,
    list
  )

  const onAction = useActionNavigator(list, routerInstance, refetch)

  return (
    <PageContainer
      title={pageTitle}
      header={
        <ItemPageHeader
          list={list}
          actions={actionsInContext}
          label={typeof pageLabel !== 'string' ? 'Loading...' : pageLabel}
          title={pageTitle}
          item={item ?? null}
          onAction={(action, resultId) => onAction(action, resultId, itemId)}
        />
      }
    >
      {pageLoading ? (
        <VStack height="100%" alignItems="center" justifyContent="center">
          <ProgressCircle aria-label="loading item data" size="large" isIndeterminate />
        </VStack>
      ) : (
        <ColumnLayout>
          <Box marginY="xlarge">
            <GraphQLErrorNotice errors={[error]} />
            {item == null && renderNotFound({ list, itemId, pageLabel })}
          </Box>
          {initialValue && (
            <ItemForm
              fieldModes={fieldModes}
              fieldPositions={fieldPositions}
              isRequireds={isRequireds}
              listKey={listKey}
              itemLabel={itemLabel}
              initialValue={initialValue}
              onSaveSuccess={refetch}
            />
          )}
        </ColumnLayout>
      )}
    </PageContainer>
  )
}