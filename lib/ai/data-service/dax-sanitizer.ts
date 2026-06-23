const DAX_MAX_LENGTH = 8000;

const DDL_PATTERNS = [
  /\bREFRESH\b/i,
  /\bALTER\b/i,
  /\bCREATE\b/i,
  /\bDROP\b/i,
  /\bDELETE\b/i,
  /\bINSERT\b/i,
  /\bUPDATE\b/i,
  /\bTRUNCATE\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

const DANGEROUS_DAX_PATTERNS = [
  /\bINFO\./i,
  /\bINFO\s*\(/i,
  /\bDMV\b/i,
  /\bSESSION\b/i,
  /\bPROCESS\b/i,
  /\bDETACH\b/i,
  /\bATTACH\b/i,
  /\bBACKUP\b/i,
  /\bRESTORE\b/i,
  /\bBEGIN\s+TRANSACTION\b/i,
  /\bCOMMIT\b/i,
  /\bROLLBACK\b/i,
  /\bDISCOVER_SCHEMA\b/i,
  /\bDISCOVER_CALC_DEPENDENCY\b/i,
  /\bDISCOVER_XML_METADATA\b/i,
  /\bDISCOVER_CSDL_METADATA\b/i,
  /\bDISCOVER_STORAGE_TABLES\b/i,
  /\bDISCOVER_STORAGE_TABLE_COLUMNS\b/i,
  /\bDISCOVER_STORAGE_TABLE_COLUMN_SEGMENTS\b/i,
  /\bDISCOVER_TRACE_EVENTS\b/i,
];

const ALLOWED_TOP_LEVEL = [
  /^\s*EVALUATE\b/i,
  /^\s*SUMMARIZECOLUMNS\b/i,
  /^\s*DEFINE\b/i,
  /^\s*ORDER\b/i,
];

export interface DaxValidationResult {
  valid: boolean;
  reason?: string;
  pattern?: string;
}

export function sanitizeDax(dax: string): DaxValidationResult {
  if (!dax || !dax.trim()) {
    return { valid: false, reason: "DAX query is empty." };
  }

  if (dax.length > DAX_MAX_LENGTH) {
    return { valid: false, reason: `DAX query too long (max ${DAX_MAX_LENGTH} chars, got ${dax.length}).` };
  }

  for (const pattern of DDL_PATTERNS) {
    if (pattern.test(dax)) {
      return { valid: false, reason: "DAX query contains disallowed DDL/DML statements.", pattern: pattern.source };
    }
  }

  for (const pattern of DANGEROUS_DAX_PATTERNS) {
    if (pattern.test(dax)) {
      return { valid: false, reason: "DAX query contains disallowed pattern.", pattern: pattern.source };
    }
  }

  const trimmed = dax.trim();
  const hasAllowedStatement = ALLOWED_TOP_LEVEL.some((p) => p.test(trimmed));
  if (!hasAllowedStatement) {
    return { valid: false, reason: "DAX query must start with EVALUATE, SUMMARIZECOLUMNS, DEFINE, or ORDER." };
  }

  return { valid: true };
}
