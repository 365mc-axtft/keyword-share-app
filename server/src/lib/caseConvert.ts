// DB 컬럼은 snake_case, API/프런트는 camelCase를 사용한다. 이 두 유틸로 경계에서만 변환한다.

function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function camelToSnakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function toCamel<T = any>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamel) as any;
  if (obj instanceof Date) return obj as any;
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[snakeToCamelKey(k)] = toCamel(v);
    }
    return out;
  }
  return obj;
}

export function toSnake<T = any>(obj: any): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnake) as any;
  if (obj instanceof Date) return obj as any;
  if (typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[camelToSnakeKey(k)] = toSnake(v);
    }
    return out;
  }
  return obj;
}
