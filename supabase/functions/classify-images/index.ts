import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_IMAGES_PER_REQUEST = 20;
const MAX_DATAURL_BYTES = 2_000_000; // ~2MB per image

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { images } = await req.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No se proporcionaron imágenes." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (images.length > MAX_IMAGES_PER_REQUEST) {
      return new Response(
        JSON.stringify({ error: `Máximo ${MAX_IMAGES_PER_REQUEST} imágenes por solicitud.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    for (const img of images) {
      if (!img || typeof img.dataUrl !== "string" || !img.dataUrl.startsWith("data:image/")) {
        return new Response(
          JSON.stringify({ error: "Formato de imagen inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (img.dataUrl.length > MAX_DATAURL_BYTES) {
        return new Response(
          JSON.stringify({ error: "Una de las imágenes es demasiado grande." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[classify-images] LOVABLE_API_KEY missing");
      return new Response(JSON.stringify({ error: "Servicio no disponible." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

4. **Safety moderation** - detect sensitive content:
   - "nudity": true if the image contains nude/partially nude people, exposed intimate body parts, sexual content, or underwear-only shots. false otherwise.
   - "minors": true if the image clearly shows the face(s) of one or more people who appear to be UNDER 18 years old (children, teenagers). false if no people, only adults, or faces not visible/identifiable.
   - "safety_reason": brief Spanish explanation when nudity OR minors is true (e.g. "Rostro de niño visible", "Persona sin camisa"). Empty string if both false.
   Be conservative: only flag when reasonably certain. Construction workers fully clothed = false. Adults working = false.

5. **Progress** - estimated overall completion percentage of the work shown, integer 1-100:
   - 1-60: work not started or just beginning (BEFORE)
   - 61-90: work in progress, partially done (PROCESS)
   - 91-100: work essentially complete (AFTER)
   The "stage" field MUST be consistent with the progress range.

Use visual cues:
- Deterioration, stains, cracks, peeling, raw/empty space → low progress (before)
- Tools, ladders, drop cloths, tape, partially painted/installed → mid progress (process)
- Clean lines, uniform color, installed hardware, staged furniture, no tools → high progress (after)

${hasExif ? "EXIF metadata is provided for chronological ordering. Earlier dates suggest 'before', latest dates suggest 'after'." : ""}

IMPORTANT - Filename hints: The filename may contain keywords indicating the stage in ANY language. Examples:
- before/antes/avant/vorher/prima → "before"
- process/proceso/durant/während/durante → "process"  
- after/después/despues/après/nachher/dopo → "after"
If the filename clearly indicates a stage, use that as a strong hint (but still verify with the image content).

Here are the images to classify:`
      }
    ];

    for (const img of images) {
      let metadata = `Image ID: ${img.id}`;
      if (img.name) metadata += ` | Filename: ${String(img.name).slice(0, 200)}`;
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
                        progress: { type: "integer", description: "Estimated work completion 1-100. 1-60=before, 61-90=process, 91-100=after.", minimum: 1, maximum: 100 },
                        nudity: { type: "boolean", description: "True if image contains nudity, partial nudity or sexual content" },
                        minors: { type: "boolean", description: "True if image clearly shows faces of people under 18 years old" },
                        safety_reason: { type: "string", description: "Brief Spanish reason when nudity or minors is true, empty otherwise" },
                        reason: { type: "string", description: "Brief reason for classification in Spanish" }
                      },
                      required: ["id", "stage", "scene", "confidence", "progress", "nudity", "minors", "safety_reason", "reason"],
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
      console.error("[classify-images] AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "Error del servicio de IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    console.error("[classify-images] could not parse AI response");
    return new Response(JSON.stringify({ error: "No se pudo procesar la respuesta de la IA." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[classify-images] internal error:", e);
    return new Response(
      JSON.stringify({ error: "Ocurrió un error interno. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
