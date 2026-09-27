import { useState } from "react";
import { COUNTRIES } from "@domain/countries.ts";
import { FOREIGN_ID_TYPES, recipientIssues, type Recipient } from "@domain/invoicing.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const names = new Intl.DisplayNames(["es"], { type: "region" });
const FOREIGN = COUNTRIES.map(([a2]) => a2)
  .filter((c) => c !== "ES")
  .map((c) => ({ code: c, name: names.of(c) ?? c }))
  .sort((a, b) => a.name.localeCompare(b.name, "es"));

/** Who a full invoice is for: Spanish tax id, or a foreign document. */
export function RecipientForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Recipient> | null;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (r: Recipient) => void;
  onCancel: () => void;
}) {
  const [foreign, setForeign] = useState(!!initial?.country && !initial?.nif);
  const [f, setF] = useState({
    name: initial?.name ?? "",
    nif: initial?.nif ?? "",
    country: initial?.country ?? "FR",
    id_type: (initial?.id_type ?? "02") as NonNullable<Recipient["id_type"]>,
    id_number: initial?.id_number ?? "",
    address: initial?.address ?? "",
  });
  const [tried, setTried] = useState(false);
  const recipient: Recipient = foreign
    ? {
        name: f.name.trim(),
        country: f.country,
        id_type: f.id_type,
        id_number: f.id_number.trim(),
        address: f.address.trim() || null,
      }
    : { name: f.name.trim(), nif: f.nif.trim().toUpperCase(), address: f.address.trim() || null };
  const issues = recipientIssues(recipient);

  return (
    <div className="space-y-3 rounded-md border border-info/40 bg-info/5 p-4 text-sm">
      <div className="flex gap-1">
        {[false, true].map((x) => (
          <Button
            key={String(x)}
            size="sm"
            variant={foreign === x ? "secondary" : "ghost"}
            onClick={() => setForeign(x)}
          >
            {x ? "Cliente extranjero" : "NIF español"}
          </Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor="rc-name">Nombre o razón social</Label>
        <Input
          id="rc-name"
          maxLength={120}
          value={f.name}
          onChange={(e) => setF({ ...f, name: e.target.value })}
        />
      </div>
      {foreign ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label>País</Label>
            <Select value={f.country} onValueChange={(v) => setF({ ...f, country: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FOREIGN.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Documento</Label>
            <Select
              value={f.id_type}
              onValueChange={(v) => setF({ ...f, id_type: v as typeof f.id_type })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FOREIGN_ID_TYPES).map(([v, l]) => (
                  <SelectItem key={v} value={v}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="rc-id">Número</Label>
            <Input
              id="rc-id"
              maxLength={20}
              value={f.id_number}
              onChange={(e) => setF({ ...f, id_number: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <Label htmlFor="rc-nif">NIF / CIF</Label>
          <Input
            id="rc-nif"
            maxLength={9}
            className="font-mono uppercase"
            value={f.nif}
            onChange={(e) => setF({ ...f, nif: e.target.value.replace(/[\s-]/g, "") })}
          />
        </div>
      )}
      <div className="space-y-1">
        <Label htmlFor="rc-addr">Dirección (opcional)</Label>
        <Input
          id="rc-addr"
          maxLength={200}
          value={f.address}
          onChange={(e) => setF({ ...f, address: e.target.value })}
        />
      </div>
      {tried && issues.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-destructive">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setTried(true);
            if (!issues.length) onSubmit(recipient);
          }}
        >
          {busy ? "Emitiendo…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
