import { ApiError, errorMessage } from '@/lib/api';

export const MIN_PASSWORD = 10;

export const PASSWORD_HINT =
  'At least 10 characters. A few unrelated words make a strong, easy-to-type password. Very common passwords are refused.';

/** Sign-in and password errors in the API's own words ("Email or password is incorrect"). */
export function authError(err: unknown): string {
  if (err instanceof ApiError && err.message && !/csrf/i.test(err.message)) return err.message;
  return errorMessage(err);
}
