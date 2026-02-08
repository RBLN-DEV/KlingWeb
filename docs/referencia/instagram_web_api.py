"""
Instagram Web API Client
Usa a API web do Instagram (mesmos endpoints do navegador)
para evitar checkpoint/challenge de IPs de datacenter.

A API mobile (instagrapi) bloqueia IPs de datacenter com
auth_platform checkpoint. A API web aceita esses IPs normalmente.
"""
import json
import os
import re
import time
import random
import logging
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass, field

import requests

logger = logging.getLogger(__name__)

# ============================================
# DATA CLASSES
# ============================================

@dataclass
class WebUser:
    """Perfil de usuário retornado pela API web"""
    pk: int = 0
    username: str = ""
    full_name: str = ""
    biography: str = ""
    follower_count: int = 0
    following_count: int = 0
    media_count: int = 0
    is_private: bool = False
    is_verified: bool = False
    profile_pic_url: str = ""
    external_url: str = ""


@dataclass
class WebMedia:
    """Mídia/post retornado pela API web"""
    pk: int = 0
    id: str = ""
    code: str = ""  # shortcode
    caption_text: str = ""
    like_count: int = 0
    comment_count: int = 0
    media_type: int = 1  # 1=photo, 2=video, 8=album
    taken_at: Optional[datetime] = None
    user: Optional[WebUser] = None
    image_url: str = ""


# ============================================
# WEB API CLIENT
# ============================================

