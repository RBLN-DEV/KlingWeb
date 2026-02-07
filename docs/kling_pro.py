#!/usr/bin/env python3
"""
Kling 2.6 Motion Control Pro - Sistema Completo
Baseado no tutorial @ricco.ia

Funcionalidades:
- Batch processing (múltiplos vídeos)
- Geração automática de imagem base (integração com outros modelos)
- Interface web (Streamlit)
- Notificações (Discord/Slack/Telegram)
- Queue system com retry automático
- Análise de custos e relatórios
"""

import os
import sys
import time
import json
import base64
import asyncio
import aiohttp
import requests
import schedule
import threading
from pathlib import Path
from typing import Optional, Dict, Any, List, Callable
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import jwt
import logging
from functools import wraps

# Imports para Google Gemini
from google import genai
from google.genai import types
import uuid
import os
import base64

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('kling_automation.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURAÇÕES GLOBAIS
# =============================================================================

@dataclass
class KlingConfig:
    """Configurações da API Kling"""
    access_key: str
    secret_key: str
    base_url: str = "https://api-singapore.klingai.com"
    max_retries: int = 3
    retry_delay: int = 5
    poll_interval: int = 10
    
    def validate(self):
        if not self.access_key or not self.secret_key:
            raise ValueError("Access Key e Secret Key são obrigatórios")


@dataclass
class GenerationConfig:
    """Configurações de geração de vídeo"""
    duration: int = 5  # 5 ou 10
    aspect_ratio: str = "9:16"  # 16:9, 9:16, 1:1
    mode: str = "std"  # std ou pro
    cfg_scale: float = 0.7
    preserve_structure: bool = True
    motion_weight: float = 0.85  # 0-1, quão forte é o motion control
    
    def to_dict(self):
        return asdict(self)


@dataclass
class StyleConfig:
    """Configurações de estilo visual"""
    skin_tone: str = "warm"  # warm, cool
    hair_type: str = "blonde_waves"  # blonde_waves, dark_straight
    outfit: str = "beige_dress"  # beige_dress, black_bodysuit
    lighting: str = "warm"  # warm, cool
    
    def to_dict(self):
        return asdict(self)


# =============================================================================
# NOTIFICATION SYSTEM
# =============================================================================

class NotificationManager:
    """Sistema de notificações multi-plataforma"""
    
    def __init__(self):
        self.webhooks = {}
    
    def add_discord(self, webhook_url: str):
        self.webhooks['discord'] = webhook_url
    
    def add_slack(self, webhook_url: str):
        self.webhooks['slack'] = webhook_url
    
    def add_telegram(self, bot_token: str, chat_id: str):
        self.webhooks['telegram'] = {'token': bot_token, 'chat_id': chat_id}
    
    def _send_discord(self, message: str, image_url: str = None):
        if 'discord' not in self.webhooks:
            return
        
        payload = {
            "content": message,
            "embeds": []
        }
        
        if image_url:
            payload["embeds"].append({
                "image": {"url": image_url}
            })
        
        try:
            requests.post(self.webhooks['discord'], json=payload, timeout=10)
        except Exception as e:
            logger.error(f"Erro ao enviar Discord: {e}")
    
    def _send_slack(self, message: str, image_url: str = None):
        if 'slack' not in self.webhooks:
            return
        
        payload = {
            "text": message,
            "blocks": [
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": message}
                }
            ]
        }
        
        if image_url:
            payload["blocks"].append({
                "type": "image",
                "image_url": image_url,
                "alt_text": "Generated Video"
            })
        
        try:
            requests.post(self.webhooks['slack'], json=payload, timeout=10)
        except Exception as e:
            logger.error(f"Erro ao enviar Slack: {e}")
    
    def _send_telegram(self, message: str, image_url: str = None):
        if 'telegram' not in self.webhooks:
            return
        
        config = self.webhooks['telegram']
        base_url = f"https://api.telegram.org/bot{config['token']}"
        
        try:
            # Enviar mensagem
            requests.post(
                f"{base_url}/sendMessage",
                json={
                    "chat_id": config['chat_id'],
                    "text": message,
                    "parse_mode": "Markdown"
                },
                timeout=10
            )
            
            # Se tiver imagem/vídeo, enviar também
            if image_url:
                requests.post(
                    f"{base_url}/sendVideo",
                    json={
                        "chat_id": config['chat_id'],
                        "video": image_url,
                        "caption": "Vídeo gerado com sucesso!"
                    },
                    timeout=10
                )
        except Exception as e:
            logger.error(f"Erro ao enviar Telegram: {e}")
    
    def notify(self, title: str, message: str, video_url: str = None, status: str = "success"):
        """Envia notificação para todas as plataformas configuradas"""
        emoji = "✅" if status == "success" else "❌" if status == "error" else "⏳"
        full_message = f"{emoji} **{title}**\n\n{message}"
        
        if video_url:
            full_message += f"\n\n🔗 [Ver Vídeo]({video_url})"
        
        logger.info(f"Enviando notificação: {title}")
        
        self._send_discord(full_message, video_url)
        self._send_slack(full_message, video_url)
        self._send_telegram(full_message, video_url)


# =============================================================================
# IMAGE GENERATION INTEGRATION
# =============================================================================

