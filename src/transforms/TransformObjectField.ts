import {
  GraphQLSchema,
  FieldNode,
  SelectionNode,
  FragmentDefinitionNode
} from 'graphql';
import { Transform } from './transforms';
import { createResolveType, fieldToFieldConfig } from '../stitching/schemaRecreation';
import { Request, IFieldResolver } from '../Interfaces';
import TransformObjectFields from './TransformObjectFields';

export default class TransformObjectField implements Transform {
  private transformer: TransformObjectFields;

  constructor({
    typeName,
    fieldName,
    resolverWrapper,
    fieldNodeTransformer,
    fragments = {},
  }: {
    typeName: string;
    fieldName: string;
    resolverWrapper?: (originalResolver: IFieldResolver<any, any>) => IFieldResolver<any, any>;
    fieldNodeTransformer?:
      (fieldNode: FieldNode, fragments: Record<string, FragmentDefinitionNode>) => SelectionNode | Array<SelectionNode>;
    fragments?: Record<string, FragmentDefinitionNode>;
  }) {
    const resolveType = createResolveType((name, type) => type);
    this.transformer = new TransformObjectFields(
      (t, f, field) => {
        const fieldConfig = fieldToFieldConfig(field, resolveType, true);
        if (typeName === t && fieldName === f && resolverWrapper) {
          const originalResolver = fieldConfig.resolve;
          fieldConfig.resolve = resolverWrapper(originalResolver);
        }
        return fieldConfig;
      },
      (t, f, fieldNode, fragments): SelectionNode | Array<SelectionNode> => {
        if (typeName === t && fieldName === f && fieldNodeTransformer) {
          return fieldNodeTransformer(fieldNode, fragments);
        }
        return fieldNode;
      }
    );
  }

  public transformSchema(originalSchema: GraphQLSchema): GraphQLSchema {
    return this.transformer.transformSchema(originalSchema);
  }

  public transformRequest(originalRequest: Request): Request {
    return this.transformer.transformRequest(originalRequest);
  }
}