class InstagramWebAPI:
    """
    Client para a API web do Instagram.
    Login via /accounts/login/ajax/ (mesmo que o navegador).
    Operações via endpoints /web/ e /api/v1/ com cookies de sessão.
    """

    BASE_URL = "https://www.instagram.com"
    API_URL = "https://www.instagram.com/api/v1"
    GRAPHQL_URL = "https://www.instagram.com/graphql/query"

    # Instagram Web App ID (público, usado pelo site)
    IG_APP_ID = "936619743392459"

    def __init__(self):
        self.session = requests.Session()
        self.user_id: Optional[str] = None
        self.username: Optional[str] = None
        self.csrf_token: str = ""
        self.is_authenticated: bool = False
        self._proxy: Optional[str] = None

        # Headers padrão (simula Chrome em Windows)
        self.session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/131.0.0.0 Safari/537.36"
            ),
            "Accept": "*/*",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Origin": self.BASE_URL,
            "Referer": f"{self.BASE_URL}/",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
        })

    # ============================================
    # CONFIGURAÇÃO
    # ============================================

    def set_proxy(self, proxy_url: str):
        """Define proxy HTTP(S)"""
        self._proxy = proxy_url
        self.session.proxies = {
            "http": proxy_url,
            "https": proxy_url,
        }
        logger.info(f"Proxy configurado: {proxy_url[:40]}...")

    def set_delay_range(self, min_sec: float, max_sec: float):
        """Define intervalo de delays entre requests"""
        self._delay_min = min_sec
        self._delay_max = max_sec

    def _delay(self, min_s: float = 1.0, max_s: float = 3.0):
        """Delay aleatório entre requests"""
        time.sleep(random.uniform(min_s, max_s))

    # ============================================
    # CSRF & REQUEST HELPERS
    # ============================================

    def _refresh_csrf(self):
        """Atualiza CSRF token dos cookies"""
        # Limpar cookies csrftoken duplicados (manter apenas o último)
        csrf_cookies = [c for c in self.session.cookies if c.name == "csrftoken"]
        if len(csrf_cookies) > 1:
            # Remover duplicados, manter o último
            for c in csrf_cookies[:-1]:
                self.session.cookies.clear(c.domain, c.path, c.name)

        csrf = self.session.cookies.get("csrftoken", "")
        if csrf:
            self.csrf_token = csrf
            self.session.headers["X-CSRFToken"] = csrf

    def _set_ajax_headers(self):
        """Configura headers para chamadas AJAX"""
        self._refresh_csrf()
        self.session.headers.update({
            "X-Requested-With": "XMLHttpRequest",
            "X-Instagram-AJAX": "1",
            "X-IG-App-ID": self.IG_APP_ID,
            "Content-Type": "application/x-www-form-urlencoded",
        })

    def _api_get(self, endpoint: str, params: dict = None, timeout: int = 15, retries: int = 2) -> dict:
        """GET request para API v1 web com retry automático em 429"""
        url = f"{self.API_URL}/{endpoint}"
        self._refresh_csrf()
        for attempt in range(retries + 1):
            try:
                self._delay(0.5, 1.5)  # delay entre requests
                r = self.session.get(url, params=params, timeout=timeout)
                r.raise_for_status()
                return r.json()
            except requests.exceptions.HTTPError:
                logger.error(f"API GET {endpoint}: HTTP {r.status_code}")
                if r.status_code == 429 and attempt < retries:
                    wait = 30 * (attempt + 1)
                    logger.warning(f"Rate limit (429). Aguardando {wait}s... (tentativa {attempt+1}/{retries})")
                    time.sleep(wait)
                    continue
                raise
            except Exception as e:
                logger.error(f"API GET {endpoint}: {e}")
                raise

    def _api_post(self, endpoint: str, data: dict = None, timeout: int = 15, retries: int = 2) -> dict:
        """POST request para API v1 web com retry automático em 429"""
        url = f"{self.API_URL}/{endpoint}"
        self._refresh_csrf()
        for attempt in range(retries + 1):
            try:
                self._delay(0.5, 1.5)  # delay entre requests
                r = self.session.post(url, data=data, timeout=timeout)
                r.raise_for_status()
                return r.json()
            except requests.exceptions.HTTPError:
                logger.error(f"API POST {endpoint}: HTTP {r.status_code}")
                if r.status_code == 429 and attempt < retries:
                    wait = 30 * (attempt + 1)
                    logger.warning(f"Rate limit (429). Aguardando {wait}s... (tentativa {attempt+1}/{retries})")
                    time.sleep(wait)
                    continue
                raise
            except Exception as e:
                logger.error(f"API POST {endpoint}: {e}")
                raise

    def _web_post(self, path: str, data: dict = None, timeout: int = 15) -> dict:
        """POST request para endpoints /web/"""
        url = f"{self.BASE_URL}{path}"
        self._refresh_csrf()
        try:
            r = self.session.post(url, data=data, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.exceptions.HTTPError as e:
            logger.error(f"WEB POST {path}: HTTP {r.status_code}")
            raise
        except Exception as e:
            logger.error(f"WEB POST {path}: {e}")
            raise

    # ============================================
    # LOGIN / SESSÃO
    # ============================================

    def login(self, username: str, password: str) -> bool:
        """
        Login via API web do Instagram.
        Retorna True se autenticado com sucesso.
        """
        logger.info(f"Iniciando login web para @{username}...")

        # 1. Visitar página principal para obter cookies/CSRF
        try:
            r = self.session.get(f"{self.BASE_URL}/", timeout=15)
            self._refresh_csrf()
        except Exception as e:
            logger.error(f"Erro ao acessar instagram.com: {e}")
            return False

        if not self.csrf_token:
            logger.error("Não foi possível obter token CSRF")
            return False

        # 2. Configurar headers AJAX
        self._set_ajax_headers()
        self._delay(1, 3)

        # 3. Login
        try:
            r = self.session.post(
                f"{self.BASE_URL}/accounts/login/ajax/",
                data={
                    "username": username,
                    "enc_password": f"#PWD_INSTAGRAM_BROWSER:0:{int(time.time())}:{password}",
                    "queryParams": "{}",
                    "optIntoOneTap": "false",
                },
                timeout=15,
            )

            data = r.json()
            logger.debug(f"Login response: {data}")

            if data.get("authenticated"):
                self.user_id = str(data.get("userId", ""))
                self.username = username
                self.is_authenticated = True
                self._refresh_csrf()
                logger.info(f"Login OK! userId={self.user_id}")
                return True

            elif data.get("checkpoint_url"):
                cp_url = data["checkpoint_url"]
                logger.warning(f"Checkpoint requerido: {cp_url}")
                return self._handle_checkpoint(cp_url)

            elif data.get("two_factor_required"):
                logger.warning("2FA requerido")
                return self._handle_2fa(username, password, data)

            else:
                msg = data.get("message", "Login falhou")
                logger.error(f"Login falhou: {msg}")
                return False

        except Exception as e:
            logger.error(f"Erro no login: {e}")
            return False

    def _handle_checkpoint(self, checkpoint_url: str) -> bool:
        """Tenta resolver checkpoint (verificação de segurança)"""
        full_url = (
            f"{self.BASE_URL}{checkpoint_url}"
            if checkpoint_url.startswith("/")
            else checkpoint_url
        )

        logger.info(f"Acessando checkpoint: {full_url}")
        try:
            self.session.get(full_url, timeout=15)
            self._refresh_csrf()

            # Tentar selecionar email (choice=1)
            r = self.session.post(full_url, data={"choice": "1"}, timeout=15)

            if r.status_code == 200:
                logger.info("Código de verificação enviado por email!")
                code = input("📱 Digite o código de verificação recebido por email: ").strip()

                r2 = self.session.post(full_url, data={"security_code": code}, timeout=15)
                if r2.status_code == 200 and self.session.cookies.get("sessionid"):
                    self.user_id = self.session.cookies.get("ds_user_id", "")
                    self.is_authenticated = True
                    self._refresh_csrf()
                    logger.info("Checkpoint resolvido com sucesso!")
                    return True

            logger.error("Não foi possível resolver o checkpoint automaticamente.")
            return False

        except Exception as e:
            logger.error(f"Erro ao resolver checkpoint: {e}")
            return False

    def _handle_2fa(self, username: str, password: str, login_data: dict) -> bool:
        """Resolve autenticação de dois fatores"""
        code = input("📱 Digite o código 2FA: ").strip()
        identifier = login_data.get("two_factor_info", {}).get("two_factor_identifier", "")

        try:
            r = self.session.post(
                f"{self.BASE_URL}/accounts/login/ajax/two_factor/",
                data={
                    "username": username,
                    "verificationCode": code,
                    "identifier": identifier,
                    "queryParams": "{}",
                },
                timeout=15,
            )
            data = r.json()
            if data.get("authenticated"):
                self.user_id = str(data.get("userId", ""))
                self.username = username
                self.is_authenticated = True
                self._refresh_csrf()
                return True
        except Exception as e:
            logger.error(f"Erro no 2FA: {e}")

        return False

    def logout(self):
        """Logout"""
        try:
            self._web_post("/accounts/logout/ajax/", data={"one_tap_app_login": "0"})
        except Exception:
            pass
        self.is_authenticated = False
        self.user_id = None
        self.username = None

    # ============================================
    # SESSÃO PERSISTENTE (SALVAR/CARREGAR)
    # ============================================

    def save_session(self, filepath: str):
        """Salva cookies e dados de sessão em arquivo"""
        data = {
            "cookies": dict(self.session.cookies),
            "user_id": self.user_id,
            "username": self.username,
            "csrf_token": self.csrf_token,
            "saved_at": datetime.now().isoformat(),
        }
        os.makedirs(os.path.dirname(filepath) or ".", exist_ok=True)
        with open(filepath, "w") as f:
            json.dump(data, f, indent=2)
        logger.info(f"Sessão salva em {filepath}")

    def load_session(self, filepath: str) -> bool:
        """Carrega sessão de arquivo. Retorna True se válida."""
        if not os.path.exists(filepath):
            return False

        try:
            with open(filepath) as f:
                data = json.load(f)

            # Limpar cookies antigos antes de restaurar
            self.session.cookies.clear()

            # Restaurar cookies
            for name, value in data.get("cookies", {}).items():
                self.session.cookies.set(name, value)

            self.user_id = data.get("user_id")
            self.username = data.get("username")
            self.csrf_token = data.get("csrf_token", "")
            self._set_ajax_headers()

            # Verificar se sessão ainda é válida
            if self._verify_session():
                self.is_authenticated = True
                logger.info(f"Sessão restaurada: @{self.username}")
                return True

            logger.warning("Sessão expirada")
            return False

        except Exception as e:
            logger.warning(f"Erro ao carregar sessão: {e}")
            return False

    def _verify_session(self) -> bool:
        """Verifica se a sessão está válida fazendo um request simples"""
        try:
            r = self.session.get(
                f"{self.API_URL}/accounts/edit/web_form_data/",
                timeout=10,
            )
            if r.status_code == 200:
                data = r.json()
                return data.get("status") == "ok" or "form_data" in data
            return False
        except Exception:
            return False

    # ============================================
    # PERFIL / USUÁRIO
    # ============================================

    def get_user_info(self, username: str) -> Optional[WebUser]:
        """Obtém informações de um perfil"""
        try:
            data = self._api_get(
                "users/web_profile_info/",
                params={"username": username},
            )
            user_data = data.get("data", {}).get("user", {})
            if not user_data:
                return None

            return WebUser(
                pk=int(user_data.get("id", 0)),
                username=user_data.get("username", ""),
                full_name=user_data.get("full_name", ""),
                biography=user_data.get("biography", ""),
                follower_count=user_data.get("edge_followed_by", {}).get("count", 0),
                following_count=user_data.get("edge_follow", {}).get("count", 0),
                media_count=user_data.get("edge_owner_to_timeline_media", {}).get("count", 0),
                is_private=user_data.get("is_private", False),
                is_verified=user_data.get("is_verified", False),
                profile_pic_url=user_data.get("profile_pic_url_hd", ""),
                external_url=user_data.get("external_url", ""),
            )
        except Exception as e:
            logger.error(f"Erro ao buscar perfil @{username}: {e}")
            return None

    def get_user_id_from_username(self, username: str) -> Optional[int]:
        """Obtém user ID a partir do username"""
        user = self.get_user_info(username)
        return user.pk if user else None

    def get_account_info(self) -> Optional[WebUser]:
        """Obtém informações da própria conta"""
        if self.username:
            return self.get_user_info(self.username)
        return None

    # ============================================
    # SEGUIDORES / SEGUINDO
    # ============================================

    def user_followers(self, user_id: int, amount: int = 50) -> List[WebUser]:
        """Lista seguidores de um usuário"""
        followers = []
        end_cursor = ""
        count = min(amount, 50)  # Máximo por request

        try:
            while len(followers) < amount:
                params = {
                    "count": count,
                    "search_surface": "follow_list_page",
                }
                if end_cursor:
                    params["max_id"] = end_cursor

                data = self._api_get(
                    f"friendships/{user_id}/followers/",
                    params=params,
                )

                users = data.get("users", [])
                for u in users:
                    followers.append(WebUser(
                        pk=u.get("pk", 0),
                        username=u.get("username", ""),
                        full_name=u.get("full_name", ""),
                        is_private=u.get("is_private", False),
                        is_verified=u.get("is_verified", False),
                        profile_pic_url=u.get("profile_pic_url", ""),
                    ))

                if not data.get("next_max_id"):
                    break
                end_cursor = data["next_max_id"]
                self._delay(1, 3)

        except Exception as e:
            logger.error(f"Erro ao listar followers de {user_id}: {e}")

        return followers[:amount]

    def user_following(self, user_id: int, amount: int = 50) -> List[WebUser]:
        """Lista quem um usuário segue"""
        following = []
        end_cursor = ""
        count = min(amount, 50)

        try:
            while len(following) < amount:
                params = {"count": count}
                if end_cursor:
                    params["max_id"] = end_cursor

                data = self._api_get(
                    f"friendships/{user_id}/following/",
                    params=params,
                )

                users = data.get("users", [])
                for u in users:
                    following.append(WebUser(
                        pk=u.get("pk", 0),
                        username=u.get("username", ""),
                        full_name=u.get("full_name", ""),
                        is_private=u.get("is_private", False),
                        is_verified=u.get("is_verified", False),
                    ))

                if not data.get("next_max_id"):
                    break
                end_cursor = data["next_max_id"]
                self._delay(1, 3)

        except Exception as e:
            logger.error(f"Erro ao listar following de {user_id}: {e}")

        return following[:amount]

    # ============================================
    # FOLLOW / UNFOLLOW
    # ============================================

    def user_follow(self, user_id: int) -> bool:
        """Segue um usuário"""
        try:
            data = self._web_post(f"/web/friendships/{user_id}/follow/")
            result = data.get("result", "")
            status = data.get("status", "")
            if result == "following" or status == "ok":
                logger.info(f"Seguiu user_id={user_id}")
                return True
            logger.warning(f"Follow retornou: {data}")
            return False
        except Exception as e:
            logger.error(f"Erro ao seguir {user_id}: {e}")
            return False

    def user_unfollow(self, user_id: int) -> bool:
        """Deixa de seguir um usuário"""
        try:
            data = self._web_post(f"/web/friendships/{user_id}/unfollow/")
            status = data.get("status", "")
            if status == "ok":
                logger.info(f"Unfollowed user_id={user_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Erro ao unfollow {user_id}: {e}")
            return False

    # ============================================
    # CURTIR / DESCURTIR
    # ============================================

    def media_like(self, media_id: str) -> bool:
        """Curte uma mídia"""
        try:
            data = self._web_post(f"/web/likes/{media_id}/like/")
            if data.get("status") == "ok":
                logger.info(f"Curtiu media_id={media_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Erro ao curtir {media_id}: {e}")
            return False

    def media_unlike(self, media_id: str) -> bool:
        """Descurte uma mídia"""
        try:
            data = self._web_post(f"/web/likes/{media_id}/unlike/")
            return data.get("status") == "ok"
        except Exception as e:
            logger.error(f"Erro ao descurtir {media_id}: {e}")
            return False

    # ============================================
    # COMENTÁRIOS
    # ============================================

    def media_comment(self, media_id: str, text: str) -> bool:
        """Comenta em uma mídia"""
        try:
            data = self._web_post(
                f"/web/comments/{media_id}/add/",
                data={"comment_text": text},
            )
            if data.get("status") == "ok":
                logger.info(f"Comentou em media_id={media_id}")
                return True
            return False
        except Exception as e:
            logger.error(f"Erro ao comentar {media_id}: {e}")
            return False

    # ============================================
    # MÍDIAS / POSTS
    # ============================================

    def user_medias(self, user_id: int, amount: int = 12) -> List[WebMedia]:
        """Obtém mídias recentes de um usuário via GraphQL"""
        medias = []
        try:
            # Primeiro tentar pegar do web_profile_info que já vem com mídias
            # Buscar username pelo user_id (se não tiver)
            r = self.session.get(
                f"{self.BASE_URL}/graphql/query/",
                params={
                    "query_hash": "58b6785bea111c67129decfb136ab174",
                    "variables": json.dumps({
                        "id": str(user_id),
                        "first": min(amount, 50),
                    }),
                },
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                edges = (
                    data.get("data", {})
                    .get("user", {})
                    .get("edge_owner_to_timeline_media", {})
                    .get("edges", [])
                )
                for edge in edges[:amount]:
                    node = edge.get("node", {})
                    taken_at = None
                    if node.get("taken_at_timestamp"):
                        taken_at = datetime.fromtimestamp(node["taken_at_timestamp"])

                    medias.append(WebMedia(
                        pk=int(node.get("id", 0)),
                        id=node.get("id", ""),
                        code=node.get("shortcode", ""),
                        caption_text=(node.get("edge_media_to_caption", {})
                                      .get("edges", [{}])[0]
                                      .get("node", {})
                                      .get("text", "")) if node.get("edge_media_to_caption", {}).get("edges") else "",
                        like_count=node.get("edge_liked_by", {}).get("count", 0),
                        comment_count=node.get("edge_media_to_comment", {}).get("count", 0),
                        media_type=1 if not node.get("is_video") else 2,
                        taken_at=taken_at,
                        image_url=node.get("display_url", ""),
                        user=WebUser(pk=int(node.get("owner", {}).get("id", 0))),
                    ))

        except Exception as e:
            logger.error(f"Erro ao buscar mídias de {user_id}: {e}")

        return medias

    def media_likers(self, media_shortcode: str, amount: int = 50) -> List[WebUser]:
        """Lista quem curtiu uma mídia"""
        likers = []
        try:
            r = self.session.get(
                f"{self.GRAPHQL_URL}/",
                params={
                    "query_hash": "d5d763b1e2acf209d62d22d184f1b5f2",
                    "variables": json.dumps({
                        "shortcode": media_shortcode,
                        "first": min(amount, 50),
                    }),
                },
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                edges = (
                    data.get("data", {})
                    .get("shortcode_media", {})
                    .get("edge_liked_by", {})
                    .get("edges", [])
                )
                for edge in edges[:amount]:
                    node = edge.get("node", {})
                    likers.append(WebUser(
                        pk=int(node.get("id", 0)),
                        username=node.get("username", ""),
                        full_name=node.get("full_name", ""),
                        is_private=node.get("is_private", False),
                        is_verified=node.get("is_verified", False),
                        profile_pic_url=node.get("profile_pic_url", ""),
                    ))

        except Exception as e:
            logger.error(f"Erro ao buscar likers: {e}")

        return likers

    def hashtag_medias_top(self, hashtag: str, amount: int = 20) -> List[WebMedia]:
        """Busca mídias top de uma hashtag"""
        medias = []
        hashtag = hashtag.strip().lstrip("#")

        try:
            r = self.session.get(
                f"{self.GRAPHQL_URL}/",
                params={
                    "query_hash": "174a21c41ef669bdf70474b0a94ee3ad",
                    "variables": json.dumps({
                        "tag_name": hashtag,
                        "first": min(amount, 50),
                    }),
                },
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                edges = (
                    data.get("data", {})
                    .get("hashtag", {})
                    .get("edge_hashtag_to_top_posts", {})
                    .get("edges", [])
                )
                # Também tentar mídias recentes
                recent_edges = (
                    data.get("data", {})
                    .get("hashtag", {})
                    .get("edge_hashtag_to_media", {})
                    .get("edges", [])
                )
                all_edges = edges + recent_edges

                for edge in all_edges[:amount]:
                    node = edge.get("node", {})
                    taken_at = None
                    if node.get("taken_at_timestamp"):
                        taken_at = datetime.fromtimestamp(node["taken_at_timestamp"])

                    medias.append(WebMedia(
                        pk=int(node.get("id", 0)),
                        id=node.get("id", ""),
                        code=node.get("shortcode", ""),
                        caption_text=(
                            (node.get("edge_media_to_caption", {})
                             .get("edges", [{}])[0]
                             .get("node", {})
                             .get("text", ""))
                            if node.get("edge_media_to_caption", {}).get("edges")
                            else ""
                        ),
                        like_count=node.get("edge_liked_by", {}).get("count", 0),
                        comment_count=node.get("edge_media_to_comment", {}).get("count", 0),
                        media_type=1 if not node.get("is_video") else 2,
                        taken_at=taken_at,
                        image_url=node.get("display_url", ""),
                        user=WebUser(
                            pk=int(node.get("owner", {}).get("id", 0)),
                            username=node.get("owner", {}).get("username", ""),
                        ),
                    ))

        except Exception as e:
            logger.error(f"Erro na hashtag #{hashtag}: {e}")

        return medias

    # ============================================
    # STORIES
    # ============================================

    def user_stories(self, user_id: int) -> List[dict]:
        """Obtém stories de um usuário"""
        try:
            data = self._api_get(
                f"feed/user/{user_id}/story/",
            )
            reel = data.get("reel", {})
            items = reel.get("items", []) if reel else []
            return items
        except Exception as e:
            logger.error(f"Erro ao buscar stories de {user_id}: {e}")
            return []

    def story_seen(self, story_ids: List[str], reel_ids: List[str] = None) -> bool:
        """Marca stories como vistos"""
        try:
            # Montar payload de visualização
            reels = {}
            timestamp = str(int(time.time()))
            for i, sid in enumerate(story_ids):
                reel_id = reel_ids[i] if reel_ids and i < len(reel_ids) else sid.split("_")[1] if "_" in str(sid) else str(sid)
                reels[f"{sid}_{reel_id}"] = [f"{timestamp}_{timestamp}"]

            data = self._api_post(
                "stories/reel/seen/",
                data={
                    "reelMediaId": story_ids[0] if story_ids else "",
                    "reelMediaOwnerId": "",
                    "reelId": "",
                    "reelMediaTakenAt": timestamp,
                    "viewSeenAt": timestamp,
                },
            )
            return data.get("status") == "ok"
        except Exception as e:
            logger.error(f"Erro ao marcar stories vistos: {e}")
            return False

    # ============================================
    # HELPERS DE UPLOAD
    # ============================================

    @staticmethod
    def _get_video_info(video_path: str) -> Dict[str, Any]:
        """Extrai metadados do vídeo via ffprobe"""
        try:
            cmd = [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_streams", "-show_format", video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            data = json.loads(result.stdout)

            video_stream = None
            for stream in data.get("streams", []):
                if stream.get("codec_type") == "video":
                    video_stream = stream
                    break

            if not video_stream:
                raise ValueError("Nenhum stream de vídeo encontrado")

            duration = float(data.get("format", {}).get("duration", 0))
            width = int(video_stream.get("width", 0))
            height = int(video_stream.get("height", 0))

            return {
                "duration": duration,
                "duration_ms": int(duration * 1000),
                "width": width,
                "height": height,
            }
        except FileNotFoundError:
            logger.warning("ffprobe não disponível. Usando valores padrão.")
            return {"duration": 15.0, "duration_ms": 15000, "width": 1080, "height": 1920}
        except Exception as e:
            logger.warning(f"Erro ao extrair info do vídeo: {e}")
            return {"duration": 15.0, "duration_ms": 15000, "width": 1080, "height": 1920}

    @staticmethod
    def _extract_thumbnail(video_path: str, output_path: str = None) -> Optional[str]:
        """Extrai primeiro frame do vídeo como thumbnail"""
        if not output_path:
            output_path = video_path.rsplit(".", 1)[0] + "_thumb.jpg"
        try:
            cmd = [
                "ffmpeg", "-y", "-i", video_path,
                "-vframes", "1", "-q:v", "2", output_path
            ]
            subprocess.run(cmd, capture_output=True, timeout=30)
            if os.path.exists(output_path):
                return output_path
        except Exception as e:
            logger.warning(f"Erro ao extrair thumbnail: {e}")
        return None

    def _upload_photo_binary(self, image_path: str, upload_id: str,
                              is_story: bool = False) -> bool:
        """Upload de foto binária para o CDN do Instagram (rupload_igphoto)"""
        with open(image_path, "rb") as f:
            image_data = f.read()

        ext = os.path.splitext(image_path)[1].lower()
        content_type = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        }.get(ext, "image/jpeg")

        upload_name = f"{upload_id}_0_{random.randint(1000000000, 9999999999)}"

        rupload_params = {
            "retry_context": json.dumps({
                "num_step_auto_retry": 0, "num_reupload": 0, "num_step_manual_retry": 0
            }),
            "media_type": "1",
            "xsharing_user_ids": "[]",
            "upload_id": upload_id,
            "image_compression": json.dumps({
                "lib_name": "moz", "lib_version": "3.1.m", "quality": "80"
            }),
        }

        headers = {
            "X-Entity-Name": upload_name,
            "X-Entity-Length": str(len(image_data)),
            "X-Entity-Type": content_type,
            "X-Instagram-Rupload-Params": json.dumps(rupload_params),
            "Offset": "0",
            "Content-Type": "application/octet-stream",
        }

        r = self.session.post(
            f"https://www.instagram.com/rupload_igphoto/{upload_name}",
            data=image_data,
            headers=headers,
            timeout=60,
        )

        if r.status_code == 200:
            logger.info(f"Foto uploaded: {r.json().get('status', 'ok')}")
            return True
        else:
            logger.error(f"Upload foto falhou: HTTP {r.status_code}")
            return False

    def _upload_video_binary(self, video_path: str, upload_id: str,
                              video_info: dict,
                              is_clips: bool = False,
                              is_story: bool = False) -> bool:
        """Upload de vídeo binário para o CDN do Instagram (rupload_igvideo)"""
        with open(video_path, "rb") as f:
            video_data = f.read()

        waterfall_id = str(uuid.uuid4())
        upload_name = f"{upload_id}_0_{random.randint(1000000000, 9999999999)}"

        rupload_params = {
            "retry_context": json.dumps({
                "num_step_auto_retry": 0, "num_reupload": 0, "num_step_manual_retry": 0
            }),
            "media_type": "2",
            "xsharing_user_ids": json.dumps([str(self.user_id)]) if self.user_id else "[]",
            "upload_id": upload_id,
            "upload_media_duration_ms": str(video_info["duration_ms"]),
            "upload_media_width": str(video_info["width"]),
            "upload_media_height": str(video_info["height"]),
        }

        if is_clips:
            rupload_params["is_clips_video"] = "1"
        if is_story:
            rupload_params["extract_cover_frame"] = "1"
            rupload_params["content_tags"] = "has-overlay"
            rupload_params["for_album"] = "1"

        rp_json = json.dumps(rupload_params)

        # Fase 1: Inicializar upload (GET)
        init_headers = {
            "Accept-Encoding": "gzip, deflate",
            "X-Instagram-Rupload-Params": rp_json,
            "X_FB_VIDEO_WATERFALL_ID": waterfall_id,
            "X-Entity-Type": "video/mp4",
            "X-Entity-Name": upload_name,
            "X-Entity-Length": str(len(video_data)),
        }

        r_init = self.session.get(
            f"https://www.instagram.com/rupload_igvideo/{upload_name}",
            headers=init_headers,
            timeout=30,
        )
        logger.debug(f"Video init: {r_init.status_code}")

        # Fase 2: Enviar bytes (POST)
        upload_headers = {
            "Offset": "0",
            "X-Entity-Name": upload_name,
            "X-Entity-Length": str(len(video_data)),
            "Content-Type": "application/octet-stream",
            "X-Entity-Type": "video/mp4",
            "X-Instagram-Rupload-Params": rp_json,
            "X_FB_VIDEO_WATERFALL_ID": waterfall_id,
        }

        r = self.session.post(
            f"https://www.instagram.com/rupload_igvideo/{upload_name}",
            data=video_data,
            headers=upload_headers,
            timeout=120,
        )

        if r.status_code == 200:
            logger.info(f"Vídeo uploaded: {r.json().get('status', 'ok')}")
            return True
        else:
            logger.error(f"Upload vídeo falhou: HTTP {r.status_code}")
            return False

    # ============================================
    # UPLOAD: FOTO NO FEED
    # ============================================

    def photo_upload(self, image_path: str, caption: str = "") -> Optional[dict]:
        """Upload de foto para o feed"""
        if not os.path.exists(image_path):
            logger.error(f"Arquivo não encontrado: {image_path}")
            return None

        try:
            upload_id = str(int(time.time() * 1000))

            if not self._upload_photo_binary(image_path, upload_id):
                return None

            self._delay(2, 4)
            self._refresh_csrf()

            configure_data = {
                "upload_id": upload_id,
                "caption": caption,
                "usertags": "",
                "custom_accessibility_caption": "",
                "retry_timeout": "",
            }

            r = self.session.post(
                f"{self.API_URL}/media/configure/",
                data=configure_data,
                timeout=15,
            )

            if r.status_code == 200:
                result = r.json()
                if result.get("status") == "ok":
                    media = result.get("media", {})
                    code = media.get("code", "")
                    logger.info(f"📸 Foto publicada no feed! https://instagram.com/p/{code}")
                    return result
                else:
                    logger.error(f"Configure feed falhou: {result}")
            else:
                logger.error(f"Configure feed HTTP {r.status_code}")

            return None
        except Exception as e:
            logger.error(f"Erro no upload de foto: {e}")
            return None

    # ============================================
    # UPLOAD: VÍDEO NO FEED
    # ============================================

    def video_upload(self, video_path: str, caption: str = "",
                     thumbnail_path: str = None) -> Optional[dict]:
        """Upload de vídeo para o feed"""
        if not os.path.exists(video_path):
            logger.error(f"Arquivo não encontrado: {video_path}")
            return None

        try:
            upload_id = str(int(time.time() * 1000))
            video_info = self._get_video_info(video_path)

            logger.info(f"📹 Enviando vídeo: {video_info['width']}x{video_info['height']}, "
                        f"{video_info['duration']:.1f}s")

            # 1. Upload do vídeo
            if not self._upload_video_binary(video_path, upload_id, video_info):
                return None

            # 2. Upload da thumbnail (se fornecida ou extrair)
            thumb = thumbnail_path
            if not thumb:
                thumb = self._extract_thumbnail(video_path)
            if thumb:
                self._upload_photo_binary(thumb, upload_id)
                # Limpar thumbnail temporária
                if not thumbnail_path and os.path.exists(thumb):
                    os.remove(thumb)

            self._delay(3, 6)
            self._refresh_csrf()

            # 3. Configurar o post
            now_str = datetime.now().strftime("%Y%m%dT%H%M%S.000")
            configure_data = {
                "upload_id": upload_id,
                "caption": caption,
                "source_type": "4",
                "filter_type": "0",
                "poster_frame_index": "0",
                "length": str(video_info["duration"]),
                "audio_muted": "false",
                "usertags": json.dumps({"in": []}),
                "date_time_original": now_str,
                "timezone_offset": "-10800",
                "clips": json.dumps([{
                    "length": video_info["duration"],
                    "source_type": "4"
                }]),
                "extra": json.dumps({
                    "source_width": video_info["width"],
                    "source_height": video_info["height"]
                }),
            }

            r = self.session.post(
                f"{self.API_URL}/media/configure/?video=1",
                data=configure_data,
                timeout=30,
            )

            if r.status_code == 200:
                result = r.json()
                if result.get("status") == "ok":
                    media = result.get("media", {})
                    code = media.get("code", "")
                    logger.info(f"📹 Vídeo publicado no feed! https://instagram.com/p/{code}")
                    return result
                else:
                    logger.error(f"Configure vídeo feed falhou: {result}")
            else:
                logger.error(f"Configure vídeo feed HTTP {r.status_code}")

            return None
        except Exception as e:
            logger.error(f"Erro no upload de vídeo: {e}")
            return None

    # ============================================
    # UPLOAD: FOTO NOS STORIES
    # ============================================

    def photo_upload_to_story(self, image_path: str, caption: str = "") -> Optional[dict]:
        """Upload de foto para os Stories"""
        if not os.path.exists(image_path):
            logger.error(f"Arquivo não encontrado: {image_path}")
            return None

        try:
            upload_id = str(int(time.time() * 1000))

            if not self._upload_photo_binary(image_path, upload_id, is_story=True):
                return None

            self._delay(2, 4)
            self._refresh_csrf()

            now = int(time.time())
            configure_data = {
                "upload_id": upload_id,
                "source_type": "4",
                "configure_mode": "1",
                "timezone_offset": "-10800",
                "client_shared_at": str(now - 5),
                "client_timestamp": str(now),
                "capture_type": "normal",
                "creation_surface": "camera",
                "camera_entry_point": "25",
                "original_media_type": "photo",
                "has_original_sound": "1",
                "camera_session_id": str(uuid.uuid4()),
                "composition_id": str(uuid.uuid4()),
                "filter_type": "0",
                "_uid": str(self.user_id) if self.user_id else "",
                "_uuid": str(uuid.uuid4()),
            }

            r = self.session.post(
                f"{self.API_URL}/media/configure_to_story/",
                data=configure_data,
                timeout=15,
            )

            if r.status_code == 200:
                result = r.json()
                if result.get("status") == "ok":
                    logger.info("📱 Foto publicada nos Stories!")
                    return result
                else:
                    logger.error(f"Configure story falhou: {result}")
            else:
                logger.error(f"Configure story HTTP {r.status_code}")

            return None
        except Exception as e:
            logger.error(f"Erro no upload de story (foto): {e}")
            return None

    # ============================================
    # UPLOAD: VÍDEO NOS STORIES
    # ============================================

    def video_upload_to_story(self, video_path: str, caption: str = "",
                               thumbnail_path: str = None) -> Optional[dict]:
        """Upload de vídeo para os Stories (máx 60s)"""
        if not os.path.exists(video_path):
            logger.error(f"Arquivo não encontrado: {video_path}")
            return None

        try:
            upload_id = str(int(time.time() * 1000))
            video_info = self._get_video_info(video_path)

            if video_info["duration"] > 60:
                logger.warning("Stories permitem no máximo 60 segundos de vídeo")

            logger.info(f"📱 Enviando story vídeo: {video_info['duration']:.1f}s")

            # 1. Upload do vídeo
            if not self._upload_video_binary(video_path, upload_id, video_info,
                                              is_story=True):
                return None

            # 2. Upload da thumbnail
            thumb = thumbnail_path
            if not thumb:
                thumb = self._extract_thumbnail(video_path)
            if thumb:
                self._upload_photo_binary(thumb, upload_id, is_story=True)
                if not thumbnail_path and os.path.exists(thumb):
                    os.remove(thumb)

            self._delay(3, 6)
            self._refresh_csrf()

            # 3. Configurar story
            now = int(time.time())
            configure_data = {
                "upload_id": upload_id,
                "source_type": "3",
                "configure_mode": "1",
                "timezone_offset": "-10800",
                "client_shared_at": str(now - 7),
                "client_timestamp": str(now),
                "capture_type": "normal",
                "creation_surface": "camera",
                "camera_entry_point": "25",
                "original_media_type": "video",
                "has_original_sound": "1",
                "camera_session_id": str(uuid.uuid4()),
                "composition_id": str(uuid.uuid4()),
                "filter_type": "0",
                "video_result": "",
                "camera_position": "back",
                "length": str(video_info["duration"]),
                "clips": json.dumps([{
                    "length": video_info["duration"],
                    "source_type": "3",
                    "camera_position": "back",
                }]),
                "extra": json.dumps({
                    "source_width": video_info["width"],
                    "source_height": video_info["height"],
                }),
                "_uid": str(self.user_id) if self.user_id else "",
                "_uuid": str(uuid.uuid4()),
            }

            r = self.session.post(
                f"{self.API_URL}/media/configure_to_story/?video=1",
                data=configure_data,
                timeout=30,
            )

            if r.status_code == 200:
                result = r.json()
                if result.get("status") == "ok":
                    logger.info("📱 Vídeo publicado nos Stories!")
                    return result
                else:
                    logger.error(f"Configure story vídeo falhou: {result}")
            else:
                logger.error(f"Configure story vídeo HTTP {r.status_code}")

            return None
        except Exception as e:
            logger.error(f"Erro no upload de story (vídeo): {e}")
            return None

    # ============================================
    # UPLOAD: REELS
    # ============================================

    def clip_upload(self, video_path: str, caption: str = "",
                    thumbnail_path: str = None) -> Optional[dict]:
        """Upload de Reels (clips) — vídeo curto para o feed e aba Reels"""
        if not os.path.exists(video_path):
            logger.error(f"Arquivo não encontrado: {video_path}")
            return None

        try:
            upload_id = str(int(time.time() * 1000))
            video_info = self._get_video_info(video_path)

            if video_info["duration"] > 90:
                logger.warning("Reels permitem no máximo 90 segundos")

            logger.info(f"🎬 Enviando Reel: {video_info['width']}x{video_info['height']}, "
                        f"{video_info['duration']:.1f}s")

            # 1. Upload do vídeo (com flag is_clips_video)
            if not self._upload_video_binary(video_path, upload_id, video_info,
                                              is_clips=True):
                return None

            # 2. Upload da thumbnail
            thumb = thumbnail_path
            if not thumb:
                thumb = self._extract_thumbnail(video_path)
            if thumb:
                self._upload_photo_binary(thumb, upload_id)
                if not thumbnail_path and os.path.exists(thumb):
                    os.remove(thumb)

            self._delay(3, 6)
            self._refresh_csrf()

            # 3. Configurar Reel
            now_str = datetime.now().strftime("%Y%m%dT%H%M%S.000")
            configure_data = {
                "upload_id": upload_id,
                "caption": caption,
                "source_type": "4",
                "filter_type": "0",
                "timezone_offset": "-10800",
                "date_time_original": now_str,
                "clips_share_preview_to_feed": "1",
                "length": str(video_info["duration"]),
                "audio_muted": "false",
                "poster_frame_index": "70",
                "usertags": json.dumps({"in": []}),
                "clips": json.dumps([{
                    "length": video_info["duration"],
                    "source_type": "4",
                }]),
                "extra": json.dumps({
                    "source_width": video_info["width"],
                    "source_height": video_info["height"],
                }),
            }

            r = self.session.post(
                f"{self.API_URL}/media/configure_to_clips/?video=1",
                data=configure_data,
                timeout=30,
            )

            if r.status_code == 200:
                result = r.json()
                if result.get("status") == "ok":
                    media = result.get("media", {})
                    code = media.get("code", "")
                    logger.info(f"🎬 Reel publicado! https://instagram.com/reel/{code}")
                    return result
                else:
                    logger.error(f"Configure Reel falhou: {result}")
            else:
                logger.error(f"Configure Reel HTTP {r.status_code}")

            return None
        except Exception as e:
            logger.error(f"Erro no upload de Reel: {e}")
            return None

    # ============================================
    # UTILITÁRIOS
    # ============================================

    def media_pk_from_url(self, url: str) -> Optional[str]:
        """Extrai media ID de uma URL do Instagram"""
        # Extrair shortcode da URL
        patterns = [
            r"instagram\.com/p/([A-Za-z0-9_-]+)",
            r"instagram\.com/reel/([A-Za-z0-9_-]+)",
            r"instagram\.com/tv/([A-Za-z0-9_-]+)",
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                shortcode = match.group(1)
                # Buscar media info pelo shortcode
                return self._shortcode_to_media_id(shortcode)
        return None

    def _shortcode_to_media_id(self, shortcode: str) -> Optional[str]:
        """Converte shortcode para media ID"""
        try:
            r = self.session.get(
                f"{self.GRAPHQL_URL}/",
                params={
                    "query_hash": "b3055c01b4b222b8a47dc12b090e4e64",
                    "variables": json.dumps({
                        "shortcode": shortcode,
                    }),
                },
                timeout=15,
            )
            if r.status_code == 200:
                data = r.json()
                media = data.get("data", {}).get("shortcode_media", {})
                return media.get("id")
        except Exception as e:
            logger.error(f"Erro ao converter shortcode {shortcode}: {e}")
        return None

    def search_users(self, query: str, amount: int = 10) -> List[WebUser]:
        """Busca usuários por nome"""
        users = []
        try:
            data = self._api_get(
                "web/search/topsearch/",
                params={"query": query, "context": "blended"},
            )
            for item in data.get("users", [])[:amount]:
                u = item.get("user", {})
                users.append(WebUser(
                    pk=u.get("pk", 0),
                    username=u.get("username", ""),
                    full_name=u.get("full_name", ""),
                    is_private=u.get("is_private", False),
                    is_verified=u.get("is_verified", False),
                    profile_pic_url=u.get("profile_pic_url", ""),
                ))
        except Exception as e:
            logger.error(f"Erro na busca: {e}")
        return users