class ImageGenerator:
    """Integração com múltiplas APIs de geração de imagem"""
    
    def __init__(self):
        self.providers = {}
        self.stats = {
            'images_generated': 0,
            'cost_estimated': 0.0
        }

    def add_midjourney(self, api_key: str):
        self.providers['midjourney'] = api_key
    
    def add_dalle(self, api_key: str):
        self.providers['dalle'] = api_key
    
    def add_azure_dalle(self, api_key: str, endpoint: str, deployment_name: str = "Dalle3", api_version: str = "2024-04-01-preview"):
        """Configura Azure OpenAI DALL-E 3"""
        self.providers['azure_dalle'] = {
            'key': api_key,
            'endpoint': endpoint,
            'deployment': deployment_name,
            'api_version': api_version
        }
    
    def add_stable_diffusion(self, api_key: str, endpoint: str):
        self.providers['stable_diffusion'] = {
            'key': api_key,
            'endpoint': endpoint
        }
    
    def add_leonardo(self, api_key: str):
        self.providers['leonardo'] = api_key
        
    def add_gemini(self, api_key: str):
        """Configura Google Gemini"""
        self.providers['gemini'] = api_key
    
    def generate_with_azure_dalle(self, prompt: str, size: str = "1024x1024") -> str:
        """Gera imagem com Azure OpenAI DALL-E 3"""
        if 'azure_dalle' not in self.providers:
            raise ValueError("Azure DALL-E não configurado")
        
        config = self.providers['azure_dalle']
        
        try:
            from openai import AzureOpenAI
            
            # Usar AzureOpenAI client para compatibilidade
            client = AzureOpenAI(
                api_version=config.get('api_version', '2024-04-01-preview'),
                azure_endpoint=config['endpoint'],
                api_key=config['key']
            )
            
            response = client.images.generate(
                model=config['deployment'],
                prompt=prompt,
                n=1,
                size=size,
                style="vivid",
                quality="standard"
            )
            
            # Atualizar Billing (Estimativa $0.04 por imagem DALL-E 3 Standard)
            self.stats['images_generated'] += 1
            self.stats['cost_estimated'] += 0.04
            
            return response.data[0].url
            
        except Exception as e:
            logger.error(f"Erro ao gerar imagem com Azure DALL-E: {e}")
            raise
    
    def generate_with_dalle(self, prompt: str, size: str = "1024x1792") -> str:
        """Gera imagem com DALL-E 3"""
        if 'dalle' not in self.providers:
            raise ValueError("DALL-E não configurado")
        
        headers = {
            "Authorization": f"Bearer {self.providers['dalle']}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json={
                "model": "dall-e-3",
                "prompt": prompt,
                "size": size,
                "quality": "hd",
                "n": 1
            },
            timeout=120
        )
        response.raise_for_status()
        
        return response.json()['data'][0]['url']
    
    def generate_with_leonardo(self, prompt: str, width: int = 1024, height: int = 1792) -> str:
        """Gera imagem com Leonardo AI"""
        if 'leonardo' not in self.providers:
            raise ValueError("Leonardo não configurado")
        
        # Criar geração
        response = requests.post(
            "https://cloud.leonardo.ai/api/rest/v1/generations",
            headers={"Authorization": f"Bearer {self.providers['leonardo']}"},
            json={
                "prompt": prompt,
                "width": width,
                "height": height,
                "modelId": "e71a1c2f-4f18-45ef-8d2a-5e5f9d5f5e5f",  # Leonardo Kino XL
                "num_images": 1
            },
            timeout=60
        )
        response.raise_for_status()
        
        generation_id = response.json()['sdGenerationJob']['generationId']
        
        # Aguardar conclusão
        for _ in range(30):
            time.sleep(2)
            status = requests.get(
                f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}",
                headers={"Authorization": f"Bearer {self.providers['leonardo']}"}
            ).json()
            
            if status['generations_by_pk']['status'] == 'COMPLETE':
                return status['generations_by_pk']['generated_images'][0]['url']
        
        raise TimeoutError("Timeout aguardando Leonardo AI")
    
    def generate_with_gemini(self, prompt: str) -> str:
        """Gera imagem com Google Gemini 3 Pro"""
        if 'gemini' not in self.providers:
            raise ValueError("Gemini não configurado")
            
        try:
            # Sintaxe correta para google-genai v1.0+
            client = genai.Client(api_key=self.providers['gemini'])
            
            response = client.models.generate_content(
                model='gemini-3-pro-image-preview',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_modalities=['IMAGE'],
                    image_config=types.ImageConfig(image_size='4K')
                )
            )
            
            # Verificar se há imagem na resposta
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data:
                        # Salvar a imagem temporariamente
                        import uuid
                        import base64
                        
                        img_data = part.inline_data.data
                        if isinstance(img_data, str):
                            img_data = base64.b64decode(img_data)
                            
                        filename = f"gemini_{uuid.uuid4()}.png"
                        filepath = os.path.join("temp_uploads", filename)
                        os.makedirs("temp_uploads", exist_ok=True)
                        
                        with open(filepath, 'wb') as f:
                            f.write(img_data)
                            
                        logger.info(f"Imagem Gemini gerada: {filepath}")
                        return filepath
                        
            raise ValueError("Nenhuma imagem gerada pelo Gemini")
            
        except Exception as e:
            logger.error(f"Erro ao gerar imagem com Gemini: {e}")
            raise
    
    def generate(self, prompt: str, provider: str = None) -> str:
        """
        Gera imagem usando o provedor especificado.
        Se Azure DALL-E falhar por política de conteúdo, automaticamente usa Gemini como fallback.
        """
        if provider:
            if provider == 'dalle':
                return self.generate_with_dalle(prompt)
            elif provider == 'azure_dalle':
                # Tentar Azure DALL-E com fallback para Gemini
                try:
                    return self.generate_with_azure_dalle(prompt)
                except Exception as e:
                    error_msg = str(e).lower()
                    if 'content_policy_violation' in error_msg or 'responsibleaipolicyviolation' in error_msg:
                        logger.warning("Azure DALL-E bloqueou por política de conteúdo. Tentando Gemini como fallback...")
                        if 'gemini' in self.providers:
                            logger.info("Usando Gemini (Nano Banana) como fallback...")
                            return self.generate_with_gemini(prompt)
                        else:
                            logger.error("Gemini não configurado para fallback")
                            raise ValueError("Azure DALL-E bloqueou o prompt e Gemini não está configurado como fallback")
                    else:
                        raise
            elif provider == 'leonardo':
                return self.generate_with_leonardo(prompt)
            elif provider == 'gemini':
                return self.generate_with_gemini(prompt)
            else:
                raise ValueError(f"Provedor desconhecido: {provider}")
        
        # Auto-selecionar (prioriza Azure DALL-E com fallback, depois Gemini)
        if 'azure_dalle' in self.providers:
            try:
                return self.generate_with_azure_dalle(prompt)
            except Exception as e:
                if 'content_policy' in str(e).lower() and 'gemini' in self.providers:
                    logger.warning("Fallback automático para Gemini...")
                    return self.generate_with_gemini(prompt)
                raise
        elif 'gemini' in self.providers:
            return self.generate_with_gemini(prompt)
        elif 'dalle' in self.providers:
            return self.generate_with_dalle(prompt)
        elif 'leonardo' in self.providers:
            return self.generate_with_leonardo(prompt)
        else:
            raise ValueError("Nenhum provedor de imagem configurado")



# =============================================================================
# STORAGE INTEGRATION (AZURE BLOB)
# =============================================================================

class AzureStorageHandler:
    """Gerenciador de Uploads para Azure Blob Storage"""
    
    def __init__(self, connection_string: str = None, container_name: str = "kling-videos"):
        self.connection_string = connection_string or os.environ.get("AZURE_STORAGE_CONNECTION_STRING")
        self.container_name = container_name
        self.client = None
        
        if self.connection_string:
            try:
                from azure.storage.blob import BlobServiceClient
                self.client = BlobServiceClient.from_connection_string(self.connection_string)
            except ImportError:
                logger.error("Biblioteca azure-storage-blob não instalada")
            except Exception as e:
                logger.error(f"Erro ao conectar Azure Storage: {e}")
    
    def is_configured(self) -> bool:
        return self.client is not None

    def upload_file(self, file_path: str, blob_name: str = None, content_type: str = None) -> str:
        """Faz upload de arquivo e retorna URL Pública"""
        if not self.client:
            raise ValueError("Azure Storage não configurado")
            
        if not blob_name:
            import uuid
            ext = os.path.splitext(file_path)[1]
            blob_name = f"video_{uuid.uuid4()}{ext}"
            
        try:
            container_client = self.client.get_container_client(self.container_name)
            if not container_client.exists():
                try:
                    container_client.create_container(public_access="blob")
                except Exception:
                    container_client.create_container()
                
            blob_client = container_client.get_blob_client(blob_name)
            
            with open(file_path, "rb") as data:
                content_settings = None
                if content_type:
                    from azure.storage.blob import ContentSettings
                    content_settings = ContentSettings(content_type=content_type)
                    
                blob_client.upload_blob(data, overwrite=True, content_settings=content_settings)
                
            return blob_client.url
            
        except Exception as e:
            logger.error(f"Erro upload Azure Blob: {e}")
            raise

