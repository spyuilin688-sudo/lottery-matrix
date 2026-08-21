const unavailable = async () => {
  throw new Error('APPDEPLOY_SDK_TEST_ADAPTER_NOT_CONFIGURED');
};

export const db = {
  list: unavailable,
  add: unavailable,
  update: unavailable,
  delete: unavailable,
};

export const secrets = { readSecret: unavailable };
export const ws = {};
export const json = (body: unknown, statusCode = 200) => ({ body, statusCode });
export const error = (message: string, statusCode = 500) => ({ body: { error: message }, statusCode });
export const requireAuth = () => async () => undefined;
export const router = (routes: unknown) => routes;
