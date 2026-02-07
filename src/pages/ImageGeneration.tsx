import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wand2, 
  Download, 
  ArrowRight, 
  RefreshCw, 
  Image as ImageIcon,
  Sparkles
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGemini } from '@/hooks/useGemini';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { AspectRatio } from '@/types';
import { PROMPT_TEMPLATES } from '@/lib/prompts';

const ASPECT_RATIOS: { value: AspectRatio; label: string; dimensions: string }[] = [
  { value: '16:9', label: 'Panorâmico (16:9)', dimensions: '1024×576' },
  { value: '9:16', label: 'Vertical (9:16)', dimensions: '576×1024' },
  { value: '1:1', label: 'Quadrado (1:1)', dimensions: '1024×1024' },
  { value: '4:3', label: 'Padrão (4:3)', dimensions: '1024×768' },
  { value: '3:4', label: 'Retrato (3:4)', dimensions: '768×1024' },
];

export function ImageGeneration() {
  const navigate = useNavigate();
  const { generateImage, isGenerating, progress } = useGemini();
  const { addToast } = useToast();
  
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<'gemini' | 'dalle'>('gemini');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [quality, setQuality] = useState<'standard' | 'high' | 'ultra'>('high');
  const [showTemplates, setShowTemplates] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast({
        type: 'error',
        title: 'Prompt vazio',
        message: 'Digite uma descrição para gerar a imagem',
      });
      return;
    }

    try {
      const result = await generateImage({
        prompt,
        model: selectedModel === 'dalle' ? 'dall-e-3' : 'gemini-2.5-flash-image',
        aspectRatio,
        quality,
      });

      if (result.imageUrl) {
        setGeneratedImage(result.imageUrl);
        addToast({
          type: 'success',
          title: 'Imagem gerada!',
          message: 'Sua imagem foi criada com sucesso',
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Erro na geração',
        message: 'Não foi possível gerar a imagem',
      });
    }
  };

  const handleUseForVideo = () => {
    if (generatedImage) {
      navigate('/video', { state: { imageUrl: generatedImage } });
    }
  };

  const handleDownload = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `imagem-gerada-${Date.now()}.png`;
      link.click();
    }
  };

  const handleSelectTemplate = (templatePrompt: string) => {
    setPrompt(templatePrompt);
    setShowTemplates(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Gerar Imagem</h1>
        <p className="text-[#b0b0b0] mt-1">Crie imagens hiper-realistas com Gemini ou DALL-E 3</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Controls Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Prompt */}
          <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-white">Descrição da Imagem</Label>
              <span className="text-xs text-[#b0b0b0]">{prompt.length} caracteres</span>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Descreva em detalhes a imagem que você quer gerar..."
              className="min-h-[200px] bg-[#1a1a1a] border-[#444444] text-white placeholder:text-[#666] resize-none"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplates(true)}
              className="mt-3 border-[#444444] text-[#b0b0b0] hover:text-white hover:bg-[#444444]"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Usar Prompt de Exemplo
            </Button>
          </div>

          {/* Parameters */}
          <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] space-y-6">
            <h3 className="text-white font-medium">Parâmetros</h3>

            {/* Model Selection */}
            <div>
              <Label className="text-white mb-3 block">Modelo de IA</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedModel('gemini')}
                  className={cn(
                    'p-4 rounded-lg border text-left transition-all',
                    selectedModel === 'gemini'
                      ? 'border-[#7e57c2] bg-[#7e57c2]/20 text-white'
                      : 'border-[#444444] text-[#b0b0b0] hover:border-[#666]'
                  )}
                >
                  <div className="font-medium text-sm">✨ Gemini</div>
                  <div className="text-xs mt-1 opacity-70">Google AI - Rápido e versátil</div>
                </button>
                <button
                  onClick={() => setSelectedModel('dalle')}
                  className={cn(
                    'p-4 rounded-lg border text-left transition-all',
                    selectedModel === 'dalle'
                      ? 'border-[#7e57c2] bg-[#7e57c2]/20 text-white'
                      : 'border-[#444444] text-[#b0b0b0] hover:border-[#666]'
                  )}
                >
                  <div className="font-medium text-sm">🎨 DALL-E 3</div>
                  <div className="text-xs mt-1 opacity-70">Azure OpenAI - Alta qualidade</div>
                </button>
              </div>
            </div>

            {/* Aspect Ratio */}
            <div>
              <Label className="text-white mb-3 block">Proporção</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio.value}
                    onClick={() => setAspectRatio(ratio.value)}
                    className={cn(
                      'p-3 rounded-lg border text-center transition-all',
                      aspectRatio === ratio.value
                        ? 'border-[#7e57c2] bg-[#7e57c2]/20 text-white'
                        : 'border-[#444444] text-[#b0b0b0] hover:border-[#666]'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-4 mx-auto mb-1 border-2 rounded-sm',
                      aspectRatio === ratio.value ? 'border-[#7e57c2]' : 'border-[#666]'
                    )} style={{
                      aspectRatio: ratio.value.replace(':', '/')
                    }} />
                    <span className="text-xs">{ratio.value}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality */}
            <div>
              <Label className="text-white mb-3 block">Qualidade</Label>
              <Select value={quality} onValueChange={(v) => setQuality(v as any)}>
                <SelectTrigger className="bg-[#1a1a1a] border-[#444444] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2a] border-[#444444]">
                  <SelectItem value="standard" className="text-white">Padrão</SelectItem>
                  <SelectItem value="high" className="text-white">Alta</SelectItem>
                  <SelectItem value="ultra" className="text-white">Ultra</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex-1 bg-[#7e57c2] hover:bg-[#6a42b0] text-white h-12"
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full mr-2"
                  />
                  Gerando... {Math.round(progress)}%
                </>
              ) : (
                <>
                  <Wand2 className="w-5 h-5 mr-2" />
                  Gerar Imagem
                </>
              )}
            </Button>
            
            {generatedImage && (
              <Button
                variant="outline"
                onClick={() => {
                  setPrompt('');
                  setGeneratedImage(null);
                }}
                className="border-[#444444] text-white hover:bg-[#2a2a2a]"
              >
                <RefreshCw className="w-5 h-5" />
              </Button>
            )}
          </div>
        </motion.div>

        {/* Preview Panel */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-[#2a2a2a] rounded-xl border border-[#444444] overflow-hidden min-h-[500px] flex flex-col"
        >
          <div className="p-4 border-b border-[#444444] flex items-center justify-between">
            <h3 className="text-white font-medium">Preview</h3>
            {generatedImage && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownload}
                  className="border-[#444444] text-white hover:bg-[#444444]"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Baixar
                </Button>
                <Button
                  size="sm"
                  onClick={handleUseForVideo}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                >
                  <ArrowRight className="w-4 h-4 mr-1" />
                  Usar para Vídeo
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 flex items-center justify-center p-8 bg-[#1a1a1a]">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <motion.div
                    animate={{ 
                      rotate: 360,
                      scale: [1, 1.1, 1]
                    }}
                    transition={{ 
                      rotate: { duration: 2, repeat: Infinity, ease: 'linear' },
                      scale: { duration: 1, repeat: Infinity }
                    }}
                    className="w-20 h-20 rounded-full border-4 border-[#444444] border-t-[#7e57c2] mx-auto mb-4"
                  />
                  <p className="text-white font-medium">Gerando imagem...</p>
                  <p className="text-[#b0b0b0] text-sm mt-1">{Math.round(progress)}% completo</p>
                  <div className="w-48 h-2 bg-[#444444] rounded-full mt-4 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-gradient-to-r from-[#7e57c2] to-[#6a42b0]"
                    />
                  </div>
                </motion.div>
              ) : generatedImage ? (
                <motion.div
                  key="image"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="relative w-full h-full flex items-center justify-center"
                >
                  <img
                    src={generatedImage}
                    alt="Generated"
                    className="max-w-full max-h-[400px] object-contain rounded-lg"
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-center"
                >
                  <div className="w-24 h-24 rounded-full bg-[#444444] flex items-center justify-center mx-auto mb-4">
                    <ImageIcon className="w-10 h-10 text-[#666]" />
                  </div>
                  <p className="text-[#b0b0b0]">Sua imagem aparecerá aqui</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-3xl bg-[#1a1a1a] border-[#444444] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">Prompts de Exemplo</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {PROMPT_TEMPLATES.slice(0, 6).map((template) => (
              <motion.button
                key={template.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSelectTemplate(template.prompt)}
                className="p-4 bg-[#2a2a2a] rounded-lg border border-[#444444] hover:border-[#7e57c2] text-left transition-colors"
              >
                {template.previewUrl && (
                  <img
                    src={template.previewUrl}
                    alt={template.title}
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                )}
                <h4 className="text-white font-medium mb-1">{template.title}</h4>
                <p className="text-sm text-[#b0b0b0] line-clamp-2">{template.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {template.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-[#444444] rounded text-xs text-[#b0b0b0]">
                      {tag}
                    </span>
                  ))}
                </div>
              </motion.button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