# =============================================================================
# KLING API CLIENT
# =============================================================================

class KlingAPIClient:
    """Cliente completo para API Kling 2.6"""
    
    def __init__(self, config: KlingConfig):
        self.config = config
        self.config.validate()
        self.token = self._generate_jwt()
        self.session = requests.Session()
        self.session.headers.update(self._get_headers())
        self.stats = {
            'requests': 0,
            'success': 0,
            'failed': 0,
            'credits_used': 0
        }
        
        # Inicializar gerenciador de storage (opcional)
        self.storage = AzureStorageHandler()
    
    def _generate_jwt(self) -> str:
        headers = {"alg": "HS256", "typ": "JWT"}
        # Usar timezone.utc para garantir timestamp correto
        now = datetime.now(timezone.utc)
        payload = {
            "iss": self.config.access_key,
            "exp": int((now + timedelta(hours=1)).timestamp()),
            "iat": int((now - timedelta(seconds=30)).timestamp()), # Margem de segurança
            "nbf": int((now - timedelta(seconds=30)).timestamp())
        }
        return jwt.encode(payload, self.config.secret_key, algorithm="HS256", headers=headers)
    
    def _get_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def _refresh_token_if_needed(self):
        """Refresh token se estiver próximo de expirar"""
        try:
            decoded = jwt.decode(self.token, options={"verify_signature": False})
            exp = decoded.get('exp', 0)
            if datetime.utcnow().timestamp() > exp - 300:  # 5 minutos antes
                logger.info("Refreshando token JWT...")
                self.token = self._generate_jwt()
                self.session.headers.update(self._get_headers())
        except Exception:
            pass
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Dict:
        """Faz requisição com retry automático"""
        url = f"{self.config.base_url}{endpoint}"
        
        for attempt in range(self.config.max_retries):
            try:
                self._refresh_token_if_needed()
                self.stats['requests'] += 1
                
                response = self.session.request(method, url, timeout=300, **kwargs)
                response.raise_for_status()
                
                self.stats['success'] += 1
                return response.json()
                
            except requests.exceptions.RequestException as e:
                self.stats['failed'] += 1
                
                # Log detalhado do erro se houver resposta do servidor
                error_msg = str(e)
                if e.response is not None:
                    try:
                        error_data = e.response.json()
                        error_msg = f"{e} - Resposta: {error_data}"
                    except:
                        error_msg = f"{e} - Resposta bruta: {e.response.text}"
                
                logger.error(f"Tentativa {attempt + 1} falhou: {error_msg}")
                
                if attempt < self.config.max_retries - 1:
                    time.sleep(self.config.retry_delay * (attempt + 1))
                else:
                    raise
    
    def upload_image(self, image_path: str) -> str:
        """Lê a imagem e converte para Base64 (API Kling suporta Base64 direto)"""
        logger.info(f"Processando imagem para envio (Base64): {image_path}")
        try:
            with open(image_path, "rb") as image_file:
                encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
            return encoded_string
        except Exception as e:
            logger.error(f"Erro ao converter imagem para Base64: {e}")
            raise

    def upload_video(self, video_path: str) -> str:
        """Lê o vídeo e converte para Base64 (API Kling suporta Base64 direto)"""
        logger.info(f"Processando vídeo para envio (Base64): {video_path}")
        try:
            with open(video_path, "rb") as video_file:
                encoded_string = base64.b64encode(video_file.read()).decode('utf-8')
            return encoded_string
        except Exception as e:
            logger.error(f"Erro ao converter vídeo para Base64: {e}")
            raise
    
    def _ensure_base64(self, content: str) -> str:
        """Garante que o conteúdo esteja em Base64. Se for URL, baixa e converte."""
        if content and content.startswith(('http://', 'https://')):
            try:
                logger.info("Detectada URL. Baixando e convertendo para Base64...")
                response = requests.get(content)
                response.raise_for_status()
                return base64.b64encode(response.content).decode('utf-8')
            except Exception as e:
                logger.error(f"Erro ao baixar/converter URL para Base64: {e}")
                raise
        return content

    def create_video(
        self,
        image_url: str,
        video_reference_url: str = None,
        prompt: str = "",
        negative_prompt: str = "",
        config: GenerationConfig = None
    ) -> str:
        """
        Cria vídeo a partir de imagem.
        
        Se video_reference_url for fornecido, usa o endpoint Motion Control.
        Caso contrário, usa Image-to-Video simples.
        """
        if config is None:
            config = GenerationConfig()
        
        # Se tem vídeo de referência, usar Motion Control endpoint
        if video_reference_url:
            return self._create_motion_control_video(
                image_url=image_url,
                video_url=video_reference_url,
                prompt=prompt,
                config=config
            )
        else:
            return self._create_image2video(
                image_url=image_url,
                prompt=prompt,
                negative_prompt=negative_prompt,
                config=config
            )
    
    def _create_image2video(
        self,
        image_url: str,
        prompt: str = "",
        negative_prompt: str = "",
        config: GenerationConfig = None
    ) -> str:
        """Cria vídeo simples a partir de imagem (sem motion control)"""
        if config is None:
            config = GenerationConfig()
        
        logger.info("Iniciando geração de vídeo (Image-to-Video)...")
        
        # Garantir Base64 para imagem
        image_base64 = self._ensure_base64(image_url)
        
        payload = {
            "model_name": "kling-v1",
            "image": image_base64,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "duration": str(config.duration),
            "aspect_ratio": config.aspect_ratio,
            "mode": config.mode,
            "cfg_scale": config.cfg_scale
        }
        
        result = self._make_request("POST", "/v1/videos/image2video", json=payload)
        
        # Estimar créditos usados
        credits = 10 
        self.stats['credits_used'] += credits
        
        return result['data']['task_id']
    
    def _create_motion_control_video(
        self,
        image_url: str,
        video_url: str,
        prompt: str = "",
        config: GenerationConfig = None
    ) -> str:
        """
        Cria vídeo com Motion Control.
        
        IMPORTANTE: video_url deve ser uma URL acessível publicamente.
        Arquivos locais devem ser hospedados primeiro (ex: upload para cloud storage).
        """
        if config is None:
            config = GenerationConfig()
        
        logger.info("Iniciando geração de vídeo com Motion Control...")
        
        # Para image_url: a API aceita Base64 ou URL
        # Se já for Base64 (longo), usar direto; se for URL, passar a URL
        if image_url.startswith(('http://', 'https://')):
            # É uma URL - a API aceita URLs diretas
            image_input = image_url
            logger.info(f"Usando imagem via URL: {image_url[:80]}...")
        else:
            # Assume que já é Base64 ou caminho local
            image_input = self._ensure_base64(image_url)
            logger.info(f"Usando imagem via Base64 (tamanho: {len(image_input)} chars)")
        
        # NOTA: video_url DEVE ser uma URL pública, não Base64
        if not video_url.startswith(('http://', 'https://')):
            # Tentar fazer upload se storage estiver configurado e for arquivo local
            if self.storage.is_configured() and os.path.isfile(video_url):
                logger.info(f"Fazendo upload do vídeo de referência para Azure Blob: {video_url}")
                try:
                    video_url = self.storage.upload_file(video_url, content_type="video/mp4")
                    logger.info(f"Upload concluído. URL Pública: {video_url}")
                except Exception as e:
                    raise ValueError(f"Falha ao fazer upload do vídeo para Azure: {e}")
            else:
                raise ValueError(
                    "Motion Control requer uma URL pública para o vídeo de referência. "
                    "Configure AZURE_STORAGE_CONNECTION_STRING para upload automático de arquivos locais."
                )
        
        # Construir payload conforme documentação da API Kling
        # Campos REQUIRED: image_url, video_url, character_orientation, mode
        # character_orientation: "video" permite ate 30s, "image" apenas ate 10s
        payload = {
            "image_url": image_input,
            "video_url": video_url,
            "character_orientation": "video",  # "video" permite ate 30s, "image" apenas ate 10s
            "mode": config.mode if config.mode in ["std", "pro"] else "std",
            "keep_original_sound": "no"
        }
        
        # Adicionar prompt apenas se fornecido (é opcional)
        if prompt and prompt.strip():
            payload["prompt"] = prompt[:2500]  # Limite de 2500 chars
        
        logger.info(f"Payload Motion Control: image_url={type(image_input).__name__}[{len(str(image_input)[:50])}...], video_url={video_url[:60]}..., mode={payload['mode']}")
        
        result = self._make_request("POST", "/v1/videos/motion-control", json=payload)
        
        # Estimar créditos usados (Motion Control consome mais)
        credits = 20 
        self.stats['credits_used'] += credits
        
        return result['data']['task_id']
    
    def get_motion_control_status(self, task_id: str) -> Dict:
        """Obtém status de tarefa Motion Control"""
        return self._make_request("GET", f"/v1/videos/motion-control/{task_id}")
    
    def get_status(self, task_id: str) -> Dict:
        """Obtém status da tarefa"""
        # Endpoint correto para image2video
        return self._make_request("GET", f"/v1/videos/image2video/{task_id}")

    def wait_for_completion(
        self,
        task_id: str,
        callback: Callable = None,
        timeout: int = 1800,  # 30 minutos
        task_type: str = "image2video"  # "image2video" ou "motion-control"
    ) -> Optional[str]:
        """Aguarda conclusão com callback opcional"""
        logger.info(f"Aguardando tarefa {task_id} (tipo: {task_type})...")
        start_time = time.time()
        
        # Tempo estimado baseado no tipo de tarefa (em segundos)
        estimated_time = 300 if task_type == "motion-control" else 180  # 5 min ou 3 min
        
        while time.time() - start_time < timeout:
            # Usar endpoint correto baseado no tipo de tarefa
            if task_type == "motion-control":
                status_data = self.get_motion_control_status(task_id)
            else:
                status_data = self.get_status(task_id)
            
            # A estrutura de resposta pode variar, mas geralmente é data -> task_status ou similar
            # Verificando a estrutura retornada pelo endpoint image2video
            data = status_data.get('data', {})
            status = data.get('task_status', data.get('status'))
            
            # Progress pode não estar disponível em todas as chamadas
            # Se a API não fornecer progresso, estimar baseado no tempo decorrido
            api_progress = data.get('task_progress', data.get('progress'))
            
            if api_progress is not None and api_progress > 0:
                progress = int(api_progress)
            else:
                # Estimar progresso baseado no tempo decorrido
                elapsed = time.time() - start_time
                progress = min(95, int((elapsed / estimated_time) * 100))  # Max 95% até conclusão
            
            logger.info(f"Status tarefa {task_id}: {status} - {progress}%")
            
            if callback:
                callback(status, progress)
            
            if status == "succeed" or status == "completed":
                # Marcar como 100%
                if callback:
                    callback(status, 100)
                    
                # Resposta de sucesso contém output -> video_url ou similar
                video_limit = data.get('task_result', {}).get('videos', [])
                if video_limit:
                    video_url = video_limit[0].get('url')
                else:
                    video_url = data.get('video_url') # Tentativa de fallback
                
                if not video_url:
                     # Tentar estrutura alternativa baseada na doc
                     video_url = data.get('task_result', {}).get('video_url')

                logger.info(f"Video pronto: {video_url}")
                return video_url
            
            elif status == "failed":
                error = data.get('task_status_msg', data.get('error_message', 'Erro desconhecido'))
                logger.error(f"Falha: {error}")
                raise Exception(f"Geracao falhou: {error}")
            
            time.sleep(self.config.poll_interval)
        
        raise TimeoutError(f"Timeout apos {timeout} segundos")
    
    def download_video(self, video_url: str, output_path: str):
        """Download com barra de progresso"""
        logger.info(f"Download para: {output_path}")
        
        response = requests.get(video_url, stream=True, timeout=300)
        response.raise_for_status()
        
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)
        
        total_size = int(response.headers.get('content-length', 0))
        downloaded = 0
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"\r   Progresso: {percent:.1f}%", end='', flush=True)
        
        print()  # Nova linha
        logger.info(f"✅ Download concluído: {output_path}")
    
    def get_stats(self) -> Dict:
        """Retorna estatísticas de uso"""
        return self.stats.copy()


