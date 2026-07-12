import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Cloud, CloudOff, LogOut, RefreshCw, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { connectDrive, disconnectDrive, downloadBackup, getDriveState, isConfigured, uploadBackup } from "@/lib/drive";
import { exportBackup, importBackup, validateBackup } from "@/lib/db";
import { format } from "date-fns";

/**
 * Optional Google Drive backup. The user signs in with their own Google
 * account; MileTrack only ever sees a single file it created in their Drive
 * (drive.file scope). Nothing is stored on our servers.
 */
export function DriveBackupCard() {
  const [state, setState] = useState(getDriveState());
  const [busy, setBusy] = useState<"connect" | "backup" | "restore" | null>(null);
  const configured = isConfigured();

  useEffect(() => {
    setState(getDriveState());
  }, []);

  async function handleConnect() {
    setBusy("connect");
    try {
      const email = await connectDrive();
      setState(getDriveState());
      if (email) toast.success(`Connected to ${email}`);
      else toast.success("Connected to Google Drive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleBackup() {
    setBusy("backup");
    try {
      const data = await exportBackup();
      await uploadBackup(JSON.stringify(data));
      setState(getDriveState());
      toast.success("Backup uploaded to your Drive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRestore() {
    setBusy("restore");
    try {
      const raw = await downloadBackup();
      if (!raw) {
        toast.error("No backup found in your Drive yet");
        return;
      }
      const parsed = JSON.parse(raw);
      const clean = validateBackup(parsed);
      await importBackup(clean, true);
      toast.success("Backup restored from Drive");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    await disconnectDrive();
    setState(getDriveState());
    toast.success("Disconnected from Google Drive");
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Google Drive backup
      </h2>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-start gap-3 px-4 py-3.5">
          <span className="mt-0.5 text-muted-foreground">
            {state.email ? <Cloud className="size-4" /> : <CloudOff className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Store backups in your own Drive</p>
            <p className="text-xs text-muted-foreground">
              Optional. Uses your Google account — MileTrack only sees the single backup file it creates.
            </p>
          </div>
        </div>

        {!configured ? (
          <div className="border-t px-4 py-4 text-xs text-muted-foreground">
            Google Drive backup isn't configured yet. Add a Google OAuth Client ID as
            <code className="mx-1 rounded bg-muted px-1 py-0.5">VITE_GOOGLE_DRIVE_CLIENT_ID</code>
            to enable it.
          </div>
        ) : !state.email ? (
          <div className="border-t px-4 py-4">
            <Button size="sm" onClick={handleConnect} disabled={busy !== null}>
              {busy === "connect" ? <RefreshCw className="size-4 animate-spin" /> : <Cloud className="size-4" />}
              Connect Google Drive
            </Button>
          </div>
        ) : (
          <div className="space-y-3 border-t px-4 py-4">
            <div className="text-sm">
              <p className="font-medium">{state.email}</p>
              <p className="text-xs text-muted-foreground">
                {state.lastBackupAt
                  ? `Last backup ${format(state.lastBackupAt, "MMM d, HH:mm")}`
                  : "No backup uploaded yet"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={handleBackup} disabled={busy !== null}>
                {busy === "backup" ? <RefreshCw className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Back up now
              </Button>
              <Button variant="outline" size="sm" onClick={handleRestore} disabled={busy !== null}>
                {busy === "restore" ? <RefreshCw className="size-4 animate-spin" /> : <Download className="size-4" />}
                Restore
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={busy !== null}>
                    <LogOut className="size-4" /> Disconnect
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect Google Drive?</AlertDialogTitle>
                    <AlertDialogDescription>
                      MileTrack will forget your Google account on this device. Your backup file
                      stays in your Drive — delete it there if you want it gone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisconnect}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
