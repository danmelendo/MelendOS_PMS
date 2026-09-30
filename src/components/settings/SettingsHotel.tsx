import { useEffect, useState, type ReactNode } from "react";
import { Settings } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStaffHotelModules } from "@/lib/features";
import { t } from "@/lib/i18n";

/** The hotel a settings page edits: the first one, or the one picked when there are several. */
export function useSettingsHotel() {
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  return { hotels: hotels ?? [], hotel, setHotel };
}

/** Header of a page under «Configuración», with the hotel picker when there are several. */
export function SettingsHeader({
  title,
  description,
  hotels,
  hotel,
  onHotel,
}: {
  title: string;
  description: ReactNode;
  hotels: { id: string; name: string }[];
  hotel: string | null;
  onHotel: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Settings className="h-3.5 w-3.5" /> {t("Configuración")}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {hotels.length > 1 && (
        <Select value={hotel ?? undefined} onValueChange={onHotel}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {hotels.map((h) => (
              <SelectItem key={h.id} value={h.id}>
                {h.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
