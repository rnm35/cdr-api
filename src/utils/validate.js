import { badRequest } from "./errors.js";

// validation helpers; validate() collects every problem into one 400 error

export function validate(source, rules) {
  const result = {};
  const problems = [];
  for (const [field, rule] of Object.entries(rules)) {
    const outcome = rule(source[field], field);
    if (outcome?.error) problems.push({ field, message: outcome.error });
    else if (outcome?.value !== undefined) result[field] = outcome.value;
  }
  if (problems.length > 0) throw badRequest("Some of the values sent are not valid.", problems);
  return result;
}

const isMissing = (value) => value === undefined || value === null || value === "";

export const optional = (rule) => (value, field) => (isMissing(value) ? {} : rule(value, field));

export const required = (rule) => (value, field) =>
  isMissing(value) ? { error: `${field} is required.` } : rule(value, field);

export const withDefault = (fallback, rule) => (value, field) =>
  isMissing(value) ? { value: fallback } : rule(value, field);

export const integer = ({ min = -Infinity, max = Infinity } = {}) => (value, field) => {
  const number = Number(value);
  if (!Number.isInteger(number)) return { error: `${field} must be a whole number.` };
  if (number < min || number > max) return { error: `${field} must be between ${min} and ${max}.` };
  return { value: number };
};

export const oneOf = (options) => (value, field) =>
  options.includes(value) ? { value } : { error: `${field} must be one of: ${options.join(", ")}.` };

export const text = ({ min = 0, max = 200 } = {}) => (value, field) => {
  if (typeof value !== "string") return { error: `${field} must be text.` };
  const trimmed = value.trim();
  if (trimmed.length < min) {
    return { error: min === 1 ? `${field} cannot be empty.` : `${field} must be at least ${min} characters.` };
  }
  if (trimmed.length > max) return { error: `${field} must be at most ${max} characters.` };
  return { value: trimmed };
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const email = () => (value, field) => {
  if (typeof value !== "string" || value.length > 254 || !EMAIL_PATTERN.test(value.trim())) {
    return { error: `${field} must be a valid email address.` };
  }
  return { value: value.trim().toLowerCase() };
};

// bcrypt only uses the first 72 bytes
export const password = () => (value, field) => {
  if (typeof value !== "string") return { error: `${field} must be text.` };
  if (value.length < 8) return { error: `${field} must be at least 8 characters.` };
  if (Buffer.byteLength(value) > 72) return { error: `${field} must be at most 72 characters.` };
  return { value };
};

// YYYY-MM-DD and a real date
export const isoDate = () => (value, field) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: `${field} must be a date in YYYY-MM-DD format.` };
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { error: `${field} is not a real date.` };
  }
  return { value };
};

// keep digits only
export const phoneSearch = () => (value, field) => {
  if (typeof value !== "string") return { error: `${field} must be text.` };
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return { error: `${field} must contain at least one digit.` };
  if (digits.length > 15) return { error: `${field} must be at most 15 digits.` };
  return { value: digits };
};