# =============================================================================
# BATCH PROCESSING SYSTEM
# =============================================================================

@dataclass
class BatchJob:
    """Representa um job de batch"""
    id: str
    image_path: Optional[str]
    video_reference_path: str
    style: StyleConfig
    gen_config: GenerationConfig
    status: str = "pending"
    result_url: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = None
    completed_at: Optional[datetime] = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()


class BatchProcessor:
    """Processamento em lote com queue e workers"""
    
    def __init__(
        self,
        kling_client: KlingAPIClient,
        image_generator: ImageGenerator = None,
        notification_manager: NotificationManager = None,
        max_workers: int = 3
    ):
        self.kling = kling_client
        self.image_gen = image_generator
        self.notifier = notification_manager
        self.max_workers = max_workers
        self.jobs: List[BatchJob] = []
        self.results: List[Dict] = []
        self.is_running = False
    
    def add_job(
        self,
        video_reference_path: str,
        image_path: str = None,
        style: StyleConfig = None,
        gen_config: GenerationConfig = None,
        auto_generate_image: bool = False,
        image_prompt: str = None
    ) -> str:
        """
        Adiciona job ao batch.
        Se image_path for None e auto_generate_image=True, gera imagem automaticamente.
        """
        job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.jobs)}"
        
        job = BatchJob(
            id=job_id,
            image_path=image_path,
            video_reference_path=video_reference_path,
            style=style or StyleConfig(),
            gen_config=gen_config or GenerationConfig()
        )
        
        # Se precisar gerar imagem automaticamente
        if auto_generate_image and self.image_gen and not image_path:
            logger.info(f"[{job.id}] Gerando imagem base automaticamente...")
            try:
                prompt = image_prompt or PromptBuilder.get_master_prompt(**job.style.to_dict())
                job.image_path = self.image_gen.generate(prompt)
                logger.info(f"[{job.id}] Imagem gerada: {job.image_path}")
            except Exception as e:
                logger.error(f"[{job.id}] Falha ao gerar imagem: {e}")
                job.status = "failed"
                job.error = str(e)
        
        self.jobs.append(job)
        logger.info(f"[{job_id}] Adicionado ao batch. Total: {len(self.jobs)} jobs")
        
        return job_id
    
    def _process_single_job(self, job: BatchJob) -> Dict:
        """Processa um único job"""
        logger.info(f"[{job.id}] Iniciando processamento...")
        job.status = "processing"
        
        try:
            # Validações
            if not job.image_path:
                raise ValueError("Imagem base não fornecida e não foi possível gerar automaticamente")
            
            if not os.path.exists(job.video_reference_path):
                raise FileNotFoundError(f"Vídeo de referência não encontrado: {job.video_reference_path}")
            
            # Uploads
            # Verifica se image_path é um arquivo local ou uma URL
            if os.path.exists(job.image_path):
                image_url = self.kling.upload_image(job.image_path)
            else:
                image_url = job.image_path # Assume que já é uma URL
            
            video_url = self.kling.upload_video(job.video_reference_path)
            
            # Prompts
            prompt = PromptBuilder.get_master_prompt(**job.style.to_dict())
            negative_prompt = PromptBuilder.get_negative_prompt()
            
            # Geração
            task_id = self.kling.create_video(
                image_url=image_url,
                video_reference_url=video_url,
                prompt=prompt,
                negative_prompt=negative_prompt,
                config=job.gen_config
            )
            
            # Aguardar com callback de progresso
            def progress_callback(status, progress):
                logger.info(f"[{job.id}] {status}: {progress}%")
            
            result_url = self.kling.wait_for_completion(task_id, callback=progress_callback)
            
            # Sucesso
            job.status = "completed"
            job.result_url = result_url
            job.completed_at = datetime.now()
            
            # Notificação
            if self.notifier:
                self.notifier.notify(
                    title=f"Job Concluído: {job.id}",
                    message=f"Estilo: {job.style.skin_tone} | {job.style.outfit}\n"
                           f"Duração: {job.gen_config.duration}s | Modo: {job.gen_config.mode}",
                    video_url=result_url,
                    status="success"
                )
            
            return {
                "job_id": job.id,
                "status": "success",
                "video_url": result_url,
                "task_id": task_id
            }
            
        except Exception as e:
            logger.error(f"[{job.id}] Erro: {e}")
            job.status = "failed"
            job.error = str(e)
            job.completed_at = datetime.now()
            
            if self.notifier:
                self.notifier.notify(
                    title=f"Job Falhou: {job.id}",
                    message=f"Erro: {str(e)}",
                    status="error"
                )
            
            return {
                "job_id": job.id,
                "status": "failed",
                "error": str(e)
            }
    
    def run(self, download_results: bool = True, output_dir: str = "./output"):
        """Executa todos os jobs em paralelo"""
        if self.is_running:
            raise RuntimeError("Batch já está em execução")
        
        self.is_running = True
        pending_jobs = [j for j in self.jobs if j.status == "pending"]
        
        logger.info(f"Iniciando batch com {len(pending_jobs)} jobs (workers: {self.max_workers})")
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            future_to_job = {
                executor.submit(self._process_single_job, job): job 
                for job in pending_jobs
            }
            
            for future in as_completed(future_to_job):
                job = future_to_job[future]
                try:
                    result = future.result()
                    self.results.append(result)
                    
                    # Download se solicitado
                    if download_results and result['status'] == 'success':
                        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                        filename = f"{job.id}_{timestamp}.mp4"
                        filepath = os.path.join(output_dir, filename)
                        self.kling.download_video(result['video_url'], filepath)
                        result['local_path'] = filepath
                        
                except Exception as e:
                    logger.error(f"Erro no job {job.id}: {e}")
                    self.results.append({
                        "job_id": job.id,
                        "status": "failed",
                        "error": str(e)
                    })
        
        self.is_running = False
        logger.info(f"Batch concluído. {len(self.results)} resultados processados.")
        
        return self._generate_report()
    
    def _generate_report(self) -> Dict:
        """Gera relatório do batch"""
        total = len(self.results)
        success = sum(1 for r in self.results if r['status'] == 'success')
        failed = total - success
        
        report = {
            "total_jobs": total,
            "successful": success,
            "failed": failed,
            "success_rate": f"{(success/total*100):.1f}%" if total > 0 else "0%",
            "kling_stats": self.kling.get_stats(),
            "jobs": self.results,
            "generated_at": datetime.now().isoformat()
        }
        
        # Salvar relatório
        report_path = f"batch_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        
        logger.info(f"📊 Relatório salvo: {report_path}")
        return report
    
    def schedule_job(
        self,
        video_reference_path: str,
        schedule_time: datetime,
        **kwargs
    ):
        """Agenda job para execução futura"""
        def job_wrapper():
            self.add_job(video_reference_path, **kwargs)
            self.run()
        
        schedule.every().day.at(schedule_time.strftime("%H:%M")).do(job_wrapper)
        logger.info(f"Job agendado para {schedule_time}")


