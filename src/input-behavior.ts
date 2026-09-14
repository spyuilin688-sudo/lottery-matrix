function selectInputValue(input: HTMLInputElement) {
  try {
    input.select();
  } catch {
    // Some non-text input types do not expose a selectable text range.
  }
}

export function installGlobalInputBehavior() {
  const handleFocus = (event: Event) => {
    const input = event.target;
    if (input instanceof HTMLInputElement) selectInputValue(input);
  };
  document.addEventListener('focusin', handleFocus, true);
  return () => {
    document.removeEventListener('focusin', handleFocus, true);
  };
}
