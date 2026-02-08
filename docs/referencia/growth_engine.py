"""
Motor de Crescimento Orgânico
Usa instagrapi (API privada) — sem Selenium
"""
import json
import os
import time
import random
from datetime import datetime, timedelta
from typing import List, Dict, Set, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict

from utils import HumanBehavior, RateLimiter, logger, safe_execute, print_success, print_info
from config import config

@dataclass
class GrowthStats:
    """Estatísticas de crescimento diário"""
    dia: str
    follows_realizados: int = 0
    unfollows_realizados: int = 0
    curtidas_enviadas: int = 0
    comentarios_enviados: int = 0
    stories_visualizados: int = 0
    posts_curtidos: int = 0

    def to_dict(self):
        return asdict(self)


class GrowthEngine:
    """Motor completo de crescimento orgânico via instagrapi"""

    def __init__(self, cl, rate_limiter, followers_manager):
        self.cl = cl
        self.rate_limiter = rate_limiter
        self.fm = followers_manager

        # Arquivos
        self.stats_file = os.path.join(config.DATA_DIR, "growth_stats.json")
        self.targets_file = os.path.join(config.DATA_DIR, "growth_targets.json")

        # Dados
        self.daily_stats: Dict[str, GrowthStats] = {}
        self.targets = self._load_targets()

        self._load_stats()

    def _load_stats(self):
        try:
            from utils import load_json
            data = load_json(self.stats_file, {})
            self.daily_stats = {k: GrowthStats(**v) for k, v in data.items()}
        except:
            self.daily_stats = {}

    def _save_stats(self):
        from utils import save_json
        save_json(
            {k: v.to_dict() for k, v in self.daily_stats.items()},
            self.stats_file
        )

    def _load_targets(self) -> Dict:
        from utils import load_json
        default = {
            "influenciadores": [],
            "concorrentes": [],
            "hashtags_populares": config.TARGET_HASHTAGS,
            "comentarios_templates": [
                "Conteúdo incrível! 🔥",
                "Muito bom mesmo! 👏",
                "Adorei isso! ❤️",
                "Que post fantástico! ✨",
                "Valeu pela dica! 🙌",
                "Salvando aqui! 💾",
                "Muito útil, obrigado! 🙏"
            ]
        }
        return load_json(self.targets_file, default)

    def save_targets(self):
        from utils import save_json
        save_json(self.targets, self.targets_file)

    def add_target_influencer(self, username: str, niche: str = ""):
        username = username.strip().lower()
        if username not in [t.get("username") for t in self.targets["influenciadores"]]:
            self.targets["influenciadores"].append({
                "username": username,
                "niche": niche,
                "added_at": datetime.now().isoformat()
            })
            self.save_targets()
            print_success(f"Influenciador @{username} adicionado")

    def _get_today_stats(self) -> GrowthStats:
        today = datetime.now().strftime("%Y-%m-%d")
        if today not in self.daily_stats:
            self.daily_stats[today] = GrowthStats(dia=today)
        return self.daily_stats[today]

    # ============================================
    # ESTRATÉGIA 1: FOLLOW EM CURTIDORES
    # ============================================

    @safe_execute(max_retries=2)
    def follow_recent_likers(self, post_url: str, max_follows: int = 15) -> int:
        """
        Segue quem curtiu posts recentes de influenciadores.
        Taxa de follow-back: 30-50%
        """
        print_info(f"Processando curtidores: {post_url[:60]}...")

        try:
            # Extrair shortcode da URL
            import re
            match = re.search(r'instagram\.com/(?:p|reel|tv)/([A-Za-z0-9_-]+)', post_url)
            if not match:
                logger.error(f"URL inválida: {post_url}")
                return 0
            shortcode = match.group(1)
            likers = self.cl.media_likers(shortcode)
        except Exception as e:
            logger.error(f"Erro ao obter curtidores: {e}")
            return 0

        followed = 0

        for user in likers:
            if followed >= max_follows:
                break

            username = user.username
            if username in self.fm.followed_users:
                continue

            if not self.rate_limiter.can_perform('follows', config.MAX_FOLLOWS_PER_HOUR):
                break

            try:
                self.cl.user_follow(user.pk)

                from followers_manager import UserProfile
                self.fm.followed_users[username] = UserProfile(
                    username=username,
                    user_id=str(user.pk),
                    followed_at=datetime.now().isoformat(),
                    source='recent_liker'
                )

                self.rate_limiter.record_action('follows')
                self._get_today_stats().follows_realizados += 1
                followed += 1

                logger.info(f"✅ Seguiu curtidor {followed}/{max_follows}: @{username}")
                HumanBehavior.random_delay(8, 15)

            except Exception as e:
                if 'wait' in str(e).lower() or '429' in str(e):
                    logger.warning("⏳ Rate limit. Pausando 5 min...")
                    time.sleep(300)
                    break
                logger.warning(f"Erro ao seguir @{username}: {e}")
                continue

        self._save_stats()
        self.fm.save_data()

        print_success(f"{followed} curtidores seguidos!")
        return followed

    # ============================================
    # ESTRATÉGIA 2: STORY ENGAGEMENT
    # ============================================

    def mass_story_engagement(self, hashtags: List[str], max_stories: int = 50) -> int:
        """
        Visualiza stories de usuários do nicho.
        Taxa de conversão: 5-10% visitam perfil.
        """
        print_info(f"Visualizando stories de {len(hashtags)} hashtags...")

        viewed = 0
        users_processed = set()

        for hashtag in hashtags[:3]:
            if viewed >= max_stories:
                break

            try:
                # Busca posts top da hashtag e descobre usuários
                medias = self.cl.hashtag_medias_top(hashtag, amount=20)

                for media in medias:
                    if viewed >= max_stories:
                        break

                    user_id = media.user.pk
                    if user_id in users_processed:
                        continue
                    users_processed.add(user_id)

                    try:
                        stories = self.cl.user_stories(user_id)
                        if stories:
                            # stories retorna list[dict], extrair IDs
                            story_ids = []
                            for s in stories[:5]:
                                sid = s.get('id') or s.get('pk') or str(s) if isinstance(s, dict) else str(s)
                                story_ids.append(str(sid))

                            if story_ids:
                                self.cl.story_seen(story_ids)

                                viewed += len(story_ids)
                                self._get_today_stats().stories_visualizados += len(story_ids)

                                logger.info(f"👀 Visto {len(story_ids)} stories de usuario {user_id}")
                                HumanBehavior.random_delay(2, 4)

                    except Exception as e:
                        if 'wait' in str(e).lower() or '429' in str(e):
                            logger.warning("⏳ Rate limit. Pausando 5 min...")
                            time.sleep(300)
                            break
                        logger.warning(f"Erro ao ver stories: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Erro na hashtag #{hashtag}: {e}")
                continue

        self._save_stats()
        print_success(f"{viewed} stories visualizados!")
        return viewed

    # ============================================
    # ESTRATÉGIA 3: COMENTÁRIOS ESTRATÉGICOS
    # ============================================

    def strategic_commenting(self, post_urls: List[str], max_comments: int = 10) -> int:
        """
        Comenta em posts de influenciadores.
        Exposição massiva = visitas ao perfil.
        """
        print_info(f"Comentando estrategicamente: {max_comments} comentários")

        commented = 0
        templates = self.targets.get("comentarios_templates", ["👏", "🔥", "❤️"])

        for post_url in post_urls[:max_comments + 3]:
            if commented >= max_comments:
                break

            if not post_url or not post_url.strip():
                continue

            try:
                media_id = self.cl.media_pk_from_url(post_url.strip())
                if not media_id:
                    continue

                comment_text = random.choice(templates)
                self.cl.media_comment(media_id, comment_text)

                commented += 1
                self._get_today_stats().comentarios_enviados += 1

                logger.info(f"💬 Comentado: '{comment_text}' em {post_url[:50]}")
                HumanBehavior.random_delay(30, 60)

            except Exception as e:
                if 'wait' in str(e).lower() or '429' in str(e):
                    logger.warning("⏳ Rate limit. Pausando 5 min...")
                    time.sleep(300)
                    break
                logger.error(f"Erro ao comentar: {e}")
                continue

        self._save_stats()
        print_success(f"{commented} comentários enviados!")
        return commented

    # ============================================
    # ESTRATÉGIA 4: LIKE EM HASHTAG
    # ============================================

    def like_by_hashtag(self, hashtag: str, max_likes: int = 30) -> int:
        """Curte posts de uma hashtag"""
        print_info(f"Curtindo posts de #{hashtag}")

        liked = 0
        hashtag = hashtag.strip().lstrip('#')

        try:
            medias = self.cl.hashtag_medias_top(hashtag, amount=max_likes)

            for media in medias:
                if liked >= max_likes:
                    break

                if not self.rate_limiter.can_perform('likes', config.MAX_LIKES_PER_HOUR):
                    break

                try:
                    self.cl.media_like(str(media.pk))
                    liked += 1
                    self._get_today_stats().curtidas_enviadas += 1
                    self.rate_limiter.record_action('likes')

                    logger.info(f"❤️  Curtido {liked}/{max_likes}")
                    HumanBehavior.random_delay(3, 6)

                except Exception as e:
                    if 'wait' in str(e).lower() or '429' in str(e):
                        logger.warning("⏳ Rate limit. Pausando 5 min...")
                        time.sleep(300)
                        break
                    continue

        except Exception as e:
            logger.error(f"Erro ao curtir por hashtag: {e}")

        self._save_stats()
        print_success(f"{liked} posts curtidos em #{hashtag}!")
        return liked

    # ============================================
    # SESSÃO COMPLETA
    # ============================================

    def run_growth_session(self, session_type: str = "balanced"):
        """
        Executa sessão completa de crescimento.

        session_type:
        - "aggressive": Máximo de ações (risco maior)
        - "balanced": Equilíbrio (recomendado)
        - "safe": Conservador (contas novas)
        """
        configs = {
            "aggressive": {
                "follows": 50, "unfollows": 50, "likes": 100,
                "comments": 15, "stories": 100, "likes_per_tag": 50
            },
            "balanced": {
                "follows": 30, "unfollows": 30, "likes": 60,
                "comments": 8, "stories": 50, "likes_per_tag": 30
            },
            "safe": {
                "follows": 15, "unfollows": 15, "likes": 30,
                "comments": 3, "stories": 20, "likes_per_tag": 15
            }
        }

        cfg = configs.get(session_type, configs["balanced"])

        print(f"""
╔══════════════════════════════════════════════════════════╗
║  🚀 SESSÃO DE CRESCIMENTO: {session_type.upper():12}               ║
╠══════════════════════════════════════════════════════════╣
║  Follows: {cfg['follows']:3}  |  Unfollows: {cfg['unfollows']:3}                    ║
║  Likes:   {cfg['likes']:3}  |  Comments:   {cfg['comments']:3}                    ║
║  Stories: {cfg['stories']:3}                                          ║
╚══════════════════════════════════════════════════════════╝
        """)

        # 1. UNFOLLOW PRIMEIRO
        print("\n📍 FASE 1: Limpando não-seguidores...")
        self.fm.clean_non_followers(cfg["unfollows"], days_before_unfollow=2)

        # 2. FOLLOW EM CURTIDORES
        print("\n📍 FASE 2: Follow em curtidores de influenciadores...")
        if self.targets["influenciadores"]:
            influencer = random.choice(self.targets["influenciadores"])
            post_url = self._get_recent_post(influencer["username"])
            if post_url:
                self.follow_recent_likers(post_url, cfg["follows"] // 2)

        # 3. FOLLOW EM SEGUIDORES DE CONCORRENTES
        remaining = cfg["follows"] - self._get_today_stats().follows_realizados
        if remaining > 0 and self.targets["concorrentes"]:
            print("\n📍 FASE 3: Follow em seguidores de concorrentes...")
            competitor = random.choice(self.targets["concorrentes"])
            self.fm.follow_followers_of_target(
                competitor if isinstance(competitor, str) else competitor["username"],
                max_follows=remaining
            )

        # 4. LIKE EM HASHTAGS
        print("\n📍 FASE 4: Curtindo posts de hashtags...")
        for hashtag in self.targets["hashtags_populares"][:2]:
            self.like_by_hashtag(hashtag, cfg["likes_per_tag"] // 2)
            HumanBehavior.random_delay(10, 20)

        # 5. STORY ENGAGEMENT
        print("\n📍 FASE 5: Visualizando stories...")
        self.mass_story_engagement(
            self.targets["hashtags_populares"][:3],
            cfg["stories"]
        )

        # 6. COMENTÁRIOS
        print("\n📍 FASE 6: Comentários estratégicos...")
        if self.targets["influenciadores"]:
            posts = []
            for inf in self.targets["influenciadores"][:2]:
                post = self._get_recent_post(inf["username"])
                if post:
                    posts.append(post)
            self.strategic_commenting(posts, cfg["comments"])

        # RELATÓRIO
        self._print_session_report()

    def _get_recent_post(self, username: str) -> Optional[str]:
        """Pega URL do post mais recente de um perfil"""
        try:
            user_id = self.cl.get_user_id_from_username(username)
            if not user_id:
                return None
            medias = self.cl.user_medias(user_id, amount=1)
            if medias:
                media = medias[0]
                return f"https://www.instagram.com/p/{media.code}/"
            return None
        except Exception as e:
            logger.warning(f"Erro ao buscar post de @{username}: {e}")
            return None

    def _print_session_report(self):
        stats = self._get_today_stats()

        report = f"""
╔══════════════════════════════════════════════════════════╗
║           📊 RELATÓRIO DA SESSÃO                         ║
╠══════════════════════════════════════════════════════════╣
║  📅 Data: {stats.dia}                                    ║
║  ➕ Follows:      {stats.follows_realizados:4}                          ║
║  ➖ Unfollows:    {stats.unfollows_realizados:4}                          ║
║  ❤️  Curtidas:     {stats.curtidas_enviadas:4}                          ║
║  💬 Comentários:  {stats.comentarios_enviados:4}                          ║
║  👀 Stories:      {stats.stories_visualizados:4}                          ║
╠══════════════════════════════════════════════════════════╣
║  📈 Projeção: ~{stats.follows_realizados * 0.3:.0f} novos seguidores (30% conv.)  ║
╚══════════════════════════════════════════════════════════╝
        """
        print(report)

    def get_weekly_report(self) -> dict:
        week_ago = datetime.now() - timedelta(days=7)
        weekly = defaultdict(int)

        for date_str, stats in self.daily_stats.items():
            date = datetime.strptime(date_str, "%Y-%m-%d")
            if date >= week_ago:
                for key, value in vars(stats).items():
                    if isinstance(value, int):
                        weekly[key] += value

        return dict(weekly)

# Importações
from utils import load_json, save_json