# =============================================================================
# PROMPT BUILDER
# =============================================================================

class PromptBuilder:
    """Construtor de prompts otimizados - Azure Content Safety Compliant"""
    
    TEMPLATES = {
        'skin_tone': {
            'warm': 'fair skin with warm undertones',
            'cool': 'fair skin with natural cool undertones'
        },
        'hair': {
            'blonde_waves': 'Long blonde hair with soft waves, natural volume',
            'dark_straight': 'Long straight dark brown hair, elegant style',
            'red_curly': 'Long curly red hair, voluminous, natural texture',
            'black_wavy': 'Long black wavy hair, glossy finish'
        },
        'outfit': {
            'beige_dress': 'Elegant beige midi dress, professional style, smooth fabric',
            'black_bodysuit': 'Black long-sleeve professional top, elegant style',
            'red_dress': 'Elegant red evening dress, silk fabric, sophisticated',
            'casual_jeans': 'Blue jeans with white blouse, casual professional style'
        },
        'lighting': {
            'warm': 'Warm indoor lighting with soft tungsten tones, gentle highlights, balanced exposure',
            'cool': 'Cool ambient lighting, soft LED tones, balanced shadows',
            'golden_hour': 'Golden hour lighting, warm soft sunlight, cinematic atmosphere',
            'studio': 'Professional studio lighting, softbox setup, even illumination'
        }
    }
    
    # Prompts pre-definidos prontos para uso - Azure Safe
    PRESET_PROMPTS = {
        'default': {
            'name': 'Padrao (Retrato Profissional)',
            'description': 'Prompt padrao para retratos profissionais',
            'prompt': None  # Usa get_master_prompt()
        },
        'tiktok_reels': {
            'name': 'TikTok/Reels (Vertical 9:16)',
            'description': 'Video vertical estilo TikTok/Instagram Reels',
            'prompt': """Ultra-realistic 9:16 vertical cinematic shot of a professional model posing elegantly in a modern interior hallway, with white walls, wooden floors, and recessed lighting.
The camera is at a medium frontal angle showing the full body naturally centered in frame.
Professional attire with realistic fabric texture and natural folds.
Relaxed confident expression, professional makeup, warm skin tones with natural texture.
Long styled hair with soft movement, capturing warm ambient light.
Clean bright lighting with gentle shadows, shallow cinematic depth of field, smooth bokeh background."""
        },
        'fashion_editorial': {
            'name': 'Editorial de Moda',
            'description': 'Estilo revista de moda premium',
            'prompt': """High-end fashion editorial photograph, ultra-realistic 8K quality.
Professional model with elegant posture in designer outfit, photographed in luxurious indoor setting.
Shot with cinematic camera, shallow depth of field, perfect lighting setup.
Magazine cover quality, sharp focus on subject, artistic composition.
Natural skin texture, professional styling.
Soft shadows, balanced exposure, rich color grading."""
        },
        'cinematic_portrait': {
            'name': 'Retrato Cinematografico',
            'description': 'Estilo filme de Hollywood',
            'prompt': """Cinematic portrait of a professional model, shot in ultra-realistic 8K quality.
Movie-like atmosphere with dramatic lighting and shallow depth of field.
Professional color grading, film grain texture, anamorphic lens characteristics.
Subject in elegant pose, natural expression, detailed skin texture.
Soft bokeh background, warm color tones, cinematic aspect ratio.
Production quality, photorealistic, natural colors."""
        }
    }
    
    @classmethod
    def get_preset_names(cls) -> dict:
        """Retorna os nomes dos presets para o selectbox"""
        return {key: val['name'] for key, val in cls.PRESET_PROMPTS.items()}
    
    @classmethod
    def get_preset_prompt(cls, preset_key: str) -> str:
        """Retorna o prompt do preset selecionado"""
        if preset_key in cls.PRESET_PROMPTS:
            return cls.PRESET_PROMPTS[preset_key].get('prompt')
        return None
    
    @classmethod
    def get_master_prompt(
        cls,
        skin_tone: str = "warm",
        hair_type: str = "blonde_waves",
        outfit: str = "beige_dress",
        lighting: str = "warm",
        custom_elements: str = ""
    ) -> str:
        
        prompt = f"""Professional portrait photograph, high quality 8K photography.

CAMERA: Shot on professional cinema camera, high dynamic range, sharp focus.

SUBJECT: Professional model, {cls.TEMPLATES['skin_tone'][skin_tone]}, natural look, confident posture, standing elegantly.

WARDROBE: {cls.TEMPLATES['outfit'][outfit]}

HAIR & MAKEUP: {cls.TEMPLATES['hair'][hair_type]}, natural makeup, professional appearance.

LIGHTING: {cls.TEMPLATES['lighting'][lighting]}

ENVIRONMENT: Modern indoor setting with neutral walls, clean background, professional studio atmosphere.

STYLE: Professional portrait, photorealistic, high quality, sharp details, natural colors, magazine quality photograph."""
        
        if custom_elements:
            prompt += f"\n\nADDITIONAL: {custom_elements}"
        
        return prompt
    
    @classmethod
    def get_negative_prompt(cls) -> str:
        return """low quality, blurry, distorted face, distorted body, extra limbs, missing limbs, deformed hands, plastic skin, wax skin, over-smoothed, cartoon, anime, painting, drawing, artificial, synthetic, watermark, text, logo, frame, border, cropped, worst quality, jpeg artifacts, duplicate, morbid, mutilated, out of frame, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, ugly, bad anatomy, bad proportions"""


