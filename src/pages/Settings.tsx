import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Key, 
  Palette, 
  Bell, 
  Camera,
  Eye,
  EyeOff,
  Save,
  TestTube
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'profile', label: 'Perfil', icon: User },
  { id: 'api', label: 'API Keys', icon: Key },
  { id: 'preferences', label: 'Preferências', icon: Palette },
  { id: 'notifications', label: 'Notificações', icon: Bell },
];

export function Settings() {
  const { user, updateUser } = useAuth();
  const { addToast } = useToast();
  
  const [activeTab, setActiveTab] = useState('profile');
  const [isSaving, setIsSaving] = useState(false);
  
  // Profile state
  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    bio: '',
  });
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState({
    geminiApiKey: '',
    klingApiKey: '',
    klingSecret: '',
  });
  const [showKeys, setShowKeys] = useState({
    gemini: false,
    kling: false,
    secret: false,
  });
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  
  // Preferences state
  const [preferences, setPreferences] = useState({
    language: 'pt-BR',
    theme: 'dark',
    autoSave: true,
    defaultDuration: 5,
    defaultCfgScale: 0.5,
  });
  
  // Notifications state
  const [notifications, setNotifications] = useState({
    emailOnComplete: true,
    emailOnFail: true,
    browserNotifications: false,
    marketingEmails: false,
  });

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    updateUser({ name: profile.name });
    addToast({
      type: 'success',
      title: 'Perfil atualizado',
      message: 'Suas informações foram salvas',
    });
    setIsSaving(false);
  };

  const handleSaveApiKeys = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    localStorage.setItem('klingai_api_keys', JSON.stringify(apiKeys));
    addToast({
      type: 'success',
      title: 'API Keys salvas',
      message: 'Suas chaves foram armazenadas com segurança',
    });
    setIsSaving(false);
  };

  const testConnection = async (service: string) => {
    setTestingConnection(service);
    await new Promise(resolve => setTimeout(resolve, 2000));
    addToast({
      type: 'success',
      title: 'Conexão bem-sucedida',
      message: `${service} está configurado corretamente`,
    });
    setTestingConnection(null);
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    localStorage.setItem('klingai_preferences', JSON.stringify(preferences));
    addToast({
      type: 'success',
      title: 'Preferências salvas',
      message: 'Suas configurações foram atualizadas',
    });
    setIsSaving(false);
  };

  const handleSaveNotifications = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    localStorage.setItem('klingai_notifications', JSON.stringify(notifications));
    addToast({
      type: 'success',
      title: 'Notificações configuradas',
      message: 'Suas preferências de notificação foram salvas',
    });
    setIsSaving(false);
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Configurações</h1>
        <p className="text-[#b0b0b0] mt-1">Personalize sua experiência no KlingAI Studio</p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#2a2a2a] border border-[#444444] p-1 mb-6 flex flex-wrap h-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                    'data-[state=active]:bg-[#7e57c2] data-[state=active]:text-white',
                    'text-[#b0b0b0] hover:text-white'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] space-y-6"
            >
              <div className="flex items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#7e57c2] to-[#6a42b0] flex items-center justify-center">
                    <span className="text-3xl font-bold text-white">
                      {profile.name.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                  <button className="absolute -bottom-1 -right-1 w-8 h-8 bg-[#444444] rounded-full flex items-center justify-center hover:bg-[#7e57c2] transition-colors">
                    <Camera className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div>
                  <h3 className="text-white font-medium text-lg">Foto de Perfil</h3>
                  <p className="text-sm text-[#b0b0b0]">Clique no ícone para alterar</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white mb-2 block">Nome</Label>
                  <Input
                    value={profile.name}
                    onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                    className="bg-[#1a1a1a] border-[#444444] text-white"
                  />
                </div>
                <div>
                  <Label className="text-white mb-2 block">Email</Label>
                  <Input
                    value={profile.email}
                    disabled
                    className="bg-[#1a1a1a] border-[#444444] text-[#b0b0b0]"
                  />
                </div>
              </div>

              <div>
                <Label className="text-white mb-2 block">Biografia</Label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Conte um pouco sobre você..."
                  rows={4}
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#444444] rounded-lg text-white placeholder:text-[#666] resize-none focus:outline-none focus:border-[#7e57c2]"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                    />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Alterações
                </Button>
              </div>
            </motion.div>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {/* Gemini */}
              <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-medium">Gemini API Key</h3>
                    <p className="text-sm text-[#b0b0b0]">Chave para geração de imagens</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('Gemini')}
                    disabled={testingConnection === 'Gemini'}
                    className="border-[#444444] text-white hover:bg-[#2a2a2a]"
                  >
                    {testingConnection === 'Gemini' ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                      />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Testar
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    type={showKeys.gemini ? 'text' : 'password'}
                    value={apiKeys.geminiApiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, geminiApiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    className="bg-[#1a1a1a] border-[#444444] text-white pr-10"
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, gemini: !showKeys.gemini })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-white"
                  >
                    {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Kling */}
              <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-white font-medium">Kling API Key</h3>
                    <p className="text-sm text-[#b0b0b0]">Chave para geração de vídeos</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testConnection('Kling')}
                    disabled={testingConnection === 'Kling'}
                    className="border-[#444444] text-white hover:bg-[#2a2a2a]"
                  >
                    {testingConnection === 'Kling' ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                      />
                    ) : (
                      <TestTube className="w-4 h-4 mr-2" />
                    )}
                    Testar
                  </Button>
                </div>
                <div className="relative mb-4">
                  <Input
                    type={showKeys.kling ? 'text' : 'password'}
                    value={apiKeys.klingApiKey}
                    onChange={(e) => setApiKeys({ ...apiKeys, klingApiKey: e.target.value })}
                    placeholder="Sua API Key..."
                    className="bg-[#1a1a1a] border-[#444444] text-white pr-10"
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, kling: !showKeys.kling })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-white"
                  >
                    {showKeys.kling ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showKeys.secret ? 'text' : 'password'}
                    value={apiKeys.klingSecret}
                    onChange={(e) => setApiKeys({ ...apiKeys, klingSecret: e.target.value })}
                    placeholder="Sua Secret Key..."
                    className="bg-[#1a1a1a] border-[#444444] text-white pr-10"
                  />
                  <button
                    onClick={() => setShowKeys({ ...showKeys, secret: !showKeys.secret })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-white"
                  >
                    {showKeys.secret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveApiKeys}
                  disabled={isSaving}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                    />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar API Keys
                </Button>
              </div>
            </motion.div>
          </TabsContent>

          {/* Preferences Tab */}
          <TabsContent value="preferences" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-white mb-2 block">Idioma</Label>
                  <select
                    value={preferences.language}
                    onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#444444] rounded-lg text-white"
                  >
                    <option value="pt-BR">Português (Brasil)</option>
                    <option value="en-US">English (US)</option>
                    <option value="es-ES">Español</option>
                  </select>
                </div>
                <div>
                  <Label className="text-white mb-2 block">Tema</Label>
                  <select
                    value={preferences.theme}
                    onChange={(e) => setPreferences({ ...preferences, theme: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#444444] rounded-lg text-white"
                  >
                    <option value="dark">Escuro</option>
                    <option value="light">Claro</option>
                    <option value="auto">Automático</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-white">Auto-salvar</Label>
                  <p className="text-sm text-[#b0b0b0]">Salvar automaticamente rascunhos</p>
                </div>
                <Switch
                  checked={preferences.autoSave}
                  onCheckedChange={(v) => setPreferences({ ...preferences, autoSave: v })}
                />
              </div>

              <div className="border-t border-[#444444] pt-6">
                <h4 className="text-white font-medium mb-4">Padrões de Geração</h4>
                
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white">Duração Padrão</Label>
                      <span className="text-[#7e57c2]">{preferences.defaultDuration}s</span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={preferences.defaultDuration}
                      onChange={(e) => setPreferences({ ...preferences, defaultDuration: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-white">CFG Scale Padrão</Label>
                      <span className="text-[#7e57c2]">{preferences.defaultCfgScale}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.1}
                      value={preferences.defaultCfgScale}
                      onChange={(e) => setPreferences({ ...preferences, defaultCfgScale: parseFloat(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSavePreferences}
                  disabled={isSaving}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                    />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Preferências
                </Button>
              </div>
            </motion.div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-0">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] space-y-6"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-white">Email quando concluir</Label>
                    <p className="text-sm text-[#b0b0b0]">Receba um email quando o vídeo for gerado</p>
                  </div>
                  <Switch
                    checked={notifications.emailOnComplete}
                    onCheckedChange={(v) => setNotifications({ ...notifications, emailOnComplete: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-white">Email em caso de falha</Label>
                    <p className="text-sm text-[#b0b0b0]">Receba um email se a geração falhar</p>
                  </div>
                  <Switch
                    checked={notifications.emailOnFail}
                    onCheckedChange={(v) => setNotifications({ ...notifications, emailOnFail: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-white">Notificações do navegador</Label>
                    <p className="text-sm text-[#b0b0b0]">Permitir notificações no desktop</p>
                  </div>
                  <Switch
                    checked={notifications.browserNotifications}
                    onCheckedChange={(v) => setNotifications({ ...notifications, browserNotifications: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-white">Emails de marketing</Label>
                    <p className="text-sm text-[#b0b0b0]">Receba novidades e promoções</p>
                  </div>
                  <Switch
                    checked={notifications.marketingEmails}
                    onCheckedChange={(v) => setNotifications({ ...notifications, marketingEmails: v })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveNotifications}
                  disabled={isSaving}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                >
                  {isSaving ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                    />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar Notificações
                </Button>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
