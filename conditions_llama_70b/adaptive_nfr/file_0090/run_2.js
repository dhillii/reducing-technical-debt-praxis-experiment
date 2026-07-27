interface SchemaVisitor {
  visitChild(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
  visitRelationship(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
  visitForm(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
  visitObject(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
  visitArray(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
  visitConditional(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void
}

class DefaultSchemaVisitor implements SchemaVisitor {
  visitChild(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
  visitRelationship(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
  visitForm(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
  visitObject(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
  visitArray(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
  visitConditional(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {}
}

class ValidationSchemaVisitor extends DefaultSchemaVisitor {
  private isValid: boolean

  constructor() {
    super()
    this.isValid = true
  }

  visitChild(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    this.isValid = true
  }

  visitRelationship(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    this.isValid = true
  }

  visitForm(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    this.isValid = schema.validate(value)
  }

  visitObject(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      const childVisitor = new ValidationSchemaVisitor()
      traverseProps(childProp, (value as any)[key], childVisitor, [...path, key])
      if (!childVisitor.isValid) {
        this.isValid = false
        return
      }
    }
  }

  visitArray(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    if (!Array.isArray(value)) {
      this.isValid = false
      return
    }
    for (const [idx, val] of (value as unknown[]).entries()) {
      const childVisitor = new ValidationSchemaVisitor()
      traverseProps(schema.element, val, childVisitor, path.concat(idx))
      if (!childVisitor.isValid) {
        this.isValid = false
        return
      }
    }
  }

  visitConditional(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    if (!('discriminant' in value) || !('value' in value)) {
      this.isValid = false
      return
    }
    const discriminantVisitor = new ValidationSchemaVisitor()
    discriminantVisitor.visitForm(schema.discriminant, (value as any).discriminant, path.concat('discriminant'))
    if (!discriminantVisitor.isValid) {
      this.isValid = false
      return
    }
    const childVisitor = new ValidationSchemaVisitor()
    traverseProps(
      schema.values[(value as any).discriminant.toString()],
      (value as any).value,
      childVisitor,
      path.concat('value')
    )
    if (!childVisitor.isValid) {
      this.isValid = false
      return
    }
  }
}

export function clientSideValidateProp(schema: ComponentSchema, value: unknown): boolean {
  const visitor = new ValidationSchemaVisitor()
  traverseProps(schema, value, visitor)
  return visitor.isValid
}

class FindChildPropPathsSchemaVisitor extends DefaultSchemaVisitor {
  private paths: PathToChildFieldWithOption[]

  constructor() {
    super()
    this.paths = []
  }

  visitChild(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    this.paths.push({ path, options: schema.options })
  }

  visitObject(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], this, [...path, key])
    }
  }

  visitArray(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, this, path.concat(idx))
    }
  }

  visitConditional(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    traverseProps(
      schema.values[(value as any).discriminant.toString()],
      (value as any).value,
      this,
      path.concat('value')
    )
  }

  getPaths(): PathToChildFieldWithOption[] {
    return this.paths
  }
}

export function findChildPropPathsForProp(
  value: any,
  schema: ComponentSchema,
  path: ReadonlyPropPath
): PathToChildFieldWithOption[] {
  const visitor = new FindChildPropPathsSchemaVisitor()
  traverseProps(schema, value, visitor, path)
  return visitor.getPaths()
}

class GetDocumentFeaturesForChildFieldSchemaVisitor extends DefaultSchemaVisitor {
  private documentFeatures: DocumentFeaturesForChildField

  constructor(editorDocumentFeatures: DocumentFeatures) {
    super()
    this.documentFeatures = {
      kind: 'inline',
      inlineMarks: 'inherit',
      documentFeatures: {
        links: true,
        relationships: true,
      },
      softBreaks: true,
    }
    this.initDocumentFeatures(editorDocumentFeatures)
  }

  private initDocumentFeatures(editorDocumentFeatures: DocumentFeatures) {
    if (editorDocumentFeatures.formatting) {
      this.documentFeatures.inlineMarks = editorDocumentFeatures.formatting.inlineMarks
    }
  }

  visitChild(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    this.documentFeatures = getDocumentFeaturesForChildField(schema.options, this.documentFeatures)
  }

  visitObject(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    for (const [key, childProp] of Object.entries(schema.fields)) {
      traverseProps(childProp, (value as any)[key], this, [...path, key])
    }
  }

  visitArray(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    for (const [idx, val] of (value as unknown[]).entries()) {
      traverseProps(schema.element, val, this, path.concat(idx))
    }
  }

  visitConditional(schema: ComponentSchema, value: unknown, path: ReadonlyPropPath): void {
    traverseProps(
      schema.values[(value as any).discriminant.toString()],
      (value as any).value,
      this,
      path.concat('value')
    )
  }

  getDocumentFeatures(): DocumentFeaturesForChildField {
    return this.documentFeatures
  }
}

function getDocumentFeaturesForChildField(
  options: ChildField['options'],
  editorDocumentFeatures: DocumentFeaturesForChildField
): DocumentFeaturesForChildField {
  const inlineMarksFromOptions = options.formatting?.inlineMarks

  const inlineMarks =
    inlineMarksFromOptions === 'inherit'
      ? 'inherit'
      : (Object.fromEntries(
          Object.keys(editorDocumentFeatures.inlineMarks).map(mark => {
            return [mark as Mark, !!(inlineMarksFromOptions || {})[mark as Mark]]
          })
        ) as Record<Mark, boolean>)

  if (options.kind === 'inline') {
    return {
      kind: 'inline',
      inlineMarks,
      documentFeatures: {
        links: options.links === 'inherit',
        relationships: options.relationships === 'inherit',
      },
      softBreaks: options.formatting?.softBreaks === 'inherit',
    }
  }
  return {
    kind: 'block',
    inlineMarks,
    softBreaks: options.formatting?.softBreaks === 'inherit',
    documentFeatures: {
      layouts: [],
      dividers: options.dividers === 'inherit' ? editorDocumentFeatures.documentFeatures.dividers : false,
      formatting: {
        alignment:
          options.formatting?.alignment === 'inherit'
            ? editorDocumentFeatures.documentFeatures.formatting.alignment
            : {
                center: false,
                end: false,
              },
        blockTypes:
          options.formatting?.blockTypes === 'inherit'
            ? editorDocumentFeatures.documentFeatures.formatting.blockTypes
            : {
                blockquote: false,
                code: false,
              },
        headingLevels:
          options.formatting?.headingLevels === 'inherit'
            ? editorDocumentFeatures.documentFeatures.formatting.headingLevels
            : options.formatting?.headingLevels || [],
        listTypes:
          options.formatting?.listTypes === 'inherit'
            ? editorDocumentFeatures.documentFeatures.formatting.listTypes
            : {
                ordered: false,
                unordered: false,
              },
      },
      links: options.links === 'inherit',
      relationships: options.relationships === 'inherit',
    },
    componentBlocks: options.componentBlocks === 'inherit',
  }
}

export function getDocumentFeaturesForChildField(
  editorDocumentFeatures: DocumentFeatures,
  options: ChildField['options']
): DocumentFeaturesForChildField {
  const visitor = new GetDocumentFeaturesForChildFieldSchemaVisitor(editorDocumentFeatures)
  traverseProps({ kind: 'child', options }, {}, visitor)
  return visitor.getDocumentFeatures()
}