# =============================================================================
# INTERFACE WEB (STREAMLIT)
# =============================================================================

def run_web_interface():
    """Inicia interface web com Streamlit"""
    try:
        import streamlit as st
    except ImportError:
        print("Instale streamlit: pip install streamlit")
        return
    
    st.set_page_config(
        page_title="Kling 2.6 Motion Control Pro",
        page_icon="🎬",
        layout="wide"
    )
    
    st.title("🎬 Kling 2.6 Motion Control Pro")
    st.markdown("Baseado no tutorial [@ricco.ia](https://instagram.com/ricco.ia)")
    
    # Sidebar - Configurações
    with st.sidebar:
        st.header("⚙️ Configurações da API Kling")
        
        access_key = st.text_input("Access Key", value=os.environ.get("KLING_ACCESS_KEY", ""), type="password")
        secret_key = st.text_input("Secret Key", value=os.environ.get("KLING_SECRET_KEY", ""), type="password")
        
        st.divider()
        
        st.header("🔔 Notificações (Opcional)")
        discord_webhook = st.text_input("Discord Webhook URL", type="password")
        telegram_token = st.text_input("Telegram Bot Token", type="password")
        telegram_chat = st.text_input("Telegram Chat ID")
        
        st.divider()
        
        st.header("🎨 Azure OpenAI DALL-E 3")
        azure_endpoint = st.text_input(
            "Azure Endpoint", 
            value=os.environ.get("AZURE_DALLE_ENDPOINT", "")
        )
        azure_dalle_key = st.text_input(
            "Azure API Key", 
            value=os.environ.get("AZURE_DALLE_KEY", ""),
            type="password"
        )
        azure_deployment = st.text_input(
            "Deployment Name", 
            value=os.environ.get("AZURE_DALLE_DEPLOYMENT", "dall-e-3")
        )
        azure_api_version = st.text_input(
            "API Version", 
            value=os.environ.get("AZURE_DALLE_API_VERSION", "2024-04-01-preview")
        )
        
        st.divider()
        
        st.header("🎨 Alternativas (Opcional)")
        gemini_key = st.text_input("Google Gemini API Key", value=os.environ.get("GEMINI_API_KEY", ""), type="password")
        dalle_key = st.text_input("OpenAI API Key (DALL-E)", type="password")
        leonardo_key = st.text_input("Leonardo AI Key", type="password")
    
    # Tabs principais
    tab1, tab2, tab3 = st.tabs(["🎬 Gerar Vídeo", "📁 Batch Processing", "📊 Relatórios"])
    
    with tab1:
        st.header("Geração Individual")
        
        col1, col2 = st.columns(2)
        
        with col1:
            st.subheader("Arquivos")
            image_file = st.file_uploader("Imagem Base (Modelo)", type=['jpg', 'jpeg', 'png'])
            video_file = st.file_uploader("Vídeo de Referência (Movimento)", type=['mp4', 'mov'])
            
            auto_gen = st.checkbox("Gerar imagem automaticamente (se não enviar imagem)")
            if auto_gen:
                image_provider = st.selectbox(
                    "Provedor de IA",
                    ["azure_dalle", "gemini", "dalle", "leonardo"],
                    format_func=lambda x: {
                        "azure_dalle": "Azure DALL-E 3 (Recomendado)",
                        "gemini": "Google Gemini 3 Pro (Novo!)",
                        "dalle": "OpenAI DALL-E 3",
                        "leonardo": "Leonardo AI"
                    }[x]
                )
                
                # Seletor de Prompt Preset
                st.markdown("**🎯 Estilo do Prompt:**")
                preset_names = PromptBuilder.get_preset_names()
                selected_preset = st.selectbox(
                    "Escolha um estilo de prompt",
                    list(preset_names.keys()),
                    format_func=lambda x: preset_names[x]
                )
                
                # Mostrar descrição do preset
                preset_desc = PromptBuilder.PRESET_PROMPTS[selected_preset].get('description', '')
                st.caption(f"ℹ️ {preset_desc}")
                
                # Opção de personalização manual
                with st.expander("✏️ Personalizar Prompt Manualmente (Avançado)"):
                    st.info("Deixe em branco para usar o prompt do estilo selecionado acima.")
                    image_prompt = st.text_area(
                        "Digite seu prompt personalizado (sobrescreve o estilo)",
                        height=150,
                        placeholder="Cole ou escreva seu prompt aqui..."
                    )
        
        with col2:
            st.subheader("Configurações de Estilo")
            
            skin = st.selectbox("Tom de pele", ["warm", "cool"])
            hair = st.selectbox("Cabelo", ["blonde_waves", "dark_straight", "red_curly", "black_wavy"])
            outfit = st.selectbox("Roupa", ["beige_dress", "black_bodysuit", "red_dress", "casual_jeans"])
            lighting = st.selectbox("Iluminação", ["warm", "cool", "golden_hour", "studio"])
            
            st.divider()
            
            st.subheader("Configurações Técnicas")
            duration = st.selectbox("Duração", [5, 10])
            aspect = st.selectbox("Aspect Ratio", ["9:16", "16:9", "1:1"])
            mode = st.selectbox("Modo", ["std", "pro"])
            motion_weight = st.slider("Peso do Motion Control", 0.0, 1.0, 0.85)
        
        if st.button("🚀 Iniciar Geração", type="primary", use_container_width=True):
            if not access_key or not secret_key:
                st.error("Configure Access Key e Secret Key!")
                return
            
            if not video_file:
                st.error("Envie o vídeo de referência!")
                return
            
            if not image_file and not auto_gen:
                st.error("Envie uma imagem ou ative geração automática!")
                return
            
            # Processo
            with st.spinner("Processando..."):
                try:
                    # Setup
                    config = KlingConfig(access_key=access_key, secret_key=secret_key)
                    kling = KlingAPIClient(config)
                    
                    # Notificações
                    notifier = NotificationManager()
                    if discord_webhook:
                        notifier.add_discord(discord_webhook)
                    if telegram_token and telegram_chat:
                        notifier.add_telegram(telegram_token, telegram_chat)
                    
                    # Salvar arquivos temporários
                    temp_dir = "temp_uploads"
                    os.makedirs(temp_dir, exist_ok=True)
                    
                    video_path = os.path.join(temp_dir, video_file.name)
                    with open(video_path, 'wb') as f:
                        f.write(video_file.getvalue())
                    
                    image_url_or_path = None
                    if image_file:
                        image_path = os.path.join(temp_dir, image_file.name)
                        with open(image_path, 'wb') as f:
                            f.write(image_file.getvalue())
                        image_url_or_path = image_path
                    elif auto_gen and not image_file:
                        st.info(f"Gerando imagem com IA ({image_provider})...")
                        img_gen = ImageGenerator()
                        
                        if azure_dalle_key and azure_endpoint:
                            img_gen.add_azure_dalle(azure_dalle_key, azure_endpoint, azure_deployment, azure_api_version)
                        if gemini_key:
                            img_gen.add_gemini(gemini_key)
                        if dalle_key:
                            img_gen.add_dalle(dalle_key)
                        if leonardo_key:
                            img_gen.add_leonardo(leonardo_key)
                            
                        if not image_prompt:
                            # Verificar se há preset selecionado (diferente de 'default')
                            preset_prompt = PromptBuilder.get_preset_prompt(selected_preset)
                            if preset_prompt:
                                # Usar prompt do preset
                                st.info(f"Usando estilo: {PromptBuilder.PRESET_PROMPTS[selected_preset]['name']}")
                                image_prompt = preset_prompt
                            else:
                                # Usar prompt automático (default)
                                st.info("Criando prompt otimizado...")
                                style_config_for_prompt = StyleConfig(skin, hair, outfit, lighting)
                                image_prompt = PromptBuilder.get_master_prompt(**style_config_for_prompt.to_dict())
                            st.write(f"Prompt: {image_prompt[:150]}...")
                        
                        image_url_or_path = img_gen.generate(image_prompt, provider=image_provider)
                        st.success("Imagem gerada com sucesso!")
                        # Se for caminho local (Gemini), não é URL
                        if os.path.exists(image_url_or_path):
                            st.image(image_url_or_path, caption="Imagem Gerada", width=300)
                        else:
                            st.image(image_url_or_path, caption="Imagem Gerada", width=300)
                    
                    if not image_url_or_path:
                        st.error("Nenhuma imagem base disponível para geração.")
                        return

                    # Gerar vídeo
                    style = StyleConfig(skin, hair, outfit, lighting)
                    gen_config = GenerationConfig(
                        duration=duration,
                        aspect_ratio=aspect,
                        mode=mode,
                        motion_weight=motion_weight
                    )
                    
                    # Uploads e geração
                    if os.path.exists(image_url_or_path):
                        # Arquivo local (Gemini ou Upload)
                        st.info("Preparando imagem base (Base64)...")
                        # Agora retorna Base64 string direto
                        image_url = kling.upload_image(image_url_or_path)
                    else:
                        # URL externa (DALL-E)
                        st.info("Baixando e processando imagem gerada...")
                        import requests as r
                        
                        # Nome único para temp
                        temp_name = f"dalle_gen_{uuid.uuid4()}.png"
                        temp_path = os.path.join(temp_dir, temp_name)
                        
                        with open(temp_path, 'wb') as f:
                            f.write(r.get(image_url_or_path).content)
                            
                        st.info("Preparando imagem para Kling (Base64)...")
                        image_url = kling.upload_image(temp_path)

                    # Se tiver vídeo de referência, passar o caminho do arquivo
                    # O método create_video vai tratar o upload para Azure se necessário
                    video_reference = video_path if video_file else None
                    
                    # Usar o mesmo prompt da imagem se disponível, senão gerar padrão
                    if auto_gen and image_prompt:
                        prompt = image_prompt
                    else:
                        prompt = PromptBuilder.get_master_prompt(**style.to_dict())
                    negative = PromptBuilder.get_negative_prompt()
                    
                    task_id = kling.create_video(image_url, video_reference, prompt, negative, gen_config)
                    
                    # Progresso
                    progress_bar = st.progress(0)
                    status_text = st.empty()
                    
                    def update_progress(status, progress):
                        progress_bar.progress(int(progress))
                        status_text.text(f"Status: {status} - {progress}%")
                    
                    # Usar task_type correto: motion-control se tiver video de referencia
                    task_type = "motion-control" if video_reference else "image2video"
                    result_url = kling.wait_for_completion(task_id, callback=update_progress, task_type=task_type)
                    
                    # Sucesso
                    st.success("Video gerado com sucesso!")
                    st.video(result_url)
                    
                    # Download
                    output_path = f"output_{datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                    kling.download_video(result_url, output_path)
                    
                    with open(output_path, 'rb') as f:
                        st.download_button(
                            "⬇️ Baixar Vídeo",
                            f,
                            file_name=output_path,
                            mime="video/mp4"
                        )
                    
                    # Notificar
                    if notifier:
                        notifier.notify("Vídeo Concluído", f"Estilo: {outfit} | {lighting}", result_url)
                    
                except Exception as e:
                    st.error(f"Erro: {str(e)}")
                    logger.exception("Erro na geração")
    
    with tab2:
        st.header("Batch Processing")
        
        st.info("""
        Para batch processing, use o script Python diretamente:
        ```bash
        python kling_motion_control.py --batch --config batch_config.json
        ```
        """)
        
        batch_config = st.text_area("Configuração JSON do Batch", height=200, value="""
{
  "jobs": [
    {
      "video_reference": "video1.mp4",
      "style": {"skin_tone": "warm", "hair_type": "blonde_waves", "outfit": "beige_dress", "lighting": "warm"},
      "gen_config": {"duration": 5, "aspect_ratio": "9:16", "mode": "std"}
    }
  ],
  "max_workers": 3,
  "auto_generate_images": false
}
        """)
        
        if st.button("Executar Batch"):
            st.warning("Execute via linha de comando para batch processing robusto.")
    
    with tab3:
        st.header("Relatórios e Estatísticas")
        
        # Mostrar logs se existirem
        if os.path.exists('kling_automation.log'):
            with open('kling_automation.log', 'r') as f:
                logs = f.read()
                st.text_area("Logs", logs, height=400)
        
        # Mostrar relatórios de batch
        reports = [f for f in os.listdir('.') if f.startswith('batch_report_')]
        if reports:
            st.subheader("Relatórios de Batch")
            for report in sorted(reports, reverse=True)[:5]:
                with open(report, 'r') as f:
                    data = json.load(f)
                    with st.expander(f"{report} - {data.get('success_rate', 'N/A')} sucesso"):
                        st.json(data)


