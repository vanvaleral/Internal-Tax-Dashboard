declare const catalog: {
  readonly groups: readonly { readonly label: string; readonly taxes: readonly string[] }[];
  readonly taxes: readonly string[];
  readonly otherValue: string;
  readonly maxProducts: number;
};
export = catalog;
