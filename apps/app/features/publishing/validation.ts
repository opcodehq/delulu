// Helper to validate required parameters
export function validateRequired<T>(
  value: T | undefined | null,
  fieldName: string
): T {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${fieldName} is required`);
  }
  return value;
}
