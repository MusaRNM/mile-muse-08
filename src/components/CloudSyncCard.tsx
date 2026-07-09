import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Cloud, CloudOff, KeyRound, RefreshCw, LogOut, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useSync, attachOnlineSync } from "@/lib/sync";
import { useSettings } from "@/lib/settings";
import { format } from "date-fns";

/**
 * Cloud sync UI shown inside Settings. Everything is opt-in.
 *
 * Flow:
 *   1. Toggle "Cloud sync" on → prompt to sign in (link to /auth).
 *   2. Once signed in, prompt for a passphrase. First device generates the
 *      salt + key-check on the server; other devices verify against it.
 *   3. "Sync now" pushes/pulls encrypted rows. Nothing readable to server.
 */
export function CloudSyncCard() {
  const {
    userId,
    userEmail,
    unlocked,
    syncing,
    lastSyncAt,
    lastError,
    init,
    signOut,
    unlock,
    lock,
    sync,
    wipeCloud,
  } = useSync();
  const cloudSyncEnabled = useSettings((s) => s.cloudSyncEnabled);
  const updateSettings = useSettings((s) => s.update);
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void init();
    attachOnlineSync();
  }, [init]);

  // Auto-sync once when unlocked.
  useEffect(() => {
    if (unlocked && cloudSyncEnabled) void sync();
  }, [unlocked, cloudSyncEnabled, sync]);

  async function handleUnlock() {
    setBusy(true);
    const res = await unlock(passphrase);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error ?? "Could not unlock");
      return;
    }
    setPassphrase("");
    toast.success("Cloud sync unlocked");
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Cloud sync
      </h2>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 text-muted-foreground">
              {cloudSyncEnabled ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">Enable cloud sync</p>
              <p className="text-xs text-muted-foreground">
                End-to-end encrypted. Data is encrypted on this device before it leaves.
              </p>
            </div>
          </div>
          <Switch
            checked={cloudSyncEnabled}
            onCheckedChange={(v) => updateSettings({ cloudSyncEnabled: v })}
          />
        </div>

        {cloudSyncEnabled && (
          <div className="border-t px-4 py-4">
            {!userId ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted-foreground">Sign in to sync across devices.</p>
                <Button asChild size="sm">
                  <Link to="/auth">Sign in</Link>
                </Button>
              </div>
            ) : !unlocked ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{userEmail}</span>
                  <button className="underline" onClick={() => void signOut()}>Sign out</button>
                </div>
                <Label htmlFor="passphrase" className="text-sm">Encryption passphrase</Label>
                <p className="text-xs text-muted-foreground">
                  Choose a passphrase (min 8 chars). We <strong>cannot recover it</strong> — if you
                  forget it, cloud data becomes unreadable. Use the same passphrase on every device.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="passphrase"
                    type="password"
                    autoComplete="off"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
                    minLength={8}
                    maxLength={200}
                  />
                  <Button onClick={handleUnlock} disabled={busy || passphrase.length < 8}>
                    <KeyRound className="size-4" /> Unlock
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{userEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      {lastSyncAt
                        ? `Last synced ${format(lastSyncAt, "MMM d, HH:mm")}`
                        : "Not yet synced"}
                      {lastError ? ` · ${lastError}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" onClick={() => void sync()} disabled={syncing}>
                      <RefreshCw className={"size-4 " + (syncing ? "animate-spin" : "")} /> Sync now
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={lock}>
                    <KeyRound className="size-4" /> Lock
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void signOut()}>
                    <LogOut className="size-4" /> Sign out
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="size-4" /> Delete cloud data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete cloud data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This removes all synced trips, fuel entries and your encryption salt
                          from the server. Your local data on this device is not touched.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={async () => {
                            await wipeCloud();
                            toast.success("Cloud data deleted");
                          }}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
