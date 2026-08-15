const LOTTERY_NUMBER_INPUT_SELECTOR = [
  '.same-star-fields input',
  '.reference-search input[aria-label^="探索號碼"]',
  '.note-number-group input[aria-label*="投注號碼"]',
].join(',');

const lastValidLotteryNumber = new WeakMap<HTMLInputElement, string>();
const syntheticInputGuard = new WeakSet<HTMLInputElement>();

export function normalizeLotteryNumberDraft(value: string, previous = ''): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 2);
  if (!digits) return '';
  if (digits.length === 1) return digits;
  const numeric = Number(digits);
  return numeric >= 1 && numeric <= 49 ? digits : previous;
}

export function formatLotteryNumber(value: string): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 2);
  if (!digits) return '';
  const numeric = Number(digits);
  if (numeric < 1 || numeric > 49) return '';
  return String(numeric).padStart(2, '0');
}

function isLotteryNumberInput(input: HTMLInputElement) {
  return input.matches(LOTTERY_NUMBER_INPUT_SELECTOR);
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  if (input.value === value) return;
  const ownSetter = Object.getOwnPropertyDescriptor(input, 'value')?.set;
  const prototypeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (prototypeSetter && ownSetter !== prototypeSetter) prototypeSetter.call(input, value);
  else if (ownSetter) ownSetter.call(input, value);
  else input.value = value;
}

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
    if (!(input instanceof HTMLInputElement)) return;
    selectInputValue(input);
    if (isLotteryNumberInput(input)) {
      lastValidLotteryNumber.set(input, normalizeLotteryNumberDraft(input.value));
    }
  };

  const handleInput = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isLotteryNumberInput(input) || syntheticInputGuard.has(input)) return;
    const previous = lastValidLotteryNumber.get(input) ?? '';
    const normalized = normalizeLotteryNumberDraft(input.value, previous);
    setNativeInputValue(input, normalized);
    lastValidLotteryNumber.set(input, normalized);
  };

  const handleBlur = (event: Event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !isLotteryNumberInput(input)) return;
    const formatted = formatLotteryNumber(input.value);
    if (formatted === input.value) return;
    setNativeInputValue(input, formatted);
    lastValidLotteryNumber.set(input, formatted);
    syntheticInputGuard.add(input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    syntheticInputGuard.delete(input);
  };

  document.addEventListener('focusin', handleFocus, true);
  document.addEventListener('input', handleInput, true);
  document.addEventListener('blur', handleBlur, true);

  return () => {
    document.removeEventListener('focusin', handleFocus, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('blur', handleBlur, true);
  };
}
