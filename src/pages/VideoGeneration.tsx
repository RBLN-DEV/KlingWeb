import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Video,
  Upload,
  ChevronRight,
  ChevronLeft,
  Check,
  Settings,
  Image as ImageIcon,
  X,
  Wand2
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useKling } from '@/hooks/useKling';
import { useGemini } from '@/hooks/useGemini';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { VideoGeneration, KlingParameters } from '@/types';

interface LocationState {
  imageUrl?: string;
}

const STEPS = [
  { id: 1, label: 'Selecionar Imagem', icon: ImageIcon },
  { id: 2, label: 'Configurar Movimento', icon: Settings },
  { id: 3, label: 'Gerar Vídeo', icon: Video },
];

export function VideoGeneration() {
  const location = useLocation();
  const navigate = useNavigate();
  const { generateVideo, isGenerating, progress, statusMessage } = useKling();
  const { getStoredImages } = useGemini();
  const { addToast } = useToast();

  const state = location.state as LocationState;
  const [currentStep, setCurrentStep] = useState(state?.imageUrl ? 2 : 1);
  const [selectedImage, setSelectedImage] = useState<string | null>(state?.imageUrl || null);
  const [selectedImageBase64, setSelectedImageBase64] = useState<string | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [parameters, setParameters] = useState<KlingParameters>({
    duration: 5,
    cfgScale: 0.5,
    preserveStructure: true,
    identityConsistency: true,
    mode: 'standard',
  });
  const [generatedVideo, setGeneratedVideo] = useState<VideoGeneration | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);
  const [storedImages, setStoredImages] = useState<Array<{ imageUrl: string; imageBase64?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) { // 10MB limit for image
        addToast({
          type: 'error',
          title: 'Arquivo muito grande',
          message: 'A imagem deve ter no máximo 10MB',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setSelectedImage(result);
        setSelectedImageBase64(null); // Upload gera data: URI, não precisa de base64 separado
        addToast({
          type: 'success',
          title: 'Imagem carregada',
          message: 'Imagem selecionada com sucesso',
        });
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    const images = getStoredImages();
    setStoredImages(images.map(img => ({
      imageUrl: img.imageUrl || '',
      imageBase64: img.imageBase64,
    })).filter(img => img.imageUrl));
  }, [getStoredImages]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 100 * 1024 * 1024) {
        addToast({
          type: 'error',
          title: 'Arquivo muito grande',
          message: 'O vídeo deve ter no máximo 100MB',
        });
        return;
      }
      setReferenceVideo(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      if (file.size > 100 * 1024 * 1024) {
        addToast({
          type: 'error',
          title: 'Arquivo muito grande',
          message: 'O vídeo deve ter no máximo 100MB',
        });
        return;
      }
      setReferenceVideo(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    }
  };

  const handleGenerate = async () => {
    if (!selectedImage) {
      addToast({
        type: 'error',
        title: 'Imagem necessária',
        message: 'Selecione uma imagem base',
      });
      return;
    }

    if (!title.trim()) {
      addToast({
        type: 'error',
        title: 'Título necessário',
        message: 'Dê um nome para o seu vídeo',
      });
      return;
    }

    try {
      setGenerationError(null);
      const result = await generateVideo({
        imageUrl: selectedImage,
        imageBase64: selectedImageBase64 || undefined,
        referenceVideo: referenceVideo || undefined,
        parameters,
        title: title.trim(),
      });

      setGeneratedVideo(result);
      addToast({
        type: 'success',
        title: 'Vídeo gerado!',
        message: 'Seu vídeo foi criado com sucesso',
      });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Não foi possível gerar o vídeo';
      setGenerationError(errMsg);
      addToast({
        type: 'error',
        title: 'Erro na geração',
        message: errMsg,
      });
    }
  };

  const handleStepClick = (stepId: number) => {
    // Só permitir ir para steps anteriores ou o atual +1 se os requisitos estão preenchidos
    if (stepId < currentStep) {
      setCurrentStep(stepId);
    } else if (stepId === currentStep + 1 && canProceed()) {
      setCurrentStep(stepId);
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return !!selectedImage;
      case 2:
        return !!selectedImage && !!title.trim();
      default:
        return true;
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h3 className="text-white font-medium">Escolha a imagem base</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/image')}
            className="border-[#444444] text-white hover:bg-[#2a2a2a] flex-1 sm:flex-none"
          >
            <Wand2 className="w-4 h-4 mr-2" />
            Gerar Nova
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            className="border-[#444444] text-white hover:bg-[#2a2a2a] flex-1 sm:flex-none"
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload
          </Button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGallery(!showGallery)}
            className="border-[#444444] text-white hover:bg-[#2a2a2a] flex-1 sm:flex-none"
          >
            <ImageIcon className="w-4 h-4 mr-2" />
            Da Galeria
          </Button>
        </div>
      </div>

      {showGallery && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-[#2a2a2a] rounded-xl p-4 border border-[#444444]"
        >
          <h4 className="text-sm text-[#b0b0b0] mb-3">Imagens geradas recentemente</h4>
          {storedImages.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {storedImages.map((img, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setSelectedImage(img.imageUrl);
                    setSelectedImageBase64(img.imageBase64 || null);
                    setShowGallery(false);
                  }}
                  className={cn(
                    'aspect-square rounded-lg overflow-hidden border-2 transition-colors',
                    selectedImage === img.imageUrl ? 'border-[#7e57c2]' : 'border-transparent'
                  )}
                >
                  <img src={img.imageUrl} alt="" className="w-full h-full object-cover" />
                </motion.button>
              ))}
            </div>
          ) : (
            <p className="text-[#b0b0b0] text-center py-4">Nenhuma imagem gerada ainda</p>
          )}
        </motion.div>
      )}

      {/* Selected Image Preview */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] min-h-[300px] flex items-center justify-center">
        {selectedImage ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <img
              src={selectedImage}
              alt="Selected"
              className="max-h-[300px] rounded-lg"
            />
            <button
              onClick={() => { setSelectedImage(null); setSelectedImageBase64(null); }}
              className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </motion.div>
        ) : (
          <div className="text-center">
            <ImageIcon className="w-16 h-16 text-[#444444] mx-auto mb-4" />
            <p className="text-[#b0b0b0]">Selecione uma imagem para continuar</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      {/* Title Input */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <Label className="text-white mb-3 block">Nome do Vídeo</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Vídeo de dança"
          className="bg-[#1a1a1a] border-[#444444] text-white"
        />
      </div>

      {/* Video Upload */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <Label className="text-white mb-3 block">Vídeo de Referência (Opcional)</Label>

        {!videoPreview ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#444444] rounded-xl p-8 text-center cursor-pointer hover:border-[#7e57c2] transition-colors"
          >
            <Upload className="w-12 h-12 text-[#666] mx-auto mb-4" />
            <p className="text-white font-medium mb-2">Arraste um vídeo aqui</p>
            <p className="text-sm text-[#b0b0b0]">ou clique para selecionar</p>
            <p className="text-xs text-[#666] mt-2">MP4, MOV até 100MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative"
          >
            <video
              src={videoPreview}
              controls
              className="w-full rounded-lg"
            />
            <button
              onClick={() => {
                setReferenceVideo(null);
                setVideoPreview(null);
              }}
              className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </motion.div>
        )}
      </div>

      {/* Parameters */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] space-y-6">
        <h4 className="text-white font-medium">Parâmetros do Kling</h4>

        {/* Duration */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-white">Duração</Label>
            <span className="text-[#7e57c2] font-medium">{parameters.duration}s</span>
          </div>
          <Slider
            value={[parameters.duration]}
            onValueChange={([v]) => setParameters({ ...parameters, duration: v })}
            min={1}
            max={10}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[#666] mt-1">
            <span>1s</span>
            <span>10s</span>
          </div>
        </div>

        {/* CFG Scale */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-white">CFG Scale</Label>
            <span className="text-[#7e57c2] font-medium">{parameters.cfgScale.toFixed(1)}</span>
          </div>
          <Slider
            value={[parameters.cfgScale]}
            onValueChange={([v]) => setParameters({ ...parameters, cfgScale: v })}
            min={0}
            max={1}
            step={0.1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-[#666] mt-1">
            <span>0</span>
            <span>1</span>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Preservar Estrutura Facial</Label>
              <p className="text-xs text-[#b0b0b0]">Mantém características faciais consistentes</p>
            </div>
            <Switch
              checked={parameters.preserveStructure}
              onCheckedChange={(v) => setParameters({ ...parameters, preserveStructure: v })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-white">Consistência de Identidade</Label>
              <p className="text-xs text-[#b0b0b0]">Preserva a identidade ao longo do vídeo</p>
            </div>
            <Switch
              checked={parameters.identityConsistency}
              onCheckedChange={(v) => setParameters({ ...parameters, identityConsistency: v })}
            />
          </div>
        </div>

        {/* Mode */}
        <div>
          <Label className="text-white mb-3 block">Modo de Geração</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setParameters({ ...parameters, mode: 'standard' })}
              className={cn(
                'p-4 rounded-lg border text-center transition-colors',
                parameters.mode === 'standard'
                  ? 'border-[#7e57c2] bg-[#7e57c2]/20 text-white'
                  : 'border-[#444444] text-[#b0b0b0] hover:border-[#666]'
              )}
            >
              <div className="font-medium mb-1">Padrão</div>
              <div className="text-xs opacity-70">Mais rápido</div>
            </button>
            <button
              onClick={() => setParameters({ ...parameters, mode: 'professional' })}
              className={cn(
                'p-4 rounded-lg border text-center transition-colors',
                parameters.mode === 'professional'
                  ? 'border-[#7e57c2] bg-[#7e57c2]/20 text-white'
                  : 'border-[#444444] text-[#b0b0b0] hover:border-[#666]'
              )}
            >
              <div className="font-medium mb-1">Profissional</div>
              <div className="text-xs opacity-70">Maior qualidade</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      {isGenerating ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-[#2a2a2a] rounded-xl p-12 border border-[#444444] text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full border-4 border-[#444444] border-t-[#7e57c2] mx-auto mb-6"
          />
          <h3 className="text-white font-medium text-lg mb-2">Gerando seu vídeo...</h3>
          <p className="text-[#b0b0b0] mb-4">{statusMessage}</p>
          <div className="w-64 h-3 bg-[#444444] rounded-full mx-auto overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              className="h-full bg-gradient-to-r from-[#7e57c2] to-[#6a42b0]"
            />
          </div>
          <p className="text-[#7e57c2] font-medium mt-2">{Math.round(progress)}%</p>
        </motion.div>
      ) : generationError ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#2a2a2a] rounded-xl p-6 border border-red-500/30"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-white font-medium text-lg">Erro ao gerar vídeo</h3>
            <p className="text-red-400 text-sm mt-2">{generationError}</p>
          </div>

          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => { setGenerationError(null); setCurrentStep(2); }}
              variant="outline"
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Voltar e Ajustar
            </Button>
            <Button
              onClick={() => { setGenerationError(null); handleGenerate(); }}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Tentar Novamente
            </Button>
          </div>
        </motion.div>
      ) : generatedVideo ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-white font-medium text-lg">Vídeo gerado com sucesso!</h3>
          </div>

          {generatedVideo.videoUrl && (
            <video
              src={generatedVideo.videoUrl}
              controls
              className="w-full rounded-lg mb-6"
            />
          )}

          <div className="flex gap-3 justify-center">
            <Button
              onClick={() => navigate('/gallery')}
              variant="outline"
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              Ver na Galeria
            </Button>
            <Button
              onClick={() => {
                setGeneratedVideo(null);
                setCurrentStep(1);
                setSelectedImage(null);
                setSelectedImageBase64(null);
                setTitle('');
              }}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <Wand2 className="w-4 h-4 mr-2" />
              Criar Outro
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
          <h3 className="text-white font-medium mb-4">Revisar e Gerar</h3>

          {/* Summary */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-4 p-4 bg-[#1a1a1a] rounded-lg">
              <img
                src={selectedImage || ''}
                alt="Base"
                className="w-20 h-20 object-cover rounded-lg"
              />
              <div>
                <p className="text-sm text-[#b0b0b0]">Imagem Base</p>
                <p className="text-white">{title || 'Sem título'}</p>
              </div>
            </div>

            {videoPreview && (
              <div className="flex items-center gap-4 p-4 bg-[#1a1a1a] rounded-lg">
                <video src={videoPreview} className="w-20 h-20 object-cover rounded-lg" />
                <div>
                  <p className="text-sm text-[#b0b0b0]">Vídeo de Referência</p>
                  <p className="text-white">{referenceVideo?.name}</p>
                </div>
              </div>
            )}

            <div className="p-4 bg-[#1a1a1a] rounded-lg">
              <p className="text-sm text-[#b0b0b0] mb-2">Parâmetros</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-[#b0b0b0]">Duração:</span>
                <span className="text-white">{parameters.duration}s</span>
                <span className="text-[#b0b0b0]">CFG Scale:</span>
                <span className="text-white">{parameters.cfgScale}</span>
                <span className="text-[#b0b0b0]">Modo:</span>
                <span className="text-white capitalize">{parameters.mode}</span>
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            className="w-full bg-[#7e57c2] hover:bg-[#6a42b0] text-white h-12"
          >
            <Wand2 className="w-5 h-5 mr-2" />
            Gerar Vídeo
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-white">Gerar Vídeo</h1>
        <p className="text-[#b0b0b0] mt-1">Transforme imagens em vídeos com movimento realista</p>
      </motion.div>

      {/* Step Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            const isClickable = isCompleted || (step.id === currentStep + 1 && canProceed());

            return (
              <div key={step.id} className="flex items-center flex-1">
                <motion.button
                  onClick={() => handleStepClick(step.id)}
                  disabled={!isClickable && !isActive}
                  animate={{
                    scale: isActive ? 1.1 : 1,
                    backgroundColor: isActive || isCompleted ? '#7e57c2' : '#2a2a2a',
                  }}
                  className={cn(
                    'w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-colors flex-shrink-0',
                    isActive || isCompleted
                      ? 'border-[#7e57c2]'
                      : 'border-[#444444]',
                    isClickable && !isActive ? 'cursor-pointer hover:border-[#7e57c2]/70' : '',
                    !isClickable && !isActive ? 'cursor-default' : ''
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <Icon className={cn(
                      'w-5 h-5',
                      isActive ? 'text-white' : 'text-[#b0b0b0]'
                    )} />
                  )}
                </motion.button>
                <span
                  onClick={() => handleStepClick(step.id)}
                  className={cn(
                    'ml-3 text-sm hidden sm:block',
                    isActive ? 'text-white font-medium' : 'text-[#b0b0b0]',
                    isClickable ? 'cursor-pointer hover:text-white' : ''
                  )}
                >
                  {step.label}
                </span>
                {index < STEPS.length - 1 && (
                  <div className={cn(
                    'flex-1 h-0.5 mx-2 sm:mx-4',
                    isCompleted ? 'bg-[#7e57c2]' : 'bg-[#444444]'
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation Buttons */}
      {!generatedVideo && !isGenerating && !generationError && currentStep < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-between mt-6"
        >
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
            disabled={currentStep === 1}
            className="border-[#444444] text-white hover:bg-[#2a2a2a] disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Button
            onClick={() => setCurrentStep(Math.min(3, currentStep + 1))}
            disabled={!canProceed()}
            className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white disabled:opacity-50"
          >
            Continuar
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </motion.div>
      )}
    </div>
  );
}
