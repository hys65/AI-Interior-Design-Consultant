import { NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";

export const runtime = "nodejs";

const UPDATE_DESIGN_TOOL = {
  name: "updateDesign",
  description:
    "Update the room design based on the user's request. Use this when the user asks to change the image, like 'make the rug blue' or 'add a retro filter'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description:
          "The prompt to use for the image generation, e.g., 'Change the rug to blue' or 'Add a retro filter'.",
      },
    },
    required: ["prompt"],
  },
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    if (body.action === "generate-image") {
      const prompt = body.prompt ?? "hello";
      const image = body.image;

      if (!image?.data || !image?.mimeType) {
        return NextResponse.json({ error: "Missing image data" }, { status: 400 });
      }

      const resp = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: image.data,
                mimeType: image.mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      for (const part of resp.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData?.data) {
          return NextResponse.json({
            image: {
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || "image/png",
            },
          });
        }
      }

      return NextResponse.json({ error: "No image generated." }, { status: 500 });
    }

    if (body.action === "chat") {
      const currentStyle = body.currentStyle ?? "None";
      const userText = body.userText ?? "";

      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction:
            "You are an expert AI interior design consultant. The user has uploaded a photo of their room and generated a new design. Answer their questions, provide advice, and if they ask for specific items, provide shoppable links (you can make up realistic URLs for the sake of this demo). If the user asks to change the design visually (e.g., 'make the rug blue', 'add a retro filter'), you MUST use the `updateDesign` tool to trigger a new image generation with their request.",
          tools: [{ functionDeclarations: [UPDATE_DESIGN_TOOL] }],
        },
      });

      const contextMessage = `Current style: ${currentStyle}. User message: ${userText}`;
      const resp = await chat.sendMessage({ message: contextMessage });

      return NextResponse.json({
        text: resp.text ?? "",
        functionCalls: resp.functionCalls ?? [],
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
