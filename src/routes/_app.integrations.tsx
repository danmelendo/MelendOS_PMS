import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useHotelsWith } from "@/lib/features";
import { ModuleOff } from "@/components/ModuleOff";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Check, Copy, KeyRound, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoles } from "@/lib/roles";
import {
  MCP_URL,
  mcpSnippets,
  tokenStatus,
  useCreateMcpToken,
  useMcpTokens,
  useRevokeMcpToken,
  type McpToken,
  type NewMcpToken,
} from "@/lib/mcp";
import { PlatformOnly } from "@/components/settings/AdminOnly";

export const Route = createFileRoute("/_app/integrations")({
  component: () => (
    <PlatformOnly>
      <IntegrationsPage />
    </PlatformOnly>
  ),
});

const READ_TOOLS = "disponibilidad, precios, detalles de habitación y consulta de reservas";
const WRITE_TOOLS = "crear reservas, enlaces de pago y solicitudes de cancelación";
const DAYS = { "30": "30 días", "90": "90 días", "365": "1 año" } as const;

const when = (iso: string | null) =>
  iso ? format(new Date(iso), "d MMM yyyy, HH:mm", { locale: es }) : "—";

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar: selecciónalo a mano");
    }
  };
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          <span className="ml-1 text-xs">{copied ? "Copiado" : "Copiar"}</span>
        </Button>
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre rounded-md bg-muted px-3 py-2 font-mono text-xs">
        {text}
      </pre>
    </div>
  );
}

// Shown once, right after creating a token: only its hash is stored.
function NewTokenCard({ created, onDone }: { created: NewMcpToken; onDone: () => void }) {
  const s = mcpSnippets(created.token);
  return (
    <Card className="border-gold/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4 text-gold" /> Copia el token ahora
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          No se volverá a mostrar: solo guardamos una huella para comprobarlo. Si lo pierdes,
          revócalo y crea otro.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <CopyBlock label="Token" text={created.token} />
        <Tabs defaultValue="code">
          <TabsList>
            <TabsTrigger value="code">Claude Code</TabsTrigger>
            <TabsTrigger value="desktop">Claude Desktop</TabsTrigger>
          </TabsList>
          <TabsContent value="code" className="pt-2">
            <CopyBlock label="Ejecuta en una terminal" text={s.claudeCode} />
          </TabsContent>
          <TabsContent value="desktop" className="space-y-2 pt-2">
            <CopyBlock label="claude_desktop_config.json" text={s.claudeDesktop} />
            <p className="text-xs text-muted-foreground">
              Necesita Node.js. Reinicia Claude Desktop después de guardar el archivo.
            </p>
          </TabsContent>
        </Tabs>
        <div className="flex justify-end">
          <Button onClick={onDone}>Ya lo he guardado</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TokenRow({
  token,
  onRevoke,
  revoking,
}: {
  token: McpToken;
  onRevoke: () => void;
  revoking: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const status = tokenStatus(token);
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{token.name}</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{token.token_prefix}…</code>
            {token.scopes.includes("write") ? (
              <Badge className="bg-gold text-gold-foreground hover:bg-gold">
                Lectura y escritura
              </Badge>
            ) : (
              <Badge variant="secondary">Solo lectura</Badge>
            )}
            {status !== "active" && (
              <Badge variant="outline" className="text-muted-foreground">
                {status === "revoked" ? "Revocado" : "Caducado"}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Creado {when(token.created_at)} ·{" "}
            {status === "revoked"
              ? `revocado ${when(token.revoked_at)}`
              : `caduca ${when(token.expires_at)}`}{" "}
            · último uso {when(token.last_used_at)} · {token.calls_30d} llamadas en 30 días
          </p>
        </div>
        {status === "active" && !confirming && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Revocar
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <span className="text-sm">
            Las integraciones que lo usen dejarán de funcionar al momento.
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button size="sm" variant="destructive" disabled={revoking} onClick={onRevoke}>
              Revocar acceso
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

// Admins give AI assistants and other tools access to the hotel's booking
// tools through MCP, with a token per integration.
function IntegrationsPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useHotelsWith("mcp");
  const [hotel, setHotel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [write, setWrite] = useState(false);
  const [days, setDays] = useState<keyof typeof DAYS>("90");
  const [created, setCreated] = useState<NewMcpToken | null>(null);

  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);

  const { data: tokens, error } = useMcpTokens(hotel);
  const create = useCreateMcpToken(hotel);
  const revoke = useRevokeMcpToken(hotel);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { name: name.trim(), scopes: write ? ["read", "write"] : ["read"], days: Number(days) },
      {
        onSuccess: (t) => {
          setCreated(t);
          setName("");
          setWrite(false);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  // Straight to the URL without the module in any of the staff's hotels.
  if (hotels && hotels.length === 0) return <ModuleOff feature="mcp" hotel="tus hoteles" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integraciones IA</h1>
          <p className="text-sm text-muted-foreground">
            Conecta asistentes como Claude a las herramientas de reservas del hotel mediante MCP.
          </p>
        </div>
        {hotels && hotels.length > 1 && (
          <Select
            value={hotel ?? undefined}
            onValueChange={(v) => {
              setHotel(v);
              setCreated(null);
            }}
          >
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

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <PlugZap className="h-4 w-4 text-info" /> Servidor MCP del hotel
            </p>
            <CopyBlock label="URL (HTTP)" text={MCP_URL} />
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <ShieldCheck className="h-4 w-4 text-info" /> Qué puede hacer cada acceso
            </p>
            <p>
              <span className="font-medium text-foreground">Solo lectura:</span> {READ_TOOLS}.
            </p>
            <p>
              <span className="font-medium text-foreground">Lectura y escritura:</span> además,{" "}
              {WRITE_TOOLS}. Nada es irreversible: las reservas online quedan pendientes de pago y
              las cancelaciones las decide recepción.
            </p>
            <p>Cada acceso ve solo este hotel. Máximo 60 llamadas por minuto.</p>
          </div>
        </CardContent>
      </Card>

      {created ? (
        <NewTokenCard created={created} onDone={() => setCreated(null)} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nuevo acceso</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="mcp-name">Nombre</Label>
                <Input
                  id="mcp-name"
                  value={name}
                  maxLength={80}
                  placeholder="Claude de dirección"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Permisos</Label>
                <Select
                  value={write ? "write" : "read"}
                  onValueChange={(v) => setWrite(v === "write")}
                >
                  <SelectTrigger className="sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Solo lectura</SelectItem>
                    <SelectItem value="write">Lectura y escritura</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Caduca en</Label>
                <Select value={days} onValueChange={(v) => setDays(v as keyof typeof DAYS)}>
                  <SelectTrigger className="sm:w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DAYS).map(([v, label]) => (
                      <SelectItem key={v} value={v}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  className="w-full sm:w-auto"
                  disabled={!hotel || !name.trim() || create.isPending}
                >
                  Crear token
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-base">Accesos</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="py-4 text-sm text-destructive">{error.message}</p>
          ) : !tokens?.length ? (
            <p className="py-4 text-sm text-muted-foreground">
              Todavía no hay accesos. Crea uno para conectar un asistente.
            </p>
          ) : (
            <ul className="divide-y">
              {tokens.map((t) => (
                <TokenRow
                  key={t.id}
                  token={t}
                  revoking={revoke.isPending}
                  onRevoke={() =>
                    revoke.mutate(t.id, {
                      onSuccess: () => toast.success("Acceso revocado"),
                      onError: (err) => toast.error(err.message),
                    })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
