"""
Sistema de Agendamento e Auto-Postagem
Usa instagrapi (API privada) — sem Selenium
"""
import json
import os
import time
import random
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from pathlib import Path

from utils import HumanBehavior, logger, safe_execute, print_success, print_info, print_error
from config import config


@dataclass
class ScheduledPost:
    """Post agendado"""
    id: str
    content_type: str  # 'feed', 'story', 'reel'
    media_path: str
    caption: str
    hashtags: List[str]
    scheduled_time: str
    posted: bool = False
    posted_at: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self):
        return asdict(self)

    @property
    def is_due(self) -> bool:
        if self.posted:
            return False
        scheduled = datetime.fromisoformat(self.scheduled_time)
        now = datetime.now()
        return now >= scheduled and (now - scheduled).seconds < 300


class ContentScheduler:
    """Agendador inteligente de conteúdo via instagrapi"""

    def __init__(self, cl):
        self.cl = cl

        # Arquivos
        self.schedule_file = os.path.join(config.DATA_DIR, "content_schedule.json")
        self.templates_file = os.path.join(config.DATA_DIR, "caption_templates.json")

        # Dados
        self.posts_queue: List[ScheduledPost] = []
        self.templates: Dict = {}
        self._stop_event = threading.Event()

        self.load_data()
        self.load_templates()

    def load_data(self):
        try:
            from utils import load_json
            data = load_json(self.schedule_file, [])
            self.posts_queue = [ScheduledPost(**p) for p in data]
            logger.info(f"📅 {len(self.posts_queue)} posts carregados")
        except Exception as e:
            logger.error(f"Erro ao carregar agenda: {e}")
            self.posts_queue = []

    def save_data(self):
        try:
            from utils import save_json
            save_json([p.to_dict() for p in self.posts_queue], self.schedule_file)
        except Exception as e:
            logger.error(f"Erro ao salvar agenda: {e}")

    def load_templates(self):
        default = {
            "motivational": [
                "💪 {message}\n\n{hashtags}",
                "🔥 {message}\n\n{hashtags}",
                "✨ {message}\n\n{hashtags}"
            ],
            "educational": [
                "📚 {message}\n\n{hashtags}",
                "💡 {message}\n\n{hashtags}",
                "🎯 {message}\n\n{hashtags}"
            ],
            "engagement": [
                "👇 {message}\n\n{hashtags}",
                "🤔 {message}\n\n{hashtags}",
                "💬 {message}\n\n{hashtags}"
            ],
            "questions": [
                "Qual sua opinião? {message}\n\n{hashtags}",
                "Concorda? {message}\n\n{hashtags}",
                "Comenta! {message}\n\n{hashtags}"
            ],
            "messages": {
                "crescimento": [
                    "Qual sua meta de seguidores para este mês?",
                    "O que está te impedindo de crescer?",
                    "Consistência é a chave do sucesso!"
                ],
                "conteudo": [
                    "Que tipo de conteúdo você mais gosta?",
                    "Salva esse post para ver depois!",
                    "Marca alguém que precisa ver isso!"
                ],
                "engajamento": [
                    "Dê dois toques se concorda!",
                    "Comenta sua opinião!",
                    "Compartilha nos stories!"
                ]
            }
        }

        try:
            from utils import load_json
            self.templates = load_json(self.templates_file, default)
        except:
            self.templates = default
            self.save_templates()

    def save_templates(self):
        from utils import save_json
        save_json(self.templates, self.templates_file)

    def generate_caption(self, topic: str = "engajamento", style: str = "engagement") -> str:
        templates = self.templates.get(style, self.templates.get("engagement", ["{message}"]))
        template = random.choice(templates)

        messages = self.templates.get("messages", {}).get(topic, ["Conteúdo incrível!"])
        message = random.choice(messages)

        base_hashtags = config.TARGET_HASHTAGS[:10]
        hashtags = " ".join([f"#{tag}" for tag in base_hashtags])

        return template.format(message=message, hashtags=hashtags)

    def schedule_post(self, media_path: str, caption: str = "",
                     hashtags: List[str] = None,
                     post_datetime: datetime = None,
                     content_type: str = "feed") -> str:

        post_id = f"post_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{random.randint(1000, 9999)}"

        if not caption:
            caption = self.generate_caption()

        if not post_datetime:
            post_datetime = datetime.now() + timedelta(hours=1)

        scheduled = ScheduledPost(
            id=post_id,
            content_type=content_type,
            media_path=media_path,
            caption=caption,
            hashtags=hashtags or [],
            scheduled_time=post_datetime.isoformat()
        )

        self.posts_queue.append(scheduled)
        self.save_data()

        print_success(f"Post agendado para {post_datetime.strftime('%d/%m %H:%M')}")
        return post_id

    def list_scheduled(self) -> List[ScheduledPost]:
        return [p for p in self.posts_queue if not p.posted]

    def cancel_post(self, post_id: str) -> bool:
        for i, post in enumerate(self.posts_queue):
            if post.id == post_id and not post.posted:
                self.posts_queue.pop(i)
                self.save_data()
                print_success(f"Post {post_id} cancelado")
                return True
        return False

    # ============================================
    # PUBLICAÇÃO
    # ============================================

    def check_and_post(self) -> bool:
        for post in self.posts_queue:
            if post.is_due:
                logger.info(f"🚀 Publicando post: {post.id}")

                success = False
                try:
                    if post.content_type == "feed":
                        success = self._post_to_feed(post)
                    elif post.content_type == "story":
                        success = self._post_to_story(post)
                    elif post.content_type == "reel":
                        success = self._post_reel(post)
                    else:
                        post.error = f"Tipo não suportado: {post.content_type}"
                except Exception as e:
                    post.error = str(e)
                    logger.error(f"Erro ao publicar: {e}")

                if success:
                    post.posted = True
                    post.posted_at = datetime.now().isoformat()
                    print_success(f"Post publicado: {post.id}")

                self.save_data()
                return success

        return False

    @safe_execute(max_retries=2)
    def _post_to_feed(self, post: ScheduledPost) -> bool:
        """Publica no feed via Web API (foto ou vídeo)"""

        media_path = os.path.abspath(post.media_path)
        if not os.path.exists(media_path):
            raise FileNotFoundError(f"Arquivo não encontrado: {media_path}")

        full_caption = post.caption
        if post.hashtags:
            full_caption += "\n\n" + " ".join([f"#{tag}" for tag in post.hashtags])

        ext = os.path.splitext(media_path)[1].lower()

        if ext in ['.mp4', '.mov', '.avi', '.mkv']:
            result = self.cl.video_upload(media_path, caption=full_caption)
        else:
            result = self.cl.photo_upload(media_path, caption=full_caption)

        if result:
            logger.info(f"✅ Post publicado no feed: {post.id}")
            return True
        return False

    @safe_execute(max_retries=2)
    def _post_to_story(self, post: ScheduledPost) -> bool:
        """Publica story via Web API (foto ou vídeo)"""

        media_path = os.path.abspath(post.media_path)
        if not os.path.exists(media_path):
            raise FileNotFoundError(f"Arquivo não encontrado: {media_path}")

        ext = os.path.splitext(media_path)[1].lower()

        if ext in ['.mp4', '.mov', '.avi', '.mkv']:
            result = self.cl.video_upload_to_story(
                media_path, caption=post.caption[:50] if post.caption else ""
            )
        else:
            result = self.cl.photo_upload_to_story(
                media_path, caption=post.caption[:50] if post.caption else ""
            )

        if result:
            logger.info(f"✅ Story publicado: {post.id}")
            return True
        return False

    @safe_execute(max_retries=2)
    def _post_reel(self, post: ScheduledPost) -> bool:
        """Publica Reel via Web API"""

        media_path = os.path.abspath(post.media_path)
        if not os.path.exists(media_path):
            raise FileNotFoundError(f"Arquivo não encontrado: {media_path}")

        ext = os.path.splitext(media_path)[1].lower()
        if ext not in ['.mp4', '.mov', '.avi', '.mkv']:
            logger.error("Reels requerem arquivo de vídeo (.mp4, .mov, .avi)")
            return False

        full_caption = post.caption
        if post.hashtags:
            full_caption += "\n\n" + " ".join([f"#{tag}" for tag in post.hashtags])

        result = self.cl.clip_upload(media_path, caption=full_caption)

        if result:
            logger.info(f"✅ Reel publicado: {post.id}")
            return True
        return False

    # ============================================
    # AUTO-AGENDAMENTO
    # ============================================

    def auto_schedule_week(self, content_folder: str = None,
                          posts_per_day: int = None,
                          optimal_hours: List[int] = None):

        content_folder = content_folder or config.CONTENT_FOLDER
        posts_per_day = posts_per_day or config.POSTS_PER_DAY
        optimal_hours = optimal_hours or config.DEFAULT_POST_HOURS

        image_files = []
        for ext in ['*.jpg', '*.jpeg', '*.png']:
            image_files.extend(list(Path(content_folder).glob(ext)))

        if not image_files:
            print_error(f"Nenhuma imagem encontrada em {content_folder}")
            return 0

        print_info(f"Agendando {len(image_files)} posts ({posts_per_day}/dia)")

        now = datetime.now()
        scheduled = 0
        image_idx = 0

        for day_offset in range(7):
            for post_num in range(posts_per_day):
                if image_idx >= len(image_files):
                    break

                hour = optimal_hours[post_num % len(optimal_hours)]
                post_time = now + timedelta(days=day_offset)
                post_time = post_time.replace(
                    hour=hour,
                    minute=random.randint(0, 30),
                    second=0
                )

                if post_time < now:
                    post_time += timedelta(days=1)

                image = image_files[image_idx]

                topics = ["crescimento", "conteudo", "engajamento"]
                styles = ["motivational", "educational", "engagement", "questions"]
                caption = self.generate_caption(
                    topic=random.choice(topics),
                    style=random.choice(styles)
                )

                self.schedule_post(
                    str(image),
                    caption,
                    config.TARGET_HASHTAGS[:8],
                    post_time,
                    "feed"
                )

                scheduled += 1
                image_idx += 1

        print_success(f"{scheduled} posts agendados!")
        return scheduled

    # ============================================
    # DAEMON
    # ============================================

    def run_scheduler_daemon(self, check_interval: int = 300):
        print_info(f"Iniciando daemon de publicação (verificação a cada {check_interval}s)")

        while not self._stop_event.is_set():
            try:
                posted = self.check_and_post()
                if posted:
                    logger.info("✅ Post publicado pelo daemon")

                self._stop_event.wait(check_interval)

            except Exception as e:
                logger.error(f"Erro no daemon: {e}")
                self._stop_event.wait(60)

        print_info("Daemon de publicação encerrado")

    def stop_daemon(self):
        self._stop_event.set()

    def is_daemon_running(self) -> bool:
        return not self._stop_event.is_set()

# Importações
from utils import load_json, save_json, print_success, print_info, print_error