# =============================================================================
# CLI INTERFACE
# =============================================================================

def main_cli():
    """Interface de linha de comando"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Kling 2.6 Motion Control Pro')
    parser.add_argument('--access-key', required=True, help='Kling Access Key')
    parser.add_argument('--secret-key', required=True, help='Kling Secret Key')
    parser.add_argument('--image', '-i', help='Caminho da imagem base')
    parser.add_argument('--video', '-v', required=True, help='Caminho do vídeo de referência')
    parser.add_argument('--output', '-o', default='./output', help='Diretório de saída')
    
    # Estilo
    parser.add_argument('--skin', default='warm', choices=['warm', 'cool'])
    parser.add_argument('--hair', default='blonde_waves', 
                       choices=['blonde_waves', 'dark_straight', 'red_curly', 'black_wavy'])
    parser.add_argument('--outfit', default='beige_dress',
                       choices=['beige_dress', 'black_bodysuit', 'red_dress', 'casual_jeans'])
    parser.add_argument('--lighting', default='warm',
                       choices=['warm', 'cool', 'golden_hour', 'studio'])
    
    # Técnico
    parser.add_argument('--duration', type=int, default=5, choices=[5, 10])
    parser.add_argument('--aspect', default='9:16', choices=['9:16', '16:9', '1:1'])
    parser.add_argument('--mode', default='std', choices=['std', 'pro'])
    parser.add_argument('--motion-weight', type=float, default=0.85)
    
    # Modos especiais
    parser.add_argument('--batch', action='store_true', help='Modo batch processing')
    parser.add_argument('--batch-config', help='Arquivo JSON com configurações do batch')
    parser.add_argument('--web', action='store_true', help='Iniciar interface web')
    parser.add_argument('--auto-gen-image', action='store_true', help='Gerar imagem automaticamente')
    parser.add_argument('--dalle-key', help='OpenAI API Key para geração de imagem')
    parser.add_argument('--leonardo-key', help='Leonardo AI Key para geração de imagem')
    
    # Notificações
    parser.add_argument('--discord-webhook', help='Discord webhook URL')
    parser.add_argument('--telegram-token', help='Telegram bot token')
    parser.add_argument('--telegram-chat', help='Telegram chat ID')
    
    args = parser.parse_args()
    
    # Modo web
    if args.web:
        run_web_interface()
        return
    
    # Setup
    config = KlingConfig(access_key=args.access_key, secret_key=args.secret_key)
    kling = KlingAPIClient(config)
    
    # Notificações
    notifier = NotificationManager()
    if args.discord_webhook:
        notifier.add_discord(args.discord_webhook)
    if args.telegram_token and args.telegram_chat:
        notifier.add_telegram(args.telegram_token, args.telegram_chat)
    
    # Geração de imagem
    image_gen = None
    if args.dalle_key or args.leonardo_key:
        image_gen = ImageGenerator()
        if args.dalle_key:
            image_gen.add_dalle(args.dalle_key)
        if args.leonardo_key:
            image_gen.add_leonardo(args.leonardo_key)
    
    # Modo batch
    if args.batch:
        processor = BatchProcessor(kling, image_gen, notifier)
        
        if args.batch_config:
            with open(args.batch_config, 'r') as f:
                batch_data = json.load(f)
            
            for job_data in batch_data.get('jobs', []):
                processor.add_job(
                    video_reference_path=job_data['video_reference'],
                    image_path=job_data.get('image_path'),
                    style=StyleConfig(**job_data.get('style', {})),
                    gen_config=GenerationConfig(**job_data.get('gen_config', {})),
                    auto_generate_image=batch_data.get('auto_generate_images', False)
                )
            
            report = processor.run(
                download_results=True,
                output_dir=args.output
            )
            print(json.dumps(report, indent=2))
        else:
            print("Modo batch requer --batch-config")
        return
    
    # Modo single
    style = StyleConfig(
        skin_tone=args.skin,
        hair_type=args.hair,
        outfit=args.outfit,
        lighting=args.lighting
    )
    
    gen_config = GenerationConfig(
        duration=args.duration,
        aspect_ratio=args.aspect,
        mode=args.mode,
        motion_weight=args.motion_weight
    )
    
    # Gerar imagem se necessário
    image_path = args.image
    if args.auto_gen_image and image_gen and not image_path:
        print("Gerando imagem base automaticamente...")
        prompt = PromptBuilder.get_master_prompt(**style.to_dict())
        image_path = image_gen.generate(prompt)
        print(f"Imagem gerada: {image_path}")
    
    # Criar e executar job único
    processor = BatchProcessor(kling, image_gen, notifier)
    job_id = processor.add_job(
        video_reference_path=args.video,
        image_path=image_path,
        style=style,
        gen_config=gen_config
    )
    
    report = processor.run(download_results=True, output_dir=args.output)
    print(f"\nJob concluído: {job_id}")
    print(f"Relatório: {report}")


# =============================================================================
# EXECUÇÃO
# =============================================================================

def is_streamlit():
    """Detecta se está rodando via Streamlit"""
    try:
        from streamlit.runtime.scriptrunner import get_script_run_ctx
        return get_script_run_ctx() is not None
    except ImportError:
        return False

if __name__ == "__main__":
    # Verificar se está rodando como streamlit
    if is_streamlit():
        run_web_interface()
    else:
        # Se não tiver argumentos, iniciar interface web
        if len(sys.argv) == 1:
            run_web_interface()
        else:
            main_cli()
else:
    # Importado pelo Streamlit
    if is_streamlit():
        run_web_interface()
