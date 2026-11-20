/**
 * An update is offered, never swapped under a running payment. The worker
 * registers with `prompt`; this is the prompt. A till tab that reloads itself
 * mid-session can lose an unflushed write, so the choice stays with the person
 * holding the phone.
 */

import { useRegisterSW } from "virtual:pwa-register/react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <Banner
      status="info"
      title="A new version is ready"
      description="Reload when the till is idle. Nothing is swapped under a running payment."
      isDismissable
      dismissLabel="Later"
      onDismiss={() => setNeedRefresh(false)}
      collapsible={false}
      endContent={
        <Button
          label="Reload"
          variant="primary"
          onClick={() => void updateServiceWorker(true)}
        />
      }
    />
  );
}
