import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Copy, 
  Check, 
  Sparkles, 
  Search,
  ExternalLink,
  Wand2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PROMPT_TEMPLATES, CATEGORIES } from '@/lib/prompts';
import type { PromptTemplate, PromptCategory } from '@/types';

export function Prompts() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [activeCategory, setActiveCategory] = useState<PromptCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredPrompts = PROMPT_TEMPLATES.filter((prompt) => {
    const matchesCategory = activeCategory === 'all' || prompt.category === activeCategory;
    const matchesSearch = 
      prompt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prompt.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleCopy = async (prompt: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopiedId(prompt.id);
      addToast({
        type: 'success',
        title: 'Prompt copiado!',
        message: 'O prompt foi copiado para a área de transferência',
      });
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Erro ao copiar',
        message: 'Não foi possível copiar o prompt',
      });
    }
  };

  const handleUsePrompt = (prompt: PromptTemplate) => {
    navigate('/image', { state: { prompt: prompt.prompt } });
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Biblioteca de Prompts</h1>
        <p className="text-[#b0b0b0] mt-1">Explore prompts pré-configurados para gerar imagens incríveis</p>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar prompts..."
            className="pl-10 bg-[#2a2a2a] border-[#444444] text-white"
          />
        </div>
      </motion.div>

      {/* Categories */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex gap-2 overflow-x-auto pb-4 mb-6"
      >
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setActiveCategory(category.id as PromptCategory)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              activeCategory === category.id
                ? 'bg-[#7e57c2] text-white'
                : 'bg-[#2a2a2a] text-[#b0b0b0] hover:bg-[#444444] border border-[#444444]'
            )}
          >
            {category.label}
          </button>
        ))}
      </motion.div>

      {/* Prompts Grid */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <AnimatePresence mode="popLayout">
          {filteredPrompts.map((prompt, index) => (
            <motion.div
              key={prompt.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ y: -4 }}
              className="bg-[#2a2a2a] rounded-xl border border-[#444444] overflow-hidden hover:border-[#7e57c2]/50 transition-colors group"
            >
              {/* Preview Image */}
              <div 
                className="aspect-[3/4] bg-[#1a1a1a] relative overflow-hidden cursor-pointer"
                onClick={() => setSelectedPrompt(prompt)}
              >
                {prompt.previewUrl ? (
                  <img
                    src={prompt.previewUrl}
                    alt={prompt.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Sparkles className="w-12 h-12 text-[#444444]" />
                  </div>
                )}
                
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUsePrompt(prompt);
                    }}
                    className="w-full py-2 bg-[#7e57c2] hover:bg-[#6a42b0] text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Wand2 className="w-4 h-4 inline mr-2" />
                    Usar Prompt
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                <h3 className="text-white font-medium mb-1 truncate">{prompt.title}</h3>
                <p className="text-sm text-[#b0b0b0] line-clamp-2 mb-3">{prompt.description}</p>
                
                {/* Tags */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {prompt.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-[#444444] rounded text-xs text-[#b0b0b0]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCopy(prompt)}
                    className="flex-1 py-2 bg-[#1a1a1a] hover:bg-[#444444] rounded-lg text-sm text-[#b0b0b0] hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    {copiedId === prompt.id ? (
                      <>
                        <Check className="w-4 h-4 text-green-500" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copiar
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setSelectedPrompt(prompt)}
                    className="p-2 bg-[#1a1a1a] hover:bg-[#444444] rounded-lg text-[#b0b0b0] hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Empty State */}
      {filteredPrompts.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Sparkles className="w-16 h-16 text-[#444444] mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">Nenhum prompt encontrado</h3>
          <p className="text-[#b0b0b0]">Tente ajustar sua busca ou categoria</p>
        </motion.div>
      )}

      {/* Preview Dialog */}
      <Dialog open={!!selectedPrompt} onOpenChange={() => setSelectedPrompt(null)}>
        <DialogContent className="max-w-2xl bg-[#1a1a1a] border-[#444444] max-h-[90vh] overflow-y-auto">
          {selectedPrompt && (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">{selectedPrompt.title}</DialogTitle>
              </DialogHeader>
              
              {selectedPrompt.previewUrl && (
                <img
                  src={selectedPrompt.previewUrl}
                  alt={selectedPrompt.title}
                  className="w-full rounded-lg mb-4"
                />
              )}

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Descrição</h4>
                  <p className="text-[#b0b0b0]">{selectedPrompt.description}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Prompt Completo</h4>
                  <div className="bg-[#2a2a2a] rounded-lg p-4 border border-[#444444]">
                    <p className="text-sm text-[#b0b0b0] whitespace-pre-wrap">{selectedPrompt.prompt}</p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-white mb-2">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedPrompt.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 bg-[#444444] rounded-full text-sm text-[#b0b0b0]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={() => handleUsePrompt(selectedPrompt)}
                    className="flex-1 bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    Usar Este Prompt
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleCopy(selectedPrompt)}
                    className="border-[#444444] text-white hover:bg-[#2a2a2a]"
                  >
                    {copiedId === selectedPrompt.id ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
