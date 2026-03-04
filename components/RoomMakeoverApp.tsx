'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, GenerateContentResponse } from '@google/genai';
import { UploadCloud, Download, Sparkles, MessageSquare, Image as ImageIcon, ArrowRight, Loader2, Send, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

const STYLES = [
  { id: 'mid-century', name: 'Mid-Century Modern', image: 'https://picsum.photos/seed/midcentury/400/300' },
  { id: 'scandinavian', name: 'Scandinavian', image: 'https://picsum.photos/seed/scandinavian/400/300' },
  { id: 'industrial', name: 'Industrial', image: 'https://picsum.photos/seed/industrial/400/300' },
  { id: 'bohemian', name: 'Bohemian', image: 'https://picsum.photos/seed/bohemian/400/300' },
  { id: 'minimalist', name: 'Minimalist', image: 'https://picsum.photos/seed/minimalist/400/300' },
  { id: 'coastal', name: 'Coastal', image: 'https://picsum.photos/seed/coastal/400/300' },
];

type ImageData = {
  data: string; // base64
  mimeType: string;
  url: string;
};

type ChatMessage = {
  role: 'user' | 'model';
  text: string;
};

export default function RoomMakeoverApp() {
  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [generatedImage, setGeneratedImage] = useState<ImageData | null>(null);
  const [currentStyle, setCurrentStyle] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY as string });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      const base64Data = result.split(',')[1];
      setOriginalImage({
        data: base64Data,
        mimeType: file.type,
        url: result,
      });
      setGeneratedImage(null);
      setCurrentStyle('');
      setChatHistory([{
        role: 'model',
        text: 'Great! I see your room. Select a style above to get started, or tell me what you want to do.'
      }]);
    };
    reader.readAsDataURL(file);
  };

  const generateDesign = async (styleName: string, customPrompt?: string, baseImage?: ImageData) => {
    if (!originalImage) return;
    
    setIsGenerating(true);
    setGenerationStatus(`Generating ${styleName} design...`);
    setCurrentStyle(styleName);

    try {
      const imageToEdit = baseImage || originalImage;
      const promptText = customPrompt || `Redesign this room in ${styleName} style. Keep the layout similar.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: imageToEdit.data,
                mimeType: imageToEdit.mimeType,
              },
            },
            {
              text: promptText,
            },
          ],
        },
      });

      let foundImage = false;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData && part.inlineData.data) {
          const base64EncodeString = part.inlineData.data;
          const mimeType = part.inlineData.mimeType || 'image/png';
          const imageUrl = `data:${mimeType};base64,${base64EncodeString}`;
          setGeneratedImage({
            data: base64EncodeString,
            mimeType: mimeType,
            url: imageUrl,
          });
          foundImage = true;
          break;
        }
      }

      if (!foundImage) {
        throw new Error("No image generated.");
      }

      setChatHistory(prev => [...prev, {
        role: 'model',
        text: `Here is your room reimagined in **${styleName}** style! What do you think? You can ask me to change specific details like "make the rug blue" or ask for shopping links for items in the image.`
      }]);

    } catch (error) {
      console.error("Error generating image:", error);
      setChatHistory(prev => [...prev, {
        role: 'model',
        text: "Sorry, I encountered an error while generating the design. Please try again."
      }]);
    } finally {
      setIsGenerating(false);
      setGenerationStatus('');
    }
  };

  const handleStyleSelect = (styleName: string) => {
    generateDesign(styleName);
  };

  const updateDesignFunctionDeclaration: FunctionDeclaration = {
    name: "updateDesign",
    parameters: {
      type: Type.OBJECT,
      description: "Update the room design based on the user's request. Use this when the user asks to change the image, like 'make the rug blue' or 'add a retro filter'.",
      properties: {
        prompt: {
          type: Type.STRING,
          description: "The prompt to use for the image generation, e.g., 'Change the rug to blue' or 'Add a retro filter'.",
        },
      },
      required: ["prompt"],
    },
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userText }]);
    setIsChatting(true);

    try {
      const chat = ai.chats.create({
        model: "gemini-3.1-pro-preview",
        config: {
          systemInstruction: "You are an expert AI interior design consultant. The user has uploaded a photo of their room and generated a new design. Answer their questions, provide advice, and if they ask for specific items, provide shoppable links (you can make up realistic URLs for the sake of this demo). If the user asks to change the design visually (e.g., 'make the rug blue', 'add a retro filter'), you MUST use the `updateDesign` tool to trigger a new image generation with their request.",
          tools: [{ functionDeclarations: [updateDesignFunctionDeclaration] }],
        },
      });

      // Send previous history to establish context
      // We can just send the current message, and the model will have context if we pass history, but `ai.chats.create` doesn't take history directly in this SDK version easily unless we send multiple messages.
      // Let's just send the current message with some context injected.
      const contextMessage = `Current style: ${currentStyle || 'None'}. User message: ${userText}`;
      
      const response = await chat.sendMessage({ message: contextMessage });

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === 'updateDesign') {
          const args = call.args as any;
          const prompt = args.prompt;
          
          setChatHistory(prev => [...prev, { role: 'model', text: `I'm updating the design: *${prompt}*...` }]);
          
          // Trigger image generation with the new prompt, using the generated image as base if available, else original
          await generateDesign(currentStyle || 'Custom', prompt, generatedImage || originalImage || undefined);
          
          // We don't need to send a tool response back to the chat for this simple flow, 
          // as the visual update is the main result.
        }
      } else if (response.text) {
        setChatHistory(prev => [...prev, { role: 'model', text: response.text || '' }]);
      }

    } catch (error) {
      console.error("Chat error:", error);
      setChatHistory(prev => [...prev, { role: 'model', text: "Sorry, I had trouble processing that request." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage.url;
      link.download = `room-makeover-${currentStyle.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
      {/* Header */}
      <header className="flex items-center justify-between pb-6 border-b border-stone-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-white">
            <Sparkles size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">AI Interior Consultant</h1>
            <p className="text-sm text-stone-500">Reimagine your space in seconds</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content Area */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          
          {/* Image Area */}
          <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden relative min-h-[400px] flex items-center justify-center">
            {!originalImage ? (
              <div className="p-12 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-stone-400">
                  <UploadCloud size={32} />
                </div>
                <h3 className="text-lg font-medium text-stone-900 mb-2">Upload your room</h3>
                <p className="text-stone-500 mb-6 max-w-sm">
                  Take a photo of your current space and let our AI reimagine it in different styles.
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-stone-900 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-800 transition-colors flex items-center gap-2"
                >
                  <ImageIcon size={18} />
                  Select Photo
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div className="w-full h-full relative">
                {generatedImage ? (
                  <ReactCompareSlider
                    itemOne={<ReactCompareSliderImage src={originalImage.url} alt="Original" />}
                    itemTwo={<ReactCompareSliderImage src={generatedImage.url} alt="Generated" />}
                    className="w-full h-full object-cover max-h-[600px]"
                  />
                ) : (
                  <img src={originalImage.url} alt="Original" className="w-full h-full object-cover max-h-[600px]" />
                )}
                
                {isGenerating && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <Loader2 className="w-10 h-10 text-stone-900 animate-spin mb-4" />
                    <p className="text-stone-900 font-medium">{generationStatus}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          {generatedImage && (
            <div className="flex justify-end">
              <button 
                onClick={handleDownload}
                className="flex items-center gap-2 bg-white border border-stone-200 text-stone-700 px-4 py-2 rounded-lg hover:bg-stone-50 transition-colors text-sm font-medium shadow-sm"
              >
                <Download size={16} />
                Download Design
              </button>
            </div>
          )}

          {/* Style Carousel */}
          {originalImage && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider">Choose a Style</h3>
              <div className="flex overflow-x-auto pb-4 gap-4 snap-x scrollbar-hide">
                {STYLES.map((style) => (
                  <button
                    key={style.id}
                    onClick={() => handleStyleSelect(style.name)}
                    disabled={isGenerating}
                    className={`flex-shrink-0 w-32 snap-start group relative rounded-xl overflow-hidden border-2 transition-all ${
                      currentStyle === style.name ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                    }`}
                  >
                    <div className="aspect-[4/3] w-full relative">
                      <img src={style.image} alt={style.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <span className="absolute bottom-2 left-2 right-2 text-white text-xs font-medium text-left leading-tight">
                        {style.name}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat Interface */}
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 flex flex-col h-[600px] lg:h-auto overflow-hidden">
          <div className="p-4 border-b border-stone-100 bg-stone-50/50 flex items-center gap-2">
            <MessageSquare size={18} className="text-stone-500" />
            <h2 className="font-medium text-stone-900">Design Assistant</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-stone-500 p-6">
                <Sparkles size={32} className="mb-3 text-stone-300" />
                <p className="text-sm">Upload a photo to start chatting with your AI interior design consultant.</p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user' 
                        ? 'bg-stone-900 text-white rounded-tr-sm' 
                        : 'bg-stone-100 text-stone-800 rounded-tl-sm'
                    }`}
                  >
                    <div className="prose prose-sm prose-stone max-w-none dark:prose-invert">
                      <ReactMarkdown>
                        {msg.text}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))
            )}
            {isChatting && (
              <div className="flex justify-start">
                <div className="bg-stone-100 text-stone-800 rounded-2xl rounded-tl-sm px-4 py-3 text-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-stone-100 bg-white">
            <div className="relative flex items-center">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ask for changes or shopping links..."
                disabled={!originalImage || isGenerating || isChatting}
                className="w-full bg-stone-50 border border-stone-200 rounded-full pl-4 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition-all disabled:opacity-50"
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isGenerating || isChatting}
                className="absolute right-2 w-8 h-8 flex items-center justify-center bg-stone-900 text-white rounded-full hover:bg-stone-800 disabled:opacity-50 disabled:hover:bg-stone-900 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
