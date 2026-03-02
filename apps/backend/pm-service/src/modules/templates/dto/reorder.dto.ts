import { IsArray, ArrayNotEmpty, IsUUID } from 'class-validator';

/**
 * Used for both stage reorder and task reorder.
 * The array is the complete ordered list of IDs for the parent container.
 * Every sibling ID must be present — partial reorders are rejected.
 */
export class ReorderDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}
