import { signInWithGoogle } from "./google-auth";

const GOOGLE_BUTTON_ATTRIBUTE = "data-google-auth-entry";

function syncGoogleLoginEntry() {
  const lineButton = document.querySelector<HTMLButtonElement>(".profile-card .profile-logout");
  const existing = document.querySelector<HTMLButtonElement>(`[${GOOGLE_BUTTON_ATTRIBUTE}]`);
  const isAnonymousLineEntry = lineButton?.textContent?.trim() === "LINE 登入";

  if (!lineButton || !isAnonymousLineEntry) {
    existing?.remove();
    return;
  }
  if (existing?.isConnected) return;

  const googleButton = document.createElement("button");
  googleButton.type = "button";
  googleButton.className = "profile-logout";
  googleButton.setAttribute(GOOGLE_BUTTON_ATTRIBUTE, "true");
  googleButton.textContent = "Google 登入";
  googleButton.addEventListener("click", () => {
    googleButton.disabled = true;
    googleButton.textContent = "登入中…";
    void signInWithGoogle().catch(() => {
      googleButton.disabled = false;
      googleButton.textContent = "Google 登入";
    });
  });
  lineButton.insertAdjacentElement("afterend", googleButton);
}

export function installGoogleLoginEntry() {
  syncGoogleLoginEntry();
  const observer = new MutationObserver(syncGoogleLoginEntry);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
