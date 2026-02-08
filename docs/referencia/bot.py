"""
Bot Principal - Núcleo do Sistema
Usa API web do Instagram (endpoints /web/ e /api/v1/ via sessão de navegador)
para evitar checkpoint de IPs de datacenter.
"""
import os
import random
import time
from datetime import datetime

from instagram_web_api import InstagramWebAPI

from utils import (
    HumanBehavior, RateLimiter, logger,
    safe_execute, print_banner, print_success,
    print_error, print_info, print_warning
)
from config import config


class InstagramBot:
    """Bot principal de automação Instagram via Web API"""

    def __init__(self):
        self.cl = InstagramWebAPI()
        self.rate_limiter = RateLimiter()
        self.is_logged_in = False

        # Módulos (lazy loading)
        self._followers_manager = None
        self._growth_engine = None
        self._content_scheduler = None
        self._analytics_engine = None

        # Configurar proxy
        if config.PROXY_URL:
            self.cl.set_proxy(config.PROXY_URL)

    # ============================================
    # PROPRIEDADES DOS MÓDULOS
    # ============================================

    @property
    def followers_manager(self):
        if self._followers_manager is None:
            from followers_manager import FollowersManager
            self._followers_manager = FollowersManager(self.cl, self.rate_limiter)
        return self._followers_manager

    @property
    def growth_engine(self):
        if self._growth_engine is None:
            from growth_engine import GrowthEngine
            self._growth_engine = GrowthEngine(
                self.cl, self.rate_limiter, self.followers_manager
            )
        return self._growth_engine

    @property
    def content_scheduler(self):
        if self._content_scheduler is None:
            from content_scheduler import ContentScheduler
            self._content_scheduler = ContentScheduler(self.cl)
        return self._content_scheduler

    @property
    def analytics_engine(self):
        if self._analytics_engine is None:
            from analytics_engine import AnalyticsEngine
            self._analytics_engine = AnalyticsEngine(self.cl)
        return self._analytics_engine

    # ============================================
    # LOGIN
    # ============================================

    @safe_execute(max_retries=3)
    def login(self, force_new: bool = False) -> bool:
        """Realiza login no Instagram via Web API"""

        if not config.IG_USERNAME or not config.IG_PASSWORD:
            print_error("Credenciais não configuradas!")
            print_info("Configure IG_USERNAME e IG_PASSWORD no arquivo .env")
            return False

        # Tenta restaurar sessão salva
        if not force_new and os.path.exists(config.SESSION_FILE):
            try:
                print_info("Restaurando sessão anterior...")
                if self.cl.load_session(config.SESSION_FILE):
                    self.is_logged_in = True
                    print_success("Sessão restaurada com sucesso!")
                    return True
                else:
                    logger.warning("Sessão expirada, fazendo login novo...")
            except Exception as e:
                logger.warning(f"Sessão inválida: {e}")

        # Login novo via Web API
        print_info("Realizando login via Web API...")
        try:
            if self.cl.login(config.IG_USERNAME, config.IG_PASSWORD):
                self.cl.save_session(config.SESSION_FILE)
                self.is_logged_in = True
                print_success(f"Login realizado com sucesso! (userId={self.cl.user_id})")
                return True
            else:
                print_error("Login falhou!")
                print_info("Verifique suas credenciais no .env")
                print_info("Se o Instagram pedir verificação, resolva no celular e tente novamente.")
                return False

        except Exception as e:
            print_error(f"Erro no login: {e}")
            return False

    # ============================================
    # AÇÕES BÁSICAS
    # ============================================

    def like_post(self, post_url: str) -> bool:
        """Curte um post pela URL"""
        if not self.rate_limiter.can_perform('likes', config.MAX_LIKES_PER_HOUR):
            return False

        try:
            media_id = self.cl.media_pk_from_url(post_url)
            if not media_id:
                logger.warning(f"Não foi possível extrair media ID de: {post_url}")
                return False

            self.cl.media_like(media_id)
            self.rate_limiter.record_action('likes')
            logger.info(f"❤️  Post curtido: {post_url[:50]}...")
            HumanBehavior.random_delay(2, 5)
            return True

        except Exception as e:
            logger.warning(f"Erro ao curtir post: {e}")
            return False

    def like_media_by_id(self, media_id: str) -> bool:
        """Curte uma mídia pelo ID"""
        if not self.rate_limiter.can_perform('likes', config.MAX_LIKES_PER_HOUR):
            return False

        try:
            self.cl.media_like(media_id)
            self.rate_limiter.record_action('likes')
            HumanBehavior.random_delay(2, 5)
            return True
        except Exception as e:
            logger.warning(f"Erro ao curtir: {e}")
            return False

    # ============================================
    # MÉTODOS DE ALTO NÍVEL
    # ============================================

    def run_growth_session(self, session_type: str = "balanced"):
        """Executa sessão de crescimento completa"""
        if not self.is_logged_in:
            if not self.login():
                return
        self.growth_engine.run_growth_session(session_type)

    def upload_photo(self, image_path: str, caption: str = "") -> bool:
        """Upload de foto para o feed"""
        if not self.is_logged_in:
            if not self.login():
                return False
        result = self.cl.photo_upload(image_path, caption)
        return result is not None

    def upload_video(self, video_path: str, caption: str = "") -> bool:
        """Upload de vídeo para o feed"""
        if not self.is_logged_in:
            if not self.login():
                return False
        result = self.cl.video_upload(video_path, caption)
        return result is not None

    def upload_story_photo(self, image_path: str) -> bool:
        """Upload de foto para os Stories"""
        if not self.is_logged_in:
            if not self.login():
                return False
        result = self.cl.photo_upload_to_story(image_path)
        return result is not None

    def upload_story_video(self, video_path: str) -> bool:
        """Upload de vídeo para os Stories"""
        if not self.is_logged_in:
            if not self.login():
                return False
        result = self.cl.video_upload_to_story(video_path)
        return result is not None

    def upload_reel(self, video_path: str, caption: str = "") -> bool:
        """Upload de Reel (vídeo curto)"""
        if not self.is_logged_in:
            if not self.login():
                return False
        result = self.cl.clip_upload(video_path, caption)
        return result is not None

    def schedule_week_content(self, content_folder: str = None):
        """Agenda conteúdo para a semana"""
        if not self.is_logged_in:
            self.login()

        optimal = self.analytics_engine.export_best_times()
        hours = [optimal["primeiro_post"], optimal["segundo_post"]]

        self.content_scheduler.auto_schedule_week(
            content_folder=content_folder,
            posts_per_day=config.POSTS_PER_DAY,
            optimal_hours=hours
        )

    def analyze_and_report(self):
        """Analisa e gera relatório"""
        if not self.is_logged_in:
            self.login()
        print(self.analytics_engine.generate_report())

    def get_stats(self) -> dict:
        """Retorna estatísticas completas"""
        stats = {
            "rate_limiter": self.rate_limiter.get_stats(),
        }

        if self._followers_manager:
            stats["followers"] = self.followers_manager.get_stats()

        if self._growth_engine:
            stats["growth_weekly"] = self.growth_engine.get_weekly_report()

        return stats

    # ============================================
    # UTILITÁRIOS
    # ============================================

    def get_user_id(self, username: str) -> str:
        """Obtém user_id a partir do username"""
        uid = self.cl.get_user_id_from_username(username)
        return str(uid) if uid else ""

    def quit(self):
        """Encerra o bot"""
        if self.is_logged_in:
            try:
                self.cl.save_session(config.SESSION_FILE)
            except Exception:
                pass
        print_info("Bot encerrado")
