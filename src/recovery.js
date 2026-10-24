// Never resume an interrupted canary/promotion as a verified deployment.
export function recover(store) {
  let changed = false;
  const s = store.state;
  if (s.canary) {
    const v = s.versions.find((v) => v.manifest.id === s.canary);
    if (v) v.status = "withheld";
    store.event("recovery.canary-withheld", {
      version: s.canary,
      reason: "Process interrupted before independent gate completed",
    });
    s.canary = null;
    changed = true;
  }
  if (s.active) {
    const v = s.versions.find((v) => v.manifest.id === s.active);
    if (!v || v.status !== "verified") {
      const previous =
        s.lastGood && s.lastGood !== s.active ? s.lastGood : null;
      store.event("deployment.rolled-back", {
        from: s.active,
        to: previous,
        reason: "Startup refuses unverified persisted promotion",
      });
      if (v) v.status = "rolled-back";
      s.active = previous;
      changed = true;
    }
  }
  if (changed) store.save();
  return changed;
}
