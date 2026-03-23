export interface SitecoreItem {
    id: string;
    parent: string;
    template: string;
    path: string;
    branchId?: string;
    filePath: string;
    name: string;
    sharedFields?: SitecoreField[];
    languages?: SitecoreLanguage[];
}

export interface SitecoreField {
    id: string;
    hint: string;
    value: string;
}

export interface SitecoreLanguage {
    language: string;
    versions: SitecoreVersion[];
}

export interface SitecoreVersion {
    version: number;
    fields: SitecoreField[];
}

export interface ItemChange {
    type: 'added' | 'modified' | 'deleted';
    item: SitecoreItem;
    oldItem?: SitecoreItem;
    changedFields?: FieldChange[];
    filePath: string;
}

export interface FieldChange {
    fieldId: string;
    fieldName: string;
    oldValue?: string;
    newValue?: string;
    language?: string;
    version?: number;
    scope: 'shared' | 'language';
}

export interface ChangesSummary {
    added: ItemChange[];
    modified: ItemChange[];
    deleted: ItemChange[];
    totalChanges: number;
    fieldChanges: number;
}

export interface ModuleConfig {
    namespace: string;
    items: {
        includes: ModuleInclude[];
    };
}

export interface ModuleInclude {
    name: string;
    path: string;
    allowedPushOperations?: string;
    rules?: any[];
}
