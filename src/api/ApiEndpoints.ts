/** Path constants for the Cheapluxury TempMail REST API. */
export const ApiPaths = {
  domains: '/domains',
  register: '/register',
  randomEmail: '/random_email',
  login: '/login',
  changePassword: '/change_password',
  emailGet: '/email/get',
  emailView: '/email/view',
} as const;

export type ApiPath = (typeof ApiPaths)[keyof typeof ApiPaths];

/** Documented `response_code` values, used for precise error mapping. */
export const ApiResponseCode = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  notFound: 404,
  conflict: 409,
  rateLimited: 429,
  serverError: 500,
} as const;

/** Header the backend sets on 429 responses. */
export const RETRY_AFTER_HEADER = 'Retry-After';

/** Everything the API might return as a message when a request fails. */
export const API_MESSAGE_FALLBACK = 'The mailbox service returned an unexpected response.';
