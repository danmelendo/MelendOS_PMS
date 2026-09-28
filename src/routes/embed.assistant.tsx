import { createFileRoute } from "@tanstack/react-router";
import { AgentChat } from "@/components/AgentChat";
import { useBrand } from "@/lib/brand";
import { useFeatures } from "@/lib/features";
import { postToHost } from "@/lib/embed";

// The booking assistant inside the widget's panel on the hotel's own website.
export const Route = createFileRoute("/embed/assistant")({
  component: EmbedAssistant,
});

function EmbedAssistant() {
  const { ready } = useBrand();
  const features = useFeatures();
  if (!ready || !features.ready) return null;
  if (!features.ai_agent)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center text-sm text-neutral-600">
        El asistente de reservas no está disponible en este hotel.
        <button
          type="button"
          className="underline"
          onClick={() => postToHost({ type: "melendos:close" })}
        >
          Cerrar
        </button>
      </div>
    );
  return <AgentChat embedded />;
}
