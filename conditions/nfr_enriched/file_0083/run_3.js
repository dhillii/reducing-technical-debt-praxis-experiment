```typescript
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
  const router = useRouter()
  const [deleteItem] = useMutation(
    gql`mutation ($id: ID!) {
      ${list.graphql.names.deleteMutationName}(where: { id: $id }) {
        id
      }
    }`,
    { variables: { id: itemId } }
  )

  const handleDeleteSuccess = () => {
    toastQueue.neutral(`${list.singular} deleted.`, {
      timeout: 5000,
    })
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }

  const handleDeleteError = (err: any) => {
    toastQueue.critical('Unable to delete item', {
      actionLabel: 'Details',
      onAction: () => setErrorDialogValue(err),
      shouldCloseOnAction: true,
    })
  }

  const handlePrimaryAction = async () => {
    try {
      await deleteItem()
      handleDeleteSuccess()
    } catch (err: any) {
      handleDeleteError(err)
    }
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
          onPrimaryAction={handlePrimaryAction}
        >
          <Text>
            Are you sure you want to delete{' '}
            <strong style={{ fontWeight: 600 }}>{itemLabel}</strong>?
            {' '}
            This action cannot be undone.
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

type ItemFormProps = {
  listKey: string
  initialValue: Record<string, unknown>
  itemLabel: string
  onSaveSuccess: () => void
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
}

function ItemForm({
  listKey,
  initialValue,
  itemLabel,
  onSaveSuccess,
  fieldModes,
  fieldPositions,
  isRequireds,
}: ItemFormProps) {
  const list = useList(listKey)
  const itemId = initialValue.id as string
  const [updateError, setUpdateError] = useState<Error | null>(null)
  const [update, { loading, error }] = useMutation(
    gql`mutation ($id: ID!, $data: ${list.graphql.names.updateInputName}!) {
      item: ${list.graphql.names.updateMutationName}(where: { id: $id }, data: $data) {
        id
      }
    }`,
    { errorPolicy: 'all' }
  )

  const [value, setValue] = useState(() => initialValue)

  const resetValueState = useCallback(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    resetValueState()
  }, [initialValue, resetValueState])

  const invalidFields = useInvalidFields(list.fields, value, isRequireds)
  const [forceValidation, setForceValidation] = useState(false)

  const handleValidationError = () => {
    setForceValidation(true)
  }

  const handleUpdateError = (updateError: any) => {
    const error = CombinedGraphQLErrors.is(updateError)
      ? updateError.errors.find(x => x.path === undefined || x.path?.length === 1)
      : updateError

    if (error) {
      toastQueue.critical('Unable to save item', {
        actionLabel: 'Details',
        onAction: () => setUpdateError(new Error(error.message)),
        shouldCloseOnAction: true,
      })
      return true
    }
    return false
  }

  const handleUpdateSuccess = () => {
    toastQueue.positive(`Saved changes to ${list.singular.toLocaleLowerCase()}.`, {
      timeout: 5000,
    })
    onSaveSuccess()
  }

  const onSave = useEventCallback(async (e: FormEvent<HTMLFormElement>) => {
    if (e.target !== e.currentTarget) return
    e.preventDefault()

    const hasInvalidFields = invalidFields.size !== 0
    if (hasInvalidFields) {
      handleValidationError()
      return
    }

    const { error: updateErrorResult } = await update({
      variables: {
        id: itemId,
        data: serializeValueToOperationItem('update', list.fields, value, initialValue),
      },
    })

    const hasError = handleUpdateError(updateErrorResult)
    if (!hasError) {
      handleUpdateSuccess()
    }
  })

  const hasChangedFields = useHasChanges('update', list.fields, value, initialValue)

  const graphQLErrors = CombinedGraphQLErrors.is(error)
    ? error.errors.filter(x => x.path === undefined || x.path?.length === 1)
    : [error]

  return (
    <Fragment>
      <form onSubmit={onSave} style={{ display: 'contents' }}>
        {/*
          Workaround for react-aria "bug" where pressing enter in a form field
          moves focus to the submit button.
          See: https://github.com/adobe/react-spectrum/issues/5940
        */}
        <button type="submit" style={{ display: 'none' }} />
        <VStack gap="large" gridArea="main" marginTop="xlarge" minWidth={0}>
          <GraphQLErrorNotice errors={graphQLErrors} />
          <Fields
            view="itemView"
            position="form"
            fields={list.fields}
            groups={list.groups}
            forceValidation={forceValidation}
            invalidFields={invalidFields}
            fieldModes={fieldModes}
            fieldPositions={fieldPositions}
            onChange={useCallback(value => setValue(value), [setValue])}
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
            onChange={useCallback(value => setValue(value), [setValue])}
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
          <ResetButton hasChanges={hasChangedFields} onReset={resetValueState} />
          <Box flex />
          {!list.hideDelete ? (
            <DeleteButton list={list} itemId={itemId} itemLabel={itemLabel} />
          ) : null}
        </BaseToolbar>
      </form>

      <DialogContainer onDismiss={() => setUpdateError(null)} isDismissable>
        {updateError && <ErrorDetailsDialog title="Unable to save item" error={updateError} />}
      </DialogContainer>
    </Fragment>
  )
}

export const getItemPage = (props: ItemPageProps) => () => <ItemPage {...props} />

type ItemPageContextData = {
  actionsInContext: ActionMeta[]
  fieldModes: Record<string, ConditionalFilter<'edit' | 'read' | 'hidden', BaseListTypeInfo>>
  fieldPositions: Record<string, 'form' | 'sidebar'>
  isRequireds: Record<string, ConditionalFilterCase<BaseListTypeInfo>>
}

/** Builds context data for item page including actions and field configurations */
function buildItemPageContextData(
  list: ListMeta,
  adminMeta: any
): ItemPageContextData {
  const actionModes = Object.fromEntries(
    Object.entries(list.actions).map(([k, v]) => [k, v.itemView.actionMode])
  )
  const fieldModes = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldMode])
  )
  const fieldPositions = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.fieldPosition])
  )
  const isRequireds = Object.fromEntries(
    Object.entries(list.fields).map(([k, v]) => [k, v.itemView.isRequired])
  )

  // Override with admin metadata if available
  for (const field of adminMeta?.list?.fields ?? []) {
    if (
      !field?.itemView ||
      !field.key ||
      !field.itemView.fieldMode ||
      !field.itemView.fieldPosition ||
      !field.itemView.isRequired
    )
      continue
    fieldModes[field.key] = field.itemView.fieldMode
    fieldPositions[field.key] = field.itemView.fieldPosition
    isRequireds[field.key] = field.itemView.isRequired
  }

  for (const action of adminMeta?.list?.actions ?? []) {
    if (!action?.itemView?.actionMode || !action.key) continue
    actionModes[action.key] = action.itemView.actionMode
  }

  // Filter actions to only those visible in item context
  const actionsInContext = list.actions
    .map(action => ({
      ...action,
      itemView: {
        ...action.itemView,
        actionMode: actionModes[action.key],
      },
    }))
    .filter(action => action.itemView.actionMode !== 'hidden')

  return {
    actionsInContext,
    fieldModes,
    fieldPositions,
    isRequireds,
  }
}

/** Renders appropriate not-found message based on list type and item state */
function renderItemNotFoundContent(
  list: ListMeta,
  itemId: string | undefined,
  isSingleton: boolean
): React.ReactNode {
  if (isSingleton) {
    if (itemId === '1') {
      return (
        <ItemNotFound>
          <Text>"{list.label}" doesn't exist, or you don't have access to it.</Text>
          {!list.hideCreate && <CreateButtonLink list={list} />}
        </ItemNotFound>
      )
    }
    return (
      <ItemNotFound>
        <Text>
          An item with ID <strong>"{itemId}"</strong> does not exist.
        </Text>
      </ItemNotFound>
    )
  }

  return (
    <ItemNotFound>
      <Text>
        The item with ID <strong>"{itemId}"</strong> doesn't exist, or you don't have access to
        {' '}
        it.
      </Text>
    </ItemNotFound>
  )
}

/** Handles action navigation after item operations */
function handleItemAction(
  action: ActionMeta,
  resultId: string | null,
  itemId: string | undefined,
  list: ListMeta,
  refetch: () => void
): void {
  const { navigation } = action.itemView

  if ((navigation === 'follow' && resultId === itemId) || navigation === 'refetch') {
    refetch()
  } else if (navigation === 'follow' && resultId) {
    router.push(`/${list.path}/${resultId}`)
  } else {
    router.push(list.isSingleton ? '/' : `/${list.path}`)
  }
}

function ItemPage({ listKey }: ItemPageProps) {
  const list = useList(listKey)
  const id_ = useRouter().query.id
  const [itemId] =