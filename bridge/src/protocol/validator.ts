import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 轻量 JSON Schema (draft-07 子集) 校验器。
 * 零依赖，覆盖本协议用到的关键字：type / required / properties / additionalProperties / enum / minimum / maximum / items。
 * Schema 直接读取仓库 protocol/schema/*.json，保证 Bridge 与协议文档单一事实来源。
 */

export interface JsonSchema {
    type?: string | string[];
    required?: string[];
    properties?: Record<string, JsonSchema>;
    additionalProperties?: boolean | JsonSchema;
    enum?: any[];
    minimum?: number;
    maximum?: number;
    items?: JsonSchema;
    [key: string]: any;
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

function typeOf(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
    return typeof value;
}

function matchesType(value: any, expected: string): boolean {
    const actual = typeOf(value);
    if (expected === 'number') return actual === 'number' || actual === 'integer';
    return actual === expected;
}

export function validateAgainst(schema: JsonSchema, value: any, path = '$', errors: string[] = []): string[] {
    if (schema.type) {
        const types = Array.isArray(schema.type) ? schema.type : [schema.type];
        if (!types.some((t) => matchesType(value, t))) {
            errors.push(`${path}: expected ${types.join('|')}, got ${typeOf(value)}`);
            return errors;
        }
    }
    if (schema.enum && !schema.enum.includes(value)) {
        errors.push(`${path}: value ${JSON.stringify(value)} not in enum [${schema.enum.join(', ')}]`);
    }
    if (typeof value === 'number') {
        if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
        if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
    }
    if (typeOf(value) === 'object') {
        for (const key of schema.required ?? []) {
            if (!(key in value)) errors.push(`${path}: missing required property '${key}'`);
        }
        const props = schema.properties ?? {};
        for (const [key, sub] of Object.entries(props)) {
            if (key in value) validateAgainst(sub, value[key], `${path}.${key}`, errors);
        }
        if (schema.additionalProperties === false) {
            for (const key of Object.keys(value)) {
                if (!(key in props)) errors.push(`${path}: additional property '${key}' not allowed`);
            }
        } else if (typeof schema.additionalProperties === 'object') {
            for (const key of Object.keys(value)) {
                if (!(key in props)) validateAgainst(schema.additionalProperties, value[key], `${path}.${key}`, errors);
            }
        }
    }
    if (Array.isArray(value) && schema.items) {
        value.forEach((item, i) => validateAgainst(schema.items as JsonSchema, item, `${path}[${i}]`, errors));
    }
    return errors;
}

/** 向上查找仓库根目录下的 protocol/schema (src/ dist/ dist-test/ 任意深度均可) */
export function defaultSchemaDir(): string {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
        const candidate = join(dir, 'protocol', 'schema');
        if (existsSync(candidate)) return candidate;
        const parent = resolve(dir, '..');
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error('protocol/schema 目录未找到，请在仓库内运行 Bridge 或传入 schemaDir');
}

export class ProtocolValidator {
    private schemas = new Map<string, JsonSchema>();

    constructor(schemaDir: string = defaultSchemaDir()) {
        for (const file of readdirSync(schemaDir)) {
            if (!file.endsWith('.schema.json')) continue;
            const name = file.replace('.schema.json', '');
            this.schemas.set(name, JSON.parse(readFileSync(join(schemaDir, file), 'utf8')));
        }
    }

    has(type: string): boolean {
        return this.schemas.has(type);
    }

    types(): string[] {
        return [...this.schemas.keys()];
    }

    /** 按报文 type 字段选择 schema 校验 */
    validate(message: any): ValidationResult {
        if (typeOf(message) !== 'object') {
            return { valid: false, errors: ['$: message must be a JSON object'] };
        }
        const type = message.type;
        if (typeof type !== 'string' || !this.schemas.has(type)) {
            return { valid: false, errors: [`$.type: unknown message type '${String(type)}'`] };
        }
        const errors = validateAgainst(this.schemas.get(type)!, message);
        return { valid: errors.length === 0, errors };
    }
}
