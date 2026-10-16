// Persist only the consent choice. Coordinates stay in memory for this visit.
export function createLocationConsent({ navigator, readChoice, writeChoice, showPrompt, hidePrompt, onStart, onPosition, onFailure }) {
  let requestId = 0;
  let pending = false;

  function cancel() {
    requestId += 1;
    pending = false;
  }

  function request({ automatic = false } = {}) {
    if (pending) return;
    hidePrompt();
    if (!navigator.geolocation) {
      if (!automatic) onFailure({ code: 2 }, { automatic });
      return;
    }
    pending = true;
    const currentId = ++requestId;
    onStart({ automatic });
    const failure = (error) => {
      if (currentId !== requestId) return;
      pending = false;
      if (error?.code === 1) writeChoice("declined");
      onFailure(error, { automatic });
    };
    try {
      navigator.geolocation.getCurrentPosition((position) => {
        if (currentId !== requestId) return;
        const lat = position?.coords?.latitude;
        const lng = position?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          failure({ code: 2 });
          return;
        }
        pending = false;
        writeChoice("allowed");
        onPosition({ lat, lng }, { automatic });
      }, failure, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    } catch (error) {
      failure(error);
    }
  }

  function decline() {
    cancel();
    writeChoice("declined");
    hidePrompt();
  }

  async function start() {
    const initialId = requestId;
    if (!navigator.geolocation || readChoice() === "declined") return;
    let permission;
    try {
      permission = await navigator.permissions?.query({ name: "geolocation" });
    } catch {
      // Some browsers expose geolocation but do not support this permission query.
    }
    if (initialId !== requestId || pending) return;
    if (permission?.state === "denied") return;
    if (permission?.state === "granted" || (!permission && readChoice() === "allowed")) {
      request({ automatic: true });
    } else {
      showPrompt();
    }
  }

  return { start, request, decline, cancel };
}
