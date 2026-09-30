import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
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
import { useStaffHotelModules } from "@/lib/features";
import { useRoles } from "@/lib/roles";
import {
  REDSYS_BANKS,
  useDisablePaymentAccount,
  usePaymentAccount,
  useSavePaymentAccount,
  type Provider,
} from "@/lib/payments-config";
import { AdminOnly } from "@/components/settings/AdminOnly";
import { t } from "@/lib/i18n";

export const Route = createFileRoute("/_app/payments")({
  component: () => (
    <AdminOnly>
      <PaymentsPage />
    </AdminOnly>
  ),
});

function PaymentsPage() {
  const { isAdmin, loading } = useRoles();
  const { data: hotels } = useStaffHotelModules();
  const [hotel, setHotel] = useState<string | null>(null);
  useEffect(() => {
    if (!hotel && hotels?.length) setHotel(hotels[0].id);
  }, [hotel, hotels]);
  const { data: account } = usePaymentAccount(hotel);
  const save = useSavePaymentAccount();
  const disable = useDisablePaymentAccount();

  const [provider, setProvider] = useState<Provider>("redsys");
  const [testMode, setTestMode] = useState(true);
  const [bank, setBank] = useState("CaixaBank");
  const [merchant, setMerchant] = useState("");
  const [terminal, setTerminal] = useState("1");
  const [secret, setSecret] = useState("");
  const [publishable, setPublishable] = useState("");
  const [webhook, setWebhook] = useState("");

  // Fill the form from the saved account (never the secret).
  useEffect(() => {
    if (!account?.configured) return;
    setProvider(account.provider ?? "redsys");
    setTestMode(account.test_mode ?? true);
    const cfg = account.public_config ?? {};
    setBank(cfg.bank_name ?? "CaixaBank");
    setMerchant(cfg.merchant_code ?? "");
    setTerminal(cfg.terminal ?? "1");
    setPublishable(cfg.publishable_key ?? "");
    setSecret("");
    setWebhook("");
  }, [account]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/today" />;

  const submit = () => {
    const common = { tenant: hotel!, provider, test_mode: testMode };
    if (provider === "redsys") {
      save.mutate(
        {
          ...common,
          config: {
            merchant_code: merchant.trim(),
            terminal: terminal.trim() || "1",
            bank_name: bank,
          },
          secret: secret.trim() || undefined,
        },
        {
          onSuccess: () => toast.success(t("TPV guardado")),
          onError: (e: Error) => toast.error(t(e.message)),
        },
      );
    } else {
      save.mutate(
        {
          ...common,
          config: { publishable_key: publishable.trim(), bank_name: "Stripe" },
          secret: secret.trim() || undefined,
          secret2: webhook.trim() || undefined,
        },
        {
          onSuccess: () => toast.success(t("Stripe guardado")),
          onError: (e: Error) => toast.error(t(e.message)),
        },
      );
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CreditCard className="h-5 w-5 text-info" /> {t("Cobros y TPV")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "Cómo cobras a tus huéspedes. Usa el TPV de tu banco (Redsys) o Stripe. El dinero va a tu cuenta; nosotros no lo tocamos.",
            )}
          </p>
        </div>
        {hotels && hotels.length > 1 && (
          <Select value={hotel ?? undefined} onValueChange={setHotel}>
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

      {account?.configured && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <span>
            {t("Cobrando con")}{" "}
            <strong>{account.provider === "stripe" ? t("Stripe") : t("Redsys")}</strong>
            {account.public_config?.bank_name && account.provider === "redsys"
              ? ` · ${account.public_config.bank_name}`
              : ""}{" "}
            · {account.test_mode ? t("modo de pruebas") : t("producción")}
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Pasarela de pago")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("Proveedor")}</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="redsys">{t("Redsys (TPV de tu banco)")}</SelectItem>
                  <SelectItem value="stripe">{t("Stripe")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("Entorno")}</Label>
              <Select
                value={testMode ? "test" : "prod"}
                onValueChange={(v) => setTestMode(v === "test")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">{t("Pruebas")}</SelectItem>
                  <SelectItem value="prod">{t("Producción")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {provider === "redsys" ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("Tu banco")}</Label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REDSYS_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "Casi todos los bancos españoles usan Redsys. Las credenciales te las da tu banco al contratar el TPV virtual.",
                  )}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("Número de comercio (FUC)")}</Label>
                  <Input
                    inputMode="numeric"
                    placeholder={t("9 dígitos")}
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Terminal")}</Label>
                  <Input value={terminal} onChange={(e) => setTerminal(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("Clave secreta (Base64)")}</Label>
                <Input
                  type="password"
                  autoComplete="off"
                  placeholder={
                    account?.has_secret
                      ? t("Guardada · escribe para cambiarla")
                      : t("La clave que da el banco")
                  }
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t("Clave publicable (pk_…)")}</Label>
                <Input value={publishable} onChange={(e) => setPublishable(e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("Clave secreta (sk_…)")}</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      account?.has_secret ? t("Guardada · escribe para cambiarla") : t("sk_…")
                    }
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("Secreto del webhook (whsec_…)")}</Label>
                  <Input
                    type="password"
                    autoComplete="off"
                    placeholder={
                      account?.has_secret ? t("Guardado · escribe para cambiarlo") : t("whsec_…")
                    }
                    value={webhook}
                    onChange={(e) => setWebhook(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />

            {t(
              "La clave se guarda cifrada y solo la usa el servidor para cobrar. No se muestra nunca, ni siquiera aquí.",
            )}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}

              {t("Guardar")}
            </Button>
            {account?.configured && (
              <Button
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() =>
                  disable.mutate(hotel!, {
                    onSuccess: () => toast.success(t("Cobros desactivados")),
                    onError: (e: Error) => toast.error(t(e.message)),
                  })
                }
              >
                {t("Desactivar cobros")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
