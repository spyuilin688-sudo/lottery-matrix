const unavailable = () => {
  throw new Error("The AppDeploy client test double must be mocked by the importing test.");
};

export const api = {
  get: unavailable,
  post: unavailable,
  put: unavailable,
  delete: unavailable,
};

export const auth = {
  signIn: unavailable,
  signOut: unavailable,
};
