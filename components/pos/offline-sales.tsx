"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { completeSale } from "@/actions/pos";
import {
  listQueuedSales,
  markQueuedAttempt,
  markQueuedProblem,
  removeQueuedSale,
  type QueuedSale,
} from "@/lib/offline/sale-queue";
import { registerTillWorker, type OfflineReadiness } from "@/lib/offline/service-worker";

/**
 * Sales waiting to reach the server, and the thing that sends them.
 *
 * Replay is deliberately **in order and one at a time**: the sales were rung up in an order, and
 * sending them together would make the document numbers meaningless and could empty a shelf in a
 * sequence nobody chose.
 *
 * A refusal and an outage are not the same answer. A refusal — the stock went while the till was
 * offline — is kept and shown to a person, because retrying forever would never help. A failure
 * to reach the server at all is left alone to try again.
 */
export function OfflineSales({ onSynced }: { onSynced?: () => void }) {
  const router = useRouter();
  const [queued, setQueued] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);
  /**
   * Whether this till can be *reopened* with no connection, which is a different promise from
   * being able to keep selling through one. The service worker is what provides it.
   */
  const [readiness, setReadiness] = useState<OfflineReadiness>("registering");

  /**
   * Connection status as what it is: something outside React that changes on its own.
   * `useSyncExternalStore` subscribes to it without an effect that writes state on mount — and it
   * answers "online" during server rendering, so the markup matches on hydration.
   */
  const online = useSyncExternalStore(
    (notify) => {
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  const refresh = useCallback(async () => {
    try {
      setQueued(await listQueuedSales());
    } catch {
      // A browser that will not give us IndexedDB simply has no queue to show.
    }
  }, []);

  const sync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    // Read the queue *before* showing a spinner: nothing to send should look like nothing happening.
    const pending = (await listQueuedSales()).filter((sale) => !sale.problem);
    if (pending.length === 0) return;

    setSyncing(true);
    try {
      let sent = 0;
      for (const sale of pending) {
        let result;
        try {
          result = await completeSale({ ...sale.input, clientReference: sale.reference });
        } catch {
          // Could not reach the server: still offline, or it went away mid-send. Try again later.
          await markQueuedAttempt(sale.reference);
          break;
        }
        if (result.success) {
          await removeQueuedSale(sale.reference);
          sent++;
        } else {
          // The server understood and said no. Retrying will not change its mind.
          await markQueuedProblem(sale.reference, result.error);
        }
      }
      await refresh();
      if (sent > 0) {
        toast.success(`${sent} offline ${sent === 1 ? "sale" : "sales"} sent to the server`);
        onSynced?.();
        router.refresh();
      }
    } finally {
      setSyncing(false);
    }
  }, [syncing, refresh, router, onSynced]);

  useEffect(() => {
    let alive = true;
    // Installed from the till, because the till is the only screen it keeps.
    registerTillWorker().then(
      (state) => {
        if (alive) setReadiness(state);
      },
      () => {
        if (alive) setReadiness("unsupported");
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    // Reading the queue is a promise, so the state only ever lands after this effect has returned.
    const load = () => {
      listQueuedSales()
        .then((rows) => {
          if (alive) setQueued(rows);
        })
        .catch(() => {
          // A browser that will not give us IndexedDB simply has no queue to show.
        });
    };
    load();
    // The queue also changes from the till itself, so listen for its own event.
    window.addEventListener("bighawk:sale-queued", load);
    return () => {
      alive = false;
      window.removeEventListener("bighawk:sale-queued", load);
    };
  }, []);

  /**
   * Send whenever there is a connection — on mount, and again the moment one comes back.
   * Driven by `online` rather than by a listener of its own, so there is one path, not two.
   */
  useEffect(() => {
    if (!online) return;
    // Deferred to a microtask: `sync` must not be able to set state while the effect is running.
    void Promise.resolve().then(() => sync());
  }, [online, sync]);

  const waiting = queued.filter((sale) => !sale.problem);
  const refused = queued.filter((sale) => sale.problem);
  if (online && waiting.length === 0 && refused.length === 0) return null;

  return (
    <div className="space-y-2">
      {!online ? (
        <Alert>
          <CloudOff />
          <AlertDescription>
            No connection. You can keep selling — each sale is held here and sent to the server by itself when the connection returns. Receipts printed
            now are provisional.{" "}
            {readiness === "ready"
              ? "This page will also reopen if the browser is closed or refreshed."
              : readiness === "unsupported"
                ? "Do not close or refresh this page: this browser cannot reopen it without a connection."
                : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {waiting.length > 0 ? (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {waiting.length} {waiting.length === 1 ? "sale is" : "sales are"} waiting to be sent.
            </span>
            {online ? (
              <Button type="button" size="sm" variant="outline" onClick={() => void sync()} disabled={syncing}>
                <RefreshCw className={syncing ? "animate-spin" : undefined} />
                {syncing ? "Sending…" : "Send now"}
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {refused.map((sale) => (
        <Alert key={sale.reference} variant="destructive">
          <TriangleAlert />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              A sale from {new Date(sale.ringupAt).toLocaleTimeString()} could not be recorded: {sale.problem} Ring it up again if it still applies.
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await removeQueuedSale(sale.reference);
                await refresh();
              }}
            >
              Discard it
            </Button>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
