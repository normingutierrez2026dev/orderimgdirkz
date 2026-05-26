import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_HISTORY = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message : "";
    const imageContext = typeof body?.imageContext === "string" ? body.imageContext : "";
    const history = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return new Response(JSON.stringify({ error: "Mensaje vacío." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeHistory = history
      .slice(-MAX_HISTORY)
      .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
      .map((m: any) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: String(m.content),
      }));

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[chat] LOVABLE_API_KEY missing");
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const systemPrompt = `You are an expert assistant for organizing images from construction, painting, and remodeling projects.
You help users understand the classification of their images, suggest improvements in organization, and answer questions about the project status.

CRITICAL: Always detect the language the user writes in and respond in that SAME language. If they write in English, respond in English. If they write in Spanish, respond in Spanish. If they write in French, respond in French. And so on for any language.

Current classified images context:
${imageContext || "No classified images yet."}

Be concise but informative. If asked about the images, use the provided context.
If asked to analyze or reorganize images, give recommendations based on the context.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...safeHistory,
          { role: "user", content: message },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de uso alcanzado, intenta en unos minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("[chat] AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "Error del servicio de IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || "No pude generar una respuesta.";

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[chat] internal error:", e);
    return new Response(
      JSON.stringify({ error: "Ocurrió un error interno. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
