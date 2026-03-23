import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { SitecoreItem, SitecoreField, SitecoreLanguage } from '../models/types';

export class YamlParser {
    
    /**
     * Parse a Sitecore YAML file into a structured object
     */
    public static parseYamlFile(filePath: string): SitecoreItem | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = yaml.parse(content);

            if (!parsed || !parsed.ID) {
                return null;
            }

            const fileName = path.basename(filePath, '.yml');
            
            const item: SitecoreItem = {
                id: parsed.ID,
                parent: parsed.Parent || '',
                template: parsed.Template || '',
                path: parsed.Path || '',
                branchId: parsed.BranchID,
                filePath: filePath,
                name: fileName,
                sharedFields: this.parseFields(parsed.SharedFields),
                languages: this.parseLanguages(parsed.Languages)
            };

            return item;
        } catch (error) {
            console.error(`Error parsing YAML file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Parse shared fields from YAML
     */
    private static parseFields(fieldsData: any): SitecoreField[] | undefined {
        if (!fieldsData || !Array.isArray(fieldsData)) {
            return undefined;
        }

        return fieldsData.map(field => ({
            id: field.ID || '',
            hint: field.Hint || '',
            value: this.normalizeValue(field.Value)
        }));
    }

    /**
     * Parse languages and their versions
     */
    private static parseLanguages(languagesData: any): SitecoreLanguage[] | undefined {
        if (!languagesData || !Array.isArray(languagesData)) {
            return undefined;
        }

        return languagesData.map(lang => ({
            language: lang.Language || '',
            versions: (lang.Versions || []).map((ver: any) => ({
                version: ver.Version || 1,
                fields: this.parseFields(ver.Fields) || []
            }))
        }));
    }

    /**
     * Normalize field values (handle multi-line strings, etc.)
     */
    private static normalizeValue(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }
        
        if (typeof value === 'string') {
            return value;
        }

        return String(value);
    }

    /**
     * Get all YAML files in serialization directory
     */
    public static async getAllSerializationFiles(basePath: string): Promise<string[]> {
        const files: string[] = [];
        
        const walk = (dir: string) => {
            if (!fs.existsSync(dir)) {
                return;
            }

            const entries = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                
                if (entry.isDirectory()) {
                    walk(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.yml')) {
                    files.push(fullPath);
                }
            }
        };

        walk(basePath);
        return files;
    }

    /**
     * Get field name by ID using common Sitecore field mappings
     * Also accepts a hint parameter from the YAML file
     */
    public static getFieldName(fieldId: string, hint?: string): string {
        // If hint is provided and not empty, use it
        if (hint && hint.trim()) {
            return hint;
        }

        // Otherwise fall back to the mapping
        const fieldMap: { [key: string]: string } = {
            '25bed78c-4957-4165-998a-ca1b52f67497': '__Created',
            '5dd74568-4d4b-44c1-b513-0af5f4cda34f': '__Created by',
            '8cdc337e-a112-42fb-bbb4-4143751e123f': '__Revision',
            'badd9cf9-53e0-4d0c-bcc0-2d784c282f6a': '__Updated by',
            'd9cf14b1-fa16-4ba6-9288-e8a174d4d522': '__Updated',
            '52807595-0f8f-4b20-8d2a-cb71d28c6103': '__Owner',
            '001dd393-96c5-490b-924a-b0f25cd9efd8': '__Lock',
            '9c6106ea-7a5a-48e2-8cad-f0f693b1e2d4': '__Read Only',
            'f6d8a61c-2f84-4401-bd24-52d2068172bc': '__Originator',
            '86fe4f77-4d9a-4ec3-9ed9-263d03bd1965': '__Display name',
            '577f1689-7de4-4ad2-a15f-7fdc1759285f': '__Long description',
            '9541e67d-ce8c-4225-803d-33f7f29f09ef': '__Short description',
            '06d5295c-ed2f-4a54-9bf2-26228d113318': '__Icon',
            '12c33f3f-86c5-43a5-aeb4-5598cec45116': '__Thumbnail',
            'c7c26117-dbb1-42b2-ab5e-f7223845cca3': '__Thumbnail',
            '1230d2cb-4948-4d43-8a3b-b39978f6f1b3': 'Modules',
            '2b2fe9fd-78a6-40eb-b9f9-28409d8d3700': 'SitemapMediaItems',
            '33d9005e-1f71-415f-b107-53b965c3b037': 'SiteMediaLibrary',
            '85a7501a-86d9-4243-9075-0b727c3a6db4': 'Name'
        };

        return fieldMap[fieldId.toLowerCase()] || fieldId;
    }

    /**
     * Compare two items and return field-level differences
     */
    public static compareItems(oldItem: SitecoreItem | null, newItem: SitecoreItem | null): any {
        if (!oldItem && !newItem) {
            return null;
        }

        const changes: any = {
            metadata: {},
            sharedFields: [],
            languageFields: []
        };

        // Compare metadata
        if (oldItem && newItem) {
            if (oldItem.template !== newItem.template) {
                changes.metadata.template = { old: oldItem.template, new: newItem.template };
            }
            if (oldItem.parent !== newItem.parent) {
                changes.metadata.parent = { old: oldItem.parent, new: newItem.parent };
            }
        }

        // Compare shared fields
        if (oldItem?.sharedFields || newItem?.sharedFields) {
            const oldFields = new Map(oldItem?.sharedFields?.map(f => [f.id, f.value]) || []);
            const newFields = new Map(newItem?.sharedFields?.map(f => [f.id, f.value]) || []);

            // Check all fields
            const allFieldIds = new Set([...oldFields.keys(), ...newFields.keys()]);
            
            for (const fieldId of allFieldIds) {
                const oldValue = oldFields.get(fieldId);
                const newValue = newFields.get(fieldId);

                if (oldValue !== newValue) {
                    changes.sharedFields.push({
                        fieldId,
                        fieldName: this.getFieldName(fieldId),
                        oldValue: oldValue || '',
                        newValue: newValue || ''
                    });
                }
            }
        }

        return changes;
    }
}
