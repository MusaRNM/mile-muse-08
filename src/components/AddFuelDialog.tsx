import { useRef, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Camera, ImageUp, Loader2, ScanText, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { newId, saveFuel, isSafeImageDataUrl } from "@/lib/db";
import { parseReceipt } from "@/lib/receipt";
import type { FuelEntry } from "@/lib/types";

/** Downscale + compress an image file to a small JPEG data URL for storage. */
async function compressImage(file: File, maxDim = 1100, quality = 0.7): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function AddFuelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [image, setImage] = useState<string | undefined>();
  const [scanning, setScanning] = useState(false);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [station, setStation] = useState("");
  const [total, setTotal] = useState("");
  const [gallons, setGallons] = useState("");
  const [ppg, setPpg] = useState("");

  function reset() {
    setImage(undefined);
    setScanning(false);
    setDate(format(new Date(), "yyyy-MM-dd"));
    setStation("");
    setTotal("");
    setGallons("");
    setPpg("");
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setScanning(true);
    try {
      const compressed = await compressImage(file);
      setImage(compressed);
      const Tesseract = (await import("tesseract.js")).default;
      const { data } = await Tesseract.recognize(compressed, "eng");
      const parsed = parseReceipt(data.text);
      if (parsed.date) setDate(format(parsed.date, "yyyy-MM-dd"));
      if (parsed.station) setStation(parsed.station);
      if (parsed.totalPrice) setTotal(String(parsed.totalPrice));
      if (parsed.gallons) setGallons(String(parsed.gallons));
      if (parsed.pricePerGallon) setPpg(String(parsed.pricePerGallon));
      toast.success("Receipt scanned — please verify the details");
    } catch {
      toast.error("Couldn't scan the receipt. Enter details manually.");
    } finally {
      setScanning(false);
    }
  }

  // Keep the three price fields consistent as the user edits.
  function onTotal(v: string) {
    setTotal(v);
    const t = parseFloat(v);
    const g = parseFloat(gallons);
    if (t && g) setPpg((t / g).toFixed(3));
  }
  function onGallons(v: string) {
    setGallons(v);
    const t = parseFloat(total);
    const g = parseFloat(v);
    if (t && g) setPpg((t / g).toFixed(3));
  }
  function onPpg(v: string) {
    setPpg(v);
    const p = parseFloat(v);
    const t = parseFloat(total);
    if (p && t) setGallons((t / p).toFixed(3));
  }

  async function save() {
    const totalPrice = parseFloat(total);
    let gal = parseFloat(gallons);
    let pricePerGallon = parseFloat(ppg);
    if (!totalPrice || totalPrice <= 0) {
      toast.error("Enter the total price");
      return;
    }
    if (!gal && pricePerGallon) gal = totalPrice / pricePerGallon;
    if (!pricePerGallon && gal) pricePerGallon = totalPrice / gal;

    const entry: FuelEntry = {
      id: newId(),
      date: new Date(`${date}T12:00`).getTime(),
      station: station || undefined,
      totalPrice,
      gallons: gal || 0,
      pricePerGallon: pricePerGallon || 0,
      receiptImage: image,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveFuel(entry);
    toast.success("Fuel entry added");
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-sm overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add fuel</DialogTitle>
        </DialogHeader>

        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {image && isSafeImageDataUrl(image) ? (
          <div className="relative overflow-hidden rounded-xl border">
            <img src={image} alt="Receipt" className="max-h-48 w-full object-cover" loading="lazy" />
            <Button
              variant="secondary"
              size="icon"
              className="absolute right-2 top-2 size-7"
              onClick={() => setImage(undefined)}
            >
              <X className="size-4" />
            </Button>
            {scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 text-sm">
                <Loader2 className="mr-2 size-4 animate-spin" /> Scanning…
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-5"
              disabled={scanning}
              onClick={() => cameraRef.current?.click()}
            >
              {scanning ? <Loader2 className="size-6 animate-spin" /> : <Camera className="size-6 text-primary" />}
              <span className="text-xs font-medium">Take photo</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto flex-col gap-2 py-5"
              disabled={scanning}
              onClick={() => galleryRef.current?.click()}
            >
              <ImageUp className="size-6 text-primary" />
              <span className="text-xs font-medium">Upload</span>
            </Button>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ScanText className="size-3.5" /> Scan a receipt to auto-fill, or type the details.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-date">Date</Label>
              <Input id="f-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-station">Station</Label>
              <Input
                id="f-station"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="e.g. Shell"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-total">Total price ($)</Label>
            <Input
              id="f-total"
              type="number"
              inputMode="decimal"
              value={total}
              onChange={(e) => onTotal(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-gal">Gallons</Label>
              <Input
                id="f-gal"
                type="number"
                inputMode="decimal"
                value={gallons}
                onChange={(e) => onGallons(e.target.value)}
                placeholder="0.000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-ppg">$ / gallon</Label>
              <Input
                id="f-ppg"
                type="number"
                inputMode="decimal"
                value={ppg}
                onChange={(e) => onPpg(e.target.value)}
                placeholder="0.000"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={scanning}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
