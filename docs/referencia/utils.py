"""
Utilitários e funções auxiliares
"""
import os
import time
import random
import logging
import functools
from datetime import datetime
from typing import Optional, Callable, Any
from colorama import Fore, Style, init

# Inicializa colorama
init(autoreset=True)

# ============================================
# CONFIGURAÇÃO DE LOGGING
# ============================================

def setup_logging():
    """Configura o sistema de logs"""
    log_dir = "./logs"
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f"bot_{datetime.now().strftime('%Y%m%d')}.log")
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )
    
    return logging.getLogger(__name__)

logger = setup_logging()

# ============================================
# DECORADORES
# ============================================

def safe_execute(max_retries: int = 3, delay: float = 2.0):
    """
    Decorator para retry automático em caso de erro
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            for attempt in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    logger.warning(f"⚠️  Tentativa {attempt + 1}/{max_retries} falhou: {e}")
                    if attempt == max_retries - 1:
                        logger.error(f"❌ Todas as tentativas falharam para {func.__name__}")
                        raise
                    time.sleep(delay * (attempt + 1))
            return None
        return wrapper
    return decorator

def log_action(action_name: str):
    """Decorator para logar ações"""
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            logger.info(f"🚀 Iniciando: {action_name}")
            result = func(*args, **kwargs)
            logger.info(f"✅ Concluído: {action_name}")
            return result
        return wrapper
    return decorator

# ============================================
# COMPORTAMENTO HUMANO
# ============================================

class HumanBehavior:
    """Simula comportamento humano com delays variáveis"""
    
    @staticmethod
    def random_delay(min_sec: float = 2.0, max_sec: float = 5.0):
        """Delay aleatório entre ações"""
        delay = random.uniform(min_sec, max_sec)
        time.sleep(delay)
        return delay
    
    @staticmethod
    def long_delay():
        """Delay longo para simular leitura de conteúdo"""
        return HumanBehavior.random_delay(10.0, 20.0)
    
    @staticmethod
    def typing_delay(text: str, min_delay: float = 0.03, max_delay: float = 0.15):
        """Gera delays para simular digitação"""
        for char in text:
            time.sleep(random.uniform(min_delay, max_delay))
            yield char
    
    @staticmethod
    def scroll_pause():
        """Pausa após scroll"""
        return HumanBehavior.random_delay(1.0, 3.0)

# ============================================
# RATE LIMITER
# ============================================

class RateLimiter:
    """Controla limites de ações para evitar bloqueios"""
    
    def __init__(self):
        self.actions = {
            'likes': [],
            'follows': [],
            'unfollows': [],
            'comments': [],
            'stories': []
        }
    
    def can_perform(self, action_type: str, max_per_hour: int) -> bool:
        """Verifica se pode realizar ação sem exceder limites"""
        now = datetime.now().timestamp()
        hour_ago = now - 3600
        
        # Limpa ações antigas
        self.actions[action_type] = [
            ts for ts in self.actions[action_type] 
            if ts > hour_ago
        ]
        
        can_do = len(self.actions[action_type]) < max_per_hour
        
        if not can_do:
            logger.warning(f"⛔ Limite de '{action_type}' atingido ({len(self.actions[action_type])}/{max_per_hour})")
        
        return can_do
    
    def record_action(self, action_type: str):
        """Registra uma ação realizada"""
        self.actions[action_type].append(datetime.now().timestamp())
        logger.info(f"📝 Ação '{action_type}' registrada. Total/hora: {len(self.actions[action_type])}")
    
    def get_stats(self) -> dict:
        """Retorna estatísticas de ações"""
        now = datetime.now().timestamp()
        hour_ago = now - 3600
        
        stats = {}
        for action, timestamps in self.actions.items():
            recent = [ts for ts in timestamps if ts > hour_ago]
            stats[action] = len(recent)
        
        return stats
    
    def reset(self):
        """Reseta todos os contadores"""
        self.actions = {k: [] for k in self.actions}
        logger.info("🔄 Rate limiter resetado")

# ============================================
# UTILITÁRIOS DE INTERFACE
# ============================================

def print_banner():
    """Imprime banner do sistema"""
    banner = f"""
{Fore.CYAN}╔══════════════════════════════════════════════════════════╗
║                                                          ║
║     📱 INSTAGRAM GROWTH SUITE v2.0                      ║
║                                                          ║
║     Automação Inteligente de Crescimento                ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝{Style.RESET_ALL}
"""
    print(banner)

def print_menu():
    """Imprime menu principal"""
    menu = f"""
{Fore.YELLOW}╔══════════════════════════════════════════════════════════╗
║                    MENU PRINCIPAL                        ║
╠══════════════════════════════════════════════════════════╣
║                                                          ║
║  {Fore.GREEN}[1]{Fore.WHITE} 🚀 Sessão de Crescimento Completa                    ║
║  {Fore.GREEN}[2]{Fore.WHITE} 👥 Gerenciar Seguidores                              ║
║  {Fore.GREEN}[3]{Fore.WHITE} 📤 Agendar Conteúdo                                  ║
║  {Fore.GREEN}[4]{Fore.WHITE} 📊 Analytics e Horários                              ║
║  {Fore.GREEN}[5]{Fore.WHITE} ⚙️  Configurações                                    ║
║  {Fore.GREEN}[0]{Fore.WHITE} ❌ Sair                                              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝{Style.RESET_ALL}
"""
    print(menu)

def print_success(message: str):
    """Imprime mensagem de sucesso"""
    print(f"{Fore.GREEN}✅ {message}{Style.RESET_ALL}")

def print_error(message: str):
    """Imprime mensagem de erro"""
    print(f"{Fore.RED}❌ {message}{Style.RESET_ALL}")

def print_warning(message: str):
    """Imprime mensagem de aviso"""
    print(f"{Fore.YELLOW}⚠️  {message}{Style.RESET_ALL}")

def print_info(message: str):
    """Imprime mensagem informativa"""
    print(f"{Fore.CYAN}ℹ️  {message}{Style.RESET_ALL}")

# ============================================
# UTILITÁRIOS DE ARQUIVO
# ============================================

def ensure_dir(path: str):
    """Garante que diretório existe"""
    os.makedirs(path, exist_ok=True)

def save_json(data: dict, filepath: str):
    """Salva dados em JSON"""
    import json
    ensure_dir(os.path.dirname(filepath))
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def load_json(filepath: str, default: dict = None) -> dict:
    """Carrega dados de JSON"""
    import json
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default or {}

# ============================================
# UTILITÁRIOS DE DATA/HORA
# ============================================

def format_datetime(dt: datetime) -> str:
    """Formata datetime para exibição"""
    return dt.strftime("%d/%m/%Y %H:%M")

def parse_datetime(date_str: str) -> Optional[datetime]:
    """Parse de string para datetime"""
    try:
        return datetime.fromisoformat(date_str)
    except:
        return None

def time_until(target: datetime) -> str:
    """Calcula tempo até uma data"""
    now = datetime.now()
    diff = target - now
    
    if diff.total_seconds() <= 0:
        return "Agora"
    
    hours = int(diff.total_seconds() // 3600)
    minutes = int((diff.total_seconds() % 3600) // 60)
    
    if hours > 0:
        return f"{hours}h {minutes}min"
    return f"{minutes}min"
