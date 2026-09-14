export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
