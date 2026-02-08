"""
Gerenciamento Avançado de Seguidores
Usa API web do Instagram — sem Selenium, sem instagrapi
"""
import json
import os
import time
import random
from datetime import datetime, timedelta
from typing import List, Set, Dict, Optional
from dataclasses import dataclass, asdict
from collections import defaultdict

from utils import HumanBehavior, RateLimiter, logger, safe_execute
from config import config

@dataclass
class UserProfile:
    """Perfil de usuário seguido"""
    username: str
    user_id: str = ""
    followers_count: int = 0
    following_count: int = 0
    is_private: bool = False
    is_verified: bool = False
    followed_at: Optional[str] = None
    unfollowed_at: Optional[str] = None
    follows_back: Optional[bool] = None
    source: str = ""

    def to_dict(self):
        return asdict(self)

    @property
    def days_since_followed(self) -> int:
        if not self.followed_at:
            return 0
        followed_date = datetime.fromisoformat(self.followed_at)
        return (datetime.now() - followed_date).days


class FollowersManager:
    """Gerenciador completo de seguidores via instagrapi"""

    def __init__(self, cl, rate_limiter):
        self.cl = cl
        self.rate_limiter = rate_limiter

        # Arquivos de dados
        self.data_file = os.path.join(config.DATA_DIR, "followers_data.json")
        self.whitelist_file = os.path.join(config.DATA_DIR, "whitelist.json")
        self.stats_file = os.path.join(config.DATA_DIR, "follower_stats.json")

        # Dados em memória
        self.followed_users: Dict[str, UserProfile] = {}
        self.whitelist: Set[str] = set()
        self.daily_stats = defaultdict(int)

        self.load_data()

    def load_data(self):
        try:
            data = load_json(self.data_file, {})
            self.followed_users = {k: UserProfile(**v) for k, v in data.items()}
            logger.info(f"📂 Carregados {len(self.followed_users)} usuários do histórico")
        except Exception as e:
            logger.error(f"Erro ao carregar followers_data: {e}")
            self.followed_users = {}

        try:
            self.whitelist = set(load_json(self.whitelist_file, []))
            logger.info(f"🛡️  Whitelist: {len(self.whitelist)} usuários protegidos")
        except Exception as e:
            logger.error(f"Erro ao carregar whitelist: {e}")
            self.whitelist = set()

        self.daily_stats = defaultdict(int, load_json(self.stats_file, {}))

    def save_data(self):
        try:
            save_json({k: v.to_dict() for k, v in self.followed_users.items()}, self.data_file)
            save_json(list(self.whitelist), self.whitelist_file)
            save_json(dict(self.daily_stats), self.stats_file)
        except Exception as e:
            logger.error(f"Erro ao salvar dados: {e}")

    # ============================================
    # WHITELIST
    # ============================================

    def add_to_whitelist(self, username: str):
        username = username.lower().strip()
        self.whitelist.add(username)
        self.save_data()
        logger.info(f"🛡️  @{username} adicionado à whitelist")

    def remove_from_whitelist(self, username: str):
        username = username.lower().strip()
        self.whitelist.discard(username)
        self.save_data()
        logger.info(f"🗑️  @{username} removido da whitelist")

    def is_whitelisted(self, username: str) -> bool:
        return username.lower().strip() in self.whitelist

    # ============================================
    # COLETA DE DADOS
    # ============================================

    def get_followers_list(self, username: str, max_followers: int = 100) -> List[str]:
        """Coleta lista de seguidores de um perfil"""
        logger.info(f"🔍 Coletando seguidores de @{username}...")
        try:
            user_id = self.cl.get_user_id_from_username(username)
            if not user_id:
                logger.error(f"❌ Usuário @{username} não encontrado")
                return []
            followers = self.cl.user_followers(user_id, amount=max_followers)
            result = [u.username for u in followers]
            logger.info(f"✅ Coletados {len(result)} seguidores de @{username}")
            return result
        except Exception as e:
            logger.error(f"❌ Erro ao coletar seguidores: {e}")
            return []

    def get_following_list(self, max_following: int = 1000) -> List[str]:
        """Coleta lista de quem você segue"""
        logger.info("🔍 Coletando lista de seguindo...")
        try:
            user_id = int(self.cl.user_id)
            following = self.cl.user_following(user_id, amount=max_following)
            result = [u.username for u in following]
            logger.info(f"✅ Coletados {len(result)} seguindo")
            return result
        except Exception as e:
            logger.error(f"❌ Erro ao coletar seguindo: {e}")
            return []

    def check_if_follows_back(self, username: str) -> bool:
        """Verifica se um usuário segue você de volta"""
        try:
            user_id = self.cl.get_user_id_from_username(username)
            if not user_id:
                return False
            my_id = int(self.cl.user_id)
            # Verifica se nosso ID está na lista de seguindo do usuário
            user_following = self.cl.user_following(user_id, amount=200)
            return any(u.pk == my_id for u in user_following)
        except Exception as e:
            logger.error(f"Erro ao verificar @{username}: {e}")
            return False

    # ============================================
    # AÇÕES
    # ============================================

    @safe_execute(max_retries=2)
    def follow_user(self, username: str, source: str = "") -> bool:
        """Segue um usuário específico"""
        if not self.rate_limiter.can_perform('follows', config.MAX_FOLLOWS_PER_HOUR):
            return False

        if username in self.followed_users and not self.followed_users[username].unfollowed_at:
            logger.info(f"⏭️  Já segue @{username}")
            return False

        try:
            user_info = self.cl.get_user_info(username)
            if not user_info:
                logger.info(f"⏭️  Usuário @{username} não encontrado")
                return False

            user_id = user_info.pk
            if not self.cl.user_follow(user_id):
                logger.warning(f"Falha ao seguir @{username}")
                return False

            self.followed_users[username] = UserProfile(
                username=username,
                user_id=str(user_id),
                followers_count=user_info.follower_count or 0,
                following_count=user_info.following_count or 0,
                is_private=user_info.is_private,
                is_verified=user_info.is_verified,
                followed_at=datetime.now().isoformat(),
                source=source,
            )

            self.rate_limiter.record_action('follows')
            self.daily_stats['follows_today'] += 1
            self.save_data()

            logger.info(f"✅ Seguiu @{username}")
            HumanBehavior.random_delay(8, 15)
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao seguir @{username}: {e}")
            return False

    @safe_execute(max_retries=2)
    def unfollow_user(self, username: str, check_follows_back: bool = True) -> bool:
        """Deixa de seguir um usuário"""
        if self.is_whitelisted(username):
            logger.info(f"🛡️  @{username} está na whitelist")
            return False

        if not self.rate_limiter.can_perform('unfollows', config.MAX_UNFOLLOWS_PER_HOUR):
            return False

        try:
            # Verifica se segue de volta
            if check_follows_back:
                follows_back = self.check_if_follows_back(username)
                if follows_back:
                    logger.info(f"💚 @{username} segue de volta, mantendo")
                    if username in self.followed_users:
                        self.followed_users[username].follows_back = True
                        self.save_data()
                    return False

            user_id = self.cl.get_user_id_from_username(username)
            if not user_id:
                logger.info(f"⏭️  Usuário @{username} não encontrado")
                return False

            if not self.cl.user_unfollow(user_id):
                logger.warning(f"Falha ao unfollow @{username}")
                return False

            if username in self.followed_users:
                self.followed_users[username].unfollowed_at = datetime.now().isoformat()

            self.rate_limiter.record_action('unfollows')
            self.daily_stats['unfollows_today'] += 1
            self.save_data()

            logger.info(f"✅ Deixou de seguir @{username}")
            HumanBehavior.random_delay(5, 10)
            return True

        except Exception as e:
            logger.error(f"❌ Erro ao dar unfollow em @{username}: {e}")
            return False

    # ============================================
    # ESTRATÉGIAS
    # ============================================

    def follow_followers_of_target(self, target_username: str,
                                    max_follows: int = 20,
                                    min_followers: int = 50,
                                    max_followers: int = 10000,
                                    skip_private: bool = True) -> int:
        """Segue seguidores de um perfil alvo"""
        logger.info(f"🎯 Seguindo seguidores de @{target_username}")

        followers = self.get_followers_list(target_username, max_follows * 2)
        followed_count = 0

        for username in followers:
            if followed_count >= max_follows:
                break

            if username in self.followed_users:
                continue

            try:
                user_info = self.cl.get_user_info(username)
                if not user_info:
                    continue

                if skip_private and user_info.is_private:
                    continue

                user_followers = user_info.follower_count or 0
                if not (min_followers <= user_followers <= max_followers):
                    continue

                if self.follow_user(username, source=f"follower_of_{target_username}"):
                    followed_count += 1

            except Exception:
                continue

        logger.info(f"✅ Seguiu {followed_count} usuários de @{target_username}")
        return followed_count

    def clean_non_followers(self, max_unfollows: int = 50,
                           days_before_unfollow: int = 2) -> int:
        """Limpa quem não segue de volta"""
        logger.info("🧹 Iniciando limpeza de não-seguidores...")

        following = self.get_following_list()
        unfollowed_count = 0
        cutoff_date = datetime.now() - timedelta(days=days_before_unfollow)

        for username in following:
            if unfollowed_count >= max_unfollows:
                break

            if self.is_whitelisted(username):
                continue

            if username in self.followed_users:
                user = self.followed_users[username]
                if user.followed_at:
                    followed_date = datetime.fromisoformat(user.followed_at)
                    if followed_date > cutoff_date:
                        continue

            if self.unfollow_user(username, check_follows_back=True):
                unfollowed_count += 1

        logger.info(f"✅ Limpeza concluída: {unfollowed_count} unfollows")
        return unfollowed_count

    # ============================================
    # ESTATÍSTICAS
    # ============================================

    def get_stats(self) -> dict:
        total = len(self.followed_users)
        active = sum(1 for u in self.followed_users.values() if not u.unfollowed_at)
        unfollowed = total - active

        checked = [u for u in self.followed_users.values() if u.follows_back is not None]
        follow_backs = sum(1 for u in checked if u.follows_back)
        follow_back_rate = (follow_backs / len(checked) * 100) if checked else 0

        sources = defaultdict(int)
        for u in self.followed_users.values():
            sources[u.source] += 1

        return {
            "total_historico": total,
            "seguindo_ativamente": active,
            "unfollows_realizados": unfollowed,
            "whitelist": len(self.whitelist),
            "taxa_follow_back": f"{follow_back_rate:.1f}%",
            "por_fonte": dict(sources),
            "hoje": dict(self.daily_stats),
        }


# Importações no final para evitar circular
from utils import load_json, save_json
