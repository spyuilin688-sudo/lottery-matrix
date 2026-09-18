type AdminServiceWorkerContainer = {
  register(scriptURL: string, options?: RegistrationOptions): Promise<unknown>;
};

export async function registerAdminServiceWorker(
  serviceWorker: AdminServiceWorkerContainer | undefined = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
) {
  if (!serviceWorker?.register) return null;
  return serviceWorker.register('/admin/admin-push-sw.js', { scope: '/admin/' });
}
