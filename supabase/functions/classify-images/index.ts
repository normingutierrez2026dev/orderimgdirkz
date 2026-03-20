import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { images } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasExif = images.some((img: any) => img.exif);

    const content: any[] = [
      {
        type: "text",
        text: `You are an expert construction and renovation image classifier. You analyze photos from construction, painting, remodeling, and renovation projects.

For each image, classify it into:
1. **Stage** - one of three categories:
   - "before": Damaged surfaces, old paint, empty/deteriorated areas, untouched spaces, debris, worn materials
   - "process": Tools visible, scaffolding, paint cans, workers present, construction materials, partial work done, protective covers, tape, equipment
   - "after": Clean finished surfaces, installed furniture/fixtures, fresh paint, polished floors, no tools or materials visible, completed work

2. **Scene type** - one of:
   - "interior_walls": Interior walls, murals, accent walls
   - "interior_ceiling": Ceilings, crown molding
   - "interior_floor": Flooring, laminate, tile, carpet
   - "exterior_roof": Roofing, shingles, gutters
   - "exterior_facade": Building facades, siding, exterior walls
   - "exterior_pavement": Driveways, walkways, patios
   - "other": Anything that doesn't fit above

3. **Confidence** - your confidence level from 0.0 to 1.0

Use visual cues:
- Deterioration, stains, cracks, peeling → before
- Tools, ladders, drop cloths, tape, partially painted → process  
- Clean lines, uniform color, installed hardware, staged furniture → after

${hasExif ? "EXIF metadata is provided for chronological ordering. Earlier dates suggest 'before', latest dates suggest 'after'." : ""}

Here are the images to classify:`
      }
    ];

    for (const img of images) {
      let metadata = `Image ID: ${img.id}`;
      if (img.exif) {
        if (img.exif.date) metadata += ` | Date: ${img.exif.date}`;
        if (img.exif.gps) metadata += ` | GPS: ${img.exif.gps}`;
      }
      content.push({ type: "text", text: metadata });
      content.push({
        type: "image_url",
        image_url: { url: img.dataUrl }
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_images",
              description: "Classify construction/renovation images into stages and scene types",
              parameters: {
                type: "object",
                properties: {
                  classifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        stage: { type: "string", enum: ["before", "process", "after"] },
                        scene: { type: "string", enum: ["interior_walls", "interior_ceiling", "interior_floor", "exterior_roof", "exterior_facade", "exterior_pavement", "other"] },
                        confidence: { type: "number", description: "Confidence 0.0-1.0" },
                        reason: { type: "string", description: "Brief reason for classification in Spanish" }
                      },
                      required: ["id", "stage", "scene", "confidence", "reason"],
                      additionalProperties: false
                    }
                  }
                },
                required: ["classifications"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "classify_images" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Límite de uso alcanzado, intenta en unos minutos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos agotados. Agrega fondos en Configuración > Workspace > Uso." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const content_text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content_text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return new Response(JSON.stringify({ classifications: parsed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Could not parse AI response");
  } catch (e) {
    console.error("classify-images error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Error desconocido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
