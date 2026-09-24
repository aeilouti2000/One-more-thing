export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUsername(value: string) {
  return /^[a-zA-Z0-9._]{3,32}$/.test(value.trim());
}

export function isValidLoginName(value: string) {
  const trimmed = value.trim();
  return isValidUsername(trimmed) || isValidEmail(trimmed);
}

export function isValidPassword(value: string) {
  return value.length >= 6;
}

export function parseQuantity(value: string) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return null;
  }
  return quantity;
}
