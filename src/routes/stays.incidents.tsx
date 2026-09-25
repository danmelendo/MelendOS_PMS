import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus, X, Clock, CheckCircle2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { pms } from "@/integrations/pms";
import { useMember } from "@/lib/member-session";
import { useBrand } from "@/lib/brand";
import {
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_STATUS_CLASSES,
  formatDateShort,
} from "@/lib/stays";
import type { Incident, IncidentCategory } from "@/integrations/pms";

export const Route = createFileRoute("/stays/incidents")({
  component: IncidentsScreen,
});

const CATEGORIES = Object.keys(INCIDENT_CATEGORY_LABELS) as IncidentCategory[];

function IncidentsScreen() {
  const { memberId, member } = useMember();
  const { brand } = useBrand();
  const [open, setOpen] = useState(false);

  const { data: incidents, isLoading } = useQuery({
    queryKey: ["pms", "incidents", memberId],
    queryFn: () => pms.listIncidents(memberId),
  });

  const list = incidents ?? [];

  return (
    <div className="px-5 pt-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Wrench className="h-6 w-6 text-[var(--brand)]" /> Peticiones
        </h1>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white active:scale-95"
        >
          <Plus className="h-4 w-4" /> Nueva
        </button>
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        Reporta una avería y sigue su estado en tiempo real.
      </p>

      {isLoading && <p className="py-10 text-center text-sm text-neutral-400">Cargando…</p>}

      <div className="space-y-3">
        {list.map((inc) => (
          <IncidentCard key={inc.id} incident={inc} />
        ))}
      </div>

      {!isLoading && list.length === 0 && (
        <div className=" bg-white p-8 text-center shadow-sm ring-1 ring-neutral-100">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
          <p className="mt-2 text-sm text-neutral-500">No tienes peticiones abiertas.</p>
        </div>
      )}

      {open && <NewIncidentSheet onClose={() => setOpen(false)} hotelName={brand.name} />}
    </div>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className=" bg-white p-4 shadow-sm ring-1 ring-neutral-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={` border px-2 py-0.5 text-[11px] font-medium ${INCIDENT_STATUS_CLASSES[incident.status]}`}
            >
              {INCIDENT_STATUS_LABELS[incident.status]}
            </span>
            <span className="text-[11px] text-neutral-400">
              {INCIDENT_CATEGORY_LABELS[incident.category]}
            </span>
          </div>
          <h3 className="mt-1.5 font-semibold text-neutral-900">{incident.title}</h3>
          {incident.propertyName && (
            <p className="flex items-center gap-1 text-xs text-neutral-500">
              <MapPin className="h-3 w-3" /> {incident.propertyName}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-neutral-400">
          {formatDateShort(incident.createdAt.slice(0, 10))}
        </span>
      </div>

      <p className="mt-2 text-sm text-neutral-600">{incident.description}</p>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-xs font-medium text-[var(--brand)]"
      >
        {expanded ? "Ocultar seguimiento" : `Ver seguimiento (${incident.updates.length})`}
      </button>

      {expanded && (
        <ol className="mt-3 space-y-3 border-l border-neutral-200 pl-4">
          {incident.updates.map((u, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--brand)]">
                <Clock className="h-2 w-2 text-white" />
              </span>
              <p className="text-[11px] font-medium text-neutral-500">
                {INCIDENT_STATUS_LABELS[u.status]} · {formatDateShort(u.at.slice(0, 10))}
              </p>
              <p className="text-sm text-neutral-700">{u.note}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function NewIncidentSheet({
  onClose,
  hotelName,
}: {
  onClose: () => void;
  hotelName: string | null;
}) {
  const { memberId } = useMember();
  const qc = useQueryClient();
  const [category, setCategory] = useState<IncidentCategory>("housekeeping");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () =>
      pms.createIncident({ memberId, propertyName: hotelName, category, title, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms", "incidents"] });
      toast.success("Petición enviada", {
        description: "Recepción la gestionará en breve.",
      });
      onClose();
    },
  });

  const canSubmit = title.trim().length > 2 && description.trim().length > 4;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nueva petición</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded p-1 text-neutral-400 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Categoría
          </span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as IncidentCategory)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {INCIDENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Título
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ej. Almohada extra y toallas"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
            Descripción
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Cuéntanos qué ocurre…"
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
          />
        </label>

        <button
          onClick={() => create.mutate()}
          disabled={!canSubmit || create.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] py-3 font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Enviar petición
        </button>
      </div>
    </div>
  );
}
