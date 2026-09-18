export async function runConfirmed(
  confirmAction: () => Promise<boolean>,
  action: () => Promise<unknown>,
) {
  if (!await confirmAction()) return false;
  await action();
  return true;
}